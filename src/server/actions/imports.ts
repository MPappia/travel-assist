"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { COMPARISON_PRESETS } from "@/lib/domain/comparison-presets";
import { parseCriterionInput } from "@/lib/domain/criteria-values";
import {
  mapListingToCriteria,
  MAPPABLE_FIELDS,
  NEW_COMPARISON,
  type MappableValues,
} from "@/lib/listing-extract/criteria-mapping";
import { pastedContentSchema, reduceText } from "@/lib/listing-extract/payload";
import { flattenErrors, formDataToObject, importConfirmSchema } from "@/lib/validation";
import { createPendingImport, deletePendingImport, getPendingImport } from "@/server/pending-imports";

/**
 * Valide un import : crée l'élément de comparatif (et, si demandé, un comparatif « Logements »)
 * et pré-remplit les critères correspondants que l'utilisateur a laissés cochés.
 */
export async function confirmImport(
  pendingId: string,
  formData: FormData,
): Promise<ActionResult<{ tripId: string; comparisonId: string; prefilled: string[] }>> {
  const pending = await getPendingImport(pendingId);
  if (!pending) return fail("Cet import a expiré ou a déjà été validé.");

  const parsed = importConfirmSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  const input = parsed.data;

  const trip = await db.trip.findUnique({ where: { id: input.tripId }, select: { id: true } });
  if (!trip) return fail("Voyage introuvable", { tripId: "Voyage introuvable" });

  let comparisonId = input.comparisonId;
  if (comparisonId === NEW_COMPARISON) {
    const preset = COMPARISON_PRESETS.find((p) => p.key === "lodging")!;
    const created = await db.comparison.create({
      data: {
        tripId: trip.id,
        name: preset.name,
        expenseCategory: "ACCOMMODATION",
        criteria: { create: preset.criteria.map((c, position) => ({ ...c, position })) },
      },
    });
    comparisonId = created.id;
  } else {
    const comparison = await db.comparison.findFirst({ where: { id: comparisonId, tripId: trip.id }, select: { id: true } });
    if (!comparison) return fail("Comparatif introuvable", { comparisonId: "Comparatif introuvable" });
  }

  const criteria = await db.criterion.findMany({ where: { comparisonId } });
  const values: MappableValues = {};
  for (const field of MAPPABLE_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== "") (values as Record<string, unknown>)[field] = value;
  }
  const accepted = new Set(MAPPABLE_FIELDS.filter((f) => formData.get(`apply:${f}`) === "on"));
  const matches = mapListingToCriteria(criteria, values).filter((m) => accepted.has(m.field));

  let domain: string | null = null;
  try {
    domain = input.url ? new URL(input.url).hostname.replace(/^www\./, "") : null;
  } catch {
    domain = null;
  }
  const extraction = pending.extraction ? (JSON.parse(pending.extraction) as { siteName?: string | null }) : null;

  const item = await db.comparisonItem.create({
    data: {
      comparisonId,
      title: input.title,
      url: input.url,
      notes: input.notes,
      previewStatus: input.image || input.description ? "OK" : "PARTIAL",
      previewTitle: input.title,
      previewImage: input.image,
      previewDescription: input.description || null,
      previewSiteName: extraction?.siteName ?? null,
      previewDomain: domain,
      previewError: null,
      previewFetchedAt: new Date(),
    },
  });

  const prefilled: string[] = [];
  for (const match of matches) {
    const raw = typeof match.value === "boolean" ? String(match.value) : String(match.value);
    const parsedValue = parseCriterionInput(match.criterion.type, raw);
    if (!parsedValue.ok) continue;
    await db.criterionValue.create({ data: { itemId: item.id, criterionId: match.criterion.id, ...parsedValue.value } });
    prefilled.push(match.criterion.name);
  }

  await deletePendingImport(pending.id);
  revalidatePath(`/trips/${trip.id}`, "layout");
  revalidatePath("/");
  return ok({ tripId: trip.id, comparisonId, prefilled });
}

/** Abandonne un import en attente. */
export async function discardImport(pendingId: string): Promise<ActionResult> {
  await deletePendingImport(pendingId);
  return ok();
}

/** « Coller le contenu de la page » : même pipeline d'extraction et même page de confirmation. */
export async function createImportFromText(input: { text: string; url?: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = pastedContentSchema.safeParse(input);
  if (!parsed.success) return fail("Contenu invalide", flattenErrors(parsed.error));
  // Même logique que le favori : début de page + zone des tarifs si le texte est trop long.
  const reduced = reduceText(parsed.data.text.replace(/\r\n?/g, "\n"));
  const pending = await createPendingImport("paste", {
    url: parsed.data.url || null,
    text: reduced.text,
    warnings: reduced.warning ? [`${reduced.warning} (réduit par le serveur)`] : [],
  });
  return ok({ id: pending.id });
}
