// Téléchargement « prudent » d'une page HTML pour en extraire l'aperçu.
// - délai global de 8 s (redirections comprises), au plus 4 redirections, chacune revalidée ;
// - taille lue plafonnée (après décompression) : au-delà on s'arrête et on analyse ce qu'on a ;
// - uniquement du HTML ; User-Agent de navigateur standard ; aucun cookie, aucun JavaScript exécuté.
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";

import { assertSafeUrl, safeLookup, UnsafeUrlError } from "@/server/link-preview/url-safety";

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export type FetchErrorCode = "UNSAFE_URL" | "TIMEOUT" | "HTTP_ERROR" | "NOT_HTML" | "NETWORK" | "TOO_MANY_REDIRECTS";

export class FetchHtmlError extends Error {
  constructor(
    public readonly code: FetchErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FetchHtmlError";
  }
}

export interface FetchHtmlOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Réservé aux tests (serveur local) : désactive le contrôle des adresses privées. */
  allowPrivateNetwork?: boolean;
}

export interface FetchHtmlResult {
  finalUrl: string;
  html: string;
  truncated: boolean;
}

const DEFAULTS = { timeoutMs: 8000, maxBytes: 1_500_000, maxRedirects: 4 };

function request(url: URL, signal: AbortSignal, allowPrivateNetwork: boolean): Promise<IncomingMessage> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "GET",
        signal,
        lookup: allowPrivateNetwork ? undefined : safeLookup,
        // Pas de keep-alive ni d'agent partagé : chaque requête repasse par `safeLookup`.
        agent: false,
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      resolve,
    );
    req.on("error", reject);
    req.end();
  });
}

function decompress(response: IncomingMessage): Readable {
  const encoding = (response.headers["content-encoding"] ?? "").toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return response.pipe(createGunzip());
  if (encoding === "deflate") return response.pipe(createInflate());
  if (encoding === "br") return response.pipe(createBrotliDecompress());
  return response;
}

async function readLimited(stream: Readable, maxBytes: number): Promise<{ buffer: Buffer; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      const remaining = maxBytes - size;
      if (buf.length >= remaining) {
        chunks.push(buf.subarray(0, remaining));
        size += remaining;
        stream.destroy();
        return { buffer: Buffer.concat(chunks), truncated: true };
      }
      chunks.push(buf);
      size += buf.length;
    }
  } catch (error) {
    // Flux interrompu (ex. décompression d'un contenu tronqué) : on garde ce qui a été lu.
    if (size === 0) throw error;
    return { buffer: Buffer.concat(chunks), truncated: true };
  }
  return { buffer: Buffer.concat(chunks), truncated: false };
}

/** Détermine l'encodage : en-tête HTTP, puis <meta charset>, sinon UTF-8. */
export function detectCharset(contentType: string | undefined, head: Buffer): string {
  const fromHeader = contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const ascii = head.subarray(0, 4096).toString("latin1");
  const fromMeta =
    ascii.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] ??
    ascii.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([\w-]+)/i)?.[1];
  return (fromMeta ?? "utf-8").toLowerCase();
}

function decode(buffer: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

export async function fetchHtml(rawUrl: string, options: FetchHtmlOptions = {}): Promise<FetchHtmlResult> {
  const { timeoutMs, maxBytes, maxRedirects } = { ...DEFAULTS, ...options };
  const allowPrivateNetwork = options.allowPrivateNetwork ?? false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url = assertSafeUrl(rawUrl, { allowPrivateNetwork });
    for (let hop = 0; ; hop++) {
      const response = await request(url, controller.signal, allowPrivateNetwork);
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (hop >= maxRedirects) throw new FetchHtmlError("TOO_MANY_REDIRECTS", "Trop de redirections");
        url = assertSafeUrl(new URL(response.headers.location, url).toString(), { allowPrivateNetwork });
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new FetchHtmlError("HTTP_ERROR", httpErrorMessage(status), status);
      }
      const contentType = response.headers["content-type"];
      if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        response.resume();
        throw new FetchHtmlError("NOT_HTML", "La page n'est pas une page HTML");
      }

      const { buffer, truncated } = await readLimited(decompress(response), maxBytes);
      return { finalUrl: url.toString(), html: decode(buffer, detectCharset(contentType, buffer)), truncated };
    }
  } catch (error) {
    if (error instanceof FetchHtmlError) throw error;
    if (error instanceof UnsafeUrlError || (error as NodeJS.ErrnoException)?.code === "EUNSAFEADDRESS") {
      throw new FetchHtmlError("UNSAFE_URL", (error as Error).message);
    }
    if (controller.signal.aborted) throw new FetchHtmlError("TIMEOUT", "Le site a mis trop de temps à répondre");
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") throw new FetchHtmlError("NETWORK", "Site introuvable");
    throw new FetchHtmlError("NETWORK", "Impossible de joindre le site");
  } finally {
    clearTimeout(timer);
  }
}

function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403 || status === 429) {
    return `Le site refuse les requêtes automatiques (${status})`;
  }
  if (status === 404 || status === 410) return `Page introuvable (${status})`;
  return `Réponse inattendue du site (${status})`;
}
