import { NextResponse, type NextRequest } from "next/server";

import { GeocodingError, searchPlaces } from "@/server/geocoding";

// GET /api/geocode?q=… — autocomplétion d'adresses (Photon), appelée par le client.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchPlaces(q) });
  } catch (error) {
    const message = error instanceof GeocodingError ? error.message : "Recherche impossible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
