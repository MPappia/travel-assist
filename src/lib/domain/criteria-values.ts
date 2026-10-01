// Conversion des valeurs de critères entre la saisie, la base et le moteur de score.
import type { CriterionKind, CriterionRawValue } from "@/lib/domain/scoring";

export interface StoredCriterionValue {
  numberValue: number | null;
  textValue: string | null;
  boolValue: boolean | null;
}

export const EMPTY_VALUE: StoredCriterionValue = { numberValue: null, textValue: null, boolValue: null };

export type ParsedValue = { ok: true; value: StoredCriterionValue } | { ok: false; error: string };

/** Interprète la saisie d'un champ de critère (chaîne) selon son type. Une saisie vide efface la valeur. */
export function parseCriterionInput(type: CriterionKind, raw: string | null | undefined): ParsedValue {
  const input = (raw ?? "").trim();
  if (input === "") return { ok: true, value: EMPTY_VALUE };

  switch (type) {
    case "TEXT":
      return { ok: true, value: { ...EMPTY_VALUE, textValue: input.slice(0, 500) } };
    case "BOOLEAN":
      if (["true", "oui", "1"].includes(input.toLowerCase())) return { ok: true, value: { ...EMPTY_VALUE, boolValue: true } };
      if (["false", "non", "0"].includes(input.toLowerCase())) return { ok: true, value: { ...EMPTY_VALUE, boolValue: false } };
      return { ok: false, error: "Oui ou non attendu" };
    case "RATING": {
      const n = Number(input.replace(",", "."));
      if (!Number.isFinite(n) || n < 1 || n > 5) return { ok: false, error: "Note entre 1 et 5" };
      return { ok: true, value: { ...EMPTY_VALUE, numberValue: n } };
    }
    case "NUMBER": {
      const n = Number(input.replace(/[\s  ]/g, "").replace(",", "."));
      if (!Number.isFinite(n)) return { ok: false, error: "Nombre attendu" };
      return { ok: true, value: { ...EMPTY_VALUE, numberValue: n } };
    }
  }
}

/** Valeur stockée → valeur brute pour le scoring. */
export function toRawValue(type: CriterionKind, stored: StoredCriterionValue | undefined): CriterionRawValue {
  if (!stored) return null;
  if (type === "TEXT") return stored.textValue;
  if (type === "BOOLEAN") return stored.boolValue;
  return stored.numberValue;
}

/** Valeur stockée → chaîne pour pré-remplir un champ de formulaire. */
export function toInputValue(type: CriterionKind, stored: StoredCriterionValue | undefined): string {
  const raw = toRawValue(type, stored);
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "boolean") return raw ? "true" : "false";
  return String(raw);
}

/** Valeur stockée → texte affiché dans le tableau comparatif. */
export function formatCriterionValue(type: CriterionKind, stored: StoredCriterionValue | undefined, unit = ""): string {
  const raw = toRawValue(type, stored);
  if (raw === null || raw === undefined || raw === "") return "—";
  if (typeof raw === "boolean") return raw ? "Oui" : "Non";
  if (typeof raw === "number") {
    const formatted = raw.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    if (type === "RATING") return `${formatted}/5`;
    return unit ? `${formatted} ${unit}` : formatted;
  }
  return raw;
}
