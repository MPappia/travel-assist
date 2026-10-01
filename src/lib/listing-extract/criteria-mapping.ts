// Correspondance entre les champs extraits d'une annonce et les critères d'un comparatif,
// par nom (synonymes FR/EN) puis par unité. Module pur.
import type { CriterionKind } from "@/lib/domain/scoring";
import type { ListingValues } from "@/lib/listing-extract/types";

/** Valeur du sélecteur de comparatif pour « créer un comparatif Logements ». */
export const NEW_COMPARISON = "new";

/**
 * Comparatif proposé par défaut dans un voyage : le premier du type de l'annonce (« Vols » ou
 * « Logements », par type puis par nom), sinon la création d'un comparatif de ce type.
 */
export function defaultComparisonFor(
  kind: "lodging" | "flight",
  comparisons: readonly { id: string; name: string; kind?: string }[] | undefined,
): string {
  const list = comparisons ?? [];
  const byKind = list.find((c) => c.kind === (kind === "flight" ? "FLIGHTS" : "LODGING"));
  const byName = list.find((c) =>
    kind === "flight" ? /\bvols?\b|flight|avion/i.test(c.name) : /logement|h[ée]bergement|lodging/i.test(c.name),
  );
  return (byKind ?? byName)?.id ?? NEW_COMPARISON;
}

export const MAPPABLE_FIELDS = [
  "pricePerNight",
  "totalPrice",
  "reviewCount",
  "rating",
  "beds",
  "bedrooms",
  "guests",
  "nights",
  "address",
  "freeCancellation",
] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];
export type MappableValues = Partial<Pick<ListingValues, MappableField>>;

export interface MappableCriterion {
  id: string;
  name: string;
  type: CriterionKind;
  unit: string;
}

export type CriterionMatch = FieldMatch<MappableField>;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface Rule {
  types: CriterionKind[];
  name: RegExp;
  exclude?: RegExp;
  unit?: (unit: string) => boolean;
}

const RULES: Record<MappableField, Rule> = {
  pricePerNight: {
    types: ["NUMBER"],
    name: /(prix|tarif|cout|price|montant).*(nuit|night)|par nuit|\/ ?nuit|per night/,
    unit: (u) => /€ ?\/ ?(nuit|night)|eur ?\/ ?(nuit|night)/.test(u),
  },
  totalPrice: {
    types: ["NUMBER"],
    name: /prix|tarif|cout|price|montant|total|budget/,
    exclude: /nuit|night/,
    unit: (u) => u === "€" || u === "eur" || u === "euros",
  },
  reviewCount: { types: ["NUMBER"], name: /avis|commentaires|reviews|evaluations/ },
  rating: { types: ["RATING", "NUMBER"], name: /\b(note|rating|evaluation|score|notation)\b/, unit: (u) => u === "/5" },
  beds: { types: ["NUMBER"], name: /couchage|\blits?\b|\bbeds?\b/, unit: (u) => /^lits?$/.test(u) },
  bedrooms: { types: ["NUMBER"], name: /chambre|bedroom/, unit: (u) => /^chambres?$/.test(u) },
  guests: { types: ["NUMBER"], name: /voyageurs|personnes|capacite|guests|occupants/, unit: (u) => /^(pers|personnes|voyageurs)$/.test(u) },
  nights: { types: ["NUMBER"], name: /\bnuits?\b|\bnights?\b/, exclude: /prix|tarif|cout|price/, unit: (u) => /^nuits?$/.test(u) },
  address: {
    types: ["TEXT"],
    name: /adresse|quartier|localisation|emplacement|ville|secteur|address|neighbou?rhood|location/,
  },
  freeCancellation: { types: ["BOOLEAN"], name: /annulation|cancel|rembours/ },
};

function usable(field: string, value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (field === "rating") return typeof value === "number" && value >= 1 && value <= 5;
  return true;
}

export interface FieldMatch<F extends string> {
  field: F;
  criterion: MappableCriterion;
  value: number | string | boolean;
  matchedBy: "nom" | "unité";
}

/**
 * Associe chaque champ extrait à au plus un critère (et chaque critère à au plus un champ).
 * Le nom prime ; l'unité ne sert qu'en second recours, et seulement sans ambiguïté.
 */
function mapFields<F extends string>(
  criteria: readonly MappableCriterion[],
  values: Partial<Record<F, number | string | boolean>>,
  rules: Record<F, Rule>,
  order: readonly F[],
): FieldMatch<F>[] {
  const matches: FieldMatch<F>[] = [];
  const usedCriteria = new Set<string>();
  const usedFields = new Set<F>();

  for (const pass of ["nom", "unité"] as const) {
    for (const field of order) {
      if (usedFields.has(field) || !usable(field, values[field])) continue;
      const rule = rules[field];
      const candidates = criteria.filter((c) => {
        if (usedCriteria.has(c.id) || !rule.types.includes(c.type)) return false;
        const name = normalize(c.name);
        if (rule.exclude?.test(name)) return false;
        return pass === "nom" ? rule.name.test(name) : (rule.unit?.(normalize(c.unit)) ?? false);
      });
      if (candidates.length === 0 || (pass === "unité" && candidates.length > 1)) continue;
      const criterion = candidates[0];
      matches.push({ field, criterion, value: values[field]!, matchedBy: pass });
      usedCriteria.add(criterion.id);
      usedFields.add(field);
    }
  }
  return matches;
}

export function mapListingToCriteria(criteria: readonly MappableCriterion[], values: MappableValues): CriterionMatch[] {
  return mapFields(criteria, values, RULES, MAPPABLE_FIELDS);
}

// ——— Vols ———

export const FLIGHT_MAPPABLE_FIELDS = [
  "totalPrice",
  "outboundDuration",
  "inboundDuration",
  "stops",
  "checkedBag",
  "airlines",
  "outboundSchedule",
  "inboundSchedule",
] as const;
export type FlightMappableField = (typeof FLIGHT_MAPPABLE_FIELDS)[number];
export type FlightMappableValues = Partial<Record<FlightMappableField, number | string | boolean>>;

const FLIGHT_RULES: Record<FlightMappableField, Rule> = {
  totalPrice: {
    types: ["NUMBER"],
    name: /prix|tarif|cout|price|montant|total|budget/,
    exclude: /nuit|night|personne|person|duree|escale/,
    unit: (u) => u === "€" || u === "eur" || u === "euros",
  },
  outboundDuration: { types: ["NUMBER"], name: /dur.*aller|aller.*dur|temps.*aller|outbound|duration.*out/ },
  inboundDuration: { types: ["NUMBER"], name: /dur.*retour|retour.*dur|temps.*retour|inbound|return/ },
  stops: { types: ["NUMBER"], name: /escale|stops?\b|correspondance/ },
  checkedBag: { types: ["BOOLEAN"], name: /bagage|baggage|\bbags?\b|soute|luggage/ },
  airlines: { types: ["TEXT"], name: /compagnie|airline|transporteur|carrier/ },
  outboundSchedule: { types: ["TEXT"], name: /horaire.*aller|aller.*horaire|schedule.*out|depart.*horaire/ },
  inboundSchedule: { types: ["TEXT"], name: /horaire.*retour|retour.*horaire|schedule.*return/ },
};

export function mapFlightToCriteria(
  criteria: readonly MappableCriterion[],
  values: FlightMappableValues,
): FieldMatch<FlightMappableField>[] {
  return mapFields(criteria, values, FLIGHT_RULES, FLIGHT_MAPPABLE_FIELDS);
}

export const FLIGHT_FIELD_LABELS: Record<FlightMappableField | "title" | "currency" | "passengers", string> = {
  title: "Titre",
  totalPrice: "Prix total",
  currency: "Devise",
  passengers: "Passagers",
  outboundDuration: "Durée totale aller",
  inboundDuration: "Durée totale retour",
  stops: "Escales (aller + retour)",
  checkedBag: "Bagage soute inclus",
  airlines: "Compagnie(s)",
  outboundSchedule: "Horaires aller",
  inboundSchedule: "Horaires retour",
};

export const FIELD_LABELS: Record<keyof ListingValues, string> = {
  title: "Titre",
  description: "Description",
  image: "Image",
  address: "Adresse / quartier",
  totalPrice: "Prix total (€)",
  pricePerNight: "Prix par nuit (€)",
  nights: "Nuits",
  checkIn: "Arrivée",
  checkOut: "Départ",
  rating: "Note (/5)",
  reviewCount: "Nombre d'avis",
  beds: "Couchages (lits)",
  bedrooms: "Chambres",
  guests: "Voyageurs max.",
  freeCancellation: "Annulation gratuite",
};
