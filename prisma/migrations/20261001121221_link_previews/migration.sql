-- CreateTable
CREATE TABLE "ApiCache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ComparisonItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comparisonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPTION',
    "previewStatus" TEXT NOT NULL DEFAULT 'NONE',
    "previewImage" TEXT,
    "previewTitle" TEXT,
    "previewDescription" TEXT,
    "previewSiteName" TEXT,
    "previewDomain" TEXT,
    "previewError" TEXT,
    "previewFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComparisonItem_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ComparisonItem" ("comparisonId", "createdAt", "id", "notes", "status", "title", "url") SELECT "comparisonId", "createdAt", "id", "notes", "status", "title", "url" FROM "ComparisonItem";
DROP TABLE "ComparisonItem";
ALTER TABLE "new_ComparisonItem" RENAME TO "ComparisonItem";
CREATE INDEX "ComparisonItem_comparisonId_idx" ON "ComparisonItem"("comparisonId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
