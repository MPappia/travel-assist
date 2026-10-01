import { BedDoubleIcon, CalendarDaysIcon, CoffeeIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DayPlan, PlanStop } from "@/lib/domain/day-plan";
import { formatDistance, formatDuration, formatLongDate } from "@/lib/format";

export function DayPlanView<S extends PlanStop>({ plan }: { plan: DayPlan<S> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDaysIcon className="size-4" />
          Jour par jour
        </CardTitle>
        <CardDescription>
          {plan.days.length === 0
            ? "Ajoutez une date (et un nombre de nuits) aux étapes pour obtenir le programme jour par jour."
            : "Les dates en italique sont déduites des nuits passées à l'étape précédente."}
        </CardDescription>
      </CardHeader>
      {plan.days.length > 0 && (
        <CardContent>
          <ol className="grid grid-cols-1 gap-3" data-testid="day-plan">
            {plan.days.map((day, dayIndex) => (
              <li key={day.date} className="grid grid-cols-1 gap-1.5 border-l-2 pl-4" data-testid="day">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium first-letter:uppercase">
                    Jour {dayIndex + 1} · {formatLongDate(new Date(`${day.date}T00:00:00.000Z`))}
                  </p>
                  {day.distance > 0 && (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatDistance(day.distance)} · {formatDuration(day.duration)} de route
                    </p>
                  )}
                </div>
                {day.restDay ? (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                    <CoffeeIcon className="size-3.5" />
                    Journée sur place{day.overnight ? ` à ${day.overnight.name}` : ""}
                  </p>
                ) : (
                  <ul className="text-sm">
                    {day.visits.map(({ stop, legFromPrevious, inferredDate, index }) => (
                      <li key={stop.id} className={inferredDate ? "italic" : undefined}>
                        {index === 0 ? "Départ : " : "→ "}
                        {stop.name}
                        {legFromPrevious && legFromPrevious.distance > 0 && (
                          <span className="text-muted-foreground text-xs not-italic">
                            {" "}
                            ({formatDistance(legFromPrevious.distance)}, {formatDuration(legFromPrevious.duration)})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {day.overnight && !day.restDay && (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <BedDoubleIcon className="size-3.5" />
                    Nuit à {day.overnight.name}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {plan.unscheduled.length > 0 && (
            <p className="text-muted-foreground mt-4 text-xs">
              Sans date : {plan.unscheduled.map((s) => s.name).join(", ")}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
