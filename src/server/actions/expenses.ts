"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { expenseSchema, flattenErrors, formDataToObject, type ExpenseInput } from "@/lib/validation";

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`, "layout");
  revalidatePath("/");
}

function toData(input: ExpenseInput) {
  return { label: input.label, category: input.category, amountCents: input.amount, status: input.status };
}

export async function createExpense(tripId: string, formData: FormData): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  await db.expense.create({ data: { ...toData(parsed.data), tripId } });
  revalidateTrip(tripId);
  return ok();
}

export async function updateExpense(expenseId: string, formData: FormData): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  const expense = await db.expense.update({ where: { id: expenseId }, data: toData(parsed.data) });
  revalidateTrip(expense.tripId);
  return ok();
}

export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  const expense = await db.expense.delete({ where: { id: expenseId } });
  revalidateTrip(expense.tripId);
  return ok();
}
