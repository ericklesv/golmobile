-- X1: marca a "revanche repetida" (não vale gol nem gasta uma das 10 partidas da hora — dono, 15/09/2026).
ALTER TABLE "FutPregoMatch" ADD COLUMN "repeated" BOOLEAN NOT NULL DEFAULT false;
