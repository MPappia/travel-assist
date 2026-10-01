// Types de l'extraction d'annonces (bookmarklet, copier-coller).

/** Provenance d'une valeur : balises og/twitter (ou <title>), JSON-LD, motif sur le texte, ou LLM. */
export const FIELD_SOURCES = ["og", "jsonld", "regex", "llm"] as const;
export type FieldSource = (typeof FIELD_SOURCES)[number];

export interface Field<T> {
  value: T;
  source: FieldSource;
  /** Précision affichée à l'utilisateur (conversion, chambre retenue, date limite…). */
  note?: string;
}

export interface ListingValues {
  title: string;
  description: string;
  image: string;
  /** Adresse ou quartier. */
  address: string;
  /** Prix total du séjour en euros. */
  totalPrice: number;
  pricePerNight: number;
  /** Nombre de nuits couvert par le prix. */
  nights: number;
  /** Dates du séjour affichées sur la page (YYYY-MM-DD). */
  checkIn: string;
  checkOut: string;
  /** Note ramenée sur 5. */
  rating: number;
  reviewCount: number;
  /** Couchages = nombre de lits. */
  beds: number;
  bedrooms: number;
  /** Capacité en voyageurs. */
  guests: number;
  freeCancellation: boolean;
}

export type FieldKey = keyof ListingValues;
export type ListingFields = { [K in FieldKey]?: Field<ListingValues[K]> };

export const FIELD_KEYS: FieldKey[] = [
  "title",
  "description",
  "image",
  "address",
  "totalPrice",
  "pricePerNight",
  "nights",
  "checkIn",
  "checkOut",
  "rating",
  "reviewCount",
  "beds",
  "bedrooms",
  "guests",
  "freeCancellation",
];

/** Données brutes reçues de la page (bookmarklet) ou du copier-coller. */
export interface ListingSource {
  url?: string | null;
  title?: string | null;
  meta?: Record<string, string>;
  jsonLd?: string[];
  images?: string[];
  text?: string | null;
}

export type LlmStatus = "disabled" | "skipped" | "ok" | "failed";

export interface ListingExtraction {
  fields: ListingFields;
  /** Images candidates (la première est proposée par défaut). */
  images: string[];
  siteName: string | null;
  domain: string | null;
  llm: { status: LlmStatus; message?: string };
}

/** Renseigne un champ seulement s'il est encore vide. */
export function fillMissing<K extends FieldKey>(fields: ListingFields, key: K, field: Field<ListingValues[K]> | undefined) {
  if (field && fields[key] === undefined) fields[key] = field as ListingFields[K];
}
