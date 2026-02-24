-- AlterEnum
ALTER TYPE "ConversationMode" ADD VALUE 'FINANCE';

-- CreateTable
CREATE TABLE "FinanceProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "quantity" DOUBLE PRECISION,
    "currency" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceKnowledgeCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sourceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceKnowledgeCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProfile_userId_key" ON "FinanceProfile"("userId");

-- CreateIndex
CREATE INDEX "FinanceAsset_userId_idx" ON "FinanceAsset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAsset_userId_symbol_key" ON "FinanceAsset"("userId", "symbol");

-- CreateIndex
CREATE INDEX "FinanceKnowledgeCard_userId_updatedAt_idx" ON "FinanceKnowledgeCard"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "FinanceProfile" ADD CONSTRAINT "FinanceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAsset" ADD CONSTRAINT "FinanceAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceKnowledgeCard" ADD CONSTRAINT "FinanceKnowledgeCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

