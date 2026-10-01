// Libellés français des énumérations de la base.
// Les clés reprennent volontairement les valeurs des enums Prisma (chaînes) pour rester
// utilisables côté client sans importer le client Prisma.

export const TRIP_STATUSES = ["IDEA", "PLANNING", "BOOKED", "DONE"] as const;
export type TripStatusValue = (typeof TRIP_STATUSES)[number];
export const TRIP_STATUS_LABELS: Record<TripStatusValue, string> = {
  IDEA: "Idée",
  PLANNING: "En préparation",
  BOOKED: "Réservé",
  DONE: "Terminé",
};

export const TASK_CATEGORIES = ["TRANSPORT", "ACCOMMODATION", "ADMIN", "ACTIVITIES", "PACKING", "OTHER"] as const;
export type TaskCategoryValue = (typeof TASK_CATEGORIES)[number];
export const TASK_CATEGORY_LABELS: Record<TaskCategoryValue, string> = {
  TRANSPORT: "Transport",
  ACCOMMODATION: "Logement",
  ADMIN: "Administratif",
  ACTIVITIES: "Activités",
  PACKING: "Bagages",
  OTHER: "Autre",
};

export const EXPENSE_CATEGORIES = ["TRANSPORT", "ACCOMMODATION", "FOOD", "ACTIVITIES", "ADMIN", "OTHER"] as const;
export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryValue, string> = {
  TRANSPORT: "Transport",
  ACCOMMODATION: "Logement",
  FOOD: "Repas",
  ACTIVITIES: "Activités",
  ADMIN: "Administratif",
  OTHER: "Autre",
};

export const EXPENSE_STATUSES = ["ESTIMATED", "BOOKED", "PAID"] as const;
export type ExpenseStatusValue = (typeof EXPENSE_STATUSES)[number];
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatusValue, string> = {
  ESTIMATED: "Estimé",
  BOOKED: "Réservé",
  PAID: "Payé",
};
