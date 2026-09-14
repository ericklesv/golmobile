-- AlterTable
ALTER TABLE "User" ADD COLUMN     "contractUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TeamRole" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferOffer" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "fromTeamId" INTEGER,
    "vip" INTEGER NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VipGift" (
    "id" SERIAL NOT NULL,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VipGift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamRole_userId_key" ON "TeamRole"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRole_teamId_slot_key" ON "TeamRole"("teamId", "slot");

-- CreateIndex
CREATE INDEX "TransferOffer_toUserId_status_idx" ON "TransferOffer"("toUserId", "status");

-- CreateIndex
CREATE INDEX "TransferOffer_fromUserId_status_idx" ON "TransferOffer"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "TransferOffer_teamId_status_idx" ON "TransferOffer"("teamId", "status");

-- CreateIndex
CREATE INDEX "TransferOffer_fromTeamId_status_idx" ON "TransferOffer"("fromTeamId", "status");

-- CreateIndex
CREATE INDEX "TransferOffer_status_expiresAt_idx" ON "TransferOffer"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "VipGift_fromUserId_createdAt_idx" ON "VipGift"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "VipGift_toUserId_createdAt_idx" ON "VipGift"("toUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamRole" ADD CONSTRAINT "TeamRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRole" ADD CONSTRAINT "TeamRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOffer" ADD CONSTRAINT "TransferOffer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOffer" ADD CONSTRAINT "TransferOffer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOffer" ADD CONSTRAINT "TransferOffer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOffer" ADD CONSTRAINT "TransferOffer_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipGift" ADD CONSTRAINT "VipGift_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipGift" ADD CONSTRAINT "VipGift_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

