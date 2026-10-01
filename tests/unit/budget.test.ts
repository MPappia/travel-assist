import { describe, expect, it } from "vitest";

import { budgetLevel, summarizeBudget, type ExpenseLike } from "@/lib/domain/budget";

const expenses: ExpenseLike[] = [
  { amountCents: 40000, category: "TRANSPORT", status: "PAID" },
  { amountCents: 60000, category: "ACCOMMODATION", status: "BOOKED" },
  { amountCents: 20000, category: "FOOD", status: "ESTIMATED" },
  { amountCents: 5000, category: "TRANSPORT", status: "ESTIMATED" },
];

describe("summarizeBudget", () => {
  it("sépare estimé, réservé et payé", () => {
    const summary = summarizeBudget(expenses, 150000);
    expect(summary.totalCents).toBe(125000);
    expect(summary.estimatedCents).toBe(25000);
    expect(summary.bookedCents).toBe(60000);
    expect(summary.paidCents).toBe(40000);
    expect(summary.committedCents).toBe(100000);
    expect(summary.remainingCents).toBe(25000);
    expect(summary.level).toBe("ok");
  });

  it("regroupe par catégorie dans l'ordre des catégories", () => {
    const summary = summarizeBudget(expenses, null);
    expect(summary.byCategory.map((c) => c.category)).toEqual(["TRANSPORT", "ACCOMMODATION", "FOOD"]);
    expect(summary.byCategory[0]).toMatchObject({ totalCents: 45000, paidCents: 40000, count: 2 });
  });

  it("détecte un dépassement", () => {
    const summary = summarizeBudget(expenses, 100000);
    expect(summary.level).toBe("over");
    expect(summary.remainingCents).toBe(-25000);
  });

  it("sans cible, pas de niveau ni de reste", () => {
    const summary = summarizeBudget(expenses, null);
    expect(summary.level).toBe("none");
    expect(summary.remainingCents).toBeNull();
    expect(summary.ratio).toBeNull();
  });
});

describe("budgetLevel", () => {
  it("prévient à partir de 90 %", () => {
    expect(budgetLevel(89, 100)).toBe("ok");
    expect(budgetLevel(90, 100)).toBe("warning");
    expect(budgetLevel(100, 100)).toBe("warning");
    expect(budgetLevel(101, 100)).toBe("over");
    expect(budgetLevel(50, 0)).toBe("none");
  });
});
