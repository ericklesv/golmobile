/**
 * Links dos e-mails de campanha (services/emailVolta.js), SEM login — o token do e-mail é a prova.
 * POST /api/email/voltar {t}  — botão do e-mail (a página /voltar chama): marca o clique e ativa o VIP, uma vez.
 * POST /api/email/sair {t}    — "Sair da lista" do rodapé (página /sair-dos-emails).
 * POST /api/email/sair?t=…    — "cancelar inscrição" de um clique do Gmail/Yahoo (RFC 8058: corpo
 *                               `List-Unsubscribe=One-Click`, o token vem no endereço).
 * GET /api/email/aberto/<t>.gif — a imagem de 1 pixel do rodapé: marca que o e-mail foi ABERTO (e avisa no Telegram).
 * Fora isso, nada aqui responde a GET: robô que abre link de e-mail para conferir (antivírus, Outlook) não resgata nem
 * tira ninguém da lista.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handle } from '../lib/errors.js';
import { abriu, resgatar, sairDaLista } from '../services/emailVolta.js';

export const emailVolta = Router();

// GIF transparente de 1x1
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Antes do limite por IP de propósito: o Gmail busca as imagens de TODOS os e-mails pelos mesmos servidores dele, e o
// limite de 30 em 15 min jogaria fora as aberturas. Responde a imagem sempre, mesmo com token ruim (nada a esconder).
emailVolta.get('/aberto/:arq', (req, res) => {
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private' }).end(PIXEL);
  abriu(String(req.params.arq).replace(/\.gif$/, '')).catch((e) => console.error('[email] abertura:', e?.message || e));
});

emailVolta.use(rateLimit({
  windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate-limit', message: 'Muitas tentativas. Aguarde alguns minutos.' },
}));

const tokenOf = (req) => (typeof req.body?.t === 'string' ? req.body.t : null) ?? (typeof req.query?.t === 'string' ? req.query.t : null);

emailVolta.post('/voltar', handle(async (req) => resgatar(tokenOf(req))));
emailVolta.post('/sair', handle(async (req) => ({ ok: true, ...(await sairDaLista(tokenOf(req))) })));
