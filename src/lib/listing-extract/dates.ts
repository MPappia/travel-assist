// Dates de séjour affichées sur la page (formats français et anglais).

const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const FR_MONTHS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
const FR_ALIASES: Record<string, number> = { fevr: 1, fev: 1, févr: 1, aout: 7, août: 7, dec: 11, déc: 11, janv: 0, jan: 0 };

function frMonth(token: string): number | null {
  const t = token.toLowerCase().replace(/\.$/, "");
  if (t in FR_ALIASES) return FR_ALIASES[t];
  const index = FR_MONTHS.findIndex((m) => t.startsWith(m) || m.startsWith(t));
  return index >= 0 ? index : null;
}

function enMonth(token: string): number | null {
  const index = EN_MONTHS.indexOf(token.slice(0, 3).toLowerCase());
  return index >= 0 ? index : null;
}

const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m, d));
  return date.getUTCMonth() === m && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
};

export interface StayDates {
  checkIn: string;
  checkOut: string;
  /** Année déduite (absente de la page). */
  inferredYear: boolean;
}

function finish(checkIn: string | null, checkOut: string | null, inferredYear: boolean): StayDates | null {
  if (!checkIn || !checkOut) return null;
  const nights = nightsBetween(checkIn, checkOut);
  return nights > 0 && nights <= 90 ? { checkIn, checkOut, inferredYear } : null;
}

/** Complète une date sans année : prochaine occurrence à partir d'aujourd'hui. */
function withYear(month: number, day: number, year: number | null, now: Date, after?: string): [string | null, boolean] {
  if (year !== null) return [iso(year, month, day), false];
  let y = now.getUTCFullYear();
  let candidate = iso(y, month, day);
  const floor = after ?? now.toISOString().slice(0, 10);
  if (candidate && candidate < floor) candidate = iso(++y, month, day);
  return [candidate, true];
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
}

export function parseStayDates(text: string, now: Date = new Date()): StayDates | null {
  // « CHECK-IN 3/19/2027 … CHECKOUT 3/20/2027 » (mois/jour) ou « ARRIVÉE 12/04/2027 … DÉPART 15/04/2027 » (jour/mois)
  const numeric = text.match(
    /(CHECK-?IN|ARRIVÉE|Arrivée)\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})[\s\S]{0,60}?(?:CHECK-?OUT|DÉPART|Départ)\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (numeric) {
    const french = /arriv/i.test(numeric[1]);
    const [a, b, y1, c, d, y2] = numeric.slice(2).map(Number);
    const result = french
      ? finish(iso(y1, b - 1, a), iso(y2, d - 1, c), false)
      : finish(iso(y1, a - 1, b), iso(y2, c - 1, d), false);
    if (result) return result;
  }

  // « Mar 19, 2027 - Mar 20, 2027 »
  const en = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2})(?:, (\d{4}))?\s*[-–—]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2})(?:, (\d{4}))?/,
  );
  if (en) {
    const m1 = enMonth(en[1])!;
    const m2 = enMonth(en[4])!;
    const y1 = en[3] ? Number(en[3]) : en[6] ? Number(en[6]) - (m2 < m1 ? 1 : 0) : null;
    const [checkIn, inferred] = withYear(m1, Number(en[2]), y1, now);
    const y2 = en[6] ? Number(en[6]) : null;
    const [checkOut] = withYear(m2, Number(en[5]), y2, now, checkIn ?? undefined);
    const result = finish(checkIn, checkOut, inferred);
    if (result) return result;
  }

  // « lun. 1er mars — sam. 6 mars », « 12 juil. – 19 juil. 2027 », « 12 avr. 2027 - 15 avr. 2027 »
  const MONTH = String.raw`(janv|janvier|févr|février|fevr|fév|mars|avr|avril|mai|juin|juil|juillet|août|aout|sept|septembre|oct|octobre|nov|novembre|déc|décembre|dec)\.?`;
  const fr = text.match(
    new RegExp(
      String.raw`(\d{1,2})(?:er)?\s+${MONTH}(?:\s+(\d{4}))?\s*[-–—]\s*(?:[a-zé]{3,4}\.\s+)?(\d{1,2})(?:er)?\s+${MONTH}(?:\s+(\d{4}))?`,
      "i",
    ),
  );
  if (fr) {
    const m1 = frMonth(fr[2]);
    const m2 = frMonth(fr[5]);
    if (m1 !== null && m2 !== null) {
      const y1 = fr[3] ? Number(fr[3]) : fr[6] ? Number(fr[6]) - (m2 < m1 ? 1 : 0) : null;
      const [checkIn, inferred] = withYear(m1, Number(fr[1]), y1, now);
      const y2 = fr[6] ? Number(fr[6]) : null;
      const [checkOut] = withYear(m2, Number(fr[4]), y2, now, checkIn ?? undefined);
      const result = finish(checkIn, checkOut, inferred);
      if (result) return result;
    }
  }
  return null;
}

const FR_MONTH_TOKEN = String.raw`(janv|janvier|févr|février|fevr|fév|mars|avr|avril|mai|juin|juil|juillet|août|aout|sept|septembre|oct|octobre|nov|novembre|déc|décembre|dec)\.?`;

/**
 * Date seule (« ven. 19 mars », « lun. 12 juil. 2027 », « Fri, Mar 19, 2027 ») → YYYY-MM-DD.
 * Sans année : prochaine occurrence à partir d'aujourd'hui, ou de `after` si fourni.
 */
export function parseSingleDate(text: string, now: Date = new Date(), after?: string): { date: string; inferredYear: boolean } | null {
  const fr = text.match(new RegExp(String.raw`(\d{1,2})(?:er)?\s+${FR_MONTH_TOKEN}(?:\s+(\d{4}))?`, "i"));
  if (fr) {
    const month = frMonth(fr[2]);
    if (month !== null) {
      const [date, inferredYear] = withYear(month, Number(fr[1]), fr[3] ? Number(fr[3]) : null, now, after);
      if (date) return { date, inferredYear };
    }
  }
  const en = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2})(?:, (\d{4}))?/);
  if (en) {
    const [date, inferredYear] = withYear(enMonth(en[1])!, Number(en[2]), en[3] ? Number(en[3]) : null, now, after);
    if (date) return { date, inferredYear };
  }
  return null;
}
