import { LuggageIcon, PlusIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { TripCard } from "@/components/trips/trip-card";
import { TripFormDialog } from "@/components/trips/trip-form-dialog";
import { Button } from "@/components/ui/button";
import { summarizeBudget } from "@/lib/domain/budget";
import { computeTaskProgress } from "@/lib/domain/tasks";
import { todayKey } from "@/lib/format";
import { listTrips } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const trips = await listTrips();
  const today = todayKey();

  const newTripButton = (
    <Button>
      <PlusIcon />
      Nouveau voyage
    </Button>
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes voyages</h1>
          <p className="text-muted-foreground text-sm">
            {trips.length === 0
              ? "Aucun voyage pour l'instant."
              : `${trips.length} voyage${trips.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {trips.length > 0 && <TripFormDialog trigger={newTripButton} />}
      </div>

      {trips.length === 0 ? (
        <EmptyState
          icon={LuggageIcon}
          title="Votre prochain voyage commence ici"
          description="Créez un voyage pour organiser vos tâches, suivre votre budget, comparer des logements et tracer votre itinéraire."
        >
          <TripFormDialog trigger={newTripButton} />
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              tasks={computeTaskProgress(trip.tasks, today)}
              budget={summarizeBudget(trip.expenses, trip.budgetCents)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
