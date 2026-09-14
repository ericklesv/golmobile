-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "topJson" JSONB;

-- CreateIndex
CREATE INDEX "HourResult_topJson_idx" ON "HourResult" USING GIN ("topJson" jsonb_path_ops);

