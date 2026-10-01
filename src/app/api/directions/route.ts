import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_WAYPOINTS } from "@/lib/domain/ors";
import { ROUTE_MODES } from "@/lib/labels";
import { computeDirections } from "@/server/directions";

const bodySchema = z.object({
  mode: z.enum(ROUTE_MODES),
  points: z
    .array(
      z.object({
        name: z.string().max(200),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .min(2, "Au moins deux étapes")
    .max(MAX_WAYPOINTS, `${MAX_WAYPOINTS} étapes maximum`),
});

// POST /api/directions — calcule l'itinéraire multi-étapes (OpenRouteService, côté serveur).
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message ?? "Requête invalide" } },
      { status: 400 },
    );
  }
  const { mode, points } = parsed.data;
  const response = await computeDirections(
    mode,
    points.map((p) => [p.lng, p.lat]),
    points.map((p) => p.name),
  );
  return NextResponse.json(response, { status: response.ok ? 200 : 422 });
}
