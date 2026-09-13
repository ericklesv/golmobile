-- AlterEnum
ALTER TYPE "KickKind" ADD VALUE 'TERMO';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "levelBonus" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DailyGame" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "game" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "reward" JSONB,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyGame_game_day_idx" ON "DailyGame"("game", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyGame_userId_game_day_key" ON "DailyGame"("userId", "game", "day");

-- AddForeignKey
ALTER TABLE "DailyGame" ADD CONSTRAINT "DailyGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

