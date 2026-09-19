-- Tutorial de boas-vindas (dono, 18/09/2026): ao abrir o jogo pela primeira vez o jogador não recebe pop-up
-- nenhum, só o tutorial, que paga 1 VIP se ele fizer as três etapas (pênalti, minigame e X1).
--   tutorialStep: 0 = ainda não respondeu · 1..3 = na etapa · 9 = terminou (VIP pago) · -1 = recusou
ALTER TABLE "User" ADD COLUMN "tutorialStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "tutorialAt" TIMESTAMP(3);

-- Quem já joga não é interrompido por tutorial (e não ganha o VIP): entra como "recusou".
UPDATE "User" SET "tutorialStep" = -1, "tutorialAt" = now() WHERE "createdAt" < now();
