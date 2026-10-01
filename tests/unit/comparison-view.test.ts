import { describe, expect, it } from "vitest";

import { buildComparisonView, type ViewCriterion, type ViewItem } from "@/lib/domain/comparison-view";
import { formatCriterionValue, parseCriterionInput, toInputValue } from "@/lib/domain/criteria-values";

const criteria: ViewCriterion[] = [
  { id: "prix", name: "Prix", type: "NUMBER", weight: 2, direction: "LOWER_IS_BETTER", unit: "€" },
  { id: "note", name: "Note", type: "RATING", weight: 1, direction: "HIGHER_IS_BETTER", unit: "" },
];

const v = (criterionId: string, numberValue: number) => ({ criterionId, numberValue, textValue: null, boolValue: null });

const items: ViewItem[] = [
  { id: "a", title: "A", status: "OPTION", values: [v("prix", 500), v("note", 3)] },
  { id: "b", title: "B", status: "OPTION", values: [v("prix", 400), v("note", 5)] },
  { id: "x", title: "X", status: "REJECTED", values: [v("prix", 100), v("note", 5)] },
];

describe("buildComparisonView", () => {
  it("classe les éléments et met les écartés à la fin, sans score", () => {
    const view = buildComparisonView(criteria, items);
    expect(view.columns.map((c) => c.item.id)).toEqual(["b", "a", "x"]);
    expect(view.columns.map((c) => c.rank)).toEqual([1, 2, null]);
    expect(view.columns[2].score).toBeNull();
    expect(view.explanation?.winnerId).toBe("b");
  });

  it("n'utilise pas les éléments écartés pour la normalisation", () => {
    const view = buildComparisonView(criteria, items);
    const b = view.columns.find((c) => c.item.id === "b")!;
    expect(b.byCriterion.prix?.isBest).toBe(true);
    expect(b.score).toBe(100);
  });

  it("respecte l'ordre d'ajout si demandé", () => {
    const view = buildComparisonView(criteria, items, { sortByScore: false });
    expect(view.columns.map((c) => c.item.id)).toEqual(["a", "b", "x"]);
  });
});

describe("valeurs de critères", () => {
  it("interprète la saisie selon le type", () => {
    expect(parseCriterionInput("NUMBER", "1 250,5")).toEqual({
      ok: true,
      value: { numberValue: 1250.5, textValue: null, boolValue: null },
    });
    expect(parseCriterionInput("RATING", "6").ok).toBe(false);
    expect(parseCriterionInput("BOOLEAN", "oui")).toMatchObject({ ok: true, value: { boolValue: true } });
    expect(parseCriterionInput("BOOLEAN", "peut-être").ok).toBe(false);
    expect(parseCriterionInput("TEXT", "  Alfama ")).toMatchObject({ value: { textValue: "Alfama" } });
    expect(parseCriterionInput("NUMBER", "")).toMatchObject({ ok: true, value: { numberValue: null } });
  });

  it("formate pour l'affichage et les formulaires", () => {
    const stored = { numberValue: 1234.5, textValue: null, boolValue: null };
    expect(formatCriterionValue("NUMBER", stored, "€").replace(/\s/g, " ")).toBe("1 234,5 €");
    expect(formatCriterionValue("RATING", { ...stored, numberValue: 4 })).toBe("4/5");
    expect(formatCriterionValue("BOOLEAN", { ...stored, numberValue: null, boolValue: false })).toBe("Non");
    expect(formatCriterionValue("TEXT", undefined)).toBe("—");
    expect(toInputValue("BOOLEAN", { numberValue: null, textValue: null, boolValue: true })).toBe("true");
  });
});
