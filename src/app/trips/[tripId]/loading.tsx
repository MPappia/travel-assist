import { Skeleton } from "@/components/ui/skeleton";

// Affiché sous l'en-tête et les onglets du voyage pendant le chargement d'une section.
export default function TripSectionLoading() {
  return (
    <div className="grid grid-cols-1 gap-4" aria-busy="true" aria-label="Chargement">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
