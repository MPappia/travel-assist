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

export const CRITERION_TYPES = ["NUMBER", "RATING", "BOOLEAN", "TEXT"] as const;
export type CriterionTypeValue = (typeof CRITERION_TYPES)[number];
export const CRITERION_TYPE_LABELS: Record<CriterionTypeValue, string> = {
  NUMBER: "Nombre",
  RATING: "Note 1–5",
  BOOLEAN: "Oui / non",
  TEXT: "Texte (non noté)",
};

export const CRITERION_DIRECTIONS = ["HIGHER_IS_BETTER", "LOWER_IS_BETTER"] as const;
export type CriterionDirectionValue = (typeof CRITERION_DIRECTIONS)[number];
export const CRITERION_DIRECTION_LABELS: Record<CriterionDirectionValue, string> = {
  HIGHER_IS_BETTER: "Plus haut = mieux",
  LOWER_IS_BETTER: "Plus bas = mieux",
};

export const ITEM_STATUSES = ["OPTION", "SELECTED", "REJECTED"] as const;
export type ItemStatusValue = (typeof ITEM_STATUSES)[number];
export const ITEM_STATUS_LABELS: Record<ItemStatusValue, string> = {
  OPTION: "Option",
  SELECTED: "Retenu",
  REJECTED: "Écarté",
};
