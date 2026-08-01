-- CreateTable
CREATE TABLE "phone_limits" (
    "phone" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_limits_pkey" PRIMARY KEY ("phone")
);
