-- CreateTable
CREATE TABLE "offices" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "designation" TEXT NOT NULL,
    "designationTamil" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "addressLines" JSONB NOT NULL,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "level" TEXT NOT NULL DEFAULT 'state',
    "district" TEXT,
    "handles" JSONB NOT NULL,
    "ccFor" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offices_key_idx" ON "offices"("key");

-- CreateIndex
CREATE UNIQUE INDEX "offices_key_version_key" ON "offices"("key", "version");
