import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="grid grid-cols-1 gap-6" aria-busy="true" aria-label="Chargement">
      <div className="grid grid-cols-1 gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
