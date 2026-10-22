-- E-mail de campanha: quando a pessoa ABRIU o e-mail (imagem de 1 pixel carregada), 22/10/2026.
ALTER TABLE "EmailSend" ADD COLUMN "openedAt" TIMESTAMP(3);
