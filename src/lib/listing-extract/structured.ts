// Étages « structurés » : balises og:* / twitter:* et JSON-LD (schema.org).
import { decodeHtmlEntities } from "@/lib/link-preview/parse";
import { formatNumberFr, round } from "@/lib/listing-extract/numbers";
import { extractSummaryFields } from "@/lib/listing-extract/text";
import { fillMissing, type ListingFields } from "@/lib/listing-extract/types";

const clean = (value: unknown, max = 500): string | null => {
  if (typeof value !== "string") return null;
  const text = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const httpUrl = (value: unknown, base?: string | null): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), base ?? undefined);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

// ——— og:* / twitter:* ———

export function extractFromMeta(meta: Record<string, string>, baseUrl?: string | null): ListingFields {
  const fields: ListingFields = {};
  const get = (...keys: string[]) => keys.map((k) => meta[k]).find((v) => v && v.trim());
  const title = clean(get("og:title", "twitter:title"), 200);
  if (title) fields.title = { value: title, source: "og" };
  const description = clean(get("og:description", "twitter:description"));
  if (description) fields.description = { value: description, source: "og" };
  const image = httpUrl(get("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"), baseUrl);
  if (image) fields.image = { value: image, source: "og" };
  // Airbnb résume souvent l'annonce dans og:title (« Cabane · ★4,84 · 2 chambres · 4 lits »).
  const summary = extractSummaryFields([title, description].filter(Boolean).join("\n"), "og");
  for (const [key, field] of Object.entries(summary)) fillMissing(fields, key as keyof ListingFields, field as never);
  return fields;
}

/** « Cabane … - Airbnb » → « Cabane … » */
export function cleanDocumentTitle(title: string): string | null {
  const cleaned = clean(
    title
      .replace(/^Booking\.com\s*:\s*/i, "")
      .replace(/\s*[-|–—·]\s*(?:Airbnb|Booking\.com|Abritel|Vrbo|HomeAway|Gîtes de France)\b.*$/i, "")
      // Booking : « …, Tokyo – Tarifs 2027 » / « … – Updated 2027 Prices »
      .replace(/\s*[-–—]\s*(?:Tarifs|Prix|Updated)\b[^–—-]*$/i, ""),
    200,
  );
  return cleaned;
}

// ——— JSON-LD ———

type Node = Record<string, unknown>;

const ACCOMMODATION_TYPES = [
  "vacationrental",
  "accommodation",
  "house",
  "singlefamilyresidence",
  "apartment",
  "suite",
  "room",
  "hotelroom",
  "campingpitch",
  "lodgingbusiness",
  "hotel",
  "hostel",
  "motel",
  "resort",
  "bedandbreakfast",
  "campground",
  "product",
];

function flatten(value: unknown, out: Node[] = [], depth = 0): Node[] {
  if (depth > 6) return out;
  if (Array.isArray(value)) value.forEach((v) => flatten(v, out, depth + 1));
  else if (value && typeof value === "object") {
    const node = value as Node;
    out.push(node);
    for (const key of ["@graph", "mainEntity", "itemOffered", "containsPlace", "about"]) {
      if (node[key]) flatten(node[key], out, depth + 1);
    }
  }
  return out;
}

const typesOf = (node: Node) =>
  (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.toLowerCase());

const numberOf = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value.replace(",", ".")))) {
    return Number(value.replace(",", "."));
  }
  if (value && typeof value === "object") {
    const obj = value as Node;
    return numberOf(obj.value ?? obj.maxValue);
  }
  return null;
};

const imageOf = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(imageOf).find(Boolean) ?? null;
  if (value && typeof value === "object") return imageOf((value as Node).url ?? (value as Node).contentUrl);
  return null;
};

const addressOf = (value: unknown): string | null => {
  if (typeof value === "string") return clean(value, 200);
  if (value && typeof value === "object") {
    const a = value as Node;
    const country = typeof a.addressCountry === "object" && a.addressCountry ? (a.addressCountry as Node).name : a.addressCountry;
    const parts = [a.streetAddress, a.addressLocality, a.addressRegion, country]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean);
    return parts.length ? clean([...new Set(parts)].join(", "), 200) : null;
  }
  return null;
};

export function extractFromJsonLd(blocks: string[], baseUrl?: string | null): ListingFields {
  const nodes: Node[] = [];
  for (const block of blocks) {
    try {
      flatten(JSON.parse(block), nodes);
    } catch {
      // bloc invalide : ignoré
    }
  }
  const fields: ListingFields = {};
  const rank = (node: Node) => Math.min(...typesOf(node).map((t) => ACCOMMODATION_TYPES.indexOf(t)).filter((i) => i >= 0), 99);
  const main = nodes.filter((n) => rank(n) < 99).sort((a, b) => rank(a) - rank(b))[0];
  const ratingNode = (main?.aggregateRating as Node | undefined) ?? nodes.find((n) => typesOf(n).includes("aggregaterating"));
  const offerNode = (() => {
    const offers = main?.offers ?? nodes.find((n) => typesOf(n).some((t) => t === "offer" || t === "aggregateoffer"));
    return (Array.isArray(offers) ? offers[0] : offers) as Node | undefined;
  })();

  if (main) {
    const name = clean(main.name, 200);
    if (name) fields.title = { value: name, source: "jsonld" };
    const description = clean(main.description);
    if (description) fields.description = { value: description, source: "jsonld" };
    const image = httpUrl(imageOf(main.image ?? main.photo), baseUrl);
    if (image) fields.image = { value: image, source: "jsonld" };
    const address = addressOf(main.address);
    if (address) fields.address = { value: address, source: "jsonld" };
    const bedrooms = numberOf(main.numberOfBedrooms ?? main.numberOfRooms);
    if (bedrooms !== null && bedrooms > 0 && bedrooms < 100) fields.bedrooms = { value: Math.round(bedrooms), source: "jsonld" };
    const bedDetails = (Array.isArray(main.bed) ? main.bed : main.bed ? [main.bed] : []) as Node[];
    const beds = bedDetails.reduce((sum, b) => sum + (numberOf(b.numberOfBeds) ?? 0), 0);
    if (beds > 0) fields.beds = { value: beds, source: "jsonld" };
    const guests = numberOf(main.occupancy);
    if (guests !== null && guests > 0 && guests < 100) fields.guests = { value: Math.round(guests), source: "jsonld" };
  }

  if (ratingNode) {
    const value = numberOf(ratingNode.ratingValue);
    const best = numberOf(ratingNode.bestRating) ?? 5;
    if (value !== null && value > 0 && best > 0 && value <= best) {
      const onFive = round((value / best) * 5, 2);
      fields.rating = {
        value: onFive,
        source: "jsonld",
        note: best !== 5 ? `${formatNumberFr(value)}/${formatNumberFr(best)} converti en ${formatNumberFr(onFive)}/5` : undefined,
      };
    }
    const count = numberOf(ratingNode.reviewCount ?? ratingNode.ratingCount);
    if (count !== null && count >= 0) fields.reviewCount = { value: Math.round(count), source: "jsonld" };
  }

  if (offerNode) {
    const currency = typeof offerNode.priceCurrency === "string" ? offerNode.priceCurrency.toUpperCase() : "EUR";
    const price = numberOf(offerNode.price ?? offerNode.lowPrice);
    if (currency === "EUR" && price !== null && price > 0) {
      fields.totalPrice = { value: price, source: "jsonld", note: "prix de l'offre : vérifier qu'il s'agit bien du total" };
    }
  }
  return fields;
}

export { httpUrl };
