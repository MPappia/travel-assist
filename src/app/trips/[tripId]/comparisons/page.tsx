import Link from "next/link";
import { PlusIcon, ScaleIcon, TrophyIcon } from "lucide-react";

import { ComparisonFormDialog } from "@/components/comparisons/comparison-form-dialog";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildComparisonView } from "@/lib/domain/comparison-view";
import { listComparisons } from "@/server/queries";

export default async function TripComparisonsPage({ params }: PageProps<"/trips/[tripId]/comparisons">) {
  const { tripId } = await params;
  const comparisons = await listComparisons(tripId);

  const createButton = (
    <Button>
      <PlusIcon />
      Nouveau comparatif
    </Button>
  );

  if (comparisons.length === 0) {
    return (
      <EmptyState
        icon={ScaleIcon}
        title="Aucun comparatif"
        description="Comparez logements, locations de voiture ou activités sur des critères pondérés pour choisir sereinement."
      >
        <ComparisonFormDialog tripId={tripId} trigger={createButton} />
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex justify-end">
        <ComparisonFormDialog tripId={tripId} trigger={createButton} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {comparisons.map((comparison) => {
          const view = buildComparisonView(comparison.criteria, comparison.items);
          const leader = view.columns.find((c) => c.rank === 1);
          const selected = comparison.items.filter((i) => i.status === "SELECTED");
          return (
            <Link
              key={comparison.id}
              href={`/trips/${tripId}/comparisons/${comparison.id}`}
              className="group focus-visible:outline-none"
            >
              <Card className="group-hover:border-foreground/20 group-focus-visible:ring-ring/50 h-full transition-colors group-focus-visible:ring-[3px]">
                <CardHeader>
                  <CardTitle className="text-base">{comparison.name}</CardTitle>
                  <CardDescription>
                    {comparison.items.length} élément{comparison.items.length > 1 ? "s" : ""} ·{" "}
                    {comparison.criteria.length} critère{comparison.criteria.length > 1 ? "s" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-1 text-sm">
                  {leader ? (
                    <p className="flex items-center gap-1.5">
                      <TrophyIcon className="text-success size-4" />
                      <span className="truncate">{leader.item.title}</span>
                      <span className="text-muted-foreground tabular-nums">{leader.score}/100</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Ajoutez des éléments pour obtenir un classement.</p>
                  )}
                  {selected.length > 0 && (
                    <p className="text-muted-foreground text-xs">Retenu : {selected.map((s) => s.title).join(", ")}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
