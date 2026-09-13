/**
 * Recuperação de senha por e-mail.
 * POST /api/auth/forgot {email} — sempre 200 (não revela se o e-mail existe); se existir,
 *   grava um token de uso único (1 h) e envia o link PUBLIC_WEB_URL/redefinir-senha?token=...
 *   via SMTP (envs SMTP_HOST/PORT/USER/PASS, MAIL_FROM). Sem SMTP_HOST, o link vai para o console.
 * POST /api/auth/reset {token, password} — troca a senha e invalida o token.
 * No banco fica só o SHA-256 do token (o e-mail leva o token cru).
 */
import { Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma.js';
import { handle, badRequest } from '../lib/errors.js';

export const password = Router();

const TOKEN_TTL_MS = 60 * 60_000; // 1 h
const limiter = () => rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate-limit', message: 'Muitas tentativas. Aguarde alguns minutos.' } });

const hashToken = (t) => createHash('sha256').update(t).digest('hex');
const webUrl = () => (process.env.PUBLIC_WEB_URL || 'https://jogagol.com.br').replace(/\/+$/, '');

let transporter = null;
function mailer() {
  if (transporter !== null) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) { transporter = false; return transporter; }
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
  return transporter;
}

async function sendResetMail(user, link) {
  const t = mailer();
  if (!t) {
    console.log(`[senha] SMTP não configurado — link de redefinição para ${user.email}: ${link}`);
    return;
  }
  const text = `Olá, ${user.nick}!\n\nRecebemos um pedido para redefinir a senha da sua conta no JogaGol.\nAbra o link abaixo (vale por 1 hora):\n\n${link}\n\nSe não foi você, ignore este e-mail — sua senha continua a mesma.\n\nJogaGol`;
  const html = `<p>Olá, <b>${user.nick}</b>!</p>
<p>Recebemos um pedido para redefinir a senha da sua conta no JogaGol. Abra o link abaixo (vale por 1 hora):</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2BA83A;color:#fff;font-weight:bold;border-radius:10px;text-decoration:none">Redefinir minha senha</a></p>
<p style="color:#6B86B3;font-size:13px">Ou copie e cole: ${link}</p>
<p style="color:#6B86B3;font-size:13px">Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>`;
  await t.sendMail({ from: process.env.MAIL_FROM || 'JogaGol <nao-responda@jogagol.com.br>', to: user.email, subject: 'JogaGol — redefinir sua senha', text, html });
}

password.post('/forgot', limiter(), handle(async (req) => {
  const email = z.string().trim().toLowerCase().email('E-mail inválido.').parse(req.body?.email ?? '');
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const raw = randomBytes(32).toString('hex');
    await prisma.$transaction([
      // um pedido novo invalida os anteriores ainda abertos
      prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.passwordReset.create({ data: { token: hashToken(raw), userId: user.id, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) } }),
    ]);
    const link = `${webUrl()}/redefinir-senha?token=${raw}`;
    try { await sendResetMail(user, link); }
    catch (e) { console.error('[senha] falha ao enviar e-mail:', e?.message || e); }
  }
  return { ok: true, message: 'Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha.' };
}));

const resetSchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{64}$/, 'Link inválido.'),
  password: z.string().min(6, 'Senha: mínimo 6 caracteres.').max(72),
});

password.post('/reset', limiter(), handle(async (req) => {
  const body = resetSchema.parse(req.body);
  const now = new Date();
  const pr = await prisma.passwordReset.findUnique({ where: { token: hashToken(body.token) }, include: { user: true } });
  if (!pr || pr.usedAt || pr.expiresAt < now) throw badRequest('Esse link é inválido ou já venceu. Peça um novo.', 'bad-token');
  const passwordHash = await bcrypt.hash(body.password, 10);
  const res = await prisma.passwordReset.updateMany({ where: { id: pr.id, usedAt: null }, data: { usedAt: now } });
  if (res.count === 0) throw badRequest('Esse link já foi usado. Peça um novo.', 'bad-token');
  await prisma.user.update({ where: { id: pr.userId }, data: { passwordHash } });
  return { ok: true, nick: pr.user.nick, message: 'Senha redefinida! Entre com a senha nova.' };
}));
