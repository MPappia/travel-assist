"use client";

import { useState } from "react";
import { Loader2Icon, WalletIcon } from "lucide-react";

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
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUSES, EXPENSE_STATUS_LABELS, type ExpenseCategoryValue } from "@/lib/labels";
import { createExpenseFromItem } from "@/server/actions/comparisons";

/** Crée dans le budget la dépense correspondant à un élément retenu. */
export function ItemExpenseDialog({
  itemId,
  defaultLabel,
  defaultAmount,
  category,
}: {
  itemId: string;
  defaultLabel: string;
  defaultAmount: string;
  category: ExpenseCategoryValue;
}) {
  const [open, setOpen] = useState(false);
  const { pending, errors, setErrors, onSubmit } = useFormAction(
    (formData: FormData) => createExpenseFromItem(itemId, formData),
    { successMessage: "Dépense ajoutée au budget", onSuccess: () => setOpen(false) },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setErrors({});
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="w-full">
          <WalletIcon />
          Ajouter au budget
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter au budget</DialogTitle>
          <DialogDescription>
            La dépense sera rangée dans la catégorie « {EXPENSE_CATEGORY_LABELS[category]} ».
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
          <FormField label="Libellé" htmlFor="item-expense-label" error={errors.label}>
            <Input id="item-expense-label" name="label" defaultValue={defaultLabel} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Montant (€)" htmlFor="item-expense-amount" error={errors.amount}>
              <Input id="item-expense-amount" name="amount" inputMode="decimal" defaultValue={defaultAmount} />
            </FormField>
            <FormField label="Statut" htmlFor="item-expense-status">
              <NativeSelect id="item-expense-status" name="status" defaultValue="BOOKED">
                {EXPENSE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EXPENSE_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Créer la dépense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
