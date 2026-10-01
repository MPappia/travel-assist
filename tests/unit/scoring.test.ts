import { describe, expect, it } from "vitest";

import {
  computeScores,
  explainWinner,
  guessPriceCriterion,
  rankByScore,
  type ScoringCriterion,
  type ScoringItem,
} from "@/lib/domain/scoring";

const criteria: ScoringCriterion[] = [
  { id: "prix", name: "Prix total", type: "NUMBER", weight: 3, direction: "LOWER_IS_BETTER" },
  { id: "note", name: "Note", type: "RATING", weight: 2, direction: "HIGHER_IS_BETTER" },
  { id: "couchages", name: "Couchages", type: "NUMBER", weight: 1, direction: "HIGHER_IS_BETTER" },
  { id: "distance", name: "Distance au centre", type: "NUMBER", weight: 2, direction: "LOWER_IS_BETTER" },
  { id: "annulation", name: "Annulation gratuite", type: "BOOLEAN", weight: 1, direction: "HIGHER_IS_BETTER" },
  { id: "quartier", name: "Quartier", type: "TEXT", weight: 5, direction: "HIGHER_IS_BETTER" },
];

const items: ScoringItem[] = [
  { id: "a", values: { prix: 900, note: 4, couchages: 4, distance: 2, annulation: true, quartier: "Alfama" } },
  { id: "b", values: { prix: 600, note: 3, couchages: 2, distance: 5, annulation: false, quartier: "Belém" } },
  { id: "c", values: { prix: 750, note: 5, couchages: 4, distance: 1, annulation: true, quartier: "Chiado" } },
];

describe("computeScores", () => {
  const result = computeScores(criteria, items);
  const byId = Object.fromEntries(result.items.map((s) => [s.itemId, s]));

  it("produit des scores entre 0 et 100", () => {
    for (const s of result.items) {
      expect(s.score).not.toBeNull();
      expect(s.score!).toBeGreaterThanOrEqual(0);
      expect(s.score!).toBeLessThanOrEqual(100);
    }
  });

  it("calcule le score pondéré attendu", () => {
    // c : prix (900-750)/300=0.5 ×3 ; note 1 ×2 ; couchages 1 ×1 ; distance 1 ×2 ; annulation 1 ×1 → 7.5/9
    expect(byId.c.score).toBe(Math.round((7.5 / 9) * 100));
    // b : prix 1 ×3 ; note 0.5 ×2 ; couchages 0 ; distance 0 ; annulation 0 → 4/9
    expect(byId.b.score).toBe(Math.round((4 / 9) * 100));
  });

  it("ignore les critères texte", () => {
    expect(result.scoredCriteriaCount).toBe(5);
    expect(result.weightShare.quartier).toBeUndefined();
    expect(byId.a.byCriterion.quartier.normalized).toBeNull();
  });

  it("répartit les poids", () => {
    expect(result.weightShare.prix).toBeCloseTo(3 / 9);
    const sum = Object.values(result.weightShare).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("met en évidence la meilleure valeur selon le sens", () => {
    expect(byId.b.byCriterion.prix.isBest).toBe(true); // moins cher
    expect(byId.c.byCriterion.distance.isBest).toBe(true); // plus proche
    expect(byId.c.byCriterion.note.isBest).toBe(true);
    // égalité sur les couchages : les deux meilleurs sont mis en évidence
    expect(byId.a.byCriterion.couchages.isBest).toBe(true);
    expect(byId.c.byCriterion.couchages.isBest).toBe(true);
    expect(byId.b.byCriterion.couchages.isBest).toBe(false);
  });

  it("ne met rien en évidence quand toutes les valeurs sont égales", () => {
    const r = computeScores(
      [{ id: "x", name: "X", type: "NUMBER", weight: 1, direction: "HIGHER_IS_BETTER" }],
      [
        { id: "1", values: { x: 3 } },
        { id: "2", values: { x: 3 } },
      ],
    );
    expect(r.items.every((s) => s.score === 100 && !s.byCriterion.x.isBest)).toBe(true);
  });

  it("compte une valeur manquante comme 0", () => {
    const r = computeScores(criteria, [...items, { id: "d", values: { prix: 600 } }]);
    const d = r.items.find((s) => s.itemId === "d")!;
    expect(d.missingCount).toBe(4);
    expect(d.byCriterion.note).toMatchObject({ missing: true, points: 0 });
    expect(d.score).toBe(Math.round((3 / 9) * 100));
  });

  it("renvoie un score nul sans critère noté", () => {
    const r = computeScores([criteria[5]], items);
    expect(r.items.every((s) => s.score === null)).toBe(true);
  });

  it("ignore les critères de poids nul", () => {
    const r = computeScores(
      [
        { id: "p", name: "P", type: "NUMBER", weight: 0, direction: "LOWER_IS_BETTER" },
        { id: "n", name: "N", type: "RATING", weight: 1, direction: "HIGHER_IS_BETTER" },
      ],
      [{ id: "1", values: { p: 10, n: 5 } }],
    );
    expect(r.items[0].score).toBe(100);
  });

  it("borne les notes entre 1 et 5", () => {
    const r = computeScores(
      [{ id: "n", name: "N", type: "RATING", weight: 1, direction: "HIGHER_IS_BETTER" }],
      [{ id: "1", values: { n: 9 } }],
    );
    expect(r.items[0].score).toBe(100);
  });
});

describe("rankByScore & explainWinner", () => {
  it("classe par score décroissant et explique la victoire", () => {
    const result = computeScores(criteria, items);
    const ranked = rankByScore(result.items);
    expect(ranked.map((s) => s.itemId)).toEqual(["c", "a", "b"]);

    const explanation = explainWinner(criteria, ranked)!;
    expect(explanation.winnerId).toBe("c");
    expect(explanation.runnerUpId).toBe("a");
    expect(explanation.margin).toBe(ranked[0].score! - ranked[1].score!);
    expect(explanation.strengths.map((s) => s.criterionId)).toEqual(["prix", "note", "distance"]);
    expect(explanation.weaknesses).toEqual([]);
  });

  it("met les éléments sans score en dernier", () => {
    const ranked = rankByScore([
      { itemId: "x", score: null },
      { itemId: "y", score: 10 },
      { itemId: "z", score: 10 },
    ]);
    expect(ranked.map((s) => s.itemId)).toEqual(["y", "z", "x"]);
  });

  it("renvoie null sans élément", () => {
    expect(explainWinner(criteria, [])).toBeNull();
  });
});

describe("guessPriceCriterion", () => {
  it("repère le critère de prix par son nom ou son unité", () => {
    expect(guessPriceCriterion(criteria)?.id).toBe("prix");
    expect(
      guessPriceCriterion([
        { type: "NUMBER" as const, name: "Surface", unit: "m²" },
        { type: "NUMBER" as const, name: "Total séjour", unit: "€" },
      ])?.name,
    ).toBe("Total séjour");
    expect(guessPriceCriterion([{ type: "TEXT" as const, name: "Prix" }])).toBeNull();
  });
});
