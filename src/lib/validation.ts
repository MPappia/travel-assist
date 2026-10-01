// Schémas de validation (zod) des formulaires. Ils transforment les chaînes saisies
// en valeurs typées prêtes pour la base (dates UTC, montants en centimes…).
import { z } from "zod";

import { parseDateInput, parseMoneyToCents } from "@/lib/format";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, TASK_CATEGORIES, TRIP_STATUSES } from "@/lib/labels";

const optionalDate = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const date = parseDateInput(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Date invalide" });
      return z.NEVER;
    }
    return date;
  });

const optionalMoney = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value || value.trim() === "") return null;
    const cents = parseMoneyToCents(value);
    if (cents === null || cents < 0) {
      ctx.addIssue({ code: "custom", message: "Montant invalide" });
      return z.NEVER;
    }
    return cents;
  });

const requiredMoney = z.string().transform((value, ctx) => {
  const cents = parseMoneyToCents(value);
  if (cents === null || cents < 0) {
    ctx.addIssue({ code: "custom", message: "Montant invalide" });
    return z.NEVER;
  }
  return cents;
});

export const tripSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est obligatoire").max(120),
    destination: z.string().trim().max(120).default(""),
    startDate: optionalDate,
    endDate: optionalDate,
    travelers: z.coerce.number().int("Nombre entier attendu").min(1, "Au moins 1 voyageur").max(99).default(1),
    budget: optionalMoney,
    status: z.enum(TRIP_STATUSES).default("IDEA"),
    notes: z.string().max(5000).default(""),
  })
  .refine((t) => !t.startDate || !t.endDate || t.endDate >= t.startDate, {
    message: "La date de fin doit suivre la date de début",
    path: ["endDate"],
  });
export type TripInput = z.output<typeof tripSchema>;

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire").max(200),
  category: z.enum(TASK_CATEGORIES).default("OTHER"),
  dueDate: optionalDate,
});
export type TaskInput = z.output<typeof taskSchema>;

export const expenseSchema = z.object({
  label: z.string().trim().min(1, "Le libellé est obligatoire").max(200),
  category: z.enum(EXPENSE_CATEGORIES).default("OTHER"),
  amount: requiredMoney,
  status: z.enum(EXPENSE_STATUSES).default("ESTIMATED"),
});
export type ExpenseInput = z.output<typeof expenseSchema>;

/** Convertit un FormData en objet de chaînes (les champs vides deviennent undefined). */
export function formDataToObject(formData: FormData): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value === "" ? undefined : value;
  }
  return result;
}

export type FieldErrors = Record<string, string>;

export function flattenErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}
