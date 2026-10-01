import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircleIcon, ArrowRightIcon, CheckCircle2Icon, TrophyIcon } from "lucide-react";

import { BudgetAlert } from "@/components/budget/budget-overview";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { summarizeBudget } from "@/lib/domain/budget";
import { buildComparisonView } from "@/lib/domain/comparison-view";
import { computeTaskProgress, isOverdue, sortTasksByDueDate } from "@/lib/domain/tasks";
import { formatDate, formatMoney, nightsBetween, todayKey } from "@/lib/format";
import { ROUTE_MODE_LABELS, TASK_CATEGORY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getTripOverview } from "@/server/queries";

export default async function TripOverviewPage({ params }: PageProps<"/trips/[tripId]">) {
  const { tripId } = await params;
  const trip = await getTripOverview(tripId);
  if (!trip) notFound();

  const today = todayKey();
  const progress = computeTaskProgress(trip.tasks, today);
  const budget = summarizeBudget(trip.expenses, trip.budgetCents);
  const nextTasks = sortTasksByDueDate(trip.tasks.filter((t) => !t.done)).slice(0, 5);
  const nights = trip.startDate && trip.endDate ? nightsBetween(trip.startDate, trip.endDate) : null;
  const perPerson = trip.travelers > 0 ? Math.round(budget.totalCents / trip.travelers) : 0;

  return (
    <div className="grid gap-6">
      <BudgetAlert summary={budget} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tâches</CardTitle>
            <CardDescription>
              {progress.total === 0
                ? "Aucune tâche pour l'instant"
                : `${progress.done} sur ${progress.total} terminées (${progress.percent} %)`}
            </CardDescription>
            <CardAction>
              <Link href={`/trips/${tripId}/tasks`} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                Tout voir <ArrowRightIcon className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Progress value={progress.percent} aria-label="Avancement des tâches" />
            {nextTasks.length > 0 ? (
              <ul className="grid gap-2 text-sm">
                {nextTasks.map((task) => {
                  const overdue = isOverdue(task, today);
                  return (
                    <li key={task.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{task.title}</span>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 text-xs",
                          overdue ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {overdue && <AlertCircleIcon className="size-3.5" />}
                        {task.dueDate ? formatDate(task.dueDate) : TASK_CATEGORY_LABELS[task.category]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              progress.total > 0 && <p className="text-muted-foreground text-sm">Tout est fait. Bon voyage !</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget</CardTitle>
            <CardDescription>
              {budget.targetCents === null ? "Pas de budget cible" : `Cible ${formatMoney(budget.targetCents)}`}
            </CardDescription>
            <CardAction>
              <Link href={`/trips/${tripId}/budget`} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                Détails <ArrowRightIcon className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-3 gap-2">
              <div>
                <dt className="text-muted-foreground text-xs">Prévisionnel</dt>
                <dd className={cn("font-semibold tabular-nums", budget.level === "over" && "text-destructive")}>
                  {formatMoney(budget.totalCents)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Engagé</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(budget.committedCents)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Payé</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(budget.paidCents)}</dd>
              </div>
            </dl>
            {budget.targetCents !== null && (
              <Progress
                value={(budget.ratio ?? 0) * 100}
                aria-label="Prévisionnel par rapport au budget"
                indicatorClassName={cn(
                  budget.level === "over" && "bg-destructive",
                  budget.level === "warning" && "bg-warning",
                )}
              />
            )}
            {trip.travelers > 1 && budget.totalCents > 0 && (
              <p className="text-muted-foreground text-xs">
                Soit {formatMoney(perPerson)} par personne{nights ? ` pour ${nights} nuit${nights > 1 ? "s" : ""}` : ""}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {trip.comparisons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparatifs</CardTitle>
            <CardAction>
              <Link href={`/trips/${tripId}/comparisons`} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                Tout voir <ArrowRightIcon className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {trip.comparisons.map((comparison) => {
                const selected = comparison.items.find((i) => i.status === "SELECTED");
                const leader = buildComparisonView(comparison.criteria, comparison.items).columns.find((c) => c.rank === 1);
                return (
                  <li key={comparison.id} className="flex items-center justify-between gap-3">
                    <Link href={`/trips/${tripId}/comparisons/${comparison.id}`} className="truncate hover:underline">
                      {comparison.name}
                    </Link>
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                      {selected ? (
                        <>
                          <CheckCircle2Icon className="text-success size-3.5" /> {selected.title}
                        </>
                      ) : leader ? (
                        <>
                          <TrophyIcon className="size-3.5" /> {leader.item.title} ({leader.score}/100)
                        </>
                      ) : (
                        `${comparison.items.length} élément${comparison.items.length > 1 ? "s" : ""}`
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {trip.routes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itinéraires</CardTitle>
            <CardAction>
              <Link href={`/trips/${tripId}/route`} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                Voir la carte <ArrowRightIcon className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {trip.routes.map((route) => (
                <li key={route.id} className="flex items-center justify-between gap-3">
                  <Link href={`/trips/${tripId}/route?route=${route.id}`} className="truncate hover:underline">
                    {route.name}
                  </Link>
                  <span className="text-muted-foreground shrink-0 truncate text-xs">
                    {ROUTE_MODE_LABELS[route.mode]} · {route.stops.length} étape{route.stops.length > 1 ? "s" : ""}
                    {route.stops.length >= 2 && ` · ${route.stops[0].name} → ${route.stops[route.stops.length - 1].name}`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {trip.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{trip.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
