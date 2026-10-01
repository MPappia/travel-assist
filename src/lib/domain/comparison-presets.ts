import type { CriterionInput } from "@/lib/validation";

export interface ComparisonPreset {
  key: string;
  label: string;
  name: string;
  criteria: CriterionInput[];
}

export const COMPARISON_PRESETS: ComparisonPreset[] = [
  {
    key: "lodging",
    label: "Logements",
    name: "Logements",
    criteria: [
      { name: "Prix total du séjour", type: "NUMBER", weight: 3, direction: "LOWER_IS_BETTER", unit: "€" },
      { name: "Note", type: "RATING", weight: 2, direction: "HIGHER_IS_BETTER", unit: "" },
      { name: "Couchages", type: "NUMBER", weight: 1, direction: "HIGHER_IS_BETTER", unit: "" },
      { name: "Distance au centre", type: "NUMBER", weight: 2, direction: "LOWER_IS_BETTER", unit: "km" },
      { name: "Annulation gratuite", type: "BOOLEAN", weight: 1, direction: "HIGHER_IS_BETTER", unit: "" },
    ],
  },
  {
    key: "empty",
    label: "Vierge",
    name: "",
    criteria: [{ name: "Prix", type: "NUMBER", weight: 1, direction: "LOWER_IS_BETTER", unit: "€" }],
  },
];
