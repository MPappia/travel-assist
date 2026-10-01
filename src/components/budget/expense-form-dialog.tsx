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
import { centsToInput } from "@/lib/format";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  type ExpenseCategoryValue,
  type ExpenseStatusValue,
} from "@/lib/labels";
import { createExpense, updateExpense } from "@/server/actions/expenses";

export interface ExpenseFormValues {
  id: string;
  label: string;
  category: ExpenseCategoryValue;
  amountCents: number;
  status: ExpenseStatusValue;
}

export function ExpenseFormDialog({
  tripId,
  expense,
  trigger,
}: {
  tripId: string;
  expense?: ExpenseFormValues;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { pending, errors, setErrors, onSubmit } = useFormAction(
    (formData: FormData) => (expense ? updateExpense(expense.id, formData) : createExpense(tripId, formData)),
    { successMessage: expense ? "Dépense mise à jour" : "Dépense ajoutée", onSuccess: () => setOpen(false) },
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
          <DialogTitle>{expense ? "Modifier la dépense" : "Nouvelle dépense"}</DialogTitle>
          <DialogDescription>Estimée, réservée ou déjà payée : tout compte dans le prévisionnel.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
          <FormField label="Libellé" htmlFor="expense-label" error={errors.label}>
            <Input id="expense-label" name="label" defaultValue={expense?.label} placeholder="Vols aller-retour" autoFocus />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Montant (€)" htmlFor="expense-amount" error={errors.amount}>
              <Input
                id="expense-amount"
                name="amount"
                inputMode="decimal"
                defaultValue={centsToInput(expense?.amountCents)}
                placeholder="350"
              />
            </FormField>
            <FormField label="Statut" htmlFor="expense-status" error={errors.status}>
              <NativeSelect id="expense-status" name="status" defaultValue={expense?.status ?? "ESTIMATED"}>
                {EXPENSE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EXPENSE_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label="Catégorie" htmlFor="expense-category" error={errors.category}>
            <NativeSelect id="expense-category" name="category" defaultValue={expense?.category ?? "OTHER"}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {expense ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
