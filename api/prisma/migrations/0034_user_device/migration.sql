-- Último aparelho da conta (lib/device.js; dono, 15/09/2026): código do navegador, nome e se é celular.
ALTER TABLE "User" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "User" ADD COLUMN "device" TEXT;
ALTER TABLE "User" ADD COLUMN "deviceMobile" BOOLEAN;

CREATE INDEX "User_deviceId_idx" ON "User"("deviceId");
