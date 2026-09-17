-- Habilidades novas (Recarga e Sorte) e o chute de prata/ouro — dono, 17/09/2026.
ALTER TABLE "User" ADD COLUMN "skillCd" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "skillLuck" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "ballNext" JSONB;
ALTER TABLE "User" ADD COLUMN "ballLeft" JSONB;
ALTER TABLE "Goal" ADD COLUMN "ball" TEXT;

-- Pontaria e Chute passaram de 10 para 9 níveis (teto 90% no pênalti e 80% na falta): quem estava no 10
-- volta para 9 e recebe o ponto de volta (sem deixar skillPoints negativo).
UPDATE "User" SET "skillPoints" = GREATEST(0, "skillPoints" - ((CASE WHEN "skillAim" > 9 THEN "skillAim" - 9 ELSE 0 END) + (CASE WHEN "skillShot" > 9 THEN "skillShot" - 9 ELSE 0 END)))
 WHERE "skillAim" > 9 OR "skillShot" > 9;
UPDATE "User" SET "skillAim" = LEAST("skillAim", 9), "skillShot" = LEAST("skillShot", 9);
