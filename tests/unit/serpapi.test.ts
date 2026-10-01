import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildSearchedFlight,
  buildSearchQuery,
  classifySerpResponse,
  flightSearchSchema,
  parseSerpAccount,
  parseSerpFlights,
} from "@/lib/serpapi/google-flights";
import { fetchGoogleFlights, fetchSerpAccount, isSerpApiEnabled } from "@/server/serpapi";

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/serpapi/${name}`, "utf8")) as unknown;
const params = flightSearchSchema.parse({ from: "cdg", to: "NRT", outboundDate: "2027-03-19", returnDate: "2027-03-30", adults: "2" });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("paramètres de recherche", () => {
  it("valide codes IATA, dates et passagers", () => {
    expect(params).toEqual({ from: "CDG", to: "NRT", outboundDate: "2027-03-19", returnDate: "2027-03-30", adults: 2 });
    const bad = flightSearchSchema.safeParse({ from: "Paris", to: "NRT", outboundDate: "2027-03-19", returnDate: "2027-03-01", adults: 12 });
    expect(bad.success).toBe(false);
    const paths = bad.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["from", "adults"]));
    expect(flightSearchSchema.safeParse({ ...params, returnDate: "2027-03-01" }).success).toBe(false);
    expect(flightSearchSchema.parse({ ...params, returnDate: "" }).returnDate).toBeUndefined();
  });

  it("aller-retour (type=1) ou aller simple (type=2), en euros", () => {
    const query = buildSearchQuery(params);
    expect(Object.fromEntries(query)).toMatchObject({
      engine: "google_flights",
      departure_id: "CDG",
      arrival_id: "NRT",
      outbound_date: "2027-03-19",
      return_date: "2027-03-30",
      type: "1",
      adults: "2",
      currency: "EUR",
    });
    expect(buildSearchQuery({ ...params, returnDate: undefined }).get("type")).toBe("2");
    expect(buildSearchQuery(params, "TOKEN").get("departure_token")).toBe("TOKEN");
    expect(query.has("api_key")).toBe(false);
  });
});

describe("client SerpApi (fetch simulé)", () => {
  it("n'est actif qu'avec SERPAPI_KEY (sinon rien n'apparaît dans l'interface)", () => {
    vi.stubEnv("SERPAPI_KEY", "");
    expect(isSerpApiEnabled()).toBe(false);
    vi.stubEnv("SERPAPI_KEY", "  ");
    expect(isSerpApiEnabled()).toBe(false);
    vi.stubEnv("SERPAPI_KEY", "abc");
    expect(isSerpApiEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("succès : lit les vols, sans exposer la clé dans le résultat", async () => {
    const fetchImpl = vi.fn(async () => json(fixture("google-flights-outbound.synthetic.json")));
    const result = await fetchGoogleFlights(params, { apiKey: "secret-key", baseUrl: "https://serp.test", fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toMatch(/^https:\/\/serp\.test\/search\.json\?/);
    expect(new URL(url).searchParams.get("api_key")).toBe("secret-key");
    expect(JSON.stringify(result)).not.toContain("secret-key");

    const { offers, googleFlightsUrl } = result.results;
    expect(googleFlightsUrl).toContain("google.com/travel/flights");
    // Les options illisibles sont ignorées.
    expect(offers.map((o) => o.token)).toEqual(["DEP_TOKEN_AY", "DEP_TOKEN_AF"]);
    const [ay] = offers;
    expect(ay).toMatchObject({ needsReturn: true, price: 1248, best: true, airlines: ["Finnair"] });
    expect(ay.leg.durationMin).toBe(845);
    expect(ay.leg.stops).toBe(1);
    expect(ay.leg.layovers).toEqual([{ airport: { code: "HEL", name: "Aéroport d'Helsinki-Vantaa" }, durationMin: 190 }]);
    // Heure sans zéro initial normalisée
    expect(ay.leg.segments[1]).toMatchObject({ flightNumber: "AY 73", arrival: "2027-03-20T08:10" });
  });

  it("retour demandé avec le departure_token : prix total aller-retour", async () => {
    const fetchImpl = vi.fn(async () => json(fixture("google-flights-return.synthetic.json")));
    const result = await fetchGoogleFlights(params, { apiKey: "k", baseUrl: "https://serp.test", fetchImpl, departureToken: "DEP_TOKEN_AY" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(new URL(url).searchParams.get("departure_token")).toBe("DEP_TOKEN_AY");
    expect(result.ok && result.results.offers[0]).toMatchObject({ token: "BOOK_TOKEN_JL", needsReturn: false, price: 1248 });
  });

  it("quota atteint : HTTP 429 ou message explicite", async () => {
    for (const response of [
      json({ error: "Your account has run out of searches." }, 429),
      json({ error: "Your searches for the month are exhausted. You can upgrade plans on SerpApi.com website." }, 200),
    ]) {
      const result = await fetchGoogleFlights(params, { apiKey: "k", fetchImpl: vi.fn(async () => response) });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("QUOTA");
        expect(result.error.message).toContain("Quota SerpApi atteint");
        expect(result.error.message).toContain("partagé entre tous les moteurs");
      }
    }
  });

  it("erreurs : clé refusée, erreur du service, réseau, délai", async () => {
    const invalidKey = await fetchGoogleFlights(params, {
      apiKey: "k",
      fetchImpl: vi.fn(async () => json({ error: "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key" }, 401)),
    });
    expect(!invalidKey.ok && invalidKey.error.code).toBe("AUTH");

    const serverError = await fetchGoogleFlights(params, { apiKey: "k", fetchImpl: vi.fn(async () => json({ error: "Internal error" }, 500)) });
    expect(!serverError.ok && serverError.error).toEqual({ code: "ERROR", message: "Recherche SerpApi impossible : Internal error." });

    const network = await fetchGoogleFlights(params, {
      apiKey: "k",
      fetchImpl: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    expect(!network.ok && network.error.message).toBe("SerpApi est injoignable.");

    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    const timeout = await fetchGoogleFlights(params, { apiKey: "k", fetchImpl: slow as unknown as typeof fetch, timeoutMs: 20 });
    expect(!timeout.ok && timeout.error.message).toBe("SerpApi ne répond pas (délai dépassé).");

    const unreadable = await fetchGoogleFlights(params, { apiKey: "k", fetchImpl: vi.fn(async () => new Response("<html>", { status: 200 })) });
    expect(!unreadable.ok && unreadable.error.message).toBe("Réponse illisible de SerpApi.");
  });

  it("« aucun résultat » n'est pas une erreur", async () => {
    const result = await fetchGoogleFlights(params, {
      apiKey: "k",
      fetchImpl: vi.fn(async () => json({ search_metadata: { status: "Success" }, error: "Google Flights hasn't returned any results for this query." })),
    });
    expect(result).toEqual({ ok: true, results: { offers: [], googleFlightsUrl: null } });
    expect(classifySerpResponse(200, { best_flights: [] })).toBeNull();
  });

  it("compteur du compte : ne garde que les nombres (ni clé ni e-mail)", async () => {
    const account = {
      account_id: "x",
      api_key: "secret-key",
      account_email: "me@example.com",
      plan_name: "Free Plan",
      searches_per_month: 250,
      plan_searches_left: 238,
      extra_credits: 0,
      total_searches_left: 238,
      this_month_usage: 12,
    };
    const fetchImpl = vi.fn(async () => json(account));
    const usage = await fetchSerpAccount({ apiKey: "secret-key", baseUrl: "https://serp.test", fetchImpl });
    expect(usage).toEqual({ used: 12, limit: 250, left: 238 });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toMatch(/^https:\/\/serp\.test\/account\.json\?api_key=/);
    expect(await fetchSerpAccount({ apiKey: "k", fetchImpl: vi.fn(async () => json({}, 401)) })).toBeNull();
    expect(parseSerpAccount({ foo: 1 })).toBeNull();
  });
});

describe("conversion en élément de comparatif", () => {
  it("aller-retour : segments, durées, escales totales, prix du retour choisi", () => {
    const [outbound] = parseSerpFlights(fixture("google-flights-outbound.synthetic.json")).offers;
    const [inbound] = parseSerpFlights(fixture("google-flights-return.synthetic.json")).offers;
    const flight = buildSearchedFlight({ outbound, inbound, price: inbound.price, passengers: 2, fetchedAt: new Date(2026, 9, 1) });
    expect(flight.title).toBe("CDG → NRT (aller-retour) · Finnair, Japan Airlines");
    expect(flight.values).toEqual({
      totalPrice: 1248,
      outboundDuration: 845,
      inboundDuration: 885,
      stops: 1,
      airlines: "Finnair, Japan Airlines",
      outboundSchedule: "CDG 10:05 → NRT 08:10 (+1)",
      inboundSchedule: "NRT 11:00 → CDG 17:45",
    });
    expect(flight.details).toMatchObject({ passengers: 2, currency: "EUR", airlines: ["Finnair", "Japan Airlines"] });
    expect(flight.notes).toContain("Prix relevé sur Google Flights (via SerpApi) le 1 octobre 2026.");
    expect(flight.notes).toContain("total pour 2 passagers");
  });
});
