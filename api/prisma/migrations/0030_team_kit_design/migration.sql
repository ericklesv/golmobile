-- Uniforme do time: o presidente escolhe o desenho (cores sempre as do time). Pedido do dono, 15/09/2026.
-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "kitDesign" TEXT NOT NULL DEFAULT 'classico',
ADD COLUMN     "kitChangedAt" TIMESTAMP(3);
