-- Caixa de mensagens do jogador + convite paga aos DOIS lados (pedidos do dono, 15/09/2026)
-- AlterTable
ALTER TABLE "ReferralReward" ADD COLUMN     "side" TEXT NOT NULL DEFAULT 'REFERRER';

-- DropIndex
DROP INDEX "ReferralReward_referredId_milestone_key";

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referredId_milestone_side_key" ON "ReferralReward"("referredId", "milestone", "side");

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromId" INTEGER,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_userId_readAt_idx" ON "Message"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Message_userId_createdAt_idx" ON "Message"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
