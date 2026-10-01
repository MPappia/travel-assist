"use client";

import { ClockIcon, PlaneIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { legSchedule, parseFlightDetails, priceAge, stopsOf, type FlightLeg } from "@/lib/domain/flights";
import { formatDuration } from "@/lib/format";

/** Badge « prix relevé il y a N jours », orange au-delà de 3 jours. */
export function PriceAgeBadge({ capturedAt }: { capturedAt: Date }) {
  const age = priceAge(capturedAt);
  return (
    <Badge
      variant={age.stale ? "warning" : "outline"}
      data-testid="price-age"
      data-stale={age.stale || undefined}
      title={`Relevé le ${capturedAt.toLocaleDateString("fr-FR")}`}
      suppressHydrationWarning
    >
      <ClockIcon />
      {age.label}
    </Badge>
  );
}

function LegLine({ label, leg }: { label: string; leg: FlightLeg }) {
  const stops = stopsOf(leg);
  const layovers = leg.layovers
    .map((l) => `${l.airport.code ?? l.airport.name ?? "?"}${l.durationMin ? ` ${formatDuration(l.durationMin * 60)}` : ""}`)
    .join(", ");
  const numbers = leg.segments.map((s) => s.flightNumber).filter(Boolean);
  return (
    <li className="grid gap-0.5">
      <span className="text-foreground font-medium">
        {label} · {legSchedule(leg) ?? "horaires inconnus"}
      </span>
      <span>
        {leg.durationMin ? formatDuration(leg.durationMin * 60) : "durée inconnue"}
        {stops !== undefined && ` · ${stops === 0 ? "direct" : `${stops} escale${stops > 1 ? "s" : ""}`}`}
        {layovers && ` (${layovers})`}
        {numbers.length > 0 && ` · ${numbers.join(", ")}`}
      </span>
    </li>
  );
}

/** Détails d'un vol (trajets, escales, passagers) sous le titre de l'élément. */
export function FlightSummary({ flightDetails, priceCapturedAt }: { flightDetails: string | null; priceCapturedAt: Date | null }) {
  const details = parseFlightDetails(flightDetails);
  if (!details && !priceCapturedAt) return null;
  return (
    <div className="text-muted-foreground mt-2 grid gap-1.5 text-xs font-normal" data-testid="flight-summary">
      {priceCapturedAt && (
        <div>
          <PriceAgeBadge capturedAt={priceCapturedAt} />
        </div>
      )}
      {details && (
        <>
          <ul className="grid gap-1">
            {details.outbound && <LegLine label="Aller" leg={details.outbound} />}
            {details.inbound && <LegLine label="Retour" leg={details.inbound} />}
          </ul>
          {(details.passengers || (details.currency && details.currency !== "EUR")) && (
            <span className="flex items-center gap-1">
              <PlaneIcon className="size-3" />
              {details.passengers && `${details.passengers} passager${details.passengers > 1 ? "s" : ""}`}
              {details.currency && details.currency !== "EUR" && ` · prix relevé en ${details.currency}`}
            </span>
          )}
        </>
      )}
    </div>
  );
}
