// SerpApi — moteur « google_flights » : paramètres, lecture des réponses et conversion en élément de
// comparatif. Module pur (aucun appel réseau, aucune clé) : le client est dans src/server/serpapi*.ts.
//
// Aller-retour : la première requête (type=1) renvoie des allers portant chacun un `departure_token` ;
// le retour n'est demandé qu'à la demande (seconde requête avec ce jeton), dont les options portent le
// prix total aller-retour. Aller simple (type=2) : une seule requête, options avec `booking_token`.
import { z } from "zod";

import { buildFlightNotes, legSchedule, totalStops, type FlightDetails, type FlightLeg } from "@/lib/domain/flights";
import type { FlightMappableValues } from "@/lib/listing-extract/criteria-mapping";

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Code IATA de 3 lettres (ex. CDG)");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

export const flightSearchSchema = z
  .object({
    from: iata,
    to: iata,
    outboundDate: isoDate,
    returnDate: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() ? v.trim() : undefined))
      .pipe(isoDate.optional()),
    adults: z.coerce.number().int("Nombre entier attendu").min(1, "Au moins 1 passager").max(9, "9 passagers au plus"),
  })
  .refine((p) => p.from !== p.to, { path: ["to"], message: "Destination identique à l'origine" })
  .refine((p) => !p.returnDate || p.returnDate >= p.outboundDate, {
    path: ["returnDate"],
    message: "Le retour doit suivre l'aller",
  });
export type FlightSearchParams = z.output<typeof flightSearchSchema>;
export type FlightSearchInput = z.input<typeof flightSearchSchema>;

/** Paramètres de requête (sans la clé), dans un ordre stable : sert aussi de clé de cache. */
export function buildSearchQuery(params: FlightSearchParams, departureToken?: string): URLSearchParams {
  const query = new URLSearchParams({
    engine: "google_flights",
    departure_id: params.from,
    arrival_id: params.to,
    outbound_date: params.outboundDate,
    type: params.returnDate ? "1" : "2",
    adults: String(params.adults),
    currency: "EUR",
    hl: "fr",
    gl: "fr",
  });
  if (params.returnDate) query.set("return_date", params.returnDate);
  if (departureToken) query.set("departure_token", departureToken);
  return query;
}

// ——— Réponses ———

const serpAirport = z.object({ id: z.string().optional(), name: z.string().optional(), time: z.string().optional() });
const serpSegment = z.object({
  departure_airport: serpAirport.optional(),
  arrival_airport: serpAirport.optional(),
  duration: z.number().optional(),
  airline: z.string().optional(),
  flight_number: z.string().optional(),
});
const serpOption = z.object({
  flights: z.array(serpSegment).min(1),
  layovers: z.array(z.object({ duration: z.number().optional(), name: z.string().optional(), id: z.string().optional() })).optional(),
  total_duration: z.number().optional(),
  price: z.number().optional(),
  departure_token: z.string().optional(),
  booking_token: z.string().optional(),
});
type SerpOption = z.output<typeof serpOption>;

export interface SerpFlightOffer {
  /** `departure_token` (aller d'un aller-retour, retour à demander) ou `booking_token` (option complète). */
  token: string;
  needsReturn: boolean;
  /** Prix total en euros pour tous les passagers ; pour un aller d'aller-retour, prix « à partir de » l'aller-retour. */
  price: number | null;
  leg: FlightLeg;
  airlines: string[];
  best: boolean;
}

export interface SerpFlightResults {
  offers: SerpFlightOffer[];
  googleFlightsUrl: string | null;
}

/** « 2027-03-19 9:05 » → « 2027-03-19T09:05 » */
function localDateTime(time: string | undefined): string | undefined {
  const m = time?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  return m ? `${m[1]}T${m[2].padStart(2, "0")}:${m[3]}` : undefined;
}

const code = (id: string | undefined) => (id && /^[A-Z]{3}$/.test(id) ? id : undefined);
const positiveInt = (n: number | undefined) => (n !== undefined && Number.isInteger(n) && n > 0 ? n : undefined);

function toLeg(option: SerpOption): FlightLeg {
  const segments = option.flights.map((f) => ({
    from: { code: code(f.departure_airport?.id), name: f.departure_airport?.name?.slice(0, 120) },
    to: { code: code(f.arrival_airport?.id), name: f.arrival_airport?.name?.slice(0, 120) },
    departure: localDateTime(f.departure_airport?.time),
    arrival: localDateTime(f.arrival_airport?.time),
    airline: f.airline?.slice(0, 80),
    flightNumber: f.flight_number?.slice(0, 12),
    durationMin: positiveInt(f.duration),
  }));
  const layovers = (option.layovers ?? []).map((l) => ({
    airport: { code: code(l.id), name: l.name?.slice(0, 120) },
    durationMin: positiveInt(l.duration),
  }));
  return {
    segments: segments.slice(0, 8),
    layovers: layovers.slice(0, 7),
    durationMin: positiveInt(option.total_duration),
    stops: Math.min(layovers.length, 7),
  };
}

/** Lit `best_flights` puis `other_flights` ; ignore les options illisibles plutôt que d'échouer. */
export function parseSerpFlights(json: unknown): SerpFlightResults {
  const root = (json ?? {}) as { best_flights?: unknown; other_flights?: unknown; search_metadata?: { google_flights_url?: unknown } };
  const offers: SerpFlightOffer[] = [];
  for (const [list, best] of [
    [root.best_flights, true],
    [root.other_flights, false],
  ] as const) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const parsed = serpOption.safeParse(raw);
      if (!parsed.success) continue;
      const option = parsed.data;
      const token = option.departure_token ?? option.booking_token;
      if (!token) continue;
      const leg = toLeg(option);
      offers.push({
        token,
        needsReturn: !!option.departure_token,
        price: typeof option.price === "number" && option.price > 0 ? option.price : null,
        leg,
        airlines: [...new Set(leg.segments.map((s) => s.airline).filter((a): a is string => !!a))],
        best,
      });
    }
  }
  const url = root.search_metadata?.google_flights_url;
  return { offers, googleFlightsUrl: typeof url === "string" && /^https:\/\//.test(url) ? url : null };
}

export type SerpErrorCode = "QUOTA" | "AUTH" | "ERROR";
export interface SerpError {
  code: SerpErrorCode;
  message: string;
}

const NO_RESULTS = /hasn't returned any results|no results/i;
const QUOTA = /run out of searches|searches (?:for the month )?(?:are )?exhausted|plan.*limit|out of (?:searches|credits)/i;

/**
 * Classe une réponse SerpApi : `null` si exploitable (y compris « aucun résultat »), sinon erreur.
 * Quota : HTTP 429 ou message explicite ; clé refusée : HTTP 401/403.
 */
export function classifySerpResponse(status: number, json: unknown): SerpError | null {
  const error = typeof (json as { error?: unknown } | null)?.error === "string" ? (json as { error: string }).error : null;
  if (status === 429 || (error && QUOTA.test(error))) {
    return {
      code: "QUOTA",
      message:
        "Quota SerpApi atteint : plus aucune recherche disponible ce mois-ci (quota partagé entre tous les moteurs SerpApi). Les résultats déjà obtenus restent consultables pendant 6 h.",
    };
  }
  if (status === 401 || status === 403) {
    return { code: "AUTH", message: "Clé SerpApi refusée : vérifiez SERPAPI_KEY dans le fichier .env puis redémarrez le serveur." };
  }
  if (error && NO_RESULTS.test(error) && status < 500) return null;
  if (status >= 400 || error) {
    return { code: "ERROR", message: `Recherche SerpApi impossible${error ? ` : ${error.slice(0, 200)}` : ` (HTTP ${status})`}.` };
  }
  return null;
}

export interface SerpAccountUsage {
  /** Recherches consommées ce mois-ci (tous moteurs SerpApi confondus). */
  used: number | null;
  /** Recherches incluses dans l'abonnement, par mois. */
  limit: number | null;
  /** Recherches restantes (abonnement + crédits supplémentaires). */
  left: number | null;
}

/** Ne garde que les compteurs de l'API Account (qui renvoie aussi la clé et l'e-mail : jamais transmis). */
export function parseSerpAccount(json: unknown): SerpAccountUsage | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const usage = {
    used: num(o.this_month_usage),
    limit: num(o.searches_per_month),
    left: num(o.total_searches_left) ?? num(o.plan_searches_left),
  };
  return usage.used === null && usage.limit === null && usage.left === null ? null : usage;
}

// ——— Conversion en élément de comparatif ———

export interface SearchedFlight {
  title: string;
  notes: string;
  details: FlightDetails;
  values: FlightMappableValues;
}

export function buildSearchedFlight(input: {
  outbound: SerpFlightOffer;
  inbound?: SerpFlightOffer;
  /** Prix total en euros (celui du retour choisi pour un aller-retour). */
  price: number | null;
  passengers: number;
  fetchedAt: Date;
}): SearchedFlight {
  const { outbound, inbound } = input;
  const airlines = [...new Set([...outbound.airlines, ...(inbound?.airlines ?? [])])].slice(0, 8);
  const details: FlightDetails = {
    outbound: outbound.leg,
    inbound: inbound?.leg,
    passengers: input.passengers,
    currency: "EUR",
    airlines,
  };
  const first = outbound.leg.segments[0]?.from.code ?? "?";
  const last = outbound.leg.segments.at(-1)?.to.code ?? "?";
  const title = `${first} → ${last}${inbound ? " (aller-retour)" : ""}${airlines.length ? ` · ${airlines.join(", ")}` : ""}`;

  const values: FlightMappableValues = {};
  if (input.price !== null) values.totalPrice = input.price;
  if (outbound.leg.durationMin) values.outboundDuration = outbound.leg.durationMin;
  if (inbound?.leg.durationMin) values.inboundDuration = inbound.leg.durationMin;
  const stops = totalStops({ outbound: outbound.leg, inbound: inbound?.leg });
  if (stops !== undefined) values.stops = stops;
  if (airlines.length) values.airlines = airlines.join(", ");
  const outSchedule = legSchedule(outbound.leg);
  if (outSchedule) values.outboundSchedule = outSchedule;
  const inSchedule = legSchedule(inbound?.leg);
  if (inSchedule) values.inboundSchedule = inSchedule;

  const notes = buildFlightNotes(details, {
    domain: "Google Flights (via SerpApi)",
    capturedAt: input.fetchedAt,
    priceNote: input.price !== null ? `total pour ${input.passengers} passager${input.passengers > 1 ? "s" : ""}, bagage en soute non précisé` : undefined,
  });
  return { title: title.slice(0, 200), notes, details, values };
}
