import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { BudgetSummary } from "@/lib/domain/budget";
import { formatMoney } from "@/lib/format";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function BudgetAlert({ summary }: { summary: BudgetSummary }) {
  if (summary.level === "over" && summary.remainingCents !== null) {
    return (
      <div
        role="alert"
        data-testid="budget-alert"
        className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-3 rounded-xl border p-4 text-sm"
      >
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-medium">Budget dépassé de {formatMoney(-summary.remainingCents)}.</span> Le
          prévisionnel ({formatMoney(summary.totalCents)}) dépasse la cible ({formatMoney(summary.targetCents ?? 0)}).
        </p>
      </div>
    );
  }
  if (summary.level === "warning" && summary.remainingCents !== null) {
    return (
      <div role="status" className="border-warning/50 bg-warning/10 flex items-start gap-3 rounded-xl border p-4 text-sm">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          Plus que <span className="font-medium">{formatMoney(summary.remainingCents)}</span> de marge avant
          d&apos;atteindre le budget cible.
        </p>
      </div>
    );
  }
  return null;
}

export function BudgetStats({ summary }: { summary: BudgetSummary }) {
  const stats = [
    { label: "Prévisionnel", value: summary.totalCents, hint: "estimé + réservé + payé", testId: "budget-total" },
    { label: "Engagé", value: summary.committedCents, hint: "réservé + payé", testId: "budget-committed" },
    { label: "Payé", value: summary.paidCents, hint: "déjà réglé", testId: "budget-paid" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription>{stat.label}</CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-xl font-semibold tabular-nums" data-testid={stat.testId}>
              {formatMoney(stat.value)}
            </p>
            <p className="text-muted-foreground text-xs">{stat.hint}</p>
          </CardContent>
        </Card>
      ))}
      <Card className="gap-1 py-4">
        <CardHeader className="px-4">
          <CardDescription>Budget cible</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 px-4">
          {summary.targetCents === null ? (
            <p className="text-muted-foreground text-sm">Non défini</p>
          ) : (
            <>
              <p className="text-xl font-semibold tabular-nums">{formatMoney(summary.targetCents)}</p>
              <Progress
                value={(summary.ratio ?? 0) * 100}
                aria-label="Prévisionnel par rapport au budget"
                indicatorClassName={cn(
                  summary.level === "over" && "bg-destructive",
                  summary.level === "warning" && "bg-warning",
                  summary.level === "ok" && "bg-success",
                )}
              />
              <p
                className={cn(
                  "flex items-center gap-1 text-xs",
                  summary.level === "over" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {summary.level === "ok" && <CheckCircle2Icon className="text-success size-3.5" />}
                {summary.remainingCents !== null && summary.remainingCents >= 0
                  ? `Reste ${formatMoney(summary.remainingCents)}`
                  : `Dépassement ${formatMoney(-(summary.remainingCents ?? 0))}`}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function BudgetByCategory({ summary }: { summary: BudgetSummary }) {
  if (summary.byCategory.length === 0) return null;
  const max = Math.max(...summary.byCategory.map((c) => c.totalCents), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Par catégorie</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3">
        {summary.byCategory.map((c) => (
          <div key={c.category} className="grid grid-cols-1 gap-1">
            <div className="flex justify-between text-sm">
              <span>{EXPENSE_CATEGORY_LABELS[c.category]}</span>
              <span className="tabular-nums">
                {formatMoney(c.totalCents)}
                <span className="text-muted-foreground ml-2 text-xs">payé {formatMoney(c.paidCents)}</span>
              </span>
            </div>
            <div className="bg-primary/10 relative h-2 overflow-hidden rounded-full">
              <div className="bg-primary/40 absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.totalCents / max) * 100}%` }} />
              <div className="bg-primary absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.paidCents / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
