// OpenRouteService (Directions v2) : construction de la requête et interprétation de la réponse.
// Module pur : l'appel HTTP est fait côté serveur (src/server/directions.ts).
import type { RouteModeValue } from "@/lib/labels";

export const ORS_PROFILES: Record<RouteModeValue, string> = {
  DRIVING: "driving-car",
  CYCLING: "cycling-regular",
  WALKING: "foot-walking",
};

/** Limite de l'offre gratuite ORS pour les points de passage. */
export const MAX_WAYPOINTS = 50;
/** Rayon (m) dans lequel ORS cherche une route autour de chaque étape. */
export const SNAP_RADIUS_M = 1000;

export type LngLat = [number, number];

export interface DirectionsLeg {
  distance: number; // mètres
  duration: number; // secondes
}

export interface DirectionsResult {
  legs: DirectionsLeg[];
  distance: number;
  duration: number;
  /** Tracé GeoJSON (LineString) en [lng, lat]. */
  geometry: LngLat[];
}

export type DirectionsErrorCode =
  | "MISSING_KEY"
  | "INVALID_KEY"
  | "QUOTA"
  | "UNROUTABLE_POINT"
  | "NO_ROUTE"
  | "TOO_LONG"
  | "INVALID_REQUEST"
  | "UNAVAILABLE";

export interface DirectionsError {
  code: DirectionsErrorCode;
  message: string;
  /** Index (0-based) de l'étape en cause, si ORS l'indique. */
  stopIndex?: number;
}

export function buildOrsRequest(mode: RouteModeValue, coordinates: readonly LngLat[]) {
  return {
    path: `/v2/directions/${ORS_PROFILES[mode]}/geojson`,
    body: {
      coordinates,
      instructions: false,
      radiuses: coordinates.map(() => SNAP_RADIUS_M),
    },
  };
}

interface OrsFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    segments?: { distance?: number; duration?: number }[];
    summary?: { distance?: number; duration?: number };
  };
}

export function parseOrsResponse(json: unknown, waypointCount: number): DirectionsResult {
  const feature = (json as { features?: OrsFeature[] })?.features?.[0];
  if (!feature?.geometry || !Array.isArray(feature.geometry.coordinates)) {
    throw new Error("Réponse OpenRouteService inattendue");
  }
  const segments = feature.properties?.segments ?? [];
  // ORS omet les segments de longueur nulle (deux étapes identiques) : on complète.
  const legs: DirectionsLeg[] = Array.from({ length: Math.max(0, waypointCount - 1) }, (_, i) => ({
    distance: segments[i]?.distance ?? 0,
    duration: segments[i]?.duration ?? 0,
  }));
  const distance = feature.properties?.summary?.distance ?? legs.reduce((s, l) => s + l.distance, 0);
  const duration = feature.properties?.summary?.duration ?? legs.reduce((s, l) => s + l.duration, 0);
  const geometry = (feature.geometry.coordinates as unknown[]).filter(
    (c): c is LngLat => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number",
  );
  return { legs, distance, duration, geometry };
}

const MODE_ADJECTIVE: Record<RouteModeValue, string> = {
  DRIVING: "en voiture",
  CYCLING: "à vélo",
  WALKING: "à pied",
};

/** Traduit une erreur HTTP d'ORS en message clair. `names` sert à nommer l'étape en cause. */
export function parseOrsError(
  status: number,
  body: unknown,
  context: { mode: RouteModeValue; names: readonly string[] },
): DirectionsError {
  const error = (body as { error?: unknown })?.error;
  const code = typeof error === "object" && error !== null ? (error as { code?: number }).code : undefined;
  const rawMessage =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null
        ? String((error as { message?: unknown }).message ?? "")
        : "";

  if (status === 401) return { code: "INVALID_KEY", message: "Clé OpenRouteService refusée : vérifiez ORS_API_KEY dans .env." };
  if (status === 429 || /quota|rate limit/i.test(rawMessage)) {
    return {
      code: "QUOTA",
      message: "Quota OpenRouteService atteint (offre gratuite limitée par minute et par jour). Réessayez plus tard.",
    };
  }
  if (status === 403) return { code: "INVALID_KEY", message: "Accès refusé par OpenRouteService : vérifiez ORS_API_KEY." };

  if (code === 2010) {
    const index = Number(rawMessage.match(/coordinate (\d+)/)?.[1]);
    const stopIndex = Number.isInteger(index) ? index : undefined;
    const name = stopIndex !== undefined ? context.names[stopIndex] : undefined;
    return {
      code: "UNROUTABLE_POINT",
      stopIndex,
      message: `${stopIndex !== undefined ? `L'étape ${stopIndex + 1}${name ? ` (« ${name} »)` : ""}` : "Une étape"} n'est pas accessible ${MODE_ADJECTIVE[context.mode]} : rapprochez-la d'une route ou d'un chemin.`,
    };
  }
  if (code === 2009) {
    return { code: "NO_ROUTE", message: `Aucun itinéraire ${MODE_ADJECTIVE[context.mode]} n'a été trouvé entre ces étapes.` };
  }
  if (code === 2004) {
    return {
      code: "TOO_LONG",
      message: "Itinéraire trop long pour le service gratuit : découpez-le en plusieurs itinéraires.",
    };
  }
  if (status >= 400 && status < 500) {
    return { code: "INVALID_REQUEST", message: `Requête refusée par OpenRouteService${rawMessage ? ` : ${rawMessage}` : ""}.` };
  }
  return { code: "UNAVAILABLE", message: "Le service d'itinéraire est momentanément indisponible." };
}

/** Distance orthodromique (m) — utile pour les tests et les estimations. */
export function haversine([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
