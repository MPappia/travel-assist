"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { flattenErrors, formDataToObject, tripSchema, type TripInput } from "@/lib/validation";

function toData(input: TripInput) {
  return {
    name: input.name,
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    travelers: input.travelers,
    budgetCents: input.budget,
    status: input.status,
    notes: input.notes,
  };
}

export async function createTrip(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = tripSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  const trip = await db.trip.create({ data: toData(parsed.data) });
  revalidatePath("/");
  return ok({ id: trip.id });
}

export async function updateTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  const parsed = tripSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  await db.trip.update({ where: { id: tripId }, data: toData(parsed.data) });
  revalidatePath("/", "layout");
  return ok();
}

export async function deleteTrip(tripId: string): Promise<ActionResult> {
  await db.trip.delete({ where: { id: tripId } });
  revalidatePath("/");
  return ok();
}
