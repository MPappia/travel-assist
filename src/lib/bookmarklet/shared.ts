// Fonctions de réduction partagées par le favori (sérialisées avec toString() et injectées à sa
// génération) et par le serveur. ⚠️ Chacune doit rester AUTONOME : aucune référence extérieure
// (pas d'import, pas de constante de module, pas d'appel à l'autre fonction).

export interface TextLimits {
  textHead: number;
  textRates: number;
  text: number;
}

export interface ReducedText {
  text: string;
  /** Description de la réduction, ou null si le texte est envoyé tel quel. */
  note: string | null;
}

/**
 * Réduit le texte d'une page : début de page (titre, note, adresse) + zone des tarifs.
 * La zone est fournie (`ratesText`, repérée dans le DOM) ou cherchée dans le texte : en-tête de tableau
 * de chambres, sinon premier bloc contenant plusieurs montants en € et « nuit » / « night ».
 */
export function reduceListingText(raw: string, limits: TextLimits, ratesText?: string | null, ratesSource?: string | null): ReducedText {
  const text = String(raw || "").replace(/\r\n?/g, "\n");
  if (text.length <= limits.text) return { text, note: null };

  const cutAtLine = (s: string) => {
    const last = s.lastIndexOf("\n");
    return last > s.length * 0.8 ? s.slice(0, last) : s;
  };
  const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const head = cutAtLine(text.slice(0, limits.textHead));
  const separator = "\n[…]\n";
  const ratesBudget = Math.min(limits.textRates, limits.text - head.length - separator.length);

  let zone: string | null = null;
  let how = "";
  if (ratesText && ratesText.trim()) {
    zone = cutAtLine(String(ratesText).replace(/\r\n?/g, "\n").slice(0, ratesBudget));
    how = ratesSource ? `tableau des tarifs (${ratesSource})` : "tableau des tarifs";
  } else {
    // 1. En-têtes de tableau de chambres / tarifs
    const anchors = [
      /^(?:Type d'hébergement|Type de logement|Room type|Accommodation type)\b/im,
      /\b(?:Tarif pour|Prix pour|Price for)\s+\d+\s+(?:nuits?|nights?)\b/i,
      /^(?:Personnes max\.?|Max\.? (?:people|persons|guests))\s*:/im,
    ];
    let start = -1;
    for (const anchor of anchors) {
      const match = anchor.exec(text);
      if (match && (start < 0 || match.index < start)) start = match.index;
    }
    if (start >= 0) {
      how = "zone des tarifs repérée par son en-tête";
      // On garde un peu de contexte avant l'en-tête (dates, nombre de voyageurs recherché).
      start = Math.max(0, start - 1500);
    } else {
      // 2. Repli : premier bloc avec plusieurs montants en € et une mention de nuit
      const amount = /€\s?\d|\d\s?€/g;
      let offset = 0;
      for (const line of text.split("\n")) {
        const window = text.slice(offset, offset + 2000);
        const amounts = window.match(amount);
        if (amounts && amounts.length >= 3 && /nuit|night/i.test(window)) {
          start = offset;
          how = "zone des tarifs repérée par ses montants";
          break;
        }
        offset += line.length + 1;
      }
    }
    if (start >= 0) {
      const nl = text.lastIndexOf("\n", start);
      start = nl >= 0 ? nl + 1 : 0;
      if (start < head.length) {
        // La zone suit immédiatement le début de page : on envoie un extrait continu.
        const contiguous = cutAtLine(text.slice(0, limits.text));
        return {
          text: contiguous,
          note: `Texte : ${fmt(text.length)} → ${fmt(contiguous.length)} caractères (début de page, ${how})`,
        };
      }
      zone = cutAtLine(text.slice(start, start + ratesBudget));
    }
  }

  if (zone === null) {
    const start = cutAtLine(text.slice(0, limits.text));
    return {
      text: start,
      note: `Texte : ${fmt(text.length)} → ${fmt(start.length)} caractères (début de page seulement, zone des tarifs introuvable)`,
    };
  }
  const result = head + separator + zone;
  return {
    text: result,
    note: `Texte : ${fmt(text.length)} → ${fmt(result.length)} caractères (début de page + ${how})`,
  };
}

export interface PrunedJsonLd {
  blocks: string[];
  /** Description de l'élagage, ou null si rien n'a changé. */
  note: string | null;
}

/**
 * Élague les blocs JSON-LD : ne garde que les nœuds utiles à l'extraction (hébergement, produit,
 * offre, note), sans les avis ni les champs inutilisés, dans l'ordre d'utilité jusqu'à la limite.
 */
export function pruneJsonLd(rawBlocks: string[], limit: number, maxBlocks: number): PrunedJsonLd {
  const RANKS: Record<string, number> = {
    hotel: 0, lodgingbusiness: 0, accommodation: 0, vacationrental: 0, house: 0, apartment: 0,
    singlefamilyresidence: 0, room: 0, hotelroom: 0, suite: 0, resort: 0, hostel: 0, motel: 0,
    bedandbreakfast: 0, campground: 0, product: 1, offer: 2, aggregateoffer: 2, aggregaterating: 3,
  };
  const KEEP = [
    "@context", "@type", "@id", "name", "description", "image", "photo", "url", "address", "streetAddress",
    "addressLocality", "addressRegion", "postalCode", "addressCountry", "numberOfRooms", "numberOfBedrooms",
    "bed", "numberOfBeds", "typeOfBed", "occupancy", "maxValue", "value", "unitCode", "aggregateRating",
    "ratingValue", "bestRating", "worstRating", "reviewCount", "ratingCount", "offers", "itemOffered", "price",
    "lowPrice", "highPrice", "priceCurrency", "priceRange",
  ];
  const rankOf = (node: unknown): number => {
    if (!node || typeof node !== "object") return 99;
    const type = (node as Record<string, unknown>)["@type"];
    const types = (Array.isArray(type) ? type : [type]).filter((t) => typeof t === "string") as string[];
    const has = (key: string) => Object.prototype.hasOwnProperty.call(RANKS, key);
    return Math.min(99, ...types.map((t) => (has(t.toLowerCase()) ? RANKS[t.toLowerCase()] : 99)));
  };
  const prune = (value: unknown, depth: number): unknown => {
    if (depth > 6) return undefined;
    if (typeof value === "string") return value.length > 2000 ? value.slice(0, 2000) : value;
    if (Array.isArray(value)) return value.slice(0, 5).map((v) => prune(v, depth + 1));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const key of KEEP) {
        if (key in (value as Record<string, unknown>)) {
          const pruned = prune((value as Record<string, unknown>)[key], depth + 1);
          if (pruned !== undefined) out[key] = pruned;
        }
      }
      return out;
    }
    return value;
  };

  const candidates: { rank: number; json: string }[] = [];
  let unreadable = 0;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) {
      const useful = (obj["@graph"] as unknown[]).filter((n) => rankOf(n) < 99);
      if (useful.length) {
        candidates.push({
          rank: Math.min(...useful.map(rankOf)),
          json: JSON.stringify({ "@context": obj["@context"], "@graph": useful.map((n) => prune(n, 0)) }),
        });
      }
      return;
    }
    const rank = rankOf(obj);
    if (rank < 99) candidates.push({ rank, json: JSON.stringify(prune(obj, 0)) });
  };
  for (const block of rawBlocks) {
    try {
      visit(JSON.parse(block));
    } catch {
      unreadable += 1;
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);

  const blocks: string[] = [];
  let size = 2; // « [] »
  for (const candidate of candidates) {
    const cost = JSON.stringify(candidate.json).length + 1;
    if (blocks.length >= maxBlocks || size + cost > limit) continue;
    blocks.push(candidate.json);
    size += cost;
  }

  const before = rawBlocks.reduce((sum, b) => sum + b.length, 0);
  const after = blocks.reduce((sum, b) => sum + b.length, 0);
  const changed = before !== after || blocks.length !== rawBlocks.length;
  if (!changed) return { blocks, note: null };
  const ko = (n: number) => `${Math.max(1, Math.round(n / 1024))} Ko`;
  const details = [
    `${rawBlocks.length} bloc${rawBlocks.length > 1 ? "s" : ""} → ${blocks.length}`,
    `${ko(before)} → ${ko(after)}`,
    "types inutiles, avis et champs non utilisés retirés",
  ];
  if (unreadable) details.push(`${unreadable} illisible${unreadable > 1 ? "s" : ""}`);
  if (candidates.length > blocks.length) details.push(`${candidates.length - blocks.length} bloc(s) utile(s) écarté(s) faute de place`);
  return { blocks, note: `JSON-LD : ${details.join(", ")}` };
}
