// Formatage et conversions (dates, montants) — fonctions pures.
// Les dates « calendaires » (début de voyage, échéance…) sont stockées à minuit UTC
// et toujours formatées en UTC pour éviter tout décalage de fuseau.

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

/** Convertit une saisie utilisateur (« 1 234,50 », « 99.9 ») en centimes. Renvoie null si invalide. */
export function parseMoneyToCents(input: string): number | null {
  const normalized = input.replace(/[\s  €]/g, "").replace(",", ".");
  if (normalized === "" || !/^-?\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/** « YYYY-MM-DD » → Date à minuit UTC. */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date → « YYYY-MM-DD » (clé de jour UTC). */
export function toDateKey(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/** Clé du jour courant dans le fuseau local de l'utilisateur. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const longDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatDate(date: Date | null | undefined): string {
  return date ? dateFormatter.format(date) : "";
}

export function formatShortDate(date: Date | null | undefined): string {
  return date ? shortDateFormatter.format(date) : "";
}

export function formatLongDate(date: Date | null | undefined): string {
  return date ? longDateFormatter.format(date) : "";
}

export function formatDateRange(start: Date | null | undefined, end: Date | null | undefined): string {
  if (start && end) {
    if (start.getUTCFullYear() === end.getUTCFullYear()) {
      return `${shortDateFormatter.format(start)} → ${dateFormatter.format(end)}`;
    }
    return `${dateFormatter.format(start)} → ${dateFormatter.format(end)}`;
  }
  if (start) return `À partir du ${dateFormatter.format(start)}`;
  if (end) return `Jusqu'au ${dateFormatter.format(end)}`;
  return "Dates à définir";
}

/** Nombre de nuits entre deux dates calendaires. */
export function nightsBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toLocaleString("fr-FR", { maximumFractionDigits: km < 100 ? 1 : 0 })} km`;
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, "0")}`;
}
