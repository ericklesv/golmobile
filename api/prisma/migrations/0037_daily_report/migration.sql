-- Relatório diário no Telegram (pedido do outro investidor, 16/09/2026): um registro por dia enviado.
CREATE TABLE "DailyReport" (
    "day" TEXT NOT NULL,
    "json" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("day")
);
