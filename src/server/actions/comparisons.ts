"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { parseCriterionInput, type StoredCriterionValue } from "@/lib/domain/criteria-values";
import type { ItemStatusValue } from "@/lib/labels";
import { getLinkPreview, type LinkPreviewResult } from "@/server/link-preview";
import { ITEM_STATUSES } from "@/lib/labels";
import {
  comparisonItemSchema,
  comparisonSchema,
  flattenErrors,
  formDataToObject,
  itemExpenseSchema,
  itemUrlSchema,
  type FieldErrors,
} from "@/lib/validation";

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`, "layout");
  revalidatePath("/");
}

async function tripIdOfComparison(comparisonId: string) {
  const comparison = await db.comparison.findUniqueOrThrow({ where: { id: comparisonId }, select: { tripId: true } });
  return comparison.tripId;
}

// ——— Comparatifs et critères ———

export async function createComparison(tripId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = comparisonSchema.safeParse(input);
  if (!parsed.success) return fail("Comparatif invalide", flattenErrors(parsed.error));
  const { name, expenseCategory, criteria } = parsed.data;
  const comparison = await db.comparison.create({
    data: {
      tripId,
      name,
      expenseCategory,
      criteria: {
        create: criteria.map((c, position) => ({
          name: c.name,
          type: c.type,
          weight: c.weight,
          direction: c.direction,
          unit: c.unit,
          position,
        })),
      },
    },
  });
  revalidateTrip(tripId);
  return ok({ id: comparison.id });
}

/**
 * Met à jour le comparatif et synchronise ses critères :
 * les critères existants (id connu) sont modifiés en conservant leurs valeurs,
 * les nouveaux sont créés, ceux qui ont disparu sont supprimés.
 */
export async function updateComparison(comparisonId: string, input: unknown): Promise<ActionResult> {
  const parsed = comparisonSchema.safeParse(input);
  if (!parsed.success) return fail("Comparatif invalide", flattenErrors(parsed.error));
  const { name, expenseCategory, criteria } = parsed.data;

  const existing = await db.criterion.findMany({ where: { comparisonId }, select: { id: true, type: true } });
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const keptIds = new Set(criteria.map((c) => c.id).filter((id): id is string => !!id && existingById.has(id)));

  const tripId = await db.$transaction(async (tx) => {
    const comparison = await tx.comparison.update({ where: { id: comparisonId }, data: { name, expenseCategory } });
    await tx.criterion.deleteMany({ where: { comparisonId, id: { notIn: [...keptIds] } } });
    for (const [position, c] of criteria.entries()) {
      const data = { name: c.name, type: c.type, weight: c.weight, direction: c.direction, unit: c.unit, position };
      if (c.id && keptIds.has(c.id)) {
        await tx.criterion.update({ where: { id: c.id }, data });
        // Un changement de type rend les anciennes valeurs incohérentes : on les efface.
        if (existingById.get(c.id)!.type !== c.type) await tx.criterionValue.deleteMany({ where: { criterionId: c.id } });
      } else {
        await tx.criterion.create({ data: { ...data, comparisonId } });
      }
    }
    return comparison.tripId;
  });

  revalidateTrip(tripId);
  return ok();
}

export async function deleteComparison(comparisonId: string): Promise<ActionResult> {
  const comparison = await db.comparison.delete({ where: { id: comparisonId } });
  revalidateTrip(comparison.tripId);
  return ok();
}

// ——— Éléments ———

/** Lit les champs `value:<criterionId>` du formulaire et les valide selon le type de chaque critère. */
async function parseItemValues(comparisonId: string, formData: FormData) {
  const criteria = await db.criterion.findMany({ where: { comparisonId } });
  const values: { criterionId: string; value: StoredCriterionValue }[] = [];
  const errors: FieldErrors = {};
  for (const criterion of criteria) {
    const key = `value:${criterion.id}`;
    if (!formData.has(key)) continue;
    const raw = formData.get(key);
    const parsed = parseCriterionInput(criterion.type, typeof raw === "string" ? raw : "");
    if (parsed.ok) values.push({ criterionId: criterion.id, value: parsed.value });
    else errors[key] = parsed.error;
  }
  return { values, errors };
}

async function writeItemValues(itemId: string, values: { criterionId: string; value: StoredCriterionValue }[]) {
  await db.$transaction(
    values.map(({ criterionId, value }) =>
      db.criterionValue.upsert({
        where: { itemId_criterionId: { itemId, criterionId } },
        create: { itemId, criterionId, ...value },
        update: value,
      }),
    ),
  );
}

/** Champs d'aperçu à enregistrer en base à partir d'un résultat d'extraction. */
function previewData(preview: LinkPreviewResult) {
  return {
    previewStatus: preview.status,
    previewTitle: preview.title,
    previewDescription: preview.description,
    previewImage: preview.image,
    previewSiteName: preview.siteName,
    previewDomain: preview.domain || null,
    previewError: preview.error,
    previewFetchedAt: new Date(preview.fetchedAt),
  };
}

/** Données d'item issues du formulaire : les champs d'aperçu ne sont modifiés que s'ils sont présents. */
function itemData(data: ReturnType<typeof comparisonItemSchema.parse>) {
  const { previewDescription, previewImage, ...rest } = data;
  return {
    ...rest,
    ...(previewDescription !== undefined && { previewDescription: previewDescription || null }),
    ...(previewImage !== undefined && { previewImage }),
  };
}

/**
 * Crée un élément à partir d'une URL collée : l'aperçu est extrait côté serveur.
 * L'élément est créé même si l'extraction échoue (le message est conservé et affiché discrètement).
 */
export async function createItemFromUrl(
  comparisonId: string,
  rawUrl: string,
): Promise<ActionResult<{ id: string; status: LinkPreviewResult["status"]; error: string | null }>> {
  const parsed = itemUrlSchema.safeParse({ url: rawUrl });
  if (!parsed.success) return fail("Adresse invalide", flattenErrors(parsed.error));
  const url = parsed.data.url;

  const preview = await getLinkPreview(url);
  const item = await db.comparisonItem.create({
    data: {
      comparisonId,
      url,
      title: preview.title ?? preview.domain ?? url,
      ...previewData(preview),
    },
  });
  revalidateTrip(await tripIdOfComparison(comparisonId));
  return ok({ id: item.id, status: preview.status, error: preview.error });
}

/** Relance l'extraction (sans cache). Le titre n'est remplacé que s'il n'a pas été modifié à la main. */
export async function refreshItemPreview(
  itemId: string,
): Promise<ActionResult<{ status: LinkPreviewResult["status"]; error: string | null }>> {
  const item = await db.comparisonItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!item.url) return fail("Cet élément n'a pas de lien");

  const preview = await getLinkPreview(item.url, { force: true });
  const titleWasAutomatic = [item.previewTitle, item.previewDomain, item.url].includes(item.title);
  const keepManual = preview.status === "FAILED";
  await db.comparisonItem.update({
    where: { id: itemId },
    data: {
      ...(keepManual
        ? { previewStatus: "FAILED", previewError: preview.error, previewFetchedAt: new Date(preview.fetchedAt) }
        : previewData(preview)),
      ...(titleWasAutomatic && preview.title ? { title: preview.title } : {}),
    },
  });
  revalidateTrip(await tripIdOfComparison(item.comparisonId));
  return ok({ status: preview.status, error: preview.error });
}

export async function createComparisonItem(comparisonId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = comparisonItemSchema.safeParse(formDataToObject(formData));
  const { values, errors } = await parseItemValues(comparisonId, formData);
  if (!parsed.success || Object.keys(errors).length > 0) {
    return fail("Formulaire invalide", { ...(parsed.success ? {} : flattenErrors(parsed.error)), ...errors });
  }
  const item = await db.comparisonItem.create({ data: { ...itemData(parsed.data), comparisonId } });
  await writeItemValues(item.id, values);
  revalidateTrip(await tripIdOfComparison(comparisonId));
  return ok({ id: item.id });
}

export async function updateComparisonItem(itemId: string, formData: FormData): Promise<ActionResult> {
  const current = await db.comparisonItem.findUniqueOrThrow({ where: { id: itemId } });
  const parsed = comparisonItemSchema.safeParse(formDataToObject(formData));
  const { values, errors } = await parseItemValues(current.comparisonId, formData);
  if (!parsed.success || Object.keys(errors).length > 0) {
    return fail("Formulaire invalide", { ...(parsed.success ? {} : flattenErrors(parsed.error)), ...errors });
  }
  await db.comparisonItem.update({ where: { id: itemId }, data: itemData(parsed.data) });
  await writeItemValues(itemId, values);
  revalidateTrip(await tripIdOfComparison(current.comparisonId));
  return ok();
}

export async function setComparisonItemStatus(itemId: string, status: ItemStatusValue): Promise<ActionResult> {
  if (!ITEM_STATUSES.includes(status)) return fail("Statut inconnu");
  const item = await db.comparisonItem.update({ where: { id: itemId }, data: { status } });
  revalidateTrip(await tripIdOfComparison(item.comparisonId));
  return ok();
}

export async function deleteComparisonItem(itemId: string): Promise<ActionResult> {
  const item = await db.comparisonItem.delete({ where: { id: itemId } });
  revalidateTrip(await tripIdOfComparison(item.comparisonId));
  return ok();
}

/** Crée la dépense correspondant à un élément retenu (une seule par élément). */
export async function createExpenseFromItem(itemId: string, formData: FormData): Promise<ActionResult> {
  const parsed = itemExpenseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));

  const item = await db.comparisonItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { comparison: true, expense: true },
  });
  if (item.expense) return fail("Une dépense existe déjà pour cet élément.");

  await db.expense.create({
    data: {
      tripId: item.comparison.tripId,
      label: parsed.data.label,
      amountCents: parsed.data.amount,
      status: parsed.data.status,
      category: item.comparison.expenseCategory,
      comparisonItemId: item.id,
    },
  });
  revalidateTrip(item.comparison.tripId);
  return ok();
}
