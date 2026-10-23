-- E-mail de campanha: 1ª busca da imagem de 1 pixel (o Brevo conferindo a imagem no envio, não é abertura), 23/10/2026.
ALTER TABLE "EmailSend" ADD COLUMN "pixelAt" TIMESTAMP(3);
