import "server-only";

import { domainOf, parseLinkPreview, previewCompleteness, type LinkPreviewData } from "@/lib/link-preview/parse";
import { readCache, writeCache } from "@/server/cache";
import { fetchHtml, FetchHtmlError, type FetchHtmlOptions } from "@/server/link-preview/fetch-html";

export interface LinkPreviewResult extends LinkPreviewData {
  status: "OK" | "PARTIAL" | "FAILED";
  /** Message affiché discrètement quand l'extraction échoue ou est partielle. */
  error: string | null;
  fetchedAt: string;
}

const SUCCESS_TTL_MS = 7 * 24 * 3600 * 1000;
const FAILURE_TTL_MS = 3600 * 1000;

function cacheKey(url: string) {
  return `preview:${url}`;
}

/** Normalise l'URL pour le cache (sans fragment). */
export function normalizePreviewUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  return url.toString();
}

/**
 * Récupère l'aperçu d'une page. Ne lève jamais : en cas d'échec, renvoie un résultat FAILED
 * avec un message lisible. Les résultats sont mis en cache en base (7 jours, 1 h pour les échecs).
 */
export async function getLinkPreview(
  rawUrl: string,
  options: { force?: boolean; fetchOptions?: FetchHtmlOptions } = {},
): Promise<LinkPreviewResult> {
  let url: string;
  try {
    url = normalizePreviewUrl(rawUrl);
  } catch {
    return failed(rawUrl, "Adresse invalide");
  }

  if (!options.force) {
    const cached = await readCache<LinkPreviewResult>(cacheKey(url), SUCCESS_TTL_MS);
    if (cached && (cached.status !== "FAILED" || Date.now() - Date.parse(cached.fetchedAt) < FAILURE_TTL_MS)) {
      return cached;
    }
  }

  const result = await extract(url, options.fetchOptions);
  await writeCache(cacheKey(url), result);
  return result;
}

async function extract(url: string, fetchOptions?: FetchHtmlOptions): Promise<LinkPreviewResult> {
  try {
    const { html, finalUrl } = await fetchHtml(url, fetchOptions);
    const data = parseLinkPreview(html, finalUrl);
    const status = previewCompleteness(data);
    return {
      ...data,
      domain: domainOf(new URL(url)),
      status,
      error:
        status === "FAILED"
          ? "Aucune information exploitable sur la page (protection anti-robot probable)"
          : status === "PARTIAL"
            ? "Aperçu partiel"
            : null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof FetchHtmlError ? error.message : "Extraction impossible";
    return failed(url, message);
  }
}

function failed(rawUrl: string, error: string): LinkPreviewResult {
  let domain = "";
  try {
    domain = domainOf(new URL(rawUrl));
  } catch {
    // URL illisible : pas de domaine
  }
  return {
    title: null,
    description: null,
    image: null,
    siteName: null,
    domain,
    status: "FAILED",
    error,
    fetchedAt: new Date().toISOString(),
  };
}
