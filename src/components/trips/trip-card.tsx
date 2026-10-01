import Link from "next/link";
import { AlertTriangleIcon, CalendarIcon, MapPinIcon, UsersIcon } from "lucide-react";

import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { BudgetSummary } from "@/lib/domain/budget";
import type { TaskProgress } from "@/lib/domain/tasks";
import { formatDateRange, formatMoney } from "@/lib/format";
import type { TripStatusValue } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function TripCard({
  trip,
  tasks,
  budget,
}: {
  trip: {
    id: string;
    name: string;
    destination: string;
    startDate: Date | null;
    endDate: Date | null;
    travelers: number;
    status: TripStatusValue;
  };
  tasks: TaskProgress;
  budget: BudgetSummary;
}) {
  const budgetPercent = budget.targetCents ? Math.round((budget.committedCents / budget.targetCents) * 100) : 0;

  return (
    <Link href={`/trips/${trip.id}`} className="group focus-visible:outline-none" data-testid="trip-card">
      <Card className="group-hover:border-foreground/20 group-focus-visible:ring-ring/50 h-full transition-colors group-focus-visible:ring-[3px]">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{trip.name}</CardTitle>
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
              {trip.travelers}
            </span>
          </div>
        </CardHeader>
        <CardContent className="mt-auto grid gap-4">
          <div className="grid gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tâches</span>
              <span data-testid="trip-card-tasks">
                {tasks.done}/{tasks.total}
                {tasks.overdue > 0 && (
                  <span className="text-destructive ml-2 text-xs">
                    {tasks.overdue} en retard
                  </span>
                )}
              </span>
            </div>
            <Progress value={tasks.percent} aria-label="Avancement des tâches" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Budget engagé</span>
              <span data-testid="trip-card-budget" className={cn(budget.level === "over" && "text-destructive")}>
                {formatMoney(budget.committedCents)}
                {budget.targetCents !== null && ` / ${formatMoney(budget.targetCents)}`}
              </span>
            </div>
            {budget.targetCents !== null ? (
              <Progress
                value={budgetPercent}
                aria-label="Budget engagé"
                indicatorClassName={cn(
                  budget.level === "over" && "bg-destructive",
                  budget.level === "warning" && "bg-warning",
                )}
              />
            ) : (
              <p className="text-muted-foreground text-xs">Pas de budget cible</p>
            )}
            {budget.level === "over" && (
              <p className="text-destructive flex items-center gap-1 text-xs">
                <AlertTriangleIcon className="size-3.5" />
                Prévisionnel au-dessus du budget ({formatMoney(budget.totalCents)})
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
