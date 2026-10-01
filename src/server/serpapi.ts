import "server-only";

import { createHash } from "node:crypto";

import {
  buildSearchQuery,
  classifySerpResponse,
  parseSerpAccount,
  parseSerpFlights,
  type FlightSearchParams,
  type SerpAccountUsage,
  type SerpError,
  type SerpFlightResults,
} from "@/lib/serpapi/google-flights";
import { readCache, writeCache } from "@/server/cache";

// Client SerpApi (Google Flights). La clé SERPAPI_KEY n'est lue qu'ici, côté serveur ; sans clé,
// la recherche n'apparaît pas dans l'interface.

export const SERPAPI_CACHE_TTL_MS = 6 * 3600 * 1000;
const DEFAULT_BASE_URL = "https://serpapi.com";

export function getSerpApiKey(): string | null {
  return process.env.SERPAPI_KEY?.trim() || null;
}

export function isSerpApiEnabled(): boolean {
  return getSerpApiKey() !== null;
}

interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type SerpSearchResponse = { ok: true; results: SerpFlightResults } | { ok: false; error: SerpError };

/** Appel brut au moteur google_flights (1 crédit SerpApi par appel). */
export async function fetchGoogleFlights(
  params: FlightSearchParams,
  options: ClientOptions & { departureToken?: string },
): Promise<SerpSearchResponse> {
  const { apiKey, baseUrl = process.env.SERPAPI_BASE_URL ?? DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 30_000 } = options;
  const query = buildSearchQuery(params, options.departureToken);
  query.set("api_key", apiKey);
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/search.json?${query}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      error: { code: "ERROR", message: timeout ? "SerpApi ne répond pas (délai dépassé)." : "SerpApi est injoignable." },
    };
  }
  const json: unknown = await response.json().catch(() => null);
  const error = classifySerpResponse(response.status, json);
  if (error) return { ok: false, error };
  if (json === null) return { ok: false, error: { code: "ERROR", message: "Réponse illisible de SerpApi." } };
  return { ok: true, results: parseSerpFlights(json) };
}

/** Compteurs du compte (API Account, gratuite : ne consomme pas de recherche). */
export async function fetchSerpAccount(options: ClientOptions): Promise<SerpAccountUsage | null> {
  const { apiKey, baseUrl = process.env.SERPAPI_BASE_URL ?? DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 10_000 } = options;
  try {
    const response = await fetchImpl(`${baseUrl}/account.json?${new URLSearchParams({ api_key: apiKey })}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return parseSerpAccount(await response.json());
  } catch {
    return null;
  }
}

// ——— Cache (6 h par jeu de paramètres) et compteur local ———

export interface CachedFlightSearch {
  /** Date de l'appel à SerpApi : c'est la date de relevé des prix. */
  fetchedAt: string;
  results: SerpFlightResults;
}

function cacheKey(params: FlightSearchParams, departureToken?: string) {
  const hash = createHash("sha256").update(buildSearchQuery(params, departureToken).toString()).digest("hex");
  return `serpapi:google_flights:${hash}`;
}

const monthKey = (now = new Date()) => `serpapi:usage:${now.toISOString().slice(0, 7)}`;

export function readCachedFlightSearch(params: FlightSearchParams, departureToken?: string) {
  return readCache<CachedFlightSearch>(cacheKey(params, departureToken), SERPAPI_CACHE_TTL_MS);
}

/** Recherche avec cache : une même recherche (mêmes paramètres) ne consomme qu'un crédit toutes les 6 h. */
export async function searchGoogleFlights(
  params: FlightSearchParams,
  departureToken?: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; search: CachedFlightSearch; fromCache: boolean } | { ok: false; error: SerpError }> {
  const cached = await readCachedFlightSearch(params, departureToken);
  if (cached) return { ok: true, search: cached, fromCache: true };

  const apiKey = getSerpApiKey();
  if (!apiKey) return { ok: false, error: { code: "AUTH", message: "Recherche SerpApi désactivée (SERPAPI_KEY absente)." } };

  const response = await fetchGoogleFlights(params, { apiKey, departureToken, fetchImpl: options.fetchImpl });
  if (!response.ok) return response;
  const search: CachedFlightSearch = { fetchedAt: new Date().toISOString(), results: response.results };
  await writeCache(cacheKey(params, departureToken), search);
  const count = (await readCache<{ count: number }>(monthKey(), Number.POSITIVE_INFINITY))?.count ?? 0;
  await writeCache(monthKey(), { count: count + 1 });
  return { ok: true, search, fromCache: false };
}

export interface SerpUsage {
  /** Compteurs du compte SerpApi (null si l'API Account n'a pas répondu). */
  account: SerpAccountUsage | null;
  /** Recherches lancées depuis l'application ce mois-ci (hors cache) — repli si le compte est illisible. */
  local: number;
}

export async function getSerpUsage(options: { fetchImpl?: typeof fetch } = {}): Promise<SerpUsage> {
  const apiKey = getSerpApiKey();
  const [account, local] = await Promise.all([
    apiKey ? fetchSerpAccount({ apiKey, fetchImpl: options.fetchImpl }) : Promise.resolve(null),
    readCache<{ count: number }>(monthKey(), Number.POSITIVE_INFINITY),
  ]);
  return { account, local: local?.count ?? 0 };
}
