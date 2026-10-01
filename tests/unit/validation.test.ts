import { describe, expect, it } from "vitest";

import { expenseSchema, flattenErrors, formDataToObject, taskSchema, tripSchema } from "@/lib/validation";

describe("tripSchema", () => {
  it("transforme les champs saisis", () => {
    const result = tripSchema.parse({
      name: "  Lisbonne  ",
      startDate: "2026-07-01",
      endDate: "2026-07-08",
      travelers: "2",
      budget: "1 500,50",
      status: "PLANNING",
    });
    expect(result).toMatchObject({ name: "Lisbonne", travelers: 2, budget: 150050, status: "PLANNING", notes: "" });
    expect(result.startDate?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("refuse un nom vide et des dates inversées", () => {
    const result = tripSchema.safeParse({ name: "", startDate: "2026-07-08", endDate: "2026-07-01" });
    expect(result.success).toBe(false);
    if (!result.success) expect(flattenErrors(result.error)).toHaveProperty("name");

    const inverted = tripSchema.safeParse({ name: "X", startDate: "2026-07-08", endDate: "2026-07-01" });
    expect(inverted.success).toBe(false);
    if (!inverted.success) expect(flattenErrors(inverted.error).endDate).toMatch(/fin/);
  });
});

describe("taskSchema / expenseSchema", () => {
  it("accepte une tâche sans échéance", () => {
    expect(taskSchema.parse({ title: "Passeport" })).toEqual({ title: "Passeport", category: "OTHER", dueDate: null });
  });

  it("exige un montant valide", () => {
    expect(expenseSchema.safeParse({ label: "Vol", amount: "abc" }).success).toBe(false);
    expect(expenseSchema.parse({ label: "Vol", amount: "320,40" }).amount).toBe(32040);
  });
});

describe("formDataToObject", () => {
  it("convertit les champs vides en undefined", () => {
    const fd = new FormData();
    fd.set("name", "Test");
    fd.set("destination", "");
    expect(formDataToObject(fd)).toEqual({ name: "Test", destination: undefined });
  });
});
