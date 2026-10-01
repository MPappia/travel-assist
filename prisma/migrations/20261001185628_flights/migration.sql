-- AlterTable
ALTER TABLE "ComparisonItem" ADD COLUMN "flightDetails" TEXT;
ALTER TABLE "ComparisonItem" ADD COLUMN "priceCapturedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Comparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expenseCategory" TEXT NOT NULL DEFAULT 'ACCOMMODATION',
    "kind" TEXT NOT NULL DEFAULT 'GENERIC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comparison_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Comparison" ("createdAt", "expenseCategory", "id", "name", "tripId") SELECT "createdAt", "expenseCategory", "id", "name", "tripId" FROM "Comparison";
DROP TABLE "Comparison";
ALTER TABLE "new_Comparison" RENAME TO "Comparison";
CREATE INDEX "Comparison_tripId_idx" ON "Comparison"("tripId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
