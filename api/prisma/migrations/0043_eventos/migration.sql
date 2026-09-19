-- Eventos de uso (funil dos novatos — recomendação 8 do relatório de retenção; dono, 18/09/2026):
-- telas abertas, app aberto/fechado, recarga vista, slider visto, cadastro feito… Ver routes/events.js e
-- services/report.js. `deviceId` liga o que aconteceu antes do cadastro à conta criada depois.
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "name" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Event_name_createdAt_idx" ON "Event"("name", "createdAt");
CREATE INDEX "Event_userId_createdAt_idx" ON "Event"("userId", "createdAt");
CREATE INDEX "Event_deviceId_createdAt_idx" ON "Event"("deviceId", "createdAt");
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
