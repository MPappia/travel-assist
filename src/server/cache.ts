import "server-only";

import { db } from "@/lib/db";

/** Lit une entrée du cache si elle est plus récente que `maxAgeMs`. */
export async function readCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  const entry = await db.apiCache.findUnique({ where: { key } });
  if (!entry || Date.now() - entry.createdAt.getTime() > maxAgeMs) return null;
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await db.apiCache.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json, createdAt: new Date() },
  });
}
