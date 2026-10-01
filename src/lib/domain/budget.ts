import { EXPENSE_CATEGORIES, type ExpenseCategoryValue, type ExpenseStatusValue } from "@/lib/labels";

export interface ExpenseLike {
  amountCents: number;
  category: ExpenseCategoryValue;
  status: ExpenseStatusValue;
}

export interface CategoryTotals {
  category: ExpenseCategoryValue;
  /** Toutes les dépenses, quel que soit leur statut (prévision). */
  totalCents: number;
  paidCents: number;
  count: number;
}

export type BudgetLevel = "none" | "ok" | "warning" | "over";

export interface BudgetSummary {
  /** Total prévisionnel : estimé + réservé + payé. */
  totalCents: number;
  estimatedCents: number;
  bookedCents: number;
  paidCents: number;
  /** Montant engagé (réservé + payé) — c'est le « budget consommé ». */
  committedCents: number;
  targetCents: number | null;
  /** Reste par rapport à la cible, calculé sur le total prévisionnel. */
  remainingCents: number | null;
  /** Ratio total prévisionnel / cible (0–∞), null sans cible. */
  ratio: number | null;
  level: BudgetLevel;
  byCategory: CategoryTotals[];
}

/** Seuil à partir duquel on prévient que le budget est presque atteint. */
export const BUDGET_WARNING_RATIO = 0.9;

export function budgetLevel(totalCents: number, targetCents: number | null): BudgetLevel {
  if (targetCents === null || targetCents <= 0) return "none";
  const ratio = totalCents / targetCents;
  if (ratio > 1) return "over";
  if (ratio >= BUDGET_WARNING_RATIO) return "warning";
  return "ok";
}

export function summarizeBudget(expenses: readonly ExpenseLike[], targetCents: number | null): BudgetSummary {
  let estimatedCents = 0;
  let bookedCents = 0;
  let paidCents = 0;
  const byCategoryMap = new Map<ExpenseCategoryValue, CategoryTotals>();

  for (const expense of expenses) {
    if (expense.status === "ESTIMATED") estimatedCents += expense.amountCents;
    else if (expense.status === "BOOKED") bookedCents += expense.amountCents;
    else paidCents += expense.amountCents;

    const entry = byCategoryMap.get(expense.category) ?? {
      category: expense.category,
      totalCents: 0,
      paidCents: 0,
      count: 0,
    };
    entry.totalCents += expense.amountCents;
    if (expense.status === "PAID") entry.paidCents += expense.amountCents;
    entry.count += 1;
    byCategoryMap.set(expense.category, entry);
  }

  const totalCents = estimatedCents + bookedCents + paidCents;
  const hasTarget = targetCents !== null && targetCents > 0;

  return {
    totalCents,
    estimatedCents,
    bookedCents,
    paidCents,
    committedCents: bookedCents + paidCents,
    targetCents: hasTarget ? targetCents : null,
    remainingCents: hasTarget ? targetCents - totalCents : null,
    ratio: hasTarget ? totalCents / targetCents : null,
    level: budgetLevel(totalCents, targetCents),
    byCategory: EXPENSE_CATEGORIES.map((c) => byCategoryMap.get(c)).filter(
      (c): c is CategoryTotals => c !== undefined,
    ),
  };
}
