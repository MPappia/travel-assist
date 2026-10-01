"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { flattenErrors, formDataToObject, taskSchema } from "@/lib/validation";

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`, "layout");
  revalidatePath("/");
}

export async function createTask(tripId: string, formData: FormData): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  await db.task.create({ data: { ...parsed.data, tripId } });
  revalidateTrip(tripId);
  return ok();
}

export async function updateTask(taskId: string, formData: FormData): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  const task = await db.task.update({ where: { id: taskId }, data: parsed.data });
  revalidateTrip(task.tripId);
  return ok();
}

export async function setTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  const task = await db.task.update({ where: { id: taskId }, data: { done } });
  revalidateTrip(task.tripId);
  return ok();
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const task = await db.task.delete({ where: { id: taskId } });
  revalidateTrip(task.tripId);
  return ok();
}
