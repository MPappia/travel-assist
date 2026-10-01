// Extraction d'une annonce (étage déterministe) : og → JSON-LD → <title> → motifs sur le texte.
// Module pur : aucun accès réseau ni base. L'étage LLM facultatif est dans ./llm.ts (+ src/server).
import { nightsBetween } from "@/lib/listing-extract/dates";
import { round } from "@/lib/listing-extract/numbers";
import { cleanDocumentTitle, extractFromJsonLd, extractFromMeta, httpUrl } from "@/lib/listing-extract/structured";
import { extractFlightFromText, looksLikeFlight } from "@/lib/listing-extract/flight";
import { extractFromText } from "@/lib/listing-extract/text";
import { matchSite } from "@/lib/bookmarklet/shared";
import { SITE_CONFIGS, type ListingKind } from "@/lib/bookmarklet/sites";
import {
  FIELD_KEYS,
  fillMissing,
  type ListingExtraction,
  type ListingFields,
  type ListingSource,
} from "@/lib/listing-extract/types";

export * from "@/lib/listing-extract/types";

function merge(target: ListingFields, source: ListingFields) {
  for (const key of FIELD_KEYS) fillMissing(target, key, source[key] as never);
}

/** Complète les champs déductibles : prix par nuit, nuits d'après les dates. */
export function finalizeFields(fields: ListingFields): ListingFields {
  const result = { ...fields };
  if (!result.nights && result.checkIn && result.checkOut) {
    const nights = nightsBetween(result.checkIn.value, result.checkOut.value);
    if (nights > 0) result.nights = { value: nights, source: result.checkIn.source, note: "d'après les dates" };
  }
  if (!result.pricePerNight && result.totalPrice && result.nights && result.nights.value > 0) {
    result.pricePerNight = {
      value: round(result.totalPrice.value / result.nights.value, 2),
      source: result.totalPrice.source,
      note: `calculé : total ÷ ${result.nights.value} nuit${result.nights.value > 1 ? "s" : ""}`,
    };
  }
  return result;
}

/** Choix de l'extracteur : configuration du site, sinon indice (comparatif d'origine), sinon contenu. */
export function detectListingKind(source: ListingSource): ListingKind {
  if (source.url) {
    try {
      const url = new URL(source.url);
      const site = matchSite(url.hostname, url.pathname, SITE_CONFIGS);
      if (site) return site.kind;
    } catch {
      // URL invalide : on continue
    }
  }
  if (source.kindHint) return source.kindHint;
  return source.text && looksLikeFlight(source.text) ? "flight" : "lodging";
}

export function extractListing(source: ListingSource, options: { now?: Date } = {}): Omit<ListingExtraction, "llm"> {
  if (detectListingKind(source) === "flight") {
    let domain: string | null = null;
    try {
      domain = source.url ? new URL(source.url).hostname.replace(/^www\./, "") : null;
    } catch {
      domain = null;
    }
    return {
      kind: "flight",
      fields: {},
      flight: extractFlightFromText(source.text ?? "", options),
      images: [],
      siteName: source.meta?.["og:site_name"]?.trim() || null,
      domain,
    };
  }
  return extractLodging(source, options);
}

function extractLodging(source: ListingSource, options: { now?: Date }): Omit<ListingExtraction, "llm"> {
  const baseUrl = source.url ?? null;
  const fields: ListingFields = {};
  merge(fields, extractFromMeta(source.meta ?? {}, baseUrl));
  merge(fields, extractFromJsonLd(source.jsonLd ?? [], baseUrl));
  const docTitle = source.title ? cleanDocumentTitle(source.title) : null;
  if (docTitle) fillMissing(fields, "title", { value: docTitle, source: "og", note: "balise <title>" });
  if (source.text) merge(fields, extractFromText(source.text, options));

  const images = [fields.image?.value, ...(source.images ?? [])]
    .map((u) => httpUrl(u ?? null, baseUrl))
    .filter((u): u is string => !!u)
    .filter((u, i, all) => all.indexOf(u) === i)
    .slice(0, 5);
  if (!fields.image && images[0]) fields.image = { value: images[0], source: "og", note: "image principale de la page" };

  let domain: string | null = null;
  try {
    domain = baseUrl ? new URL(baseUrl).hostname.replace(/^www\./, "") : null;
  } catch {
    domain = null;
  }
  const siteName = source.meta?.["og:site_name"]?.trim() || null;
  return { kind: "lodging", fields: finalizeFields(fields), images, siteName, domain };
}

/** Champs encore vides après l'étage déterministe. */
export function missingFields(fields: ListingFields) {
  return FIELD_KEYS.filter((key) => fields[key] === undefined && key !== "image");
}
