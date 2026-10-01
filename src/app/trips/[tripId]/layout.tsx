import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarIcon, ChevronLeftIcon, MapPinIcon, UsersIcon } from "lucide-react";

import { TripActions } from "@/components/trips/trip-actions";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { TripTabs } from "@/components/trips/trip-tabs";
import { formatDateRange } from "@/lib/format";
import { getTrip } from "@/server/queries";

export async function generateMetadata({ params }: LayoutProps<"/trips/[tripId]">): Promise<Metadata> {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  return { title: trip?.name ?? "Voyage introuvable" };
}

export default async function TripLayout({ params, children }: LayoutProps<"/trips/[tripId]">) {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  if (!trip) notFound();

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-3">
        <Link href="/" className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm">
          <ChevronLeftIcon className="size-4" />
          Mes voyages
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid grid-cols-1 gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{trip.name}</h1>
              <TripStatusBadge status={trip.status} />
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {trip.destination && (
                <span className="flex items-center gap-1">
                  <MapPinIcon className="size-3.5" />
                  {trip.destination}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CalendarIcon className="size-3.5" />
                {formatDateRange(trip.startDate, trip.endDate)}
              </span>
              <span className="flex items-center gap-1">
                <UsersIcon className="size-3.5" />
                {trip.travelers} voyageur{trip.travelers > 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <TripActions trip={trip} />
        </div>
      </div>
      <TripTabs tripId={trip.id} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
