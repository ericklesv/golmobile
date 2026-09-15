-- X1 (FutPrego + Futebol de Botão, um por dia): a tabela de partidas guarda o jogo, a temporada e o placar
-- AlterEnum
ALTER TYPE "KickKind" ADD VALUE IF NOT EXISTS 'BOTAO';

-- AlterTable
ALTER TABLE "FutPregoMatch" ADD COLUMN     "game" TEXT NOT NULL DEFAULT 'FUTPREGO',
ADD COLUMN     "scoreA" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scoreB" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seasonId" INTEGER;

-- CreateIndex
CREATE INDEX "FutPregoMatch_seasonId_goalAwarded_winnerId_idx" ON "FutPregoMatch"("seasonId", "goalAwarded", "winnerId");


-- as partidas de FutPrego já jogadas (desde 15/09/2026, na temporada ativa) entram no Ranking do X1
UPDATE "FutPregoMatch" SET "seasonId" = (SELECT id FROM "Season" WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1) WHERE "seasonId" IS NULL;
