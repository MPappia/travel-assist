// Prépare l'affichage d'un comparatif : scores, rangs, meilleure valeur, explication du gagnant.
// Les éléments écartés sont « hors course » : ils restent visibles mais ne sont ni notés ni classés,
// et n'influencent pas la normalisation des autres.
import { toRawValue, type StoredCriterionValue } from "@/lib/domain/criteria-values";
import {
  computeScores,
  explainWinner,
  rankByScore,
  type CriterionScore,
  type ScoringCriterion,
  type WinnerExplanation,
} from "@/lib/domain/scoring";
import type { ItemStatusValue } from "@/lib/labels";

export interface ViewCriterion extends ScoringCriterion {
  unit: string;
}

export interface ViewItem {
  id: string;
  title: string;
  status: ItemStatusValue;
  values: (StoredCriterionValue & { criterionId: string })[];
}

export interface ComparisonViewItem<T extends ViewItem> {
  item: T;
  score: number | null;
  rank: number | null;
  missingCount: number;
  /** Part du poids total évaluée (1 = score complet). */
  coverage: number;
  byCriterion: Record<string, CriterionScore | undefined>;
  valueByCriterion: Record<string, StoredCriterionValue | undefined>;
}

export interface ComparisonView<T extends ViewItem> {
  /** Ordre d'affichage (classement ou ordre d'ajout). */
  columns: ComparisonViewItem<T>[];
  weightShare: Record<string, number>;
  explanation: WinnerExplanation | null;
  scoredCriteriaCount: number;
}

export function buildComparisonView<T extends ViewItem>(
  criteria: readonly ViewCriterion[],
  items: readonly T[],
  options: { sortByScore: boolean } = { sortByScore: true },
): ComparisonView<T> {
  const valueMaps = new Map(
    items.map((item) => [item.id, Object.fromEntries(item.values.map((v) => [v.criterionId, v]))]),
  );
  const active = items.filter((item) => item.status !== "REJECTED");

  const scoring = computeScores(
    criteria,
    active.map((item) => ({
      id: item.id,
      values: Object.fromEntries(criteria.map((c) => [c.id, toRawValue(c.type, valueMaps.get(item.id)?.[c.id])])),
    })),
  );
  const ranked = rankByScore(scoring.items);
  const rankById = new Map(ranked.filter((s) => s.score !== null).map((s, index) => [s.itemId, index + 1]));
  const scoreById = new Map(scoring.items.map((s) => [s.itemId, s]));

  const toColumn = (item: T): ComparisonViewItem<T> => {
    const s = scoreById.get(item.id);
    return {
      item,
      score: s?.score ?? null,
      rank: rankById.get(item.id) ?? null,
      missingCount: s?.missingCount ?? 0,
      coverage: s?.coverage ?? 0,
      byCriterion: s?.byCriterion ?? {},
      valueByCriterion: valueMaps.get(item.id) ?? {},
    };
  };

  let ordered: T[];
  if (options.sortByScore) {
    const itemById = new Map(items.map((item) => [item.id, item]));
    ordered = [...ranked.map((s) => itemById.get(s.itemId)!), ...items.filter((item) => item.status === "REJECTED")];
  } else {
    ordered = [...items];
  }

  return {
    columns: ordered.map(toColumn),
    weightShare: scoring.weightShare,
    explanation: explainWinner(criteria, ranked),
    scoredCriteriaCount: scoring.scoredCriteriaCount,
  };
}
