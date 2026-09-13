-- Loja: itens do jogador (com validade) e histórico de compras; cor do nick.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "nickColor" TEXT;

-- CreateTable
CREATE TABLE "UserItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserItem_userId_itemKey_idx" ON "UserItem"("userId", "itemKey");

-- CreateIndex
CREATE INDEX "UserItem_userId_expiresAt_idx" ON "UserItem"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ShopLog_userId_createdAt_idx" ON "ShopLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopLog" ADD CONSTRAINT "ShopLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
