-- CreateTable
CREATE TABLE "letter_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "nameTamil" TEXT NOT NULL,
    "nameEnglish" TEXT NOT NULL,
    "addresseeHint" TEXT NOT NULL,
    "requiredFacts" JSONB NOT NULL,
    "optionalFacts" JSONB NOT NULL,
    "languageDefault" TEXT NOT NULL DEFAULT 'ta',
    "legalRefs" JSONB NOT NULL,
    "bodyGuidance" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_drafts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "letterTypeKey" TEXT NOT NULL,
    "typeVersion" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "draftHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_approvals" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftHash" TEXT NOT NULL,
    "approvalUtterance" TEXT NOT NULL,
    "revisions" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "letter_types_key_idx" ON "letter_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "letter_types_key_version_key" ON "letter_types"("key", "version");

-- CreateIndex
CREATE INDEX "letter_drafts_sessionId_idx" ON "letter_drafts"("sessionId");

-- CreateIndex
CREATE INDEX "letter_approvals_sessionId_idx" ON "letter_approvals"("sessionId");

-- AddForeignKey
ALTER TABLE "letter_approvals" ADD CONSTRAINT "letter_approvals_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "letter_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
