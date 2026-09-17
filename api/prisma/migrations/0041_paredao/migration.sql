-- Paredão: o minigame do goleiro (dono, 17/09/2026, a partir do "Mini Cup" do Google).
ALTER TYPE "KickKind" ADD VALUE IF NOT EXISTS 'PAREDAO';
ALTER TABLE "User" ADD COLUMN "paredaoBest" INTEGER NOT NULL DEFAULT 0;

-- placar coletivo da rodada: defesas dos torcedores de cada time (zera com a rodada nova)
CREATE TABLE "ParedaoTeam" (
  "id"        SERIAL PRIMARY KEY,
  "roundId"   INTEGER NOT NULL REFERENCES "Round"("id"),
  "teamId"    INTEGER NOT NULL REFERENCES "Team"("id"),
  "saves"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ParedaoTeam_roundId_teamId_key" ON "ParedaoTeam"("roundId", "teamId");
