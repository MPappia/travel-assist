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

/** 845 → « 14 h 05 » (saisie et affichage des durées de vol). */
export function formatDurationInput(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** « 14 h 05 », « 14h05 », « 14:05 », « 845 » (minutes) → 845 ; null si illisible. */
export function parseDurationInput(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const hm = v.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{1,2})?\s*(?:min)?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const m = v.match(/^(\d{1,3})\s*min$/);
  return m ? Number(m[1]) : null;
}

/** Notes pré-remplies d'un vol importé : segments, escales, passagers, date du relevé. */
export function buildFlightNotes(
  details: Pick<FlightDetails, "outbound" | "inbound" | "passengers" | "currency">,
  context: { domain?: string | null; capturedAt: Date; priceNote?: string },
): string {
  const lines: string[] = [];
  const describe = (label: string, leg: FlightLeg | undefined) => {
    if (!leg || leg.segments.length === 0) return;
    const segments = leg.segments
      .map((s) => `${s.from.code ?? "?"}→${s.to.code ?? "?"}${s.flightNumber ? ` ${s.flightNumber}` : ""}${s.departure ? ` (${s.departure.replace("T", " ")})` : ""}`)
      .join(", ");
    const layovers = leg.layovers.length
      ? ` ; escale${leg.layovers.length > 1 ? "s" : ""} : ${leg.layovers.map((l) => `${l.airport.code ?? l.airport.name}${l.durationMin ? ` ${formatDurationInput(l.durationMin)}` : ""}`).join(", ")}`
      : "";
    lines.push(`${label} : ${segments}${layovers}.`);
  };
  describe("Aller", details.outbound);
  describe("Retour", details.inbound);
  if (details.passengers) lines.push(`${details.passengers} passager${details.passengers > 1 ? "s" : ""}.`);
  if (context.priceNote) lines.push(`Prix : ${context.priceNote}.`);
  const date = context.capturedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  lines.push(`Prix relevé${context.domain ? ` sur ${context.domain}` : ""} le ${date}.`);
  return lines.join("\n");
}
