// Extraction d'un vol (aller, retour, prix, passagers, bagages) à partir du texte d'une page de détail
// (Google Flights, Skyscanner, ou page générique). Module pur, étage déterministe.
//
// Principe : la page est découpée en trajets (« Départ · ven. 19 mars » / « Retour · … ») ; dans chaque
// trajet, les lignes portant un code d'aéroport entre parenthèses « (CDG) » associées à une heure (sur la
// même ligne, ou la ligne précédente) forment les extrémités des segments. Les lignes d'escale
// (« Escale de 3 h 10 · Helsinki (HEL) ») ne sont pas des extrémités. Numéros de vol, compagnie et durée
// sont rattachés au segment ouvert, sinon au dernier segment fermé (Google les place après l'arrivée).
import { legSchedule, totalStops, type FlightLeg, type FlightSegment } from "@/lib/domain/flights";
import { parseSingleDate } from "@/lib/listing-extract/dates";
import { AMOUNT, formatNumberFr, normalizeSpaces, parseAmount } from "@/lib/listing-extract/numbers";
import type { Field, FieldSource } from "@/lib/listing-extract/types";

export interface FlightValues {
  title: string;
  totalPrice: number;
  currency: string;
  passengers: number;
  outbound: FlightLeg;
  inbound: FlightLeg;
  /** Champs « critères » dérivés des trajets (ou fournis directement, ex. par le LLM). */
  outboundDuration: number;
  inboundDuration: number;
  stops: number;
  checkedBag: boolean;
  airlines: string;
  outboundSchedule: string;
  inboundSchedule: string;
}
export type FlightFieldKey = keyof FlightValues;
export type FlightFields = { [K in FlightFieldKey]?: Field<FlightValues[K]> };

export const FLIGHT_FIELD_KEYS: FlightFieldKey[] = [
  "title",
  "totalPrice",
  "currency",
  "passengers",
  "outbound",
  "inbound",
  "outboundDuration",
  "inboundDuration",
  "stops",
  "checkedBag",
  "airlines",
  "outboundSchedule",
  "inboundSchedule",
];

// ——— Utilitaires ———

const CURRENCIES: Record<string, string> = { "€": "EUR", EUR: "EUR", "£": "GBP", GBP: "GBP", $: "USD", USD: "USD", CHF: "CHF", "¥": "JPY", JPY: "JPY" };
const CUR = String.raw`(€|£|\$|¥|EUR|GBP|USD|CHF|JPY)`;
const PRICE = String.raw`(?:${CUR}\s?(${AMOUNT})|(${AMOUNT})\s?${CUR})`;

function readPrice(match: RegExpMatchArray, offset = 1): { amount: number; currency: string } | null {
  const [cur1, amount1, amount2, cur2] = match.slice(offset, offset + 4);
  const amount = parseAmount(amount1 ?? amount2 ?? "");
  const currency = CURRENCIES[(cur1 ?? cur2 ?? "").toUpperCase()] ?? CURRENCIES[cur1 ?? cur2 ?? ""];
  return amount !== null && currency ? { amount, currency } : null;
}

/** « 14 h 05 », « 2h 55 », « 8 hr 5 min », « 45 min » → minutes */
export function parseDuration(text: string): number | null {
  const hm = text.match(/(\d{1,2})\s?(?:h|hr|hrs|heures?)\b\.?\s?(?:(\d{1,2})\s?(?:min|mn|m)?\b)?/i);
  if (hm) return Number(hm[1]) * 60 + (hm[2] ? Number(hm[2]) : 0);
  const m = text.match(/\b(\d{1,3})\s?min\b/i);
  return m ? Number(m[1]) : null;
}

const TIME_IN_LINE = /\b(\d{1,2}):(\d{2})(?:\s?\+(\d))?/;
const TIME_ONLY = /^(\d{1,2}):(\d{2})(?:\s?\+(\d))?$/;
const AIRPORT = /^(.*?)\s*\(([A-Z]{3})\)/;
const LAYOVER = /escale|correspondance|layover|connection|stopover|changement/i;
const FLIGHT_NUMBER = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s(\d{1,4})\b|\b([A-Z]{2})(\d{2,4})\b/;
const OUTBOUND_MARKER = /^(?:Départ|Aller|Vol aller|Outbound|Departure|Depart)\s*[·:,–-]\s*(?=.*\d).+$/im;
const INBOUND_MARKER = /^(?:Retour|Vol retour|Return|Inbound)\s*[·:,–-]\s*(?=.*\d).+$/im;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Event {
  code: string;
  name?: string;
  time?: { h: number; m: number; plus: number };
}

/** Analyse un trajet (texte compris entre son marqueur et le suivant). */
export function parseLeg(section: string, baseDate: string | null): FlightLeg {
  const lines = section
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const segments: FlightSegment[] = [];
  const layovers: FlightLeg["layovers"] = [];
  let open: { dep: Event; info: Partial<FlightSegment> } | null = null;
  let headerDuration: number | null = null;
  let headerStops: number | null = null;
  let explicitTotal: number | null = null;
  let seenEvent = false;
  let prevTime: { h: number; m: number; plus: number } | null = null;

  const toDateTime = (t: Event["time"]) => {
    if (!t || !baseDate) return undefined;
    return `${addDays(baseDate, t.plus)}T${pad(t.h)}:${pad(t.m)}`;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const total = line.match(/(?:durée totale|total travel time|temps de trajet total)\s*:?\s*(.+)/i);
    if (total) explicitTotal ??= parseDuration(total[1]);

    const airport = line.match(AIRPORT);
    if (airport && LAYOVER.test(line)) {
      layovers.push({ airport: { code: airport[2], name: airport[1].replace(/^.*?(?:·|à|in|at)\s+/i, "").trim() || undefined }, durationMin: parseDuration(line) ?? undefined });
      continue;
    }
    if (airport) {
      seenEvent = true;
      const same = line.match(TIME_IN_LINE);
      const prev = i > 0 ? lines[i - 1].match(TIME_ONLY) : null;
      const t = same ?? prev;
      let time = t ? { h: Number(t[1]), m: Number(t[2]), plus: t[3] ? Number(t[3]) : 0 } : undefined;
      // Heure antérieure à la précédente sans « +1 » affiché : passage à minuit
      if (time && prevTime && time.plus === prevTime.plus && time.h * 60 + time.m < prevTime.h * 60 + prevTime.m) {
        time = { ...time, plus: prevTime.plus + 1 };
      }
      if (time) prevTime = time;
      const name = airport[1].replace(TIME_IN_LINE, "").trim() || undefined;
      const event: Event = { code: airport[2], name, time };
      if (!open) {
        open = { dep: event, info: {} };
      } else {
        segments.push({
          from: { code: open.dep.code, name: open.dep.name },
          to: { code: event.code, name: event.name },
          departure: toDateTime(open.dep.time),
          arrival: toDateTime(event.time),
          ...open.info,
        });
        open = null;
      }
      continue;
    }

    if (!seenEvent) {
      // En-tête du trajet : durée totale et nombre d'escales
      // (« 4 h 25, 1 escale » est une durée totale ; « Escale de 3 h 10 » ou « 3 h 10 HEL » non)
      const layoverSummary = /escale de|correspondance|layover|\b[A-Z]{3}\b/.test(line);
      headerDuration ??= /\d\s?(?:h|hr|min)\b/i.test(line) && !layoverSummary && !/\d{1,2}:\d{2}/.test(line) ? parseDuration(line) : null;
      const stops = line.match(/\b(\d)\s*(?:escales?|stops?)\b/i);
      if (stops) headerStops ??= Number(stops[1]);
      else if (/\b(?:direct|vol direct|sans escale|nonstop|non-stop)\b/i.test(line)) headerStops ??= 0;
      continue;
    }

    // Lignes d'information : numéro de vol, compagnie, durée du segment
    const target = open ? open.info : segments[segments.length - 1];
    if (!target) continue;
    const fn = line.match(FLIGHT_NUMBER);
    if (fn && !TIME_ONLY.test(line)) {
      target.flightNumber ??= fn[1] ? `${fn[1]} ${fn[2]}` : `${fn[3]} ${fn[4]}`;
      const before = line.slice(0, fn.index).replace(/[·\s]+$/, "").trim();
      const airline = before.includes("·") ? before.split("·")[0].trim() : before;
      if (airline && /[a-z]/i.test(airline)) target.airline ??= airline;
    }
    if (/durée du trajet|travel time|flight time|·\s*\d{1,2}\s?(?:h|hr)\b/i.test(line)) {
      const d = parseDuration(line.split(/durée du trajet|travel time|flight time/i).pop() ?? line);
      if (d) target.durationMin ??= d;
    }
  }

  const leg: FlightLeg = { segments, layovers };
  const duration = explicitTotal ?? headerDuration;
  if (duration) leg.durationMin = duration;
  if (headerStops !== null) leg.stops = headerStops;
  else if (segments.length > 0) leg.stops = segments.length - 1;
  return leg;
}

function splitLegs(text: string) {
  const out = text.match(OUTBOUND_MARKER);
  const back = text.match(INBOUND_MARKER);
  const outStart = out?.index ?? -1;
  const backStart = back?.index ?? -1;
  return {
    outbound: outStart >= 0 ? { marker: out![0], body: text.slice(outStart + out![0].length, backStart > outStart ? backStart : undefined) } : null,
    inbound: backStart >= 0 ? { marker: back![0], body: text.slice(backStart + back![0].length) } : null,
  };
}

// ——— Prix, passagers, bagages ———

function extractPassengers(text: string): number | null {
  const adults = text.match(/\b(\d)\s+(?:adultes?|adults?)\b/i);
  const children = text.match(/\b(\d)\s+(?:enfants?|children|child)\b/i);
  const infants = text.match(/\b(\d)\s+(?:bébés?|infants?)\b/i);
  if (adults) return Number(adults[1]) + Number(children?.[1] ?? 0) + Number(infants?.[1] ?? 0);
  const generic = text.match(/\b(\d)\s+(?:passagers?|passengers?|voyageurs?|travell?ers?)\b/i);
  return generic ? Number(generic[1]) : null;
}

function extractPrice(text: string, passengers: number | null, source: FieldSource): FlightFields {
  const fields: FlightFields = {};
  const setPrice = (p: { amount: number; currency: string }, note?: string) => {
    fields.totalPrice = { value: p.amount, source, note };
    fields.currency = { value: p.currency, source };
  };

  const perPerson = text.match(new RegExp(String.raw`${PRICE}\s*(?:par personne|\/\s?pers(?:onne)?\.?|per person|per adult|pp)\b`, "i"));
  if (perPerson) {
    const p = readPrice(perPerson);
    if (p) {
      if (passengers && passengers > 1) {
        setPrice(
          { amount: p.amount * passengers, currency: p.currency },
          `${formatNumberFr(p.amount)} ${p.currency} par personne × ${passengers} passagers`,
        );
      } else {
        setPrice(p, passengers === 1 ? undefined : "prix par personne, nombre de passagers inconnu : à vérifier");
      }
      return fields;
    }
  }
  const patterns = [
    new RegExp(String.raw`\b(?:total|prix total|montant total)\s*:?\s*${PRICE}`, "i"),
    new RegExp(String.raw`${PRICE}\s*(?:au total|total)\b`, "i"),
    new RegExp(String.raw`${PRICE}\s*\n?\s*(?:aller-retour|aller simple|round trip|one way)\b`, "i"),
    new RegExp(String.raw`\b(?:prix|price)\s*:?\s*${PRICE}`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const p = match ? readPrice(match) : null;
    if (p) {
      setPrice(p);
      return fields;
    }
  }
  return fields;
}

function extractCheckedBag(text: string): Field<boolean> | undefined {
  const included = text.match(/bagages? en soute inclus|bagage soute inclus|\d\s+bagages? en soute|checked bags? included|\d\s+checked bags?(?! fee)/i);
  const excluded = text.match(/bagages? en soute\s*(?::\s*(?:frais|payant|en supplément)|non inclus)|frais[^\n]{0,30}bagages? en soute|checked bags?\s*(?::\s*)?(?:fee|not included|for a fee)/i);
  if (included && (!excluded || included.index! < excluded.index!)) return { value: true, source: "regex", note: included[0] };
  if (excluded) return { value: false, source: "regex", note: excluded[0] };
  return undefined;
}

// ——— Point d'entrée ———

/** Complète les champs « critères » à partir des trajets, sans écraser une valeur présente. */
export function finalizeFlightFields(fields: FlightFields): FlightFields {
  const result = { ...fields };
  const fill = <K extends FlightFieldKey>(key: K, field: Field<FlightValues[K]> | undefined) => {
    if (field && result[key] === undefined) result[key] = field as FlightFields[K];
  };
  const out = result.outbound;
  const back = result.inbound;
  if (out?.value.durationMin) fill("outboundDuration", { value: out.value.durationMin, source: out.source });
  if (back?.value.durationMin) fill("inboundDuration", { value: back.value.durationMin, source: back.source });
  const stops = totalStops({ outbound: out?.value, inbound: back?.value });
  if (stops !== undefined) fill("stops", { value: stops, source: (out ?? back)!.source, note: back ? "aller + retour" : undefined });
  const schedule = (leg: FlightLeg | undefined) => legSchedule(leg);
  if (schedule(out?.value)) fill("outboundSchedule", { value: schedule(out!.value)!, source: out!.source });
  if (schedule(back?.value)) fill("inboundSchedule", { value: schedule(back!.value)!, source: back!.source });
  const airlines = [...(out?.value.segments ?? []), ...(back?.value.segments ?? [])]
    .map((s) => s.airline)
    .filter((a): a is string => !!a)
    .filter((a, i, all) => all.indexOf(a) === i);
  if (airlines.length) fill("airlines", { value: airlines.join(", "), source: (out ?? back)!.source });
  if (out && out.value.segments.length > 0) {
    const first = out.value.segments[0].from.code;
    const last = out.value.segments[out.value.segments.length - 1].to.code;
    if (first && last) {
      const suffix = result.airlines ? ` · ${result.airlines.value}` : "";
      fill("title", { value: `${first} → ${last}${back ? " (aller-retour)" : ""}${suffix}`, source: out.source });
    }
  }
  return result;
}

export function extractFlightFromText(rawText: string, options: { now?: Date } = {}): FlightFields {
  const text = normalizeSpaces(rawText).replace(/\r\n?/g, "\n");
  const now = options.now ?? new Date();
  const fields: FlightFields = {};
  const source: FieldSource = "regex";

  const passengers = extractPassengers(text);
  if (passengers) fields.passengers = { value: passengers, source };
  Object.assign(fields, extractPrice(text, passengers, source));

  const { outbound, inbound } = splitLegs(text);
  const outDate = outbound ? parseSingleDate(outbound.marker, now) : null;
  if (outbound) {
    const leg = parseLeg(outbound.body, outDate?.date ?? null);
    if (leg.segments.length > 0 || leg.durationMin) {
      fields.outbound = { value: leg, source, note: outDate?.inferredYear ? "année déduite" : undefined };
    }
  }
  if (inbound) {
    const backDate = parseSingleDate(inbound.marker, now, outDate?.date);
    const leg = parseLeg(inbound.body, backDate?.date ?? null);
    if (leg.segments.length > 0 || leg.durationMin) {
      fields.inbound = { value: leg, source, note: backDate?.inferredYear ? "année déduite" : undefined };
    }
  }
  const bag = extractCheckedBag(text);
  if (bag) fields.checkedBag = bag;
  return finalizeFlightFields(fields);
}

/**
 * Le texte ressemble-t-il au détail d'un vol ? Codes d'aéroport entre parenthèses, horaires, et une
 * structure de vol (numéro de vol ou marqueur « Départ · … » / « Outbound · … ») : une page d'hôtel
 * citant les aéroports proches et ses heures d'arrivée ne doit pas être prise pour un vol.
 */
export function looksLikeFlight(text: string): boolean {
  const t = normalizeSpaces(text);
  const codes = new Set([...t.matchAll(/\(([A-Z]{3})\)/g)].map((m) => m[1]));
  const times = (t.match(/\b\d{1,2}:\d{2}\b/g) ?? []).length;
  const structure = OUTBOUND_MARKER.test(t) || INBOUND_MARKER.test(t) || FLIGHT_NUMBER.test(t);
  return codes.size >= 2 && times >= 2 && structure;
}
