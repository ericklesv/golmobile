-- VIP pago (PIX na Efí): compras de pacotes de dias de VIP
-- CreateTable
CREATE TABLE "VipPurchase" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "packKey" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "txid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pixCode" TEXT,
    "qrImage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "e2eId" TEXT,
    "paidAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VipPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VipPurchase_txid_key" ON "VipPurchase"("txid");

-- CreateIndex
CREATE UNIQUE INDEX "VipPurchase_e2eId_key" ON "VipPurchase"("e2eId");

-- CreateIndex
CREATE INDEX "VipPurchase_userId_status_idx" ON "VipPurchase"("userId", "status");

-- CreateIndex
CREATE INDEX "VipPurchase_status_createdAt_idx" ON "VipPurchase"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "VipPurchase" ADD CONSTRAINT "VipPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

