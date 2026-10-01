import Link from "next/link";
import { PlusIcon, RouteIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RouteActions } from "@/components/route/route-actions";
import { RouteEditor } from "@/components/route/route-editor";
import { RouteFormDialog } from "@/components/route/route-form-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listRoutes } from "@/server/queries";

export default async function TripRoutePage({ params, searchParams }: PageProps<"/trips/[tripId]/route">) {
  const { tripId } = await params;
  const { route: routeParam } = await searchParams;
  const routes = await listRoutes(tripId);

  const newButton = (label: string) => (
    <Button variant={routes.length ? "outline" : "default"} size={routes.length ? "sm" : "default"}>
      <PlusIcon />
      {label}
    </Button>
  );

  if (routes.length === 0) {
    return (
      <EmptyState
        icon={RouteIcon}
        title="Aucun itinéraire"
        description="Tracez votre road trip étape par étape : distances, temps de trajet et programme jour par jour."
      >
        <RouteFormDialog tripId={tripId} trigger={newButton("Créer un itinéraire")} />
      </EmptyState>
    );
  }

  const current = routes.find((r) => r.id === routeParam) ?? routes[0];

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Itinéraires" className="flex flex-wrap items-center gap-2">
          {routes.map((route) => (
            <Link
              key={route.id}
              href={`/trips/${tripId}/route?route=${route.id}`}
              aria-current={route.id === current.id ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                route.id === current.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {route.name}
              <span className="ml-1.5 opacity-70">({route.stops.length})</span>
            </Link>
          ))}
          <RouteActions tripId={tripId} route={current} />
        </nav>
        <RouteFormDialog tripId={tripId} trigger={newButton("Nouvel itinéraire")} />
      </div>
      <RouteEditor key={current.id} route={current} />
    </div>
  );
}
