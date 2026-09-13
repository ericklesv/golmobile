-- AlterEnum
ALTER TYPE "KickKind" ADD VALUE 'STATS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "statsBest" INTEGER NOT NULL DEFAULT 0;

