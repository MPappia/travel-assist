import { TrophyIcon } from "lucide-react";

import type { WinnerExplanation } from "@/lib/domain/scoring";

/** Résumé en une phrase : qui gagne, avec quelle avance, et grâce à quels critères. */
export function ComparisonVerdict({
  explanation,
  columns,
  titles,
}: {
  explanation: WinnerExplanation | null;
  columns: { item: { id: string }; score: number | null; missingCount: number }[];
  titles: Map<string, string>;
}) {
  if (!explanation) return null;
  const winner = columns.find((c) => c.item.id === explanation.winnerId);
  const runnerUp = explanation.runnerUpId ? columns.find((c) => c.item.id === explanation.runnerUpId) : undefined;
  if (!winner || winner.score === null) return null;
  const winnerTitle = titles.get(explanation.winnerId) ?? "";
  const runnerUpTitle = explanation.runnerUpId ? titles.get(explanation.runnerUpId) : null;
  const fmt = (r: { criterionName: string; delta: number }) => `${r.criterionName} (${r.delta > 0 ? "+" : "−"}${Math.round(Math.abs(r.delta))} pts)`;

  return (
    <div className="bg-success/5 border-success/30 flex gap-3 rounded-xl border p-4 text-sm" data-testid="comparison-verdict">
      <TrophyIcon className="text-success mt-0.5 size-5 shrink-0" />
      <div className="grid grid-cols-1 gap-1">
        <p>
          <span className="font-semibold">{winnerTitle}</span> arrive en tête avec{" "}
          <span className="font-semibold tabular-nums">{winner.score}/100</span>
          {runnerUpTitle ? (
            explanation.margin === 0 ? (
              <>, à égalité avec {runnerUpTitle}.</>
            ) : (
              <>
                , {explanation.margin} point{explanation.margin > 1 ? "s" : ""} devant {runnerUpTitle}.
              </>
            )
          ) : (
            "."
          )}
        </p>
        {runnerUpTitle && explanation.strengths.length > 0 && (
          <p className="text-muted-foreground">
            Fait la différence sur : {explanation.strengths.slice(0, 3).map(fmt).join(", ")}.
          </p>
        )}
        {runnerUpTitle && explanation.weaknesses.length > 0 && (
          <p className="text-muted-foreground">
            Moins bien que {runnerUpTitle} sur : {explanation.weaknesses.slice(0, 3).map(fmt).join(", ")}.
          </p>
        )}
        {(winner.missingCount > 0 || (runnerUp && runnerUp.missingCount > 0)) && (
          <p className="text-warning text-xs">
            Score partiel : les critères non renseignés sont ignorés (sans pénalité). Complétez-les pour comparer à
            armes égales.
          </p>
        )}
      </div>
    </div>
  );
}
