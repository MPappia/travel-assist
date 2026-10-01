import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";

export async function listTrips() {
  return db.trip.findMany({
    orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    include: {
      tasks: { select: { done: true, dueDate: true } },
      expenses: { select: { amountCents: true, category: true, status: true } },
    },
  });
}

/** Voyage seul (en-tête, formulaire d'édition). Mis en cache le temps d'une requête. */
export const getTrip = cache(async (tripId: string) => db.trip.findUnique({ where: { id: tripId } }));

export async function getTripOverview(tripId: string) {
  return db.trip.findUnique({
    where: { id: tripId },
    include: {
      tasks: true,
      expenses: true,
      comparisons: {
        orderBy: { createdAt: "asc" },
        include: {
          criteria: true,
          items: { include: { values: true } },
        },
      },
    },
  });
}

export async function getTripTasks(tripId: string) {
  return db.task.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
}

export async function getTripExpenses(tripId: string) {
  return db.expense.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
}

const comparisonInclude = {
  criteria: { orderBy: { position: "asc" } },
  items: {
    orderBy: { createdAt: "asc" },
    include: { values: true, expense: { select: { id: true, amountCents: true, status: true } } },
  },
} as const;

export async function listComparisons(tripId: string) {
  return db.comparison.findMany({ where: { tripId }, orderBy: { createdAt: "asc" }, include: comparisonInclude });
}

export async function getComparison(tripId: string, comparisonId: string) {
  return db.comparison.findFirst({ where: { id: comparisonId, tripId }, include: comparisonInclude });
}

export type ComparisonWithData = NonNullable<Awaited<ReturnType<typeof getComparison>>>;
