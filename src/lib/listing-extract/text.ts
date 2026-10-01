// Étage déterministe sur le texte visible : motifs français et anglais.
// Les fonctions reçoivent la provenance à attribuer (« regex » pour le texte de la page, « og » quand
// on applique les mêmes motifs aux balises og:title / og:description).
import { nightsBetween, parseStayDates } from "@/lib/listing-extract/dates";
import { AMOUNT, formatNumberFr, normalizeSpaces, parseAmount, parseCount, parseDecimal, round } from "@/lib/listing-extract/numbers";
import { fillMissing, type FieldSource, type ListingFields } from "@/lib/listing-extract/types";

const firstMatch = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
};

// ——— Prix ———

const TOTAL_PATTERNS = [
  new RegExp(String.raw`€\s?(${AMOUNT})\s*(?:au\s+)?total\b`, "i"), // « €227 total »
  new RegExp(String.raw`(${AMOUNT})\s?€\s*(?:au\s+)?total\b`, "i"), // « 1 450 € au total »
  new RegExp(String.raw`\b(?:prix\s+)?total(?:\s+(?:du séjour|price|for your stay|TTC))?\s*:?\s*€\s?(${AMOUNT})`, "i"),
  new RegExp(String.raw`\b(?:prix\s+)?total(?:\s+(?:du séjour|price|for your stay|TTC))?\s*:?\s*(${AMOUNT})\s?€`, "i"),
];

const PER_NIGHT_PATTERNS = [
  new RegExp(String.raw`€\s?(${AMOUNT})\s*(?:\/\s*|par\s+|per\s+|a\s+)?(?:night|nuit)\b`, "i"),
  new RegExp(String.raw`(${AMOUNT})\s?€\s*(?:\/\s*|par\s+|per\s+)(?:nuit|night)\b`, "i"),
];

const NIGHTS_PATTERNS = [
  /\b(?:tarif|prix|price)\s+(?:pour|for)\s+(\d{1,2})\s+(?:nuits?|nights?)\b/i,
  /\b(\d{1,2})\s+nights?\s+in\b/i, // « 1 night in Fujikawaguchiko »
  /\b(\d{1,2})\s+nuits?\s+à\s/i, // « 3 nuits à Lisbonne » (pas de \b après « à », non ASCII)
  /\b(?:pour|for)\s+(\d{1,2})\s+(?:nuits?|nights?)\b/i,
  /\b(\d{1,2})\s+(?:nuits?|nights?)\s*[·•,]/i, // « 7 nuits · 12 juil. »
];

/** Tarif d'une ligne d'un tableau de chambres (type Booking). */
export interface RoomRate {
  room: string | null;
  beds: number | null;
  capacity: number;
  price: number;
  freeCancellation: boolean | null;
  cancellationNote: string | null;
}

const ROOM_HEADER =
  /^(?:Chambre|Chambres|Room|Suite|Studio|Appartement|Apartment|Dortoir|Lit en dortoir|Bed in|Bungalow|Villa|Maison|Chalet|Family|Double|Twin|Single|Triple|Quadruple|Deluxe|Superior|Standard|Junior)\b.{0,110}$/i;
const CAPACITY = /^(?:Personnes max\.?|Nombre max\.? de personnes|Max\.? (?:people|persons|guests|occupancy))\s*:?\s*(\d{1,2})\b/i;
const BEDS_LINE = /^(\d{1,2})\s+(?:(?:très\s+)?grands?\s+)?lits?\b|^(\d{1,2})\s+(?:[\w-]+\s+){0,2}beds?\b/i;
const CURRENT_PRICE = new RegExp(
  String.raw`(?:Tarif actuel|Prix actuel|Current price)\s*:?\s*(?:€\s?(${AMOUNT})|(${AMOUNT})\s?€)`,
  "i",
);
const AMOUNT_LINE = new RegExp(String.raw`^(?:€\s?(${AMOUNT})|(${AMOUNT})\s?€)$`);
const FREE_CANCEL = /(annulation gratuite|free cancellation)[^\n]{0,60}/i;
const NON_REFUNDABLE = /(non remboursable|non-remboursable|non-refundable|nonrefundable)/i;

const bedsOf = (line: string) => {
  const m = line.match(BEDS_LINE);
  return m ? Number(m[1] ?? m[2]) : null;
};

/** Analyse un tableau de chambres et tarifs (« Personnes max. », « Tarif actuel »…). */
export function parseRoomRates(text: string): RoomRate[] {
  const lines = normalizeSpaces(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rates: RoomRate[] = [];
  let room: string | null = null;
  let beds: number | null = null;
  let current: (Omit<RoomRate, "price"> & { price: number | null; fallback: number | null }) | null = null;

  const close = () => {
    if (current) {
      const price = current.price ?? current.fallback;
      if (price !== null) {
        const { fallback: _fallback, ...rest } = current;
        void _fallback;
        rates.push({ ...rest, price });
      }
    }
    current = null;
  };

  for (const line of lines) {
    const capacity = line.match(CAPACITY);
    if (capacity) {
      close();
      current = {
        room,
        beds,
        capacity: Number(capacity[1]),
        price: null,
        fallback: null,
        freeCancellation: null,
        cancellationNote: null,
      };
      continue;
    }
    if (ROOM_HEADER.test(line) && !/\d+\s*€|€\s*\d/.test(line)) {
      close();
      room = line;
      beds = null;
      continue;
    }
    if (!current) {
      beds ??= bedsOf(line);
      continue;
    }
    const currentPrice = line.match(CURRENT_PRICE);
    if (currentPrice) {
      current.price = parseAmount(currentPrice[1] ?? currentPrice[2]);
      continue;
    }
    const amountLine = line.match(AMOUNT_LINE);
    if (amountLine && current.fallback === null) {
      current.fallback = parseAmount(amountLine[1] ?? amountLine[2]);
      continue;
    }
    if (current.freeCancellation === null) {
      const free = line.match(FREE_CANCEL);
      if (free) {
        current.freeCancellation = true;
        current.cancellationNote = free[0].trim();
      } else if (NON_REFUNDABLE.test(line)) {
        current.freeCancellation = false;
        current.cancellationNote = line;
      }
    }
  }
  close();
  return rates;
}

/** Nombre de voyageurs recherché sur la page (« 2 adultes », « 2 adults »). */
function requestedGuests(text: string): number | null {
  const adults = text.match(/\b(\d{1,2})\s+(?:adultes?|adults?)\b/i);
  const children = text.match(/\b(\d{1,2})\s+(?:enfants?|children|child)\b/i);
  if (!adults) return null;
  return Number(adults[1]) + (children ? Number(children[1]) : 0);
}

function chooseRate(rates: RoomRate[], guests: number | null) {
  const eligible = guests ? rates.filter((r) => r.capacity >= guests) : rates;
  const pool = eligible.length > 0 ? eligible : rates;
  const best = pool.reduce((min, r) => (r.price < min.price ? r : min), pool[0]);
  return { best, poolSize: pool.length, filtered: guests !== null && eligible.length > 0 };
}

// ——— Note, avis, capacité ———

function extractRating(text: string, source: FieldSource, fields: ListingFields) {
  const patterns: [RegExp, number | "auto"][] = [
    [/(\d(?:[.,]\d{1,2})?)\s+out of\s+5\b/i, 5],
    [/(?:not[ée]|note de)\s+(\d(?:[.,]\d{1,2})?)\s+sur\s+5\b/i, 5],
    [/\b(\d[.,]\d{1,2})\s+sur\s+5\b/i, 5],
    [/★\s?(\d[.,]\d{1,2})/, 5],
    [/\b(\d{1,2}(?:[.,]\d)?)\s*\/\s*10\b/, 10],
    [/\b(\d(?:[.,]\d{1,2})?)\s*\/\s*5\b/, 5],
    [/\bNote\s*:\s*[^\d\n]{0,40}?(\d{1,2}[.,]\d)\b/i, "auto"], // Booking : « Note : Très bien 8.2 »
    [/\b(?:Scored|Rated)\s+[^\d\n]{0,30}?(\d{1,2}[.,]\d)\b/i, "auto"],
  ];
  for (const [pattern, scale] of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = parseDecimal(match[1]);
    if (value === null) continue;
    const resolvedScale = scale === "auto" ? (value > 5 ? 10 : 5) : scale;
    if (value <= 0 || value > resolvedScale) continue;
    if (resolvedScale === 10) {
      const converted = round(value / 2, 2);
      fillMissing(fields, "rating", {
        value: converted,
        source,
        note: `${formatNumberFr(value)}/10 converti en ${formatNumberFr(converted)}/5`,
      });
    } else {
      fillMissing(fields, "rating", { value: round(value, 2), source });
    }
    return;
  }
}

// Airbnb colle les compteurs (« 6 guests2 bedrooms4 beds1.5 baths ») : pas de \b, mais des lookarounds.
const NUM = String.raw`(?<![\d.,])(\d{1,2})\s*`;
const END = String.raw`(?![a-zà-ÿ])`;
const GUESTS = new RegExp(String.raw`${NUM}(?:guests?|voyageurs?)${END}`, "i");
const BEDROOMS = new RegExp(String.raw`${NUM}(?:bedrooms?|chambres?)${END}`, "i");
const BEDS = new RegExp(String.raw`${NUM}(?:beds?|(?:(?:très\s+)?grands?\s+)?lits?)${END}`, "i");
const REVIEWS = new RegExp(
  String.raw`(?<![\d.,])(\d{1,3}(?:[ ,.]\d{3})+|\d+)\s+(?:reviews?|avis|commentaires|évaluations|expériences vécues|ratings)${END}`,
  "i",
);

function extractCounts(text: string, source: FieldSource, fields: ListingFields) {
  const reviews = text.match(REVIEWS);
  if (reviews) {
    const count = parseCount(reviews[1]);
    if (count !== null) fillMissing(fields, "reviewCount", { value: count, source });
  }
  const guests = text.match(GUESTS);
  if (guests) fillMissing(fields, "guests", { value: Number(guests[1]), source });
  const bedrooms = text.match(BEDROOMS);
  if (bedrooms) fillMissing(fields, "bedrooms", { value: Number(bedrooms[1]), source });
  const beds = text.match(BEDS);
  if (beds) fillMissing(fields, "beds", { value: Number(beds[1]), source });
}

/** Motifs « résumé » (utilisés aussi sur og:title / og:description). */
export function extractSummaryFields(rawText: string, source: FieldSource): ListingFields {
  const text = normalizeSpaces(rawText);
  const fields: ListingFields = {};
  extractRating(text, source, fields);
  extractCounts(text, source, fields);
  return fields;
}

// ——— Titre, description, adresse ———

const UI_LINES = new Set(
  [
    "share",
    "save",
    "partager",
    "enregistrer",
    "réserver",
    "reserve",
    "book",
    "show all photos",
    "afficher toutes les photos",
    "nous ajustons nos tarifs",
    "passer au contenu principal",
    "skip to content",
    "translate",
    "traduire",
  ].map((s) => s.toLowerCase()),
);

function extractTitle(lines: string[]): string | null {
  for (const line of lines.slice(0, 40)) {
    if (line.length < 4 || line.length > 150) continue;
    if (UI_LINES.has(line.toLowerCase())) continue;
    if (/^fixture synthétique/i.test(line)) continue;
    if (!/[a-zà-ÿ]{2}/i.test(line)) continue;
    return line;
  }
  return null;
}

function extractDescription(lines: string[]): string | null {
  for (const line of lines) {
    if (line.length < 120) continue;
    if (/^[«"“]/.test(line) || /cookie/i.test(line)) continue;
    if (/^fixture synthétique/i.test(line)) continue;
    const sentences = line.match(/[.!?](?:\s|$)/g)?.length ?? 0;
    if (sentences < 2) continue;
    return line.length > 500 ? `${line.slice(0, 499).trimEnd()}…` : line;
  }
  return null;
}

function extractAddress(text: string): string | null {
  const match = firstMatch(text, [
    /^(?:Entire|Private|Shared|Room in|Hotel room)[^\n]{0,60}?\bin ([^\n]{2,120})$/im, // Airbnb (en)
    /^(?:Logement entier|Chambre privée|Chambre partagée|Chambre d'hôtel)\b.*\s[·–-]\s([^\n]{2,120})$/im, // Airbnb (fr)
    /^(.{5,200}?)(?:Une fois votre réservation effectuée|–\s*(?:Excellent|Très bon|Bon|Superbe)\s+emplacement)/im, // Booking (fr)
    /^(.{5,200}?)(?:After booking|–\s*(?:Excellent|Great|Good|Superb)\s+location)/im, // Booking (en)
    /^(?:Où vous serez|Emplacement|Localisation|Where you'll be|Where you’ll be)\s*\n+([^\n]{3,120})$/im,
    /dans ce quartier\s*:\s*([^.\n]{3,80})/i,
    /in the ([^.\n]{3,60}?) neighbou?rhood/i,
  ]);
  return match ? match[1].trim().replace(/[–\s]+$/, "") : null;
}

// ——— Point d'entrée ———

export function extractFromText(rawText: string, options: { now?: Date } = {}): ListingFields {
  const text = normalizeSpaces(rawText);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const fields: ListingFields = {};
  const source: FieldSource = "regex";

  const title = extractTitle(lines);
  if (title) fields.title = { value: title, source };
  const description = extractDescription(lines);
  if (description) fields.description = { value: description, source };
  const address = extractAddress(text);
  if (address) fields.address = { value: address, source };

  // Dates et nuits
  const dates = parseStayDates(text, options.now);
  if (dates) {
    const note = dates.inferredYear ? "année déduite" : undefined;
    fields.checkIn = { value: dates.checkIn, source, note };
    fields.checkOut = { value: dates.checkOut, source, note };
  }
  const nights = firstMatch(text, NIGHTS_PATTERNS);
  if (nights) fields.nights = { value: Number(nights[1]), source };
  else if (dates) {
    fields.nights = { value: nightsBetween(dates.checkIn, dates.checkOut), source, note: "d'après les dates" };
  }

  // Tableau de chambres (hôtels) : tarif le moins cher compatible avec le nombre de voyageurs
  const rates = parseRoomRates(text);
  if (rates.length > 0) {
    const guests = requestedGuests(text);
    const { best, poolSize, filtered } = chooseRate(rates, guests);
    const scope = filtered ? ` pour ${guests} voyageur${guests! > 1 ? "s" : ""}` : "";
    const roomLabel = best.room ?? "chambre";
    fields.totalPrice = {
      value: best.price,
      source,
      note: `${roomLabel} : le moins cher des ${poolSize} tarifs${scope} — à vérifier`,
    };
    if (best.beds !== null) fields.beds = { value: best.beds, source, note: roomLabel };
    fields.guests = { value: best.capacity, source, note: roomLabel };
    if (best.freeCancellation !== null) {
      fields.freeCancellation = { value: best.freeCancellation, source, note: best.cancellationNote ?? undefined };
    }
  } else {
    const total = firstMatch(text, TOTAL_PATTERNS);
    const totalValue = total ? parseAmount(total[1]) : null;
    if (totalValue !== null) fields.totalPrice = { value: totalValue, source };
  }

  const perNight = firstMatch(text, PER_NIGHT_PATTERNS);
  const perNightValue = perNight ? parseAmount(perNight[1]) : null;
  if (perNightValue !== null) fields.pricePerNight = { value: perNightValue, source };

  if (!fields.freeCancellation) {
    const free = text.match(FREE_CANCEL);
    const nonRefundable = text.match(NON_REFUNDABLE);
    if (free && (!nonRefundable || free.index! < nonRefundable.index!)) {
      fields.freeCancellation = { value: true, source, note: free[0].trim() };
    } else if (nonRefundable) {
      fields.freeCancellation = { value: false, source, note: nonRefundable[0] };
    }
  }

  const summary = extractSummaryFields(text, source);
  for (const [key, field] of Object.entries(summary)) {
    fillMissing(fields, key as keyof ListingFields, field as never);
  }
  return fields;
}
