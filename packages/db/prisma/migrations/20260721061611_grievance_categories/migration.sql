-- CreateTable
CREATE TABLE "grievance_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issueExamples" JSONB NOT NULL,
    "toDesignation" TEXT NOT NULL,
    "cc" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grievance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grievance_categories_key_idx" ON "grievance_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "grievance_categories_key_version_key" ON "grievance_categories"("key", "version");
