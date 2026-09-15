-- Ranking X1 (FutPrego): quadro congelado + prêmios pagos no fechamento da rodada e da temporada (services/x1.js)
-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "x1Json" JSONB;

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "x1Json" JSONB;
