import "server-only";

import { db } from "@/lib/db";
import type { ListingExtraction, ListingSource } from "@/lib/listing-extract/types";
import { runListingExtraction } from "@/server/listing-import";

export const PENDING_IMPORT_TTL_MS = 24 * 3600 * 1000;
/** POST /import est ouvert à n'importe quel site : on borne le nombre d'imports en attente. */
export const MAX_PENDING_IMPORTS = 50;

async function purge() {
  await db.pendingImport.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const overflow = await db.pendingImport.findMany({
    orderBy: { createdAt: "desc" },
    skip: MAX_PENDING_IMPORTS - 1,
    select: { id: true },
  });
  if (overflow.length) await db.pendingImport.deleteMany({ where: { id: { in: overflow.map((p) => p.id) } } });
}

export async function createPendingImport(origin: "bookmarklet" | "paste", source: ListingSource) {
  await purge();
  return db.pendingImport.create({
    data: {
      origin,
      url: source.url ?? null,
      payload: JSON.stringify(source),
      expiresAt: new Date(Date.now() + PENDING_IMPORT_TTL_MS),
    },
  });
}

export async function getPendingImport(id: string) {
  const pending = await db.pendingImport.findUnique({ where: { id } });
  if (!pending || pending.expiresAt < new Date()) return null;
  return pending;
}

/** Extraction mise en cache sur l'import : le LLM éventuel n'est appelé qu'une fois. */
export async function getImportExtraction(pending: { id: string; payload: string; extraction: string | null }) {
  if (pending.extraction) return JSON.parse(pending.extraction) as ListingExtraction;
  const source = JSON.parse(pending.payload) as ListingSource;
  const extraction = await runListingExtraction(source);
  await db.pendingImport.update({ where: { id: pending.id }, data: { extraction: JSON.stringify(extraction) } });
  return extraction;
}

export async function deletePendingImport(id: string) {
  await db.pendingImport.deleteMany({ where: { id } });
}
