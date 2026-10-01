"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useFormAction } from "@/hooks/use-form-action";
import { toDateKey } from "@/lib/format";
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS, type TaskCategoryValue } from "@/lib/labels";
import { createTask, updateTask } from "@/server/actions/tasks";

export interface TaskFormValues {
  id: string;
  title: string;
  category: TaskCategoryValue;
  dueDate: Date | null;
}

export function TaskFormDialog({
  tripId,
  task,
  defaultCategory,
  trigger,
}: {
  tripId: string;
  task?: TaskFormValues;
  defaultCategory?: TaskCategoryValue;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { pending, errors, setErrors, onSubmit } = useFormAction(
    (formData: FormData) => (task ? updateTask(task.id, formData) : createTask(tripId, formData)),
    { successMessage: task ? "Tâche mise à jour" : "Tâche ajoutée", onSuccess: () => setOpen(false) },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setErrors({});
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
          <DialogDescription>Une chose à ne pas oublier avant le départ.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField label="Titre" htmlFor="task-title" error={errors.title}>
            <Input id="task-title" name="title" defaultValue={task?.title} placeholder="Renouveler le passeport" autoFocus />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Catégorie" htmlFor="task-category" error={errors.category}>
              <NativeSelect id="task-category" name="category" defaultValue={task?.category ?? defaultCategory ?? "OTHER"}>
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {TASK_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Échéance" htmlFor="task-due" error={errors.dueDate}>
              <Input id="task-due" name="dueDate" type="date" defaultValue={toDateKey(task?.dueDate)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {task ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
