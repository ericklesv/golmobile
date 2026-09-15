-- Pacotes de VIP dão saldo do jogo junto (pedido do dono, 15/09/2026): a compra guarda quanto
-- AlterTable
ALTER TABLE "VipPurchase" ADD COLUMN     "money" INTEGER NOT NULL DEFAULT 0;
