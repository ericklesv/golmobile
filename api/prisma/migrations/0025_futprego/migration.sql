-- FutPrego (futebol de prego 1x1): gol vira um tipo próprio de chute + tabela das partidas
-- AlterEnum
ALTER TYPE "KickKind" ADD VALUE IF NOT EXISTS 'FUTPREGO';

-- CreateTable
CREATE TABLE "FutPregoMatch" (
    "id" SERIAL NOT NULL,
    "aId" INTEGER NOT NULL,
    "bId" INTEGER NOT NULL,
    "aTeamId" INTEGER NOT NULL,
    "bTeamId" INTEGER NOT NULL,
    "aIp" TEXT NOT NULL,
    "bIp" TEXT NOT NULL,
    "bet" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLAYING',
    "winnerId" INTEGER,
    "reason" TEXT,
    "turns" INTEGER NOT NULL DEFAULT 0,
    "goalAwarded" BOOLEAN NOT NULL DEFAULT false,
    "lostMatchId" INTEGER,
    "lostTeamId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FutPregoMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FutPregoMatch_aId_bId_createdAt_idx" ON "FutPregoMatch"("aId", "bId", "createdAt");

-- CreateIndex
CREATE INDEX "FutPregoMatch_winnerId_createdAt_idx" ON "FutPregoMatch"("winnerId", "createdAt");

-- CreateIndex
CREATE INDEX "FutPregoMatch_lostMatchId_idx" ON "FutPregoMatch"("lostMatchId");

-- CreateIndex
CREATE INDEX "FutPregoMatch_status_idx" ON "FutPregoMatch"("status");

