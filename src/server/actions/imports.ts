"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { presetByKey } from "@/lib/domain/comparison-presets";
import { parseCriterionInput } from "@/lib/domain/criteria-values";
import { flightDetailsSchema } from "@/lib/domain/flights";
import {
  FLIGHT_MAPPABLE_FIELDS,
  mapFlightToCriteria,
  mapListingToCriteria,
  MAPPABLE_FIELDS,
  NEW_COMPARISON,
  type FlightMappableValues,
  type MappableValues,
} from "@/lib/listing-extract/criteria-mapping";
import { pastedContentSchema, reduceText } from "@/lib/listing-extract/payload";
import { flattenErrors, flightImportConfirmSchema, formDataToObject, importConfirmSchema } from "@/lib/validation";
import { createPendingImport, deletePendingImport, getImportExtraction, getPendingImport } from "@/server/pending-imports";

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
    const preset = presetByKey("lodging");
    const created = await db.comparison.create({
      data: {
        tripId: trip.id,
        name: preset.name,
        kind: preset.kind,
        expenseCategory: preset.expenseCategory,
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

/**
 * Valide l'import d'un vol : crée l'élément (date de relevé = réception de la page, détails des trajets
 * en JSON) et, si demandé, un comparatif « Vols », puis pré-remplit les critères laissés cochés.
 * Les trajets (segments, escales) viennent de l'extraction conservée côté serveur, pas du formulaire.
 */
export async function confirmFlightImport(
  pendingId: string,
  formData: FormData,
): Promise<ActionResult<{ tripId: string; comparisonId: string; prefilled: string[] }>> {
  const pending = await getPendingImport(pendingId);
  if (!pending) return fail("Cet import a expiré ou a déjà été validé.");

  const parsed = flightImportConfirmSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("Formulaire invalide", flattenErrors(parsed.error));
  const input = parsed.data;

  const trip = await db.trip.findUnique({ where: { id: input.tripId }, select: { id: true } });
  if (!trip) return fail("Voyage introuvable", { tripId: "Voyage introuvable" });

  let comparisonId = input.comparisonId;
  if (comparisonId === NEW_COMPARISON) {
    const preset = presetByKey("flights");
    const created = await db.comparison.create({
      data: {
        tripId: trip.id,
        name: preset.name,
        kind: preset.kind,
        expenseCategory: preset.expenseCategory,
        criteria: { create: preset.criteria.map((c, position) => ({ ...c, position })) },
      },
    });
    comparisonId = created.id;
  } else {
    const comparison = await db.comparison.findFirst({ where: { id: comparisonId, tripId: trip.id }, select: { id: true } });
    if (!comparison) return fail("Comparatif introuvable", { comparisonId: "Comparatif introuvable" });
  }

  const extraction = await getImportExtraction(pending);
  const flight = extraction.flight ?? {};
  const details = flightDetailsSchema.safeParse({
    outbound: flight.outbound?.value,
    inbound: flight.inbound?.value,
    passengers: input.passengers,
    currency: input.currency || undefined,
    checkedBag: input.checkedBag,
    airlines: (input.airlines ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 8),
  });

  const criteria = await db.criterion.findMany({ where: { comparisonId } });
  const values: FlightMappableValues = {};
  for (const field of FLIGHT_MAPPABLE_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== "") values[field] = value;
  }
  // Le critère « Prix total » est en euros : un prix dans une autre devise n'est pas reporté.
  if (input.currency && input.currency !== "EUR") delete values.totalPrice;
  const accepted = new Set(FLIGHT_MAPPABLE_FIELDS.filter((f) => formData.get(`apply:${f}`) === "on"));
  const matches = mapFlightToCriteria(criteria, values).filter((m) => accepted.has(m.field));

  let domain: string | null = null;
  try {
    domain = input.url ? new URL(input.url).hostname.replace(/^www\./, "") : null;
  } catch {
    domain = null;
  }

  const item = await db.comparisonItem.create({
    data: {
      comparisonId,
      title: input.title,
      url: input.url,
      notes: input.notes,
      priceCapturedAt: pending.createdAt,
      flightDetails: details.success ? JSON.stringify(details.data) : null,
      previewStatus: "NONE",
      previewSiteName: extraction.siteName,
      previewDomain: domain,
    },
  });

  const prefilled: string[] = [];
  for (const match of matches) {
    const parsedValue = parseCriterionInput(match.criterion.type, String(match.value));
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
export async function createImportFromText(input: {
  text: string;
  url?: string;
  /** Comparatif d'où vient le collage : son type oriente l'extracteur (vol ou logement). */
  comparisonId?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = pastedContentSchema.safeParse(input);
  if (!parsed.success) return fail("Contenu invalide", flattenErrors(parsed.error));
  const origin = input.comparisonId
    ? await db.comparison.findUnique({ where: { id: input.comparisonId }, select: { kind: true } })
    : null;
  const kindHint = origin?.kind === "FLIGHTS" ? "flight" : origin?.kind === "LODGING" ? "lodging" : undefined;
  // Même logique que le favori : début de page + zone des tarifs si le texte est trop long.
  const reduced = reduceText(parsed.data.text.replace(/\r\n?/g, "\n"));
  const pending = await createPendingImport("paste", {
    url: parsed.data.url || null,
    text: reduced.text,
    warnings: reduced.warning ? [`${reduced.warning} (réduit par le serveur)`] : [],
    kindHint,
  });
  return ok({ id: pending.id });
}
