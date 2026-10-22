-- E-mail de campanha "volta pro JogaGol" (22/10/2026): envios rastreados e saída da lista.
ALTER TABLE "User" ADD COLUMN "emailOptOut" TIMESTAMP(3);

CREATE TABLE "EmailSend" (
    "id" SERIAL NOT NULL,
    "campaign" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "clickedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "unsubAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSend_tokenHash_key" ON "EmailSend"("tokenHash");
CREATE UNIQUE INDEX "EmailSend_campaign_userId_key" ON "EmailSend"("campaign", "userId");
CREATE INDEX "EmailSend_campaign_claimedAt_idx" ON "EmailSend"("campaign", "claimedAt");

ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
