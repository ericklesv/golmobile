/**
 * Links dos e-mails de campanha (services/emailVolta.js), SEM login — o token do e-mail é a prova.
 * POST /api/email/voltar {t}  — botão do e-mail (a página /voltar chama): marca o clique e ativa o VIP, uma vez.
 * POST /api/email/sair {t}    — "Sair da lista" do rodapé (página /sair-dos-emails).
 * POST /api/email/sair?t=…    — "cancelar inscrição" de um clique do Gmail/Yahoo (RFC 8058: corpo
 *                               `List-Unsubscribe=One-Click`, o token vem no endereço).
 * POST /api/email/brevo/<BREVO_WEBHOOK_SECRET> — aviso do Brevo (webhook dos e-mails transacionais): quem ABRIU o
 *                               e-mail e quem marcou como spam (services/emailVolta.js → eventoBrevo).
 * GET /api/email/aberto/<hash>.gif — a imagem de 1 pixel do rodapé: a 1ª busca 90 s depois do envio = ABRIU
 *                               (services/emailVolta.js → abriuPixel). O endereço leva o hash do código, que não
 *                               resgata nada.
 * Fora a imagem, nada aqui responde a GET: robô que abre link de e-mail para conferir (antivírus, Outlook) não resgata
 * nem tira ninguém da lista.
 */
import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handle } from '../lib/errors.js';
import { abriuPixel, eventoBrevo, resgatar, sairDaLista } from '../services/emailVolta.js';

export const emailVolta = Router();

// GIF transparente de 1x1
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Antes do limite por IP de propósito: as buscas de todos os e-mails vêm dos mesmos servidores do Brevo. Responde a
// imagem sempre, mesmo com código ruim, e sem guardar em cache (cada exibição tem de chegar aqui).
emailVolta.get('/aberto/:arq', (req, res) => {
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private' }).end(PIXEL_GIF);
  abriuPixel(String(req.params.arq).replace(/\.gif$/, ''))
    .then((r) => { if (r) console.log(`[email] imagem: ${r} · ${String(req.get('user-agent') ?? '').slice(0, 60)}`); })
    .catch((e) => console.error('[email] abertura pela imagem:', e?.message || e));
});

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
    try {
      const r = await eventoBrevo(ev);
      if (ev?.event !== 'delivered' && ev?.event !== 'request') console.log(`[email] Brevo: ${ev?.event} → ${r ?? 'ignorado'} · ${String(ev?.user_agent ?? '').slice(0, 70)}`);
    } catch (e) { console.error('[email] aviso do Brevo:', e?.message || e); }
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
