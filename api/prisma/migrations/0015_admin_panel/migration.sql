-- Painel de admin (/api/painel): IP do jogador, log de auditoria e admins fixos.
-- Idempotente: o deploy da VPS pode rodar mais de uma vez sem quebrar.

-- AlterTable: último IP visto (capturado no cadastro, no login e no heartbeat)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastIp" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastIpAt" TIMESTAMP(3);

-- CreateTable: auditoria de toda ação feita pelo painel
CREATE TABLE IF NOT EXISTS "AdminAction" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "targetId" INTEGER,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAction_createdAt_idx" ON "AdminAction"("createdAt");
CREATE INDEX IF NOT EXISTS "AdminAction_targetId_createdAt_idx" ON "AdminAction"("targetId", "createdAt");

-- AddForeignKey (idempotente via DO/EXCEPTION)
DO $$ BEGIN
    ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admins do painel (pedido do dono, 13/09/2026): SOMENTE ericklesv e MVGIC
UPDATE "User" SET "isAdmin" = true WHERE "nickLower" IN ('ericklesv', 'mvgic');
