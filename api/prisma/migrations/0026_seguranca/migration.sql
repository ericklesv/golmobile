-- Segurança: IP do cadastro (teto de contas por IP em 24 h)
ALTER TABLE "User" ADD COLUMN     "createdIp" TEXT;
CREATE INDEX "User_createdIp_createdAt_idx" ON "User"("createdIp", "createdAt");
