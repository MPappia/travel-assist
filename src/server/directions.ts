import "server-only";

import { createHash } from "node:crypto";

import {
  buildOrsRequest,
  parseOrsError,
  parseOrsResponse,
  type DirectionsError,
  type DirectionsResult,
  type LngLat,
} from "@/lib/domain/ors";
import type { RouteModeValue } from "@/lib/labels";
import { readCache, writeCache } from "@/server/cache";
import { fetchWithTimeout } from "@/server/http";

const ORS_BASE_URL = process.env.ORS_BASE_URL ?? "https://api.openrouteservice.org";
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

export type DirectionsResponse = { ok: true; result: DirectionsResult } | { ok: false; error: DirectionsError };

/** Calcule l'itinéraire complet via OpenRouteService (clé lue côté serveur uniquement). */
export async function computeDirections(
  mode: RouteModeValue,
  coordinates: LngLat[],
  names: string[],
): Promise<DirectionsResponse> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: "MISSING_KEY",
        message: "Clé OpenRouteService manquante : ajoutez ORS_API_KEY dans le fichier .env puis redémarrez le serveur.",
      },
    };
  }

  const rounded = coordinates.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))] as LngLat);
  const key = `ors:${createHash("sha256").update(JSON.stringify([mode, rounded])).digest("hex")}`;
  const cached = await readCache<DirectionsResult>(key, CACHE_TTL_MS);
  if (cached) return { ok: true, result: cached };

  const { path, body } = buildOrsRequest(mode, rounded);
  let response: Response;
  try {
    response = await fetchWithTimeout(`${ORS_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: 15_000,
    });
  } catch {
    return { ok: false, error: { code: "UNAVAILABLE", message: "Le service d'itinéraire est injoignable." } };
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: parseOrsError(response.status, json, { mode, names }) };

  try {
    const result = parseOrsResponse(json, rounded.length);
    await writeCache(key, result);
    return { ok: true, result };
  } catch {
    return { ok: false, error: { code: "UNAVAILABLE", message: "Réponse inattendue du service d'itinéraire." } };
  }
}
