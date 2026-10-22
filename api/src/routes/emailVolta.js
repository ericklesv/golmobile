/**
 * Links dos e-mails de campanha (services/emailVolta.js), SEM login — o token do e-mail é a prova.
 * POST /api/email/voltar {t}  — botão do e-mail (a página /voltar chama): marca o clique e ativa o VIP, uma vez.
 * POST /api/email/sair {t}    — "Sair da lista" do rodapé (página /sair-dos-emails).
 * POST /api/email/sair?t=…    — "cancelar inscrição" de um clique do Gmail/Yahoo (RFC 8058: corpo
 *                               `List-Unsubscribe=One-Click`, o token vem no endereço).
 * POST /api/email/brevo/<BREVO_WEBHOOK_SECRET> — aviso do Brevo (webhook dos e-mails transacionais): quem ABRIU o
 *                               e-mail e quem marcou como spam (services/emailVolta.js → eventoBrevo).
 * Nada aqui responde a GET: robô que abre link de e-mail para conferir (antivírus, Outlook) não resgata nem tira
 * ninguém da lista.
 */
import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handle } from '../lib/errors.js';
import { eventoBrevo, resgatar, sairDaLista } from '../services/emailVolta.js';

export const emailVolta = Router();

const segredoOk = (s) => {
  const a = Buffer.from(String(s ?? '')), b = Buffer.from(process.env.BREVO_WEBHOOK_SECRET || '');
  return b.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
};

// Antes do limite por IP de propósito: o Brevo manda os avisos de todo mundo dos mesmos servidores. Responde 200 a
// qualquer evento (o que não interessa é ignorado), senão ele fica reenviando.
emailVolta.post('/brevo/:segredo', async (req, res) => {
  if (!segredoOk(req.params.segredo)) return res.status(404).json({ error: 'not-found', message: 'Não encontrado.' });
  const eventos = Array.isArray(req.body) ? req.body.slice(0, 200) : [req.body];
  for (const ev of eventos) {
    try { await eventoBrevo(ev); } catch (e) { console.error('[email] aviso do Brevo:', e?.message || e); }
  }
  res.json({ ok: true });
});

emailVolta.use(rateLimit({
  windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate-limit', message: 'Muitas tentativas. Aguarde alguns minutos.' },
}));

const tokenOf = (req) => (typeof req.body?.t === 'string' ? req.body.t : null) ?? (typeof req.query?.t === 'string' ? req.query.t : null);

emailVolta.post('/voltar', handle(async (req) => resgatar(tokenOf(req))));
emailVolta.post('/sair', handle(async (req) => ({ ok: true, ...(await sairDaLista(tokenOf(req))) })));
