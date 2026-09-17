-- Avisos que o jogador já viu UMA VEZ e não devem voltar (dono, 17/09/2026: o convite do Instagram
-- "aparece só uma vez para todos; depois que viram não aparece mais"). Guardado por JOGADOR, não por
-- aparelho: quem vê no celular não vê de novo no PC. Formato: { "instagram": "2026-09-17T14:00:00.000Z" }.
ALTER TABLE "User" ADD COLUMN "avisosVistos" JSONB;
