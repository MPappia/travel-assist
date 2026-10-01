import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/server/cache", () => ({
  readCache: vi.fn(async (key: string) => store.get(key) ?? null),
  writeCache: vi.fn(async (key: string, value: unknown) => void store.set(key, value)),
}));

const { computeDirections } = await import("@/server/directions");

const coords: [number, number][] = [
  [4.8357, 45.764],
  [6.1294, 45.8992],
];
const okBody = {
  features: [
    {
      geometry: { type: "LineString", coordinates: coords },
      properties: { segments: [{ distance: 140000, duration: 6000 }], summary: { distance: 140000, duration: 6000 } },
    },
  ],
};

describe("computeDirections", () => {
  beforeEach(() => {
    store.clear();
    vi.stubEnv("ORS_API_KEY", "secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("signale une clé manquante sans appeler le service", async () => {
    vi.stubEnv("ORS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await computeDirections("DRIVING", coords, ["Lyon", "Annecy"]);
    expect(response).toMatchObject({ ok: false, error: { code: "MISSING_KEY" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("appelle ORS avec la clé côté serveur puis met le résultat en cache", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(okBody), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await computeDirections("DRIVING", coords, ["Lyon", "Annecy"]);
    expect(first).toMatchObject({ ok: true, result: { distance: 140000, legs: [{ duration: 6000 }] } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v2\/directions\/driving-car\/geojson$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("secret");

    await computeDirections("DRIVING", coords, ["Lyon", "Annecy"]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // servi par le cache
    await computeDirections("CYCLING", coords, ["Lyon", "Annecy"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // autre mode : autre clé de cache
  });

  it("traduit le quota atteint et les pannes réseau", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 })));
    expect(await computeDirections("DRIVING", coords, ["A", "B"])).toMatchObject({ ok: false, error: { code: "QUOTA" } });

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await computeDirections("WALKING", coords, ["A", "B"])).toMatchObject({
      ok: false,
      error: { code: "UNAVAILABLE" },
    });
  });
});
