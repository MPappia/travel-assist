// Schémas de validation (zod) des formulaires. Ils transforment les chaînes saisies
// en valeurs typées prêtes pour la base (dates UTC, montants en centimes…).
import { z } from "zod";

import { parseDateInput, parseMoneyToCents } from "@/lib/format";
import {
  COMPARISON_KINDS,
  CRITERION_DIRECTIONS,
  CRITERION_TYPES,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  ROUTE_MODES,
  TASK_CATEGORIES,
  TRIP_STATUSES,
} from "@/lib/labels";

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

// ——— Comparatifs ———

export const criterionInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Nom du critère obligatoire").max(80),
  type: z.enum(CRITERION_TYPES),
  weight: z.coerce.number().min(0, "Poids positif").max(10, "Poids maximum : 10"),
  direction: z.enum(CRITERION_DIRECTIONS),
  unit: z.string().trim().max(12).default(""),
});
export type CriterionInput = z.output<typeof criterionInputSchema>;

export const comparisonSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire").max(120),
  expenseCategory: z.enum(EXPENSE_CATEGORIES).default("ACCOMMODATION"),
  /** Fixé à la création par le modèle choisi ; absent = inchangé (édition) ou générique (création). */
  kind: z.enum(COMPARISON_KINDS).optional(),
  criteria: z.array(criterionInputSchema).max(30, "30 critères maximum"),
});
export type ComparisonInput = z.output<typeof comparisonSchema>;

function toHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** URL http(s) facultative. */
export const optionalHttpUrl = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const url = toHttpUrl(value);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "Adresse http(s) invalide" });
      return z.NEVER;
    }
    return url;
  });

export const comparisonItemSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire").max(200),
  url: optionalHttpUrl,
  notes: z.string().max(5000).default(""),
  // Champs d'aperçu corrigibles à la main (facultatifs dans le formulaire).
  previewDescription: z.string().trim().max(1000).optional(),
  previewImage: optionalHttpUrl.optional(),
  // Vols : date du relevé du prix (« YYYY-MM-DD » ; vide = effacer ; absent = inchangé)
  priceCapturedAt: z
    .string()
    .optional()
    .refine((v) => !v || parseDateInput(v) !== null, "Date invalide"),
});

export const itemUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Collez une adresse")
    .transform((value, ctx) => {
      const url = toHttpUrl(value);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "Adresse http(s) invalide" });
        return z.NEVER;
      }
      return url;
    }),
});

export const itemExpenseSchema = z.object({
  label: z.string().trim().min(1, "Le libellé est obligatoire").max(200),
  amount: requiredMoney,
  status: z.enum(EXPENSE_STATUSES).default("BOOKED"),
});

// ——— Itinéraires ———

export const routeSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire").max(120),
  mode: z.enum(ROUTE_MODES).default("DRIVING"),
});

export const newStopSchema = z.object({
  name: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const stopDetailsSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire").max(200),
  date: optionalDate,
  nights: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 60) {
        ctx.addIssue({ code: "custom", message: "Entre 0 et 60 nuits" });
        return z.NEVER;
      }
      return n;
    }),
  notes: z.string().max(2000).default(""),
});

// ——— Import d'annonce ———

const optionalNumber = (options: { int?: boolean; min?: number; max: number; label: string }) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return undefined;
      const n = Number(value.replace(/[\s  €]/g, "").replace(",", "."));
      const valid = Number.isFinite(n) && n >= (options.min ?? 0) && n <= options.max && (!options.int || Number.isInteger(n));
      if (!valid) {
        ctx.addIssue({ code: "custom", message: options.label });
        return z.NEVER;
      }
      return n;
    });

export const importConfirmSchema = z.object({
  tripId: z.string().min(1, "Choisissez un voyage"),
  comparisonId: z.string().min(1, "Choisissez un comparatif"),
  title: z.string().trim().min(1, "Le titre est obligatoire").max(200),
  url: optionalHttpUrl,
  image: optionalHttpUrl,
  description: z.string().trim().max(1000).default(""),
  notes: z.string().max(5000).default(""),
  address: z.string().trim().max(200).optional(),
  totalPrice: optionalNumber({ max: 1_000_000, label: "Montant invalide" }),
  pricePerNight: optionalNumber({ max: 100_000, label: "Montant invalide" }),
  nights: optionalNumber({ int: true, min: 1, max: 90, label: "Entre 1 et 90 nuits" }),
  rating: optionalNumber({ min: 1, max: 5, label: "Note entre 1 et 5" }),
  reviewCount: optionalNumber({ int: true, max: 10_000_000, label: "Nombre entier attendu" }),
  beds: optionalNumber({ int: true, max: 100, label: "Nombre entier attendu" }),
  bedrooms: optionalNumber({ int: true, max: 100, label: "Nombre entier attendu" }),
  guests: optionalNumber({ int: true, min: 1, max: 100, label: "Nombre entier attendu" }),
  freeCancellation: z
    .enum(["true", "false", ""])
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
});
export type ImportConfirmInput = z.output<typeof importConfirmSchema>;
