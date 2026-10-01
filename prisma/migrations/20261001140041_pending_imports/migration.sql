-- CreateTable
CREATE TABLE "PendingImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "origin" TEXT NOT NULL,
    "url" TEXT,
    "payload" TEXT NOT NULL,
    "extraction" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PendingImport_expiresAt_idx" ON "PendingImport"("expiresAt");
