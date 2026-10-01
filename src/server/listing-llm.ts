import "server-only";

import {
  buildFlightLlmRequest,
  buildLlmRequest,
  parseFlightLlmContent,
  parseLlmContent,
  type FlightLlmValues,
  type LlmValues,
} from "@/lib/listing-extract/llm";
import type { FieldKey } from "@/lib/listing-extract/types";

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

/** Activé seulement si LLM_BASE_URL et LLM_MODEL sont définis (LLM_API_KEY facultative). */
export function getLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim();
  const model = env.LLM_MODEL?.trim();
  if (!baseUrl || !model) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), model, apiKey: env.LLM_API_KEY?.trim() || null };
}

export const LLM_TIMEOUT_MS = 30_000;

export type LlmResult = { ok: true; values: LlmValues } | { ok: false; message: string };

async function chatCompletion<T>(
  config: LlmConfig,
  body: unknown,
  parse: (content: string) => T | null,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ ok: true; values: T } | { ok: false; message: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? LLM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, message: `le service a répondu ${response.status}` };
    const json = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false, message: "réponse sans contenu" };
    const values = parse(content);
    return values ? { ok: true, values } : { ok: false, message: "réponse JSON invalide" };
  } catch (error) {
    const timeout = (error as Error)?.name === "TimeoutError" || (error as Error)?.name === "AbortError";
    return { ok: false, message: timeout ? "délai de 30 s dépassé" : "service injoignable" };
  }
}

/** Appelle /chat/completions ; ne lève jamais (en cas d'échec, on garde l'extraction déterministe). */
export function callListingLlm(
  config: LlmConfig,
  params: { text: string; url?: string | null; missing: FieldKey[] },
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<LlmResult> {
  return chatCompletion<LlmValues>(config, buildLlmRequest({ model: config.model, ...params }), parseLlmContent, options);
}

export function callFlightLlm(
  config: LlmConfig,
  params: { text: string; url?: string | null; missing: string[] },
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; values: FlightLlmValues } | { ok: false; message: string }> {
  return chatCompletion(config, buildFlightLlmRequest({ model: config.model, ...params }), parseFlightLlmContent, options);
}
