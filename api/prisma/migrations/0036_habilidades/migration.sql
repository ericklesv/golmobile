-- Habilidades do jogador (dono, 16/09/2026): Pontaria (pênalti) e Chute (falta), 10 níveis cada.
ALTER TABLE "User" ADD COLUMN "skillAim" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "skillShot" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "skillPoints" INTEGER NOT NULL DEFAULT 0;
