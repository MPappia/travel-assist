-- CreateTable
CREATE TABLE "Comparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expenseCategory" TEXT NOT NULL DEFAULT 'ACCOMMODATION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comparison_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comparisonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NUMBER',
    "weight" REAL NOT NULL DEFAULT 1,
    "direction" TEXT NOT NULL DEFAULT 'HIGHER_IS_BETTER',
    "unit" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Criterion_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComparisonItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comparisonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPTION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComparisonItem_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CriterionValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "numberValue" REAL,
    "textValue" TEXT,
    "boolValue" BOOLEAN,
    CONSTRAINT "CriterionValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ComparisonItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CriterionValue_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "comparisonItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_comparisonItemId_fkey" FOREIGN KEY ("comparisonItemId") REFERENCES "ComparisonItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountCents", "category", "createdAt", "id", "label", "status", "tripId") SELECT "amountCents", "category", "createdAt", "id", "label", "status", "tripId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_comparisonItemId_key" ON "Expense"("comparisonItemId");
CREATE INDEX "Expense_tripId_idx" ON "Expense"("tripId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Comparison_tripId_idx" ON "Comparison"("tripId");

-- CreateIndex
CREATE INDEX "Criterion_comparisonId_idx" ON "Criterion"("comparisonId");

-- CreateIndex
CREATE INDEX "ComparisonItem_comparisonId_idx" ON "ComparisonItem"("comparisonId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionValue_itemId_criterionId_key" ON "CriterionValue"("itemId", "criterionId");
