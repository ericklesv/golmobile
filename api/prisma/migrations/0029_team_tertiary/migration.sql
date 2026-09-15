-- 3ª cor do time (tricolores): listras nas peças do X1. Santa Cruz = preto · branco · vermelho (pedido da torcida, 15/09/2026)
-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "colorTertiary" TEXT;

UPDATE "Team" SET "colorTertiary" = '#FFFFFF' WHERE slug = 'santa-cruz';
