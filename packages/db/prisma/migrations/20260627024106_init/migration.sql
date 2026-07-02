-- CreateTable
CREATE TABLE "schemes" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "nameTamil" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "benefit" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "applyAt" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "exclusions" JSONB NOT NULL,
    "documents" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schemes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schemes_key_idx" ON "schemes"("key");

-- CreateIndex
CREATE UNIQUE INDEX "schemes_key_version_key" ON "schemes"("key", "version");
