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

  it("ne pénalise pas une valeur manquante : score partiel sur les critères renseignés", () => {
    // d ne renseigne que la note (2/5) et l'annulation : ces deux critères seuls font son score.
    const r = computeScores(criteria, [...items, { id: "d", values: { note: 3, annulation: true } }]);
    const d = r.items.find((s) => s.itemId === "d")!;
    expect(d.missingCount).toBe(3);
    expect(d.byCriterion.prix).toMatchObject({ missing: true, points: 0, normalized: null });
    // note (3−1)/4 = 0,5 × 2 ; annulation 1 × 1 → 2 / 3
    expect(d.score).toBe(Math.round((2 / 3) * 100));
    expect(d.coverage).toBeCloseTo(3 / 9);
    // la somme des points de l'élément vaut son score
    const points = Object.values(d.byCriterion).reduce((sum, c) => sum + c.points, 0);
    expect(Math.round(points)).toBe(d.score);
    // les éléments complets ont une couverture de 1 et des scores inchangés
    const c = r.items.find((s) => s.itemId === "c")!;
    expect(c.coverage).toBe(1);
    expect(c.score).toBe(Math.round((7.5 / 9) * 100));
  });

  it("un élément sans une valeur n'est pas plus mal noté que son jumeau complet ayant une valeur moyenne", () => {
    const twoCriteria: ScoringCriterion[] = [
      { id: "prix", name: "Prix", type: "NUMBER", weight: 1, direction: "LOWER_IS_BETTER" },
      { id: "note", name: "Note", type: "RATING", weight: 1, direction: "HIGHER_IS_BETTER" },
    ];
    const r = computeScores(twoCriteria, [
      { id: "complet", values: { prix: 500, note: 3 } },
      { id: "sans-note", values: { prix: 500 } },
    ]);
    const [complet, sansNote] = r.items;
    expect(complet.score).toBe(75); // (1 + 0,5) / 2
    expect(sansNote.score).toBe(100); // prix seul, au meilleur niveau
    expect(sansNote.coverage).toBe(0.5);
  });

  it("explique la victoire sans compter les critères absents chez l'un des deux", () => {
    const r = computeScores(criteria, [items[0], { id: "d", values: { prix: 600, couchages: 2 } }]);
    const explanation = explainWinner(criteria, rankByScore(r.items))!;
    const named = [...explanation.strengths, ...explanation.weaknesses].map((x) => x.criterionId);
    expect(named.every((id) => id === "prix" || id === "couchages")).toBe(true);
  });

  it("donne la note maximale à une valeur unique, même en « plus bas = mieux »", () => {
    const r = computeScores(
      [{ id: "prix", name: "Prix", type: "NUMBER", weight: 1, direction: "LOWER_IS_BETTER" }],
      [
        { id: "1", values: { prix: 640 } },
        { id: "2", values: {} },
      ],
    );
    expect(r.items[0].score).toBe(100);
    expect(r.items[0].byCriterion.prix.isBest).toBe(true);
    expect(r.items[1].score).toBeNull();
    const explanation = explainWinner(
      [{ id: "prix", name: "Prix", type: "NUMBER", weight: 1, direction: "LOWER_IS_BETTER" }],
      rankByScore(r.items),
    );
    expect(explanation?.runnerUpId).toBeNull();
  });

  it("ne note pas un élément sans aucune valeur", () => {
    const r = computeScores(criteria, [...items, { id: "vide", values: { quartier: "Baixa" } }]);
    const vide = r.items.find((s) => s.itemId === "vide")!;
    expect(vide.score).toBeNull();
    expect(rankByScore(r.items).at(-1)?.itemId).toBe("vide");
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
