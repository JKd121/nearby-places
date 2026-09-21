-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "categoryIds" TEXT[],
    "radiusMeters" INTEGER NOT NULL,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchHistory_visitorId_searchedAt_idx" ON "SearchHistory"("visitorId", "searchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SearchHistory_visitorId_dedupeKey_key" ON "SearchHistory"("visitorId", "dedupeKey");
