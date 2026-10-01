import "server-only";

import { transform } from "esbuild";

import { sendToTravelerAssist, type BookmarkletOptions } from "@/lib/bookmarklet/source";

export const DEFAULT_APP_URL = "http://localhost:3000";

/** URL de l'application injectée dans le bookmarklet (variable APP_URL). */
export function getAppUrl(): string {
  const raw = process.env.APP_URL?.trim() || DEFAULT_APP_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocole");
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    console.warn(`APP_URL invalide (« ${raw} »), utilisation de ${DEFAULT_APP_URL}`);
    return DEFAULT_APP_URL;
  }
}

export interface Bookmarklet {
  /** Code JavaScript minifié (exécutable tel quel). */
  code: string;
  /** URL `javascript:` encodée, à mettre en favori. */
  href: string;
  appUrl: string;
}

const cache = new Map<string, Promise<Bookmarklet>>();

/** Génère le bookmarklet : sérialise la fonction, injecte l'URL de l'app, minifie et encode. */
export function buildBookmarklet(appUrl: string = getAppUrl(), options: BookmarkletOptions = {}): Promise<Bookmarklet> {
  const key = JSON.stringify([appUrl, options]);
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const source = `(${sendToTravelerAssist.toString()})(${JSON.stringify(appUrl)}, ${JSON.stringify(options)});`;
      const { code } = await transform(source, { minify: true, loader: "js", target: "es2018", charset: "utf8" });
      // Une URL javascript: dont le script a une valeur de complétion non indéfinie remplace la page
      // par cette valeur : on termine donc explicitement par `void 0` (esbuild retirerait un `void` initial).
      const trimmed = `${code.trim().replace(/;$/, "")};void 0`;
      return { code: trimmed, href: `javascript:${encodeURIComponent(trimmed)}`, appUrl };
    })();
    cache.set(key, pending);
  }
  return pending;
}
