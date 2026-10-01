import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { ComparisonActions } from "@/components/comparisons/comparison-actions";
import { ComparisonTable } from "@/components/comparisons/comparison-table";
import { getComparison } from "@/server/queries";

export default async function ComparisonPage({ params }: PageProps<"/trips/[tripId]/comparisons/[comparisonId]">) {
  const { tripId, comparisonId } = await params;
  const comparison = await getComparison(tripId, comparisonId);
  if (!comparison) notFound();

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-1 gap-1">
          <Link
            href={`/trips/${tripId}/comparisons`}
            className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
          >
            <ChevronLeftIcon className="size-4" />
            Comparatifs
          </Link>
          <h2 className="text-xl font-semibold tracking-tight">{comparison.name}</h2>
        </div>
        <ComparisonActions tripId={tripId} comparison={comparison} />
      </div>
      <ComparisonTable
        comparisonId={comparison.id}
        expenseCategory={comparison.expenseCategory}
        criteria={comparison.criteria}
        items={comparison.items}
      />
    </div>
  );
}
