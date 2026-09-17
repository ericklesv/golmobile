-- Goleada: minigame novo (dono, 17/09/2026, a partir do "Mini Cup" do Google — você é o batedor).
ALTER TYPE "KickKind" ADD VALUE IF NOT EXISTS 'GOLEADA';
ALTER TABLE "User" ADD COLUMN "goleadaBest" INTEGER NOT NULL DEFAULT 0;

-- placar coletivo da rodada: gols dos torcedores de cada time (zera com a rodada nova)
CREATE TABLE "GoleadaTeam" (
  "id"        SERIAL PRIMARY KEY,
  "roundId"   INTEGER NOT NULL REFERENCES "Round"("id"),
  "teamId"    INTEGER NOT NULL REFERENCES "Team"("id"),
  "goals"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GoleadaTeam_roundId_teamId_key" ON "GoleadaTeam"("roundId", "teamId");
