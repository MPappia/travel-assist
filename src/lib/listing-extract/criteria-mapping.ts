// Correspondance entre les champs extraits d'une annonce et les critères d'un comparatif,
// par nom (synonymes FR/EN) puis par unité. Module pur.
import type { CriterionKind } from "@/lib/domain/scoring";
import type { ListingValues } from "@/lib/listing-extract/types";

/** Valeur du sélecteur de comparatif pour « créer un comparatif Logements ». */
export const NEW_COMPARISON = "new";

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

export interface CriterionMatch {
  field: MappableField;
  criterion: MappableCriterion;
  value: number | string | boolean;
  matchedBy: "nom" | "unité";
}

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

function usable(field: MappableField, value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (field === "rating") return typeof value === "number" && value >= 1 && value <= 5;
  return true;
}

/**
 * Associe chaque champ extrait à au plus un critère (et chaque critère à au plus un champ).
 * Le nom prime ; l'unité ne sert qu'en second recours (ex. un seul critère en « € »).
 */
export function mapListingToCriteria(criteria: readonly MappableCriterion[], values: MappableValues): CriterionMatch[] {
  const matches: CriterionMatch[] = [];
  const usedCriteria = new Set<string>();
  const usedFields = new Set<MappableField>();

  for (const pass of ["nom", "unité"] as const) {
    for (const field of MAPPABLE_FIELDS) {
      if (usedFields.has(field) || !usable(field, values[field])) continue;
      const rule = RULES[field];
      const candidates = criteria.filter((c) => {
        if (usedCriteria.has(c.id) || !rule.types.includes(c.type)) return false;
        const name = normalize(c.name);
        if (rule.exclude?.test(name)) return false;
        return pass === "nom" ? rule.name.test(name) : (rule.unit?.(normalize(c.unit)) ?? false);
      });
      // Repli par unité seulement s'il n'y a pas d'ambiguïté
      if (candidates.length === 0 || (pass === "unité" && candidates.length > 1)) continue;
      const criterion = candidates[0];
      matches.push({ field, criterion, value: values[field]!, matchedBy: pass });
      usedCriteria.add(criterion.id);
      usedFields.add(field);
    }
  }
  return matches;
}

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
