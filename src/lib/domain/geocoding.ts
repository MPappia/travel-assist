// Interprétation des réponses Photon (komoot) — module pur.

export interface Place {
  name: string;
  /** Libellé complet affiché dans l'autocomplétion. */
  label: string;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
}

export function parsePhotonFeature(feature: PhotonFeature): Place | null {
  const coords = feature.geometry?.coordinates;
  if (!coords || typeof coords[0] !== "number" || typeof coords[1] !== "number") return null;
  const p = feature.properties ?? {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const name = p.name ?? (street || p.city || p.county || p.state || p.country);
  if (!name) return null;
  const parts = [name, street && street !== name ? street : undefined, p.city ?? p.county, p.state, p.country];
  const label = parts.filter((part, index): part is string => !!part && parts.indexOf(part) === index).join(", ");
  return { name, label, lat: coords[1], lng: coords[0] };
}

export function parsePhotonResults(json: unknown): Place[] {
  const features = (json as { features?: PhotonFeature[] })?.features ?? [];
  const places = features.map(parsePhotonFeature).filter((p): p is Place => p !== null);
  // Supprime les doublons de libellé (Photon renvoie parfois la même ville plusieurs fois).
  return places.filter((p, i) => places.findIndex((q) => q.label === p.label) === i);
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
