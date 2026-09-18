-- Bots "quase reais" (dono, 18/09/2026): contas que o servidor joga sozinho, em sessões espalhadas pelo
-- dia, para encher os times da Série A que estão sem ninguém. `botJson` = { persona, plan } (services/bots.js).
ALTER TABLE "User" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "botJson" JSONB;
CREATE INDEX "User_isBot_idx" ON "User"("isBot");
