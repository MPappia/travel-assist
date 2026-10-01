import { NextResponse, type NextRequest } from "next/server";

import { GeocodingError, reverseGeocode } from "@/server/geocoding";

// GET /api/geocode/reverse?lat=…&lng=… — nom du lieu cliqué sur la carte.
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Coordonnées invalides" }, { status: 400 });
  }
  try {
    return NextResponse.json({ place: await reverseGeocode(lat, lng) });
  } catch (error) {
    const message = error instanceof GeocodingError ? error.message : "Recherche impossible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
