import { describe, expect, it, vi } from "vitest";

import { applyLlmValues, buildLlmRequest, LLM_JSON_SCHEMA, LLM_MAX_CHARS, parseLlmContent } from "@/lib/listing-extract/llm";
import { runListingExtraction } from "@/server/listing-import";
import { callListingLlm, getLlmConfig } from "@/server/listing-llm";

const config = { baseUrl: "http://llm.local/v1", model: "test-model", apiKey: "secret" };

function chatResponse(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

describe("étage LLM (pur)", () => {
  it("demande un JSON strict et tronque le texte", () => {
    const request = buildLlmRequest({ model: "m", text: "x".repeat(50_000), url: "https://a.b", missing: ["totalPrice"] });
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.response_format.json_schema.schema).toBe(LLM_JSON_SCHEMA);
    expect(LLM_JSON_SCHEMA.required).toHaveLength(Object.keys(LLM_JSON_SCHEMA.properties).length);
    const user = request.messages[1].content;
    expect(user.length).toBeLessThan(LLM_MAX_CHARS + 500);
    expect(user).toContain("totalPrice");
  });

  it("valide champ par champ et ignore les valeurs invalides", () => {
    expect(
      parseLlmContent('```json\n{"totalPrice": 980, "rating": 8.4, "beds": 3, "checkIn": "19/03/2027", "title": null}\n```'),
    ).toEqual({ totalPrice: 980, beds: 3 });
    expect(parseLlmContent("pas du json")).toBeNull();
  });

  it("ne remplace jamais une valeur déterministe", () => {
    const merged = applyLlmValues({ beds: { value: 4, source: "regex" } }, { beds: 9, totalPrice: 500 });
    expect(merged.beds).toEqual({ value: 4, source: "regex" });
    expect(merged.totalPrice).toEqual({ value: 500, source: "llm" });
  });

  it("n'est activé qu'avec LLM_BASE_URL et LLM_MODEL", () => {
    expect(getLlmConfig({})).toBeNull();
    expect(getLlmConfig({ LLM_BASE_URL: "http://x/v1/", LLM_MODEL: "m" })).toEqual({
      baseUrl: "http://x/v1",
      model: "m",
      apiKey: null,
    });
  });
});

describe("appel du LLM", () => {
  it("envoie la clé facultative et lit la réponse", async () => {
    const fetchImpl = vi.fn(async () => chatResponse('{"totalPrice": 640}'));
    const result = await callListingLlm(config, { text: "texte", missing: ["totalPrice"] }, { fetchImpl });
    expect(result).toEqual({ ok: true, values: { totalPrice: 640 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://llm.local/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("garde le résultat déterministe si le LLM échoue ou dépasse le délai", async () => {
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    const extraction = await runListingExtraction(
      { text: "Chalet\n4 lits" },
      { llm: config, fetchImpl: slow as unknown as typeof fetch, timeoutMs: 50 },
    );
    expect(extraction.llm).toEqual({ status: "failed", message: "délai de 30 s dépassé" });
    expect(extraction.fields.beds).toEqual({ value: 4, source: "regex" });

    const broken = await runListingExtraction(
      { text: "Chalet\n4 lits" },
      { llm: config, fetchImpl: vi.fn(async () => chatResponse("", 500)) },
    );
    expect(broken.llm.status).toBe("failed");
  });

  it("complète les champs manquants et recalcule le prix par nuit", async () => {
    const fetchImpl = vi.fn(async () => chatResponse('{"totalPrice": 700, "beds": 9}'));
    const extraction = await runListingExtraction({ text: "Chalet\n4 lits\n7 nuits · 1 juil. – 8 juil. 2027" }, { llm: config, fetchImpl });
    expect(extraction.llm.status).toBe("ok");
    expect(extraction.fields.totalPrice).toEqual({ value: 700, source: "llm" });
    expect(extraction.fields.beds?.value).toBe(4);
    expect(extraction.fields.pricePerNight).toMatchObject({ value: 100, source: "llm" });
  });

  it("n'appelle pas le LLM s'il n'est pas configuré", async () => {
    expect((await runListingExtraction({ text: "x" }, { llm: null })).llm.status).toBe("disabled");
  });
});
