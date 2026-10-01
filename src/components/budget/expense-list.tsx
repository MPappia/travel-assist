"use client";

import { PencilIcon, PlusIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";

import { ExpenseFormDialog, type ExpenseFormValues } from "@/components/budget/expense-form-dialog";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS, type ExpenseStatusValue } from "@/lib/labels";
import { deleteExpense } from "@/server/actions/expenses";

const STATUS_VARIANT: Record<ExpenseStatusValue, React.ComponentProps<typeof Badge>["variant"]> = {
  ESTIMATED: "outline",
  BOOKED: "warning",
  PAID: "success",
};

export function ExpenseList({ tripId, expenses }: { tripId: string; expenses: ExpenseFormValues[] }) {
  const addButton = (
    <Button>
      <PlusIcon />
      Ajouter une dépense
    </Button>
  );

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={WalletIcon}
        title="Aucune dépense"
        description="Ajoutez les postes prévus (transport, logement, activités…) pour suivre votre budget."
      >
        <ExpenseFormDialog tripId={tripId} trigger={addButton} />
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Dépenses</h2>
        <ExpenseFormDialog tripId={tripId} trigger={addButton} />
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Libellé</TableHead>
              <TableHead className="hidden sm:table-cell">Catégorie</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id} data-testid="expense-row">
                <TableCell className="max-w-48 truncate pl-4">{expense.label}</TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {EXPENSE_CATEGORY_LABELS[expense.category]}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[expense.status]}>{EXPENSE_STATUS_LABELS[expense.status]}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(expense.amountCents)}</TableCell>
                <TableCell className="pr-2 text-right whitespace-nowrap">
                  <ExpenseFormDialog
                    tripId={tripId}
                    expense={expense}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Modifier « ${expense.label} »`}>
                        <PencilIcon />
                      </Button>
                    }
                  />
                  <ConfirmDeleteButton
                    title="Supprimer cette dépense ?"
                    description={`« ${expense.label} » sera retirée du budget.`}
                    label={`Supprimer « ${expense.label} »`}
                    onConfirm={async () => {
                      const result = await deleteExpense(expense.id);
                      if (result.ok) toast.success("Dépense supprimée");
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
