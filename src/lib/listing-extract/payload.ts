// Validation des données envoyées par le bookmarklet (POST /import) et par le copier-coller.
import { z } from "zod";

import type { ListingSource } from "@/lib/listing-extract/types";

export const MAX_BODY_BYTES = 1_000_000;
export const MAX_TEXT_LENGTH = 30_000;

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Adresse http(s) invalide");

/** Champ JSON transmis comme chaîne de formulaire. */
const jsonField = <T extends z.ZodType>(maxLength: number, schema: T) =>
  z
    .string()
    .max(maxLength)
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "JSON invalide" });
        return z.NEVER;
      }
    })
    .pipe(schema);

const metaSchema = z
  .record(z.string().max(100), z.string().max(2000))
  .refine((m) => Object.keys(m).length <= 100, "Trop de balises")
  .transform((m) =>
    Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith("og:") || k.startsWith("twitter:"))),
  );

export const bookmarkletPayloadSchema = z.object({
  v: z.enum(["1", "2"]).optional(),
  url: httpUrl.optional(),
  title: z.string().max(500).optional(),
  meta: jsonField(250_000, metaSchema).optional(),
  jsonld: jsonField(1_000_000, z.array(z.string().max(100_000)).max(10)).optional(),
  images: jsonField(10_000, z.array(httpUrl).max(3)).optional(),
  text: z.string().max(MAX_TEXT_LENGTH).optional(),
  truncated: jsonField(20_000, z.array(z.string().max(300)).max(20)).optional(),
});

export function payloadToSource(payload: z.output<typeof bookmarkletPayloadSchema>): ListingSource {
  return {
    url: payload.url ?? null,
    title: payload.title ?? null,
    meta: payload.meta ?? {},
    jsonLd: payload.jsonld ?? [],
    images: payload.images ?? [],
    text: payload.text ?? "",
    warnings: payload.truncated ?? [],
  };
}

export const pastedContentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(20, "Collez le contenu de la page (au moins quelques lignes)")
    // Le texte collé est tronqué plutôt que refusé.
    .transform((t) => t.slice(0, MAX_TEXT_LENGTH)),
  url: z.union([httpUrl, z.literal("")]).optional(),
});
