import { BudgetAlert, BudgetByCategory, BudgetStats } from "@/components/budget/budget-overview";
import { ExpenseList } from "@/components/budget/expense-list";
import { summarizeBudget } from "@/lib/domain/budget";
import { getTrip, getTripExpenses } from "@/server/queries";

export default async function TripBudgetPage({ params }: PageProps<"/trips/[tripId]/budget">) {
  const { tripId } = await params;
  const [trip, expenses] = await Promise.all([getTrip(tripId), getTripExpenses(tripId)]);
  const summary = summarizeBudget(expenses, trip?.budgetCents ?? null);

  return (
    <div className="grid grid-cols-1 gap-6">
      <BudgetAlert summary={summary} />
      <BudgetStats summary={summary} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <ExpenseList tripId={tripId} expenses={expenses} />
        <BudgetByCategory summary={summary} />
      </div>
    </div>
  );
}
