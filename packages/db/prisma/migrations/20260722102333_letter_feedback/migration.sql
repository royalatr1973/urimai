-- CreateTable
CREATE TABLE "letter_feedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "letterTypeKey" TEXT,
    "categoryKey" TEXT,
    "revisions" INTEGER NOT NULL DEFAULT 0,
    "sentiment" TEXT NOT NULL,
    "rating" INTEGER,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "letter_feedback_createdAt_idx" ON "letter_feedback"("createdAt");

-- CreateIndex
CREATE INDEX "letter_feedback_sentiment_idx" ON "letter_feedback"("sentiment");
