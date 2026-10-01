import type { ComparisonKindValue, ExpenseCategoryValue } from "@/lib/labels";
import type { CriterionInput } from "@/lib/validation";

export interface ComparisonPreset {
  key: string;
  label: string;
  name: string;
  kind: ComparisonKindValue;
  /** Catégorie budgétaire de la dépense créée par un élément retenu. */
  expenseCategory: ExpenseCategoryValue;
  criteria: CriterionInput[];
}

export const COMPARISON_PRESETS: ComparisonPreset[] = [
  {
    key: "lodging",
    label: "Logements",
    name: "Logements",
    kind: "LODGING",
    expenseCategory: "ACCOMMODATION",
    criteria: [
      { name: "Prix total du séjour", type: "NUMBER", weight: 3, direction: "LOWER_IS_BETTER", unit: "€" },
      { name: "Note", type: "RATING", weight: 2, direction: "HIGHER_IS_BETTER", unit: "" },
      { name: "Couchages", type: "NUMBER", weight: 1, direction: "HIGHER_IS_BETTER", unit: "" },
      { name: "Distance au centre", type: "NUMBER", weight: 2, direction: "LOWER_IS_BETTER", unit: "km" },
      { name: "Annulation gratuite", type: "BOOLEAN", weight: 1, direction: "HIGHER_IS_BETTER", unit: "" },
    ],
  },
  {
    key: "flights",
    label: "Vols",
    name: "Vols",
    kind: "FLIGHTS",
    expenseCategory: "TRANSPORT",
    criteria: [
      { name: "Prix total", type: "NUMBER", weight: 3, direction: "LOWER_IS_BETTER", unit: "€" },
      { name: "Durée totale aller", type: "NUMBER", weight: 2, direction: "LOWER_IS_BETTER", unit: "min" },
      { name: "Durée totale retour", type: "NUMBER", weight: 2, direction: "LOWER_IS_BETTER", unit: "min" },
      { name: "Nombre d'escales", type: "NUMBER", weight: 2, direction: "LOWER_IS_BETTER", unit: "" },
      { name: "Bagage soute inclus", type: "BOOLEAN", weight: 1, direction: "HIGHER_IS_BETTER", unit: "" },
      { name: "Compagnie(s)", type: "TEXT", weight: 0, direction: "HIGHER_IS_BETTER", unit: "" },
      { name: "Horaires aller", type: "TEXT", weight: 0, direction: "HIGHER_IS_BETTER", unit: "" },
      { name: "Horaires retour", type: "TEXT", weight: 0, direction: "HIGHER_IS_BETTER", unit: "" },
    ],
  },
  {
    key: "empty",
    label: "Vierge",
    name: "",
    kind: "GENERIC",
    expenseCategory: "OTHER",
    criteria: [{ name: "Prix", type: "NUMBER", weight: 1, direction: "LOWER_IS_BETTER", unit: "€" }],
  },
];

export function presetByKey(key: string): ComparisonPreset {
  return COMPARISON_PRESETS.find((p) => p.key === key) ?? COMPARISON_PRESETS[0];
}
