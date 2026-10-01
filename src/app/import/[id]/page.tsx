import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ClockIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FlightImportForm } from "@/components/import/flight-import-form";
import { ImportForm } from "@/components/import/import-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildFlightNotes } from "@/lib/domain/flights";
import { defaultComparisonFor } from "@/lib/listing-extract/criteria-mapping";
import { buildImportNotes } from "@/lib/listing-extract/notes";
import type { ListingSource } from "@/lib/listing-extract/types";
import { getImportExtraction, getPendingImport } from "@/server/pending-imports";
import { listImportTargets } from "@/server/queries";

export const metadata: Metadata = { title: "Vérifier l'annonce importée" };
export const dynamic = "force-dynamic";

export default async function ImportPage({ params, searchParams }: PageProps<"/import/[id]">) {
  const { id } = await params;
  const { comparison } = await searchParams;
  const pending = await getPendingImport(id);

  if (!pending) {
    return (
      <EmptyState
        icon={ClockIcon}
        title="Import introuvable ou expiré"
        description="Un import non validé est effacé après 24 h. Relancez le favori depuis la page de l'annonce."
      >
        <Button asChild variant="outline">
          <Link href="/import/setup">Aide à l&apos;import</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Vérifier l&apos;annonce importée</h1>
        <p className="text-muted-foreground text-sm">
          Rien n&apos;est encore enregistré : corrigez ce qui doit l&apos;être, choisissez le comparatif, puis validez.
        </p>
      </div>
      <Suspense fallback={<ImportSkeleton />}>
        <ImportReview pending={pending} preferredComparisonId={typeof comparison === "string" ? comparison : null} />
      </Suspense>
    </div>
  );
}

async function ImportReview({
  pending,
  preferredComparisonId,
}: {
  pending: NonNullable<Awaited<ReturnType<typeof getPendingImport>>>;
  preferredComparisonId: string | null;
}) {
  const [extraction, targets] = await Promise.all([getImportExtraction(pending), listImportTargets()]);

  // Sélection par défaut : comparatif demandé (copier-coller), sinon premier comparatif du type de
  // l'annonce (vols ou logements) du voyage le plus récemment modifié et non terminé, sinon création.
  const preferredTrip = preferredComparisonId
    ? targets.find((t) => t.comparisons.some((c) => c.id === preferredComparisonId))
    : undefined;
  const defaultTrip = preferredTrip ?? targets.find((t) => t.status !== "DONE") ?? targets[0];
  const defaultComparison = preferredTrip ? preferredComparisonId! : defaultComparisonFor(extraction.kind, defaultTrip?.comparisons);
  const warnings = (JSON.parse(pending.payload) as ListingSource).warnings ?? [];

  if (extraction.kind === "flight") {
    const flight = extraction.flight ?? {};
    return (
      <FlightImportForm
        pendingId={pending.id}
        url={pending.url}
        extraction={extraction}
        targets={targets}
        defaultTripId={defaultTrip?.id ?? ""}
        defaultComparisonId={defaultComparison}
        defaultNotes={buildFlightNotes(
          {
            outbound: flight.outbound?.value,
            inbound: flight.inbound?.value,
            passengers: flight.passengers?.value,
            currency: flight.currency?.value,
          },
          { domain: extraction.domain, capturedAt: pending.createdAt, priceNote: flight.totalPrice?.note },
        )}
        capturedAt={pending.createdAt}
        warnings={warnings}
      />
    );
  }

  return (
    <ImportForm
      pendingId={pending.id}
      url={pending.url}
      extraction={extraction}
      targets={targets}
      defaultTripId={defaultTrip?.id ?? ""}
      defaultComparisonId={defaultComparison}
      defaultNotes={buildImportNotes(extraction)}
      warnings={warnings}
    />
  );
}

function ImportSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4" aria-busy="true" aria-label="Analyse de l'annonce">
      <p className="text-muted-foreground text-sm">Analyse de la page en cours…</p>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
