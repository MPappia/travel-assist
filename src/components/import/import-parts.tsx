"use client";

// Éléments communs aux pages de confirmation d'import (logement et vol).
import Link from "next/link";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCriterionValue } from "@/lib/domain/criteria-values";
import type { FieldMatch } from "@/lib/listing-extract/criteria-mapping";
import type { Field, FieldSource, ListingExtraction } from "@/lib/listing-extract/types";

const SOURCE_LABELS: Record<FieldSource, string> = {
  og: "balises de partage",
  jsonld: "données structurées",
  regex: "texte de la page",
  llm: "IA — à vérifier",
};

/** « Source : texte de la page · 214 € × 2 passagers » */
export function hintFor(field: Field<unknown> | undefined): string | undefined {
  if (!field) return undefined;
  return `Source : ${SOURCE_LABELS[field.source]}${field.note ? ` · ${field.note}` : ""}`;
}

export function LlmStatus({ status }: { status: ListingExtraction["llm"] }) {
  if (status.status === "ok") {
    return (
      <span className="flex items-center gap-1">
        <SparklesIcon className="size-3.5" />
        Complété par IA (champs marqués « IA — à vérifier »)
      </span>
    );
  }
  if (status.status === "failed") return <span>Analyse IA indisponible ({status.message}) : extraction classique uniquement.</span>;
  return null;
}

export function ImportWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <details className="text-muted-foreground text-xs" data-testid="import-warnings">
      <summary className="cursor-pointer">Page volumineuse : données réduites avant analyse</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

export function NoTripCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aucun voyage</CardTitle>
        <CardDescription>
          Créez d&apos;abord un voyage, puis revenez sur cette page (l&apos;import reste disponible 24 h).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/">Créer un voyage</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Liste des critères pré-remplis, chacun décochable. */
export function CriteriaPrefill<F extends string>({
  matches,
  rejected,
  onToggle,
  unmatchedLabels,
  footnote,
}: {
  matches: FieldMatch<F>[];
  rejected: ReadonlySet<F>;
  onToggle: (field: F, applied: boolean) => void;
  unmatchedLabels: string[];
  footnote?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2" data-testid="criteria-prefill">
      <p className="text-sm font-medium">Critères pré-remplis</p>
      {matches.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun critère du comparatif ne correspond aux informations trouvées.</p>
      ) : (
        <ul className="grid gap-2">
          {matches.map((match) => {
            const id = `apply-${match.field}`;
            const display = formatCriterionValue(
              match.criterion.type,
              {
                numberValue: typeof match.value === "number" ? match.value : null,
                textValue: typeof match.value === "string" ? match.value : null,
                boolValue: typeof match.value === "boolean" ? match.value : null,
              },
              match.criterion.unit,
            );
            return (
              <li key={match.field} className="flex items-center gap-2 text-sm">
                <Checkbox id={id} checked={!rejected.has(match.field)} onCheckedChange={(checked) => onToggle(match.field, checked === true)} />
                <label htmlFor={id}>
                  « {match.criterion.name} » ← <span className="font-medium">{display}</span>
                  <span className="text-muted-foreground text-xs"> (correspondance par {match.matchedBy})</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {unmatchedLabels.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Sans critère correspondant (conservé dans les notes si utile) : {unmatchedLabels.join(", ")}.
        </p>
      )}
      {footnote && <p className="text-muted-foreground text-xs">{footnote}</p>}
    </div>
  );
}
