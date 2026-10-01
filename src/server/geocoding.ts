import "server-only";

import { parsePhotonFeature, parsePhotonResults, type Place } from "@/lib/domain/geocoding";
import { readCache, writeCache } from "@/server/cache";
import { createThrottle, fetchWithTimeout } from "@/server/http";

// Photon (komoot) : géocodeur basé sur OpenStreetMap, adapté à l'autocomplétion.
// Politique d'usage : User-Agent identifiable, pas d'usage intensif → cache + 1 requête/s au plus.
const PHOTON_BASE_URL = process.env.PHOTON_BASE_URL ?? "https://photon.komoot.io";
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const throttle = createThrottle(1000);

export class GeocodingError extends Error {}

function userAgent() {
  return `traveler-assist/0.1 (${process.env.GEOCODER_CONTACT || "usage personnel"})`;
}

async function photon(path: string, params: Record<string, string>): Promise<unknown> {
  const url = `${PHOTON_BASE_URL}${path}?${new URLSearchParams(params)}`;
  const response = await throttle(() =>
    fetchWithTimeout(url, { headers: { "User-Agent": userAgent(), Accept: "application/json" }, timeoutMs: 8000 }),
  ).catch(() => {
    throw new GeocodingError("Service de recherche d'adresses injoignable");
  });
  if (response.status === 429) throw new GeocodingError("Trop de recherches, patientez quelques secondes");
  if (!response.ok) throw new GeocodingError("Le service de recherche d'adresses a renvoyé une erreur");
  return response.json();
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 120);
  const key = `geocode:${q.toLowerCase()}`;
  const cached = await readCache<Place[]>(key, CACHE_TTL_MS);
  if (cached) return cached;
  const places = parsePhotonResults(await photon("/api", { q, limit: "6", lang: "fr" }));
  await writeCache(key, places);
  return places;
}

export async function reverseGeocode(lat: number, lng: number): Promise<Place | null> {
  const key = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = await readCache<{ place: Place | null }>(key, CACHE_TTL_MS);
  if (cached) return cached.place;
  const json = (await photon("/reverse", { lat: String(lat), lon: String(lng), lang: "fr", limit: "1" })) as {
    features?: Parameters<typeof parsePhotonFeature>[0][];
  };
  const feature = json.features?.[0];
  const place = feature ? parsePhotonFeature(feature) : null;
  // On garde les coordonnées cliquées, pas celles de l'objet OSM trouvé.
  const result = place ? { ...place, lat, lng } : null;
  await writeCache(key, { place: result });
  return result;
}
