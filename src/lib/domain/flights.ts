// Vols : détails stockés sur l'élément de comparatif (JSON validé), résumés et ancienneté du prix.
import { z } from "zod";

/** Heure locale de l'aéroport, sans fuseau : « 2027-03-19T10:05 ». */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const airportSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  name: z.string().trim().max(120).optional(),
});

export const segmentSchema = z.object({
  from: airportSchema,
  to: airportSchema,
  departure: localDateTime.optional(),
  arrival: localDateTime.optional(),
  airline: z.string().trim().max(80).optional(),
  flightNumber: z.string().trim().max(12).optional(),
  durationMin: z.number().int().min(1).max(2000).optional(),
});

export const layoverSchema = z.object({
  airport: airportSchema,
  durationMin: z.number().int().min(1).max(4000).optional(),
});

export const legSchema = z.object({
  segments: z.array(segmentSchema).max(8).default([]),
  layovers: z.array(layoverSchema).max(7).default([]),
  /** Durée totale du trajet, escales comprises. */
  durationMin: z.number().int().min(1).max(5000).optional(),
  stops: z.number().int().min(0).max(7).optional(),
});

export const flightDetailsSchema = z.object({
  outbound: legSchema.optional(),
  inbound: legSchema.optional(),
  passengers: z.number().int().min(1).max(9).optional(),
  /** Devise du prix relevé (le critère « Prix total » est en euros). */
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  checkedBag: z.boolean().optional(),
  airlines: z.array(z.string().trim().max(80)).max(8).default([]),
});

export type Airport = z.output<typeof airportSchema>;
export type FlightSegment = z.output<typeof segmentSchema>;
export type FlightLeg = z.output<typeof legSchema>;
export type FlightDetails = z.output<typeof flightDetailsSchema>;

/** Lit les détails stockés ; renvoie null si absents ou invalides (jamais d'exception à l'affichage). */
export function parseFlightDetails(raw: string | null | undefined): FlightDetails | null {
  if (!raw) return null;
  try {
    const parsed = flightDetailsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function stopsOf(leg: FlightLeg | undefined): number | undefined {
  if (!leg) return undefined;
  if (leg.stops !== undefined) return leg.stops;
  return leg.segments.length > 0 ? leg.segments.length - 1 : undefined;
}

/** Escales comptées sur l'ensemble du voyage (aller + retour). */
export function totalStops(details: Pick<FlightDetails, "outbound" | "inbound">): number | undefined {
  const out = stopsOf(details.outbound);
  const back = stopsOf(details.inbound);
  if (out === undefined && back === undefined) return undefined;
  return (out ?? 0) + (back ?? 0);
}

const airportLabel = (a: Airport | undefined) => a?.code ?? a?.name ?? "?";
const timeOf = (dt: string | undefined) => dt?.slice(11, 16);

/** « CDG 10:05 → NRT 08:10 (+1) » */
export function legSchedule(leg: FlightLeg | undefined): string | undefined {
  if (!leg || leg.segments.length === 0) return undefined;
  const first = leg.segments[0];
  const last = leg.segments[leg.segments.length - 1];
  const dep = timeOf(first.departure);
  const arr = timeOf(last.arrival);
  const dayShift =
    first.departure && last.arrival
      ? Math.round((Date.parse(`${last.arrival.slice(0, 10)}T00:00:00Z`) - Date.parse(`${first.departure.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
      : 0;
  const from = `${airportLabel(first.from)}${dep ? ` ${dep}` : ""}`;
  const to = `${airportLabel(last.to)}${arr ? ` ${arr}` : ""}${dayShift > 0 ? ` (+${dayShift})` : ""}`;
  return `${from} → ${to}`;
}

export const PRICE_STALE_AFTER_DAYS = 3;

export interface PriceAge {
  days: number;
  label: string;
  /** Prix relevé il y a plus de 3 jours : à revérifier. */
  stale: boolean;
}

/** Ancienneté du prix relevé, en jours calendaires (fuseau local). */
export function priceAge(capturedAt: Date, now: Date = new Date()): PriceAge {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(capturedAt)) / 86_400_000));
  const label = days === 0 ? "prix relevé aujourd'hui" : days === 1 ? "prix relevé hier" : `prix relevé il y a ${days} jours`;
  return { days, label, stale: days > PRICE_STALE_AFTER_DAYS };
}
