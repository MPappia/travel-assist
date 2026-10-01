import { describe, expect, it } from "vitest";

import { computeTaskProgress, isOverdue, sortTasksByDueDate } from "@/lib/domain/tasks";

const d = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe("isOverdue", () => {
  it("signale une tâche non faite dont l'échéance est passée", () => {
    expect(isOverdue({ done: false, dueDate: d("2026-05-01") }, "2026-05-02")).toBe(true);
  });
  it("ne signale pas une tâche due aujourd'hui", () => {
    expect(isOverdue({ done: false, dueDate: d("2026-05-02") }, "2026-05-02")).toBe(false);
  });
  it("ignore les tâches faites ou sans échéance", () => {
    expect(isOverdue({ done: true, dueDate: d("2026-01-01") }, "2026-05-02")).toBe(false);
    expect(isOverdue({ done: false, dueDate: null }, "2026-05-02")).toBe(false);
  });
});

describe("sortTasksByDueDate", () => {
  it("trie à faire d'abord, par échéance, sans échéance en dernier", () => {
    const tasks = [
      { id: "sans-date", done: false, dueDate: null },
      { id: "faite", done: true, dueDate: d("2026-01-01") },
      { id: "juin", done: false, dueDate: d("2026-06-01") },
      { id: "mai", done: false, dueDate: d("2026-05-01") },
    ];
    expect(sortTasksByDueDate(tasks).map((t) => t.id)).toEqual(["mai", "juin", "sans-date", "faite"]);
  });
});

describe("computeTaskProgress", () => {
  it("calcule l'avancement", () => {
    const progress = computeTaskProgress(
      [
        { done: true, dueDate: null },
        { done: false, dueDate: d("2026-01-01") },
        { done: false, dueDate: null },
      ],
      "2026-02-01",
    );
    expect(progress).toEqual({ done: 1, total: 3, percent: 33, overdue: 1 });
  });
  it("gère une liste vide", () => {
    expect(computeTaskProgress([], "2026-02-01").percent).toBe(0);
  });
});
