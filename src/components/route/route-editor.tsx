"use client";

import { useCallback, useMemo, useOptimistic, useTransition } from "react";
import dynamic from "next/dynamic";
import { AlertTriangleIcon, BikeIcon, CarIcon, FootprintsIcon, Loader2Icon, MousePointerClickIcon, RouteIcon } from "lucide-react";
import { toast } from "sonner";

import { DayPlanView } from "@/components/route/day-plan-view";
import { PlaceSearch } from "@/components/route/place-search";
import { StopList } from "@/components/route/stop-list";
import type { StopValues } from "@/components/route/stop-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useDirections } from "@/hooks/use-directions";
import { buildDayPlan } from "@/lib/domain/day-plan";
import { formatCoordinates, type Place } from "@/lib/domain/geocoding";
import { MAX_WAYPOINTS } from "@/lib/domain/ors";
import { formatDistance, formatDuration } from "@/lib/format";
import { ROUTE_MODES, ROUTE_MODE_LABELS, type RouteModeValue } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { addStop, deleteStop, reorderStops, setRouteMode } from "@/server/actions/routes";

// MapLibre manipule le DOM et WebGL : chargé uniquement côté client.
const RouteMap = dynamic(() => import("@/components/route/route-map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-72 w-full rounded-xl" />,
});

const MODE_ICONS: Record<RouteModeValue, typeof CarIcon> = {
  DRIVING: CarIcon,
  CYCLING: BikeIcon,
  WALKING: FootprintsIcon,
};

type StopAction =
  | { type: "add"; stop: StopValues }
  | { type: "delete"; id: string }
  | { type: "reorder"; ids: string[] };

function reduceStops(stops: StopValues[], action: StopAction): StopValues[] {
  switch (action.type) {
    case "add":
      return [...stops, action.stop];
    case "delete":
      return stops.filter((s) => s.id !== action.id);
    case "reorder": {
      const byId = new Map(stops.map((s) => [s.id, s]));
      return action.ids.map((id) => byId.get(id)).filter((s): s is StopValues => s !== undefined);
    }
  }
}

export function RouteEditor({ route }: { route: { id: string; name: string; mode: RouteModeValue; stops: StopValues[] } }) {
  const [, startTransition] = useTransition();
  const [stops, applyStops] = useOptimistic(route.stops, reduceStops);
  const [mode, setOptimisticMode] = useOptimistic(route.mode);
  const directions = useDirections(mode, stops);

  const result =
    directions.status === "ok" ? directions.result : directions.status === "loading" ? directions.previous : null;
  const legsStale = directions.status === "loading";
  const error = directions.status === "error" ? directions.error : null;
  const plan = useMemo(() => buildDayPlan(stops, result?.legs ?? []), [stops, result]);
  const mapStops = useMemo(() => stops.map(({ id, name, lat, lng }) => ({ id, name, lat, lng })), [stops]);

  const add = useCallback(
    (place: Pick<Place, "name" | "lat" | "lng">) => {
      if (stops.length >= MAX_WAYPOINTS) {
        toast.error(`${MAX_WAYPOINTS} étapes maximum par itinéraire`);
        return;
      }
      startTransition(async () => {
        applyStops({
          type: "add",
          stop: { id: `tmp-${Date.now()}`, name: place.name, lat: place.lat, lng: place.lng, date: null, nights: null, notes: "" },
        });
        const res = await addStop(route.id, { name: place.name, lat: place.lat, lng: place.lng });
        if (!res.ok) toast.error(res.error);
      });
    },
    [applyStops, route.id, stops.length],
  );

  const addFromMap = useCallback(
    async (lat: number, lng: number) => {
      let name = `Point ${formatCoordinates(lat, lng)}`;
      try {
        const response = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
        const json = (await response.json()) as { place?: Place | null };
        if (json.place?.name) name = json.place.name;
      } catch {
        // Nom par défaut : coordonnées
      }
      add({ name, lat, lng });
      toast.success(`Étape ajoutée : ${name}`);
    },
    [add],
  );

  function reorder(ids: string[]) {
    startTransition(async () => {
      applyStops({ type: "reorder", ids });
      const res = await reorderStops(route.id, ids);
      if (!res.ok) toast.error(res.error);
    });
  }

  async function remove(stop: StopValues) {
    startTransition(async () => {
      applyStops({ type: "delete", id: stop.id });
      const res = await deleteStop(stop.id);
      if (res.ok) toast.success("Étape retirée");
      else toast.error(res.error);
    });
  }

  function changeMode(next: RouteModeValue) {
    startTransition(async () => {
      setOptimisticMode(next);
      const res = await setRouteMode(route.id, next);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div className="grid grid-cols-1 content-start gap-4">
          <div className="bg-muted inline-grid grid-cols-3 gap-1 rounded-lg p-1" role="radiogroup" aria-label="Mode de déplacement">
            {ROUTE_MODES.map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => changeMode(m)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === m ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {ROUTE_MODE_LABELS[m]}
                </button>
              );
            })}
          </div>

          <PlaceSearch onSelect={add} />

          {stops.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm">
              <MousePointerClickIcon className="size-5" />
              Recherchez une adresse ou cliquez sur la carte pour ajouter la première étape.
            </div>
          ) : (
            <StopList
              stops={stops}
              legs={result?.legs ?? null}
              legsStale={legsStale}
              errorIndex={error?.stopIndex}
              onReorder={reorder}
              onDelete={remove}
            />
          )}

          <RouteSummary
            stopCount={stops.length}
            distance={result?.distance}
            duration={result?.duration}
            loading={legsStale}
            error={error}
          />
        </div>

        <div className="h-[420px] lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)] lg:max-h-[720px]">
          <RouteMap
            stops={mapStops}
            geometry={result?.geometry ?? null}
            highlightIndex={error?.stopIndex}
            onMapClick={addFromMap}
          />
        </div>
      </div>

      {stops.length > 0 && <DayPlanView plan={plan} />}
    </div>
  );
}

function RouteSummary({
  stopCount,
  distance,
  duration,
  loading,
  error,
}: {
  stopCount: number;
  distance?: number;
  duration?: number;
  loading: boolean;
  error: { code: string; message: string } | null;
}) {
  if (stopCount < 2) {
    return stopCount === 1 ? (
      <p className="text-muted-foreground text-sm">Ajoutez une deuxième étape pour calculer le trajet.</p>
    ) : null;
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      {error && (
        <div
          role="alert"
          data-testid="route-error"
          data-code={error.code}
          className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </div>
      )}
      <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border p-3" data-testid="route-total">
        <div className="flex items-center gap-2 text-sm">
          <RouteIcon className="text-muted-foreground size-4" />
          <span className="text-muted-foreground">Total</span>
          {loading && <Loader2Icon className="text-muted-foreground size-3.5 animate-spin" aria-label="Calcul en cours" />}
        </div>
        <p className={cn("text-sm font-semibold tabular-nums", loading && "opacity-50")}>
          {distance !== undefined && duration !== undefined ? (
            <>
              {formatDistance(distance)} · {formatDuration(duration)}
            </>
          ) : loading ? (
            "Calcul…"
          ) : (
            "—"
          )}
        </p>
      </div>
      <p className="text-muted-foreground text-xs">Durées estimées par OpenRouteService, hors pauses.</p>
    </div>
  );
}
