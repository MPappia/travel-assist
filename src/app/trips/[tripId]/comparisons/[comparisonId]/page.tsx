import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { ComparisonActions } from "@/components/comparisons/comparison-actions";
import { ComparisonTable } from "@/components/comparisons/comparison-table";
import { FlightSearchPanel } from "@/components/comparisons/flight-search-panel";
import { db } from "@/lib/db";
import { toDateKey } from "@/lib/format";
import { getComparison } from "@/server/queries";
import { getSerpUsage, isSerpApiEnabled } from "@/server/serpapi";

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
      {/* Recherche SerpApi : uniquement pour un comparatif « Vols » et si la clé est configurée. */}
      {comparison.kind === "FLIGHTS" && isSerpApiEnabled() && (
        <Suspense fallback={null}>
          <FlightSearch tripId={tripId} comparisonId={comparison.id} />
        </Suspense>
      )}
      <ComparisonTable
        comparisonId={comparison.id}
        kind={comparison.kind}
        expenseCategory={comparison.expenseCategory}
        criteria={comparison.criteria}
        items={comparison.items}
      />
    </div>
  );
}

async function FlightSearch({ tripId, comparisonId }: { tripId: string; comparisonId: string }) {
  const [trip, usage] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true, travelers: true } }),
    getSerpUsage(),
  ]);
  return (
    <FlightSearchPanel
      comparisonId={comparisonId}
      defaults={{
        outboundDate: toDateKey(trip?.startDate),
        returnDate: toDateKey(trip?.endDate),
        adults: Math.min(9, Math.max(1, trip?.travelers ?? 1)),
      }}
      initialUsage={usage}
    />
  );
}
