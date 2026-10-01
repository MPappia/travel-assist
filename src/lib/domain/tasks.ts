import { toDateKey } from "@/lib/format";

export interface TaskLike {
  done: boolean;
  dueDate: Date | null;
  createdAt?: Date;
}

/** Une tâche est en retard si elle n'est pas faite et que son échéance est passée (strictement avant aujourd'hui). */
export function isOverdue(task: TaskLike, today: string): boolean {
  if (task.done || !task.dueDate) return false;
  return toDateKey(task.dueDate) < today;
}

/**
 * Tri par échéance : tâches à faire d'abord, puis par date croissante,
 * les tâches sans échéance en fin de groupe.
 */
export function sortTasksByDueDate<T extends TaskLike>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const aTime = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  });
}

export interface TaskProgress {
  done: number;
  total: number;
  percent: number;
  overdue: number;
}

export function computeTaskProgress(tasks: readonly TaskLike[], today: string): TaskProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const overdue = tasks.filter((t) => isOverdue(t, today)).length;
  return { done, total, overdue, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
