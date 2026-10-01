// Nombres, montants et texte : utilitaires purs.

/** Remplace les espaces insécables (fines ou non) par des espaces simples. */
export function normalizeSpaces(text: string): string {
  return text.replace(/[    ]/g, " ");
}

/** Montant : « 1 008 », « 1,234.56 », « 1.234,56 », « 227 », « 74,5 ». */
export const AMOUNT = String.raw`\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

export function parseAmount(raw: string): number | null {
  const s = normalizeSpaces(raw).trim().replace(/ /g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let normalized: string;
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    // Dernier séparateur suivi de 1 ou 2 chiffres : décimales
    normalized = `${s.slice(0, lastSep).replace(/[.,]/g, "")}.${s.slice(lastSep + 1)}`;
  } else {
    normalized = s.replace(/[.,]/g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** « 4,84 » → 4.84 */
export function parseDecimal(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** Entier avec séparateurs de milliers : « 16 054 », « 1,234 ». */
export function parseCount(raw: string): number | null {
  const value = Number(normalizeSpaces(raw).replace(/[ ,.]/g, ""));
  return Number.isInteger(value) ? value : null;
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function formatNumberFr(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}
