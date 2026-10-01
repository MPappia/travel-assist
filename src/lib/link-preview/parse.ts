// Extraction d'un aperçu (titre, description, image, site) depuis le HTML d'une page.
// Ordre de priorité : Open Graph, puis Twitter Cards, puis JSON-LD (schema.org), puis <title>/<meta description>.
// Volontairement sans dépendance : on ne lit que les balises <meta>, <title>, <link> et les scripts JSON-LD.

export interface LinkPreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  domain: string;
}

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 500;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  icirc: "î",
  iuml: "ï",
  euml: "ë",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  euro: "€",
  middot: "·",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag))) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

/** Collecte les balises <meta> (property/name → content), la première occurrence l'emporte. */
function collectMeta(html: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
  }
  return meta;
}

const JSON_LD_TYPES = [
  "lodgingbusiness",
  "hotel",
  "hostel",
  "motel",
  "resort",
  "bedandbreakfast",
  "campground",
  "vacationrental",
  "accommodation",
  "apartment",
  "house",
  "singlefamilyresidence",
  "room",
  "hotelroom",
  "product",
  "place",
  "touristattraction",
  "event",
  "localbusiness",
  "webpage",
];

type JsonObject = Record<string, unknown>;

function typesOf(node: JsonObject): string[] {
  const t = node["@type"];
  const list = Array.isArray(t) ? t : [t];
  return list.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
}

function flattenJsonLd(value: unknown, out: JsonObject[] = []): JsonObject[] {
  if (Array.isArray(value)) value.forEach((v) => flattenJsonLd(v, out));
  else if (value && typeof value === "object") {
    const node = value as JsonObject;
    out.push(node);
    if (node["@graph"]) flattenJsonLd(node["@graph"], out);
    if (node.mainEntity) flattenJsonLd(node.mainEntity, out);
    if (node.itemOffered) flattenJsonLd(node.itemOffered, out);
  }
  return out;
}

/** Renvoie l'objet JSON-LD le plus pertinent (logement > produit > lieu > page). */
export function extractJsonLd(html: string): JsonObject | null {
  const nodes: JsonObject[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      flattenJsonLd(JSON.parse(match[1].trim()), nodes);
    } catch {
      // JSON-LD invalide : ignoré
    }
  }
  let best: { node: JsonObject; rank: number } | null = null;
  for (const node of nodes) {
    const rank = Math.min(...typesOf(node).map((t) => JSON_LD_TYPES.indexOf(t)).filter((i) => i >= 0), Infinity);
    if (rank !== Infinity && (!best || rank < best.rank)) best = { node, rank };
  }
  return best?.node ?? null;
}

function jsonLdImage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const img = jsonLdImage(v);
      if (img) return img;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const obj = value as JsonObject;
    return jsonLdImage(obj.url ?? obj.contentUrl ?? null);
  }
  return null;
}

function absoluteHttpUrl(value: string | null, base: URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(decodeHtmlEntities(value.trim()), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function domainOf(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

export function parseLinkPreview(html: string, pageUrl: string): LinkPreviewData {
  const base = new URL(pageUrl);
  // Le <head> suffit presque toujours ; on limite la zone analysée pour les pages énormes.
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 300_000);
  const meta = collectMeta(head);
  const jsonLd = extractJsonLd(html.slice(0, 1_500_000));
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;

  const title =
    clean(meta.get("og:title"), MAX_TITLE) ??
    clean(meta.get("twitter:title"), MAX_TITLE) ??
    clean(jsonLd?.name, MAX_TITLE) ??
    clean(titleTag, MAX_TITLE);
  const description =
    clean(meta.get("og:description"), MAX_DESCRIPTION) ??
    clean(meta.get("twitter:description"), MAX_DESCRIPTION) ??
    clean(jsonLd?.description, MAX_DESCRIPTION) ??
    clean(meta.get("description"), MAX_DESCRIPTION);
  const image = absoluteHttpUrl(
    meta.get("og:image:secure_url") ??
      meta.get("og:image") ??
      meta.get("og:image:url") ??
      meta.get("twitter:image") ??
      meta.get("twitter:image:src") ??
      jsonLdImage(jsonLd?.image) ??
      null,
    base,
  );
  const siteName = clean(meta.get("og:site_name") ?? meta.get("application-name"), 80);

  return { title, description, image, siteName, domain: domainOf(base) };
}

export type PreviewCompleteness = "OK" | "PARTIAL" | "FAILED";

/** OK : titre + (image ou description). PARTIAL : au moins un élément. FAILED : rien d'exploitable. */
export function previewCompleteness(data: Pick<LinkPreviewData, "title" | "description" | "image">): PreviewCompleteness {
  if (data.title && (data.image || data.description)) return "OK";
  if (data.title || data.image || data.description) return "PARTIAL";
  return "FAILED";
}
