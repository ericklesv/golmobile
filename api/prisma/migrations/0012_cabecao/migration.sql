-- Cabeção: novo tipo de gol + histórico de partidas 1x1
ALTER TYPE "KickKind" ADD VALUE 'CABECAO';

CREATE TABLE "CabecaoMatch" (
    "id" SERIAL NOT NULL,
    "aId" INTEGER NOT NULL,
    "bId" INTEGER NOT NULL,
    "aTeamId" INTEGER NOT NULL,
    "bTeamId" INTEGER NOT NULL,
    "aIp" TEXT NOT NULL,
    "bIp" TEXT NOT NULL,
    "scoreA" INTEGER NOT NULL,
    "scoreB" INTEGER NOT NULL,
    "winnerId" INTEGER,
    "reason" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "goalAwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CabecaoMatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CabecaoMatch_winnerId_createdAt_idx" ON "CabecaoMatch"("winnerId", "createdAt");
CREATE INDEX "CabecaoMatch_aId_createdAt_idx" ON "CabecaoMatch"("aId", "createdAt");
CREATE INDEX "CabecaoMatch_bId_createdAt_idx" ON "CabecaoMatch"("bId", "createdAt");
