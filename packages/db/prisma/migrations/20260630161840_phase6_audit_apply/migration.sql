-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channel" TEXT,
    "schemeId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiary_records" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiary_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" TEXT NOT NULL,
    "fromEnc" TEXT NOT NULL,
    "textEnc" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_sessionId_idx" ON "audit_log"("sessionId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "beneficiary_records_sessionId_idx" ON "beneficiary_records"("sessionId");

-- CreateIndex
CREATE INDEX "escalations_status_idx" ON "escalations"("status");
