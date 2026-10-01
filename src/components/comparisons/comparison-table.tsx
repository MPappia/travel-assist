"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BanIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  TrophyIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ItemExpenseDialog } from "@/components/comparisons/item-expense-dialog";
import { ItemFormDialog, type ItemFormCriterion, type ItemFormValues } from "@/components/comparisons/item-form-dialog";
import { ComparisonVerdict } from "@/components/comparisons/comparison-verdict";
import { LinkPreviewCard, type PreviewFields } from "@/components/comparisons/link-preview-card";
import { PasteLinkForm } from "@/components/comparisons/paste-link-form";
import { ConfirmDialog } from "@/components/confirm-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { buildComparisonView, type ViewCriterion } from "@/lib/domain/comparison-view";
import { formatCriterionValue } from "@/lib/domain/criteria-values";
import { guessPriceCriterion } from "@/lib/domain/scoring";
import { centsToInput, formatMoney } from "@/lib/format";
import {
  CRITERION_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS,
  ITEM_STATUS_LABELS,
  type ExpenseCategoryValue,
  type ExpenseStatusValue,
  type ItemStatusValue,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { deleteComparisonItem, setComparisonItemStatus } from "@/server/actions/comparisons";

export interface TableItem extends Omit<ItemFormValues, "previewDescription" | "previewImage">, PreviewFields {
  status: ItemStatusValue;
  expense: { id: string; amountCents: number; status: ExpenseStatusValue } | null;
}

export interface ComparisonTableProps {
  comparisonId: string;
  expenseCategory: ExpenseCategoryValue;
  criteria: (ViewCriterion & ItemFormCriterion)[];
  items: TableItem[];
}

const STATUS_VARIANT: Record<ItemStatusValue, React.ComponentProps<typeof Badge>["variant"]> = {
  OPTION: "outline",
  SELECTED: "success",
  REJECTED: "secondary",
};

export function ComparisonTable({ comparisonId, expenseCategory, criteria, items }: ComparisonTableProps) {
  const [sortByScore, setSortByScore] = useState(true);
  const [editing, setEditing] = useState<TableItem | null>(null);
  const [deleting, setDeleting] = useState<TableItem | null>(null);
  const [, startTransition] = useTransition();

  const view = useMemo(() => buildComparisonView(criteria, items, { sortByScore }), [criteria, items, sortByScore]);
  const priceCriterion = useMemo(() => guessPriceCriterion(criteria), [criteria]);
  const titles = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items]);
  const hasSelected = items.some((i) => i.status === "SELECTED");

  function changeStatus(item: TableItem, status: ItemStatusValue) {
    startTransition(async () => {
      const result = await setComparisonItemStatus(item.id, status);
      if (result.ok) toast.success(`« ${item.title} » : ${ITEM_STATUS_LABELS[status].toLowerCase()}`);
      else toast.error(result.error);
    });
  }

  const addButton = (
    <ItemFormDialog
      comparisonId={comparisonId}
      criteria={criteria}
      trigger={
        <Button variant="outline">
          <PlusIcon />
          Ajouter manuellement
        </Button>
      }
    />
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      <ComparisonVerdict explanation={view.explanation} columns={view.columns} titles={titles} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap items-start gap-2 sm:w-auto">
          <PasteLinkForm comparisonId={comparisonId} />
          {addButton}
        </div>
        {items.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={sortByScore}
            onClick={() => setSortByScore((v) => !v)}
            className="text-muted-foreground"
          >
            {sortByScore ? "Trié par score" : "Ordre d'ajout"}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          Aucun élément pour l&apos;instant. Collez le lien d&apos;une annonce ou ajoutez une option à la main.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm" data-testid="comparison-table">
            <thead>
              <tr className="border-b align-top">
                <th className="bg-background sticky left-0 z-10 w-44 min-w-36 p-3 text-left font-medium">
                  <span className="text-muted-foreground text-xs font-normal">Critère · poids</span>
                </th>
                {view.columns.map((col) => (
                  <th
                    key={col.item.id}
                    scope="col"
                    data-testid="comparison-column"
                    data-item-title={col.item.title}
                    className={cn(
                      "min-w-48 border-l p-3 text-left font-normal",
                      col.item.status === "REJECTED" && "opacity-60",
                      col.rank === 1 && "bg-success/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid grid-cols-1 min-w-0 gap-1.5">
                        <div className="flex items-center gap-1.5">
                          {col.rank !== null && (
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                col.rank === 1 ? "bg-success text-white" : "bg-muted text-muted-foreground",
                              )}
                              aria-label={`Rang ${col.rank}`}
                            >
                              {col.rank === 1 ? <TrophyIcon className="size-3.5" /> : col.rank}
                            </span>
                          )}
                          <span className="truncate font-medium" title={col.item.title}>
                            {col.item.title}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={STATUS_VARIANT[col.item.status]}>{ITEM_STATUS_LABELS[col.item.status]}</Badge>
                          {col.item.url && (
                            <a
                              href={col.item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                            >
                              <ExternalLinkIcon className="size-3" />
                              {safeHostname(col.item.url)}
                            </a>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour « ${col.item.title} »`}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(col.item)}>
                            <PencilIcon />
                            Modifier
                          </DropdownMenuItem>
                          {col.item.status !== "SELECTED" && (
                            <DropdownMenuItem onSelect={() => changeStatus(col.item, "SELECTED")}>
                              <CheckCircle2Icon />
                              Retenir
                            </DropdownMenuItem>
                          )}
                          {col.item.status !== "REJECTED" && (
                            <DropdownMenuItem onSelect={() => changeStatus(col.item, "REJECTED")}>
                              <BanIcon />
                              Écarter
                            </DropdownMenuItem>
                          )}
                          {col.item.status !== "OPTION" && (
                            <DropdownMenuItem onSelect={() => changeStatus(col.item, "OPTION")}>
                              <RotateCcwIcon />
                              Remettre en option
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(col.item)}>
                            <Trash2Icon />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <LinkPreviewCard item={col.item} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-muted/30 border-b">
                <th scope="row" className="bg-muted sticky left-0 z-10 p-3 text-left font-medium">
                  Score
                  <span className="text-muted-foreground block text-xs font-normal">sur 100</span>
                </th>
                {view.columns.map((col) => (
                  <td key={col.item.id} className="border-l p-3" data-testid="comparison-score">
                    {col.score === null ? (
                      <span className="text-muted-foreground text-xs">
                        {col.item.status === "REJECTED"
                          ? "Hors course"
                          : view.scoredCriteriaCount === 0
                            ? "Pas de critère noté"
                            : "À compléter"}
                      </span>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5">
                        <span className="text-2xl font-semibold tabular-nums">{col.score}</span>
                        <Progress
                          value={col.score}
                          aria-label={`Score de ${col.item.title}`}
                          indicatorClassName={col.rank === 1 ? "bg-success" : undefined}
                        />
                        {col.missingCount > 0 && (
                          <span className="text-warning text-xs">
                            {col.missingCount} valeur{col.missingCount > 1 ? "s" : ""} manquante
                            {col.missingCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
              {criteria.map((criterion) => {
                const share = view.weightShare[criterion.id];
                return (
                  <tr key={criterion.id} className="border-b" data-testid="criterion-row">
                    <th scope="row" className="bg-background sticky left-0 z-10 p-3 text-left font-normal">
                      <span className="flex items-center gap-1 font-medium">
                        {criterion.name}
                        {criterion.type !== "TEXT" &&
                          (criterion.direction === "LOWER_IS_BETTER" ? (
                            <ArrowDownIcon className="text-muted-foreground size-3.5" aria-label="plus bas = mieux" />
                          ) : (
                            <ArrowUpIcon className="text-muted-foreground size-3.5" aria-label="plus haut = mieux" />
                          ))}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {share !== undefined ? `${Math.round(share * 100)} % du score` : CRITERION_TYPE_LABELS[criterion.type]}
                      </span>
                    </th>
                    {view.columns.map((col) => {
                      const score = col.byCriterion[criterion.id];
                      const best = score?.isBest ?? false;
                      return (
                        <td
                          key={col.item.id}
                          data-best={best || undefined}
                          className={cn("border-l p-3", best && "bg-success/10")}
                        >
                          <span className={cn("flex items-center gap-1.5", best && "text-success font-semibold")}>
                            {best && <TrophyIcon className="size-3.5" aria-label="Meilleure valeur" />}
                            {formatCriterionValue(criterion.type, col.valueByCriterion[criterion.id], criterion.unit)}
                          </span>
                          {score && score.normalized !== null && !score.missing && (
                            <span className="text-muted-foreground block text-xs tabular-nums">
                              +{Math.round(score.points)} pt{Math.round(score.points) > 1 ? "s" : ""}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {items.some((i) => i.notes) && (
                <tr className="border-b">
                  <th scope="row" className="bg-background sticky left-0 z-10 p-3 text-left font-medium">
                    Notes
                  </th>
                  {view.columns.map((col) => (
                    <td key={col.item.id} className="text-muted-foreground border-l p-3 text-xs whitespace-pre-line">
                      {col.item.notes || "—"}
                    </td>
                  ))}
                </tr>
              )}
              {hasSelected && (
                <tr>
                  <th scope="row" className="bg-background sticky left-0 z-10 p-3 text-left font-medium">
                    Budget
                    <span className="text-muted-foreground block text-xs font-normal">
                      {EXPENSE_CATEGORY_LABELS[expenseCategory]}
                    </span>
                  </th>
                  {view.columns.map((col) => (
                    <td key={col.item.id} className="border-l p-3">
                      {col.item.expense ? (
                        <span className="text-success flex items-center gap-1 text-xs" data-testid="item-expense">
                          <CheckCircle2Icon className="size-3.5" />
                          {formatMoney(col.item.expense.amountCents)} ·{" "}
                          {EXPENSE_STATUS_LABELS[col.item.expense.status].toLowerCase()}
                        </span>
                      ) : col.item.status === "SELECTED" ? (
                        <ItemExpenseDialog
                          itemId={col.item.id}
                          category={expenseCategory}
                          defaultLabel={col.item.title}
                          defaultAmount={defaultAmount(priceCriterion?.id, col.valueByCriterion)}
                        />
                      ) : null}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ItemFormDialog
          key={editing.id}
          comparisonId={comparisonId}
          criteria={criteria}
          item={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Supprimer « ${deleting?.title ?? ""} » ?`}
        description="L'élément et ses valeurs seront supprimés du comparatif."
        onConfirm={async () => {
          if (!deleting) return;
          const result = await deleteComparisonItem(deleting.id);
          if (result.ok) toast.success("Élément supprimé");
        }}
      />
    </div>
  );
}

function defaultAmount(
  priceCriterionId: string | undefined,
  values: Record<string, { numberValue: number | null } | undefined>,
): string {
  const value = priceCriterionId ? values[priceCriterionId]?.numberValue : null;
  return value === null || value === undefined ? "" : centsToInput(Math.round(value * 100));
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
