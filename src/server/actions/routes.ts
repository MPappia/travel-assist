"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { MAX_WAYPOINTS } from "@/lib/domain/ors";
import { ROUTE_MODES, type RouteModeValue } from "@/lib/labels";
import { flattenErrors, formDataToObject, newStopSchema, routeSchema, stopDetailsSchema } from "@/lib/validation";

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`, "layout");
}

async function tripIdOfRoute(routeId: string) {
  return (await db.route.findUniqueOrThrow({ where: { id: routeId }, select: { tripId: true } })).tripId;
}

export async function createRoute(tripId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = routeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  const route = await db.route.create({ data: { ...parsed.data, tripId } });
  revalidateTrip(tripId);
  return ok({ id: route.id });
}

export async function renameRoute(routeId: string, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Formulaire invalide", { name: "Le nom est obligatoire" });
  const route = await db.route.update({ where: { id: routeId }, data: { name: name.slice(0, 120) } });
  revalidateTrip(route.tripId);
  return ok();
}

export async function setRouteMode(routeId: string, mode: RouteModeValue): Promise<ActionResult> {
  if (!ROUTE_MODES.includes(mode)) return fail("Mode inconnu");
  const route = await db.route.update({ where: { id: routeId }, data: { mode } });
  revalidateTrip(route.tripId);
  return ok();
}

export async function deleteRoute(routeId: string): Promise<ActionResult> {
  const route = await db.route.delete({ where: { id: routeId } });
  revalidateTrip(route.tripId);
  return ok();
}

export async function addStop(routeId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = newStopSchema.safeParse(input);
  if (!parsed.success) return fail("Étape invalide");
  const count = await db.routeStop.count({ where: { routeId } });
  if (count >= MAX_WAYPOINTS) return fail(`${MAX_WAYPOINTS} étapes maximum par itinéraire`);
  const stop = await db.routeStop.create({ data: { ...parsed.data, routeId, position: count } });
  revalidateTrip(await tripIdOfRoute(routeId));
  return ok({ id: stop.id });
}

export async function updateStop(stopId: string, formData: FormData): Promise<ActionResult> {
  const parsed = stopDetailsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  const stop = await db.routeStop.update({ where: { id: stopId }, data: parsed.data });
  revalidateTrip(await tripIdOfRoute(stop.routeId));
  return ok();
}

export async function deleteStop(stopId: string): Promise<ActionResult> {
  const stop = await db.routeStop.delete({ where: { id: stopId } });
  // Recompacte les positions
  const remaining = await db.routeStop.findMany({ where: { routeId: stop.routeId }, orderBy: { position: "asc" } });
  await db.$transaction(remaining.map((s, position) => db.routeStop.update({ where: { id: s.id }, data: { position } })));
  revalidateTrip(await tripIdOfRoute(stop.routeId));
  return ok();
}

/** Enregistre un nouvel ordre d'étapes (liste complète des identifiants). */
export async function reorderStops(routeId: string, orderedIds: string[]): Promise<ActionResult> {
  const stops = await db.routeStop.findMany({ where: { routeId }, select: { id: true } });
  const known = new Set(stops.map((s) => s.id));
  if (orderedIds.length !== known.size || !orderedIds.every((id) => known.has(id))) {
    return fail("L'itinéraire a changé entre-temps, rechargez la page.");
  }
  await db.$transaction(orderedIds.map((id, position) => db.routeStop.update({ where: { id }, data: { position } })));
  revalidateTrip(await tripIdOfRoute(routeId));
  return ok();
}
