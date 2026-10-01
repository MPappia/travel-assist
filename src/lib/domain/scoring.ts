// Calcul du score pondéré des comparatifs — module pur, sans dépendance à la base.
//
// Règles :
// - NUMBER : normalisation min–max entre les éléments renseignés (le meilleur obtient 1, le pire 0).
//   Si tous les éléments ont la même valeur, ils obtiennent tous 1 (le critère ne départage pas).
// - RATING (note de 1 à 5) : échelle absolue, (note − 1) / 4.
// - BOOLEAN : oui = 1, non = 0.
// - Le sens « plus bas = mieux » inverse la note normalisée (1 − s).
// - TEXT : affiché mais non noté (poids ignoré).
// - Valeur manquante : le critère est ignoré pour cet élément, qui n'est PAS pénalisé (un import
//   d'annonce ne remplit souvent qu'une partie des critères). Le score est alors « partiel » :
//   `coverage` indique la part du poids total réellement évaluée, à afficher à l'utilisateur.
//   Un élément sans aucune valeur notée n'a pas de score (il n'est pas classé).
// Score = Σ(poids × note) / Σ(poids des critères notés ET renseignés pour l'élément) × 100, arrondi.

export type CriterionKind = "NUMBER" | "TEXT" | "BOOLEAN" | "RATING";
export type Direction = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type CriterionRawValue = number | boolean | string | null | undefined;

export interface ScoringCriterion {
  id: string;
  name: string;
  type: CriterionKind;
  weight: number;
  direction: Direction;
}

export interface ScoringItem {
  id: string;
  values: Record<string, CriterionRawValue>;
}

export interface CriterionScore {
  /** Note normalisée 0–1, null si le critère n'est pas noté (texte, poids nul). */
  normalized: number | null;
  /** Points apportés au score de l'élément (leur somme vaut le score). */
  points: number;
  /** Vrai si l'élément détient la meilleure valeur pour ce critère (et que le critère départage). */
  isBest: boolean;
  missing: boolean;
}

export interface ItemScore {
  itemId: string;
  /** Score 0–100, null s'il n'y a aucun critère noté ou aucune valeur renseignée. */
  score: number | null;
  byCriterion: Record<string, CriterionScore>;
  /** Nombre de critères notés sans valeur (ignorés dans le score de l'élément). */
  missingCount: number;
  /** Part du poids total évaluée pour cet élément (1 = score complet, < 1 = score partiel). */
  coverage: number;
}

export interface ScoringResult {
  items: ItemScore[];
  /** Poids relatif (0–1) de chaque critère noté. */
  weightShare: Record<string, number>;
  scoredCriteriaCount: number;
}

export function isScorable(criterion: Pick<ScoringCriterion, "type" | "weight">): boolean {
  return criterion.type !== "TEXT" && Number.isFinite(criterion.weight) && criterion.weight > 0;
}

function numericValue(type: CriterionKind, value: CriterionRawValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (type === "BOOLEAN") return typeof value === "boolean" ? (value ? 1 : 0) : null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (type === "RATING") return Math.min(5, Math.max(1, value));
  return value;
}

/** Note normalisée (0–1) avant application du sens. */
function rawNormalized(type: CriterionKind, value: number, min: number, max: number): number {
  if (type === "RATING") return (value - 1) / 4;
  if (type === "BOOLEAN") return value;
  return max === min ? 1 : (value - min) / (max - min);
}

export function computeScores(criteria: readonly ScoringCriterion[], items: readonly ScoringItem[]): ScoringResult {
  const scored = criteria.filter(isScorable);
  const totalWeight = scored.reduce((sum, c) => sum + c.weight, 0);

  const weightShare: Record<string, number> = {};
  for (const c of scored) weightShare[c.id] = totalWeight > 0 ? c.weight / totalWeight : 0;

  // Statistiques par critère
  const stats = new Map<string, { min: number; max: number; best: number | null; discriminates: boolean }>();
  for (const c of scored) {
    const values = items.map((item) => numericValue(c.type, item.values[c.id])).filter((v): v is number => v !== null);
    if (values.length === 0) {
      stats.set(c.id, { min: 0, max: 0, best: null, discriminates: false });
      continue;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const best = c.direction === "HIGHER_IS_BETTER" ? max : min;
    // Le critère départage si les valeurs diffèrent, ou si certains éléments n'ont pas de valeur.
    const discriminates = min !== max || values.length < items.length;
    stats.set(c.id, { min, max, best, discriminates });
  }

  const itemScores: ItemScore[] = items.map((item) => {
    const normalizedById = new Map<string, number>();
    const byCriterion: Record<string, CriterionScore> = {};
    let weighted = 0;
    let presentWeight = 0;
    let missingCount = 0;

    for (const c of scored) {
      const value = numericValue(c.type, item.values[c.id]);
      if (value === null) {
        missingCount += 1;
        continue;
      }
      const stat = stats.get(c.id)!;
      // Une seule valeur distincte (critère numérique) : tout le monde est « le meilleur », quel que soit le sens.
      const tie = c.type === "NUMBER" && stat.min === stat.max;
      const base = rawNormalized(c.type, value, stat.min, stat.max);
      const normalized = tie ? 1 : c.direction === "HIGHER_IS_BETTER" ? base : 1 - base;
      normalizedById.set(c.id, normalized);
      weighted += c.weight * normalized;
      presentWeight += c.weight;
    }

    for (const c of criteria) {
      if (!isScorable(c)) {
        byCriterion[c.id] = { normalized: null, points: 0, isBest: false, missing: false };
        continue;
      }
      const normalized = normalizedById.get(c.id);
      if (normalized === undefined) {
        byCriterion[c.id] = { normalized: null, points: 0, isBest: false, missing: true };
        continue;
      }
      const stat = stats.get(c.id)!;
      const value = numericValue(c.type, item.values[c.id]);
      byCriterion[c.id] = {
        normalized,
        points: ((c.weight * normalized) / presentWeight) * 100,
        isBest: stat.discriminates && value === stat.best,
        missing: false,
      };
    }

    return {
      itemId: item.id,
      score: presentWeight > 0 ? Math.round((weighted / presentWeight) * 100) : null,
      byCriterion,
      missingCount,
      coverage: totalWeight > 0 ? presentWeight / totalWeight : 0,
    };
  });

  return { items: itemScores, weightShare, scoredCriteriaCount: scored.length };
}

/** Tri décroissant par score ; les éléments sans score à la fin ; égalité départagée par l'ordre d'origine. */
export function rankByScore<T extends { itemId: string; score: number | null }>(scores: readonly T[]): T[] {
  return scores
    .map((s, index) => ({ s, index }))
    .sort((a, b) => {
      const as = a.s.score ?? -1;
      const bs = b.s.score ?? -1;
      return bs - as || a.index - b.index;
    })
    .map(({ s }) => s);
}

export interface WinnerReason {
  criterionId: string;
  criterionName: string;
  /** Points d'avance (positif) ou de retard (négatif) du gagnant sur le second pour ce critère. */
  delta: number;
}

export interface WinnerExplanation {
  winnerId: string;
  runnerUpId: string | null;
  margin: number;
  /** Critères qui font la différence, du plus décisif au moins décisif (avances uniquement). */
  strengths: WinnerReason[];
  /** Critères où le second fait mieux. */
  weaknesses: WinnerReason[];
}

/**
 * Explique pourquoi le premier du classement l'emporte sur le second,
 * en comparant les points obtenus critère par critère.
 */
export function explainWinner(
  criteria: readonly ScoringCriterion[],
  ranked: readonly ItemScore[],
): WinnerExplanation | null {
  const [winner, second] = ranked;
  if (!winner || winner.score === null) return null;
  // Un second sans score (aucune valeur) n'est pas un point de comparaison.
  const runnerUp = second?.score != null ? second : undefined;

  // Un critère non renseigné chez l'un des deux n'est ni un atout ni une faiblesse : on l'ignore.
  const comparable = criteria
    .filter(isScorable)
    .filter((c) => !winner.byCriterion[c.id]?.missing && !(runnerUp?.byCriterion[c.id]?.missing ?? false));
  const reasons: WinnerReason[] = comparable.map((c) => ({
    criterionId: c.id,
    criterionName: c.name,
    delta: (winner.byCriterion[c.id]?.points ?? 0) - (runnerUp?.byCriterion[c.id]?.points ?? 0),
  }));

  return {
    winnerId: winner.itemId,
    runnerUpId: runnerUp?.itemId ?? null,
    margin: runnerUp ? winner.score - (runnerUp.score ?? 0) : winner.score,
    strengths: reasons.filter((r) => r.delta > 0.5).sort((a, b) => b.delta - a.delta),
    weaknesses: reasons.filter((r) => r.delta < -0.5).sort((a, b) => a.delta - b.delta),
  };
}

/** Repère le critère qui représente le prix (pour créer la dépense d'un élément retenu). */
export function guessPriceCriterion<T extends { type: CriterionKind; name: string; unit?: string }>(
  criteria: readonly T[],
): T | null {
  const numbers = criteria.filter((c) => c.type === "NUMBER");
  return (
    numbers.find((c) => /prix|price|co[uû]t|tarif|montant/i.test(c.name)) ??
    numbers.find((c) => (c.unit ?? "").includes("€")) ??
    null
  );
}
