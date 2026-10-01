"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { AlertCircleIcon, CalendarIcon, ListTodoIcon, PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { EmptyState } from "@/components/empty-state";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { computeTaskProgress, isOverdue, sortTasksByDueDate } from "@/lib/domain/tasks";
import { formatDate } from "@/lib/format";
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS, type TaskCategoryValue } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskDone } from "@/server/actions/tasks";

export interface TaskItem {
  id: string;
  title: string;
  category: TaskCategoryValue;
  dueDate: Date | null;
  done: boolean;
  createdAt: Date;
}

type Filter = TaskCategoryValue | "ALL";

export function TaskList({ tripId, tasks, today }: { tripId: string; tasks: TaskItem[]; today: string }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [, startTransition] = useTransition();
  const [optimisticTasks, setOptimisticDone] = useOptimistic(tasks, (state, update: { id: string; done: boolean }) =>
    state.map((t) => (t.id === update.id ? { ...t, done: update.done } : t)),
  );

  const visible = useMemo(
    () => sortTasksByDueDate(optimisticTasks.filter((t) => filter === "ALL" || t.category === filter)),
    [optimisticTasks, filter],
  );
  const progress = computeTaskProgress(optimisticTasks, today);
  const counts = useMemo(() => {
    const map = new Map<TaskCategoryValue, number>();
    for (const t of tasks) map.set(t.category, (map.get(t.category) ?? 0) + 1);
    return map;
  }, [tasks]);

  function toggle(task: TaskItem, done: boolean) {
    startTransition(async () => {
      setOptimisticDone({ id: task.id, done });
      const result = await setTaskDone(task.id, done);
      if (!result.ok) toast.error(result.error);
    });
  }

  const addButton = (
    <Button>
      <PlusIcon />
      Ajouter une tâche
    </Button>
  );

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListTodoIcon}
        title="Aucune tâche"
        description="Listez ce qu'il reste à faire : réserver, renouveler un papier, préparer les bagages…"
      >
        <TaskFormDialog tripId={tripId} trigger={addButton} />
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">
            {progress.done}/{progress.total}
          </span>{" "}
          tâches faites
          {progress.overdue > 0 && <span className="text-destructive"> · {progress.overdue} en retard</span>}
        </p>
        <TaskFormDialog tripId={tripId} defaultCategory={filter === "ALL" ? undefined : filter} trigger={addButton} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
        <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>
          Toutes ({tasks.length})
        </FilterChip>
        {TASK_CATEGORIES.filter((c) => counts.has(c)).map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
            {TASK_CATEGORY_LABELS[c]} ({counts.get(c)})
          </FilterChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Aucune tâche dans cette catégorie.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {visible.map((task) => {
            const overdue = isOverdue(task, today);
            return (
              <li
                key={task.id}
                data-testid="task-row"
                data-overdue={overdue || undefined}
                className={cn("flex items-center gap-3 px-4 py-3", overdue && "bg-destructive/5")}
              >
                <Checkbox
                  id={`task-${task.id}`}
                  checked={task.done}
                  onCheckedChange={(checked) => toggle(task, checked === true)}
                  aria-label={`Marquer « ${task.title} » comme ${task.done ? "à faire" : "faite"}`}
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`task-${task.id}`}
                    className={cn("line-clamp-2 block text-sm break-words", task.done && "text-muted-foreground line-through")}
                  >
                    {task.title}
                  </label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{TASK_CATEGORY_LABELS[task.category]}</Badge>
                    {task.dueDate && (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          overdue ? "text-destructive font-medium" : "text-muted-foreground",
                        )}
                      >
                        {overdue ? <AlertCircleIcon className="size-3.5" /> : <CalendarIcon className="size-3.5" />}
                        {overdue ? "En retard · " : ""}
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
                <TaskFormDialog
                  tripId={tripId}
                  task={task}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Modifier « ${task.title} »`}>
                      <PencilIcon />
                    </Button>
                  }
                />
                <ConfirmDeleteButton
                  title="Supprimer cette tâche ?"
                  description={`« ${task.title} » sera supprimée.`}
                  label={`Supprimer « ${task.title} »`}
                  onConfirm={async () => {
                    const result = await deleteTask(task.id);
                    if (result.ok) toast.success("Tâche supprimée");
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      aria-pressed={active}
      onClick={onClick}
      className="rounded-full"
    >
      {children}
    </Button>
  );
}
