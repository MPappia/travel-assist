// Validation des données envoyées par le favori (POST /import) et par le copier-coller.
// Principe : un champ trop long est TRONQUÉ (avec un avertissement affiché sur la page d'import) ;
// seul un corps dépassant le plafond de sécurité (IMPORT_LIMITS.maxBodyBytes) est refusé, ainsi
// qu'une adresse qui n'est pas en http(s).
import { z } from "zod";

import { IMPORT_LIMITS } from "@/lib/bookmarklet/limits";
import { pruneJsonLd, reduceListingText } from "@/lib/bookmarklet/shared";
import type { ListingSource } from "@/lib/listing-extract/types";

export const MAX_BODY_BYTES = IMPORT_LIMITS.maxBodyBytes;

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
const httpUrl = z.string().trim().refine(isHttpUrl, "Adresse http(s) invalide");

/** Les navigateurs envoient les sauts de ligne des formulaires en \r\n. */
const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

const fieldsSchema = z.object({
  v: z.string().optional(),
  url: httpUrl.optional(),
  title: z.string().optional(),
  meta: z.string().optional(),
  jsonld: z.string().optional(),
  images: z.string().optional(),
  text: z.string().optional(),
  truncated: z.string().optional(),
});

const metaSchema = z.record(z.string(), z.string());
const stringArray = z.array(z.string());

function parseJson<T>(raw: string | undefined, schema: z.ZodType<T>): T | null | undefined {
  if (raw === undefined || raw === "") return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type PayloadResult = { ok: true; source: ListingSource } | { ok: false; error: string };

/** Réduit le texte (début de page + zone des tarifs) s'il dépasse la limite ; renvoie l'avertissement. */
export function reduceText(text: string): { text: string; warning: string | null } {
  const reduced = reduceListingText(text, IMPORT_LIMITS);
  return { text: reduced.text, warning: reduced.note };
}

/** Valide le formulaire du favori et applique les limites partagées (troncature plutôt que rejet). */
export function parseImportPayload(raw: Record<string, string>): PayloadResult {
  const parsed = fieldsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ") };
  const fields = parsed.data;
  const L = IMPORT_LIMITS;
  const serverNotes: string[] = [];
  const note = (message: string) => serverNotes.push(`${message} (réduit par le serveur)`);

  // URL : sans paramètres si trop longue
  let url = fields.url ?? null;
  if (url && url.length > L.url) {
    const parsedUrl = new URL(url);
    url = `${parsedUrl.origin}${parsedUrl.pathname}`.slice(0, L.url);
    note("URL : paramètres retirés");
  }

  let title = normalizeNewlines(fields.title ?? "");
  if (title.length > L.title) {
    title = title.slice(0, L.title);
    note(`Titre tronqué à ${L.title} caractères`);
  }

  // Balises og / twitter
  const metaRaw = parseJson(fields.meta, metaSchema);
  if (metaRaw === null) note("Balises og/twitter illisibles, ignorées");
  const meta: Record<string, string> = {};
  let metaCut = 0;
  for (const [key, value] of Object.entries(metaRaw ?? {})) {
    if (!key.startsWith("og:") && !key.startsWith("twitter:")) continue;
    if (Object.keys(meta).length >= L.metaEntries) {
      metaCut++;
      continue;
    }
    if (value.length > L.metaValue) metaCut++;
    meta[key.slice(0, 100)] = value.slice(0, L.metaValue);
  }
  if (metaCut) note(`Balises og/twitter : ${metaCut} tronquée(s) ou ignorée(s)`);

  // JSON-LD : élagué si trop volumineux (cas d'un ancien favori, ou d'un envoi non réduit)
  const jsonLdRaw = parseJson(fields.jsonld, stringArray);
  if (jsonLdRaw === null) note("JSON-LD illisible, ignoré");
  let jsonLd = jsonLdRaw ?? [];
  if (JSON.stringify(jsonLd).length > L.jsonLd || jsonLd.length > L.jsonLdBlocks) {
    const pruned = pruneJsonLd(jsonLd, L.jsonLd, L.jsonLdBlocks);
    jsonLd = pruned.blocks;
    if (pruned.note) note(pruned.note);
  }

  // Images
  const imagesRaw = parseJson(fields.images, stringArray);
  if (imagesRaw === null) note("Liste d'images illisible, ignorée");
  const images = (imagesRaw ?? []).filter((u) => u.length <= L.imageUrl && isHttpUrl(u)).slice(0, L.images);
  if (imagesRaw && images.length < imagesRaw.length) note(`Images : ${imagesRaw.length - images.length} ignorée(s)`);

  // Texte : début de page + zone des tarifs
  const reduced = reduceText(normalizeNewlines(fields.text ?? ""));
  if (reduced.warning) note(reduced.warning);

  // Réductions déjà faites par le favori
  const fromBookmarklet = (parseJson(fields.truncated, stringArray) ?? [])
    .slice(0, L.truncatedNotes)
    .map((w) => w.slice(0, 300));

  return {
    ok: true,
    source: {
      url,
      title,
      meta,
      jsonLd,
      images,
      text: reduced.text,
      warnings: [...fromBookmarklet, ...serverNotes],
    },
  };
}

/** Copier-coller : texte long accepté (jusqu'au plafond), puis réduit comme celui du favori. */
export const pastedContentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(20, "Collez le contenu de la page (au moins quelques lignes)")
    .refine(
      (t) => new TextEncoder().encode(t).length <= MAX_BODY_BYTES,
      "Texte trop volumineux (plus de 2 Mo) : copiez seulement la partie utile de l'annonce (titre, note, tarifs).",
    ),
  url: z.union([httpUrl, z.literal("")]).optional(),
});
