import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma.js';
import { handle, badRequest, GameError } from '../lib/errors.js';
import { signToken } from '../lib/auth.js';
import { meView } from '../services/view.js';
import { meInclude } from '../lib/items.js';
import { clientIp } from '../lib/ip.js';
import { attachReferral } from '../services/referral.js';
import { SECURITY, isDisposableEmail, checkRegisterForm, verifyTurnstile, assertNotLocked, noteLoginFail, noteLoginOk } from '../lib/security.js';
import { tg } from '../lib/telegram.js';

export const auth = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate-limit', message: 'Muitas tentativas. Aguarde alguns minutos.' } });
// cadastro: bem mais apertado que o login (5 por hora por IP; além disso, teto de contas/IP em 24 h no handler).
// Só as tentativas que DERAM CERTO contam (skipFailedRequests): nick em uso, senha curta ou "calma, craque"
// não gastam a cota — em 15/09/2026 um jogador ficou 1 h trancado depois de 5 recusas seguidas.
const registerLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, skipFailedRequests: true,
  message: { error: 'rate-limit', message: 'Muitos cadastros desta conexão. Tente mais tarde.' } });

const registerSchema = z.object({
  nick: z.string().trim().regex(/^[a-zA-Z0-9_.\-]{3,14}$/, 'Nick: 3 a 14 caracteres (letras, números, _ . -).'),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(6, 'Senha: mínimo 6 caracteres.').max(72),
  teamSlug: z.string().min(1, 'Escolha um time.'),
  gender: z.enum(['M', 'F']).default('M'),
  ref: z.string().trim().max(16).optional(), // código do link de convite (services/referral.js)
  // anti-robô (lib/security.js): honeypot, tempo que o formulário ficou aberto (elapsedMs; fronts antigos
  // mandam startedAt) e token do Turnstile (se ligado)
  website: z.string().max(200).optional(),
  elapsedMs: z.number().optional(),
  startedAt: z.number().optional(),
  turnstileToken: z.string().max(4000).optional(),
});

auth.post('/register', registerLimiter, handle(async (req) => {
  const body = registerSchema.parse(req.body);
  const ip = clientIp(req);
  // barrado = aviso no Telegram (1 por IP a cada 10 min; os repetidos viram contador)
  const barrado = (motivo) => tg.warn(`🧱 Cadastro barrado (${motivo}) — IP <code>${tg.esc(ip)}</code>, nick <code>${tg.esc(body.nick)}</code>, e-mail <code>${tg.esc(body.email)}</code>`, { key: `reg-block:${ip}`, every: 10 * 60_000 });
  try { checkRegisterForm(body); } catch (e) { barrado(e.code === 'slow-down' ? 'rápido demais' : 'honeypot'); throw e; }
  try { await verifyTurnstile(body.turnstileToken, ip); } catch (e) { barrado('captcha'); throw e; }
  if (isDisposableEmail(body.email)) { barrado('e-mail descartável'); throw badRequest('Use um e-mail de verdade — endereços temporários não são aceitos.'); }
  const team = await prisma.team.findUnique({ where: { slug: body.teamSlug } });
  if (!team) throw badRequest('Time inválido.');
  if (ip) {
    const recent = await prisma.user.count({ where: { createdIp: ip, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
    if (recent >= SECURITY.registerPerIpPerDay) { barrado(`${recent} contas em 24 h`); throw new GameError(429, 'too-many-accounts', 'Já foram criadas contas demais nesta conexão hoje. Tente amanhã.'); }
  }
  const nickLower = body.nick.toLowerCase();
  const clash = await prisma.user.findFirst({ where: { OR: [{ nickLower }, { email: body.email }] } });
  if (clash) throw new GameError(409, 'taken', clash.nickLower === nickLower ? 'Esse nick já está em uso.' : 'Esse e-mail já está cadastrado.');
  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: { nick: body.nick, nickLower, email: body.email, passwordHash, gender: body.gender, teamId: team.id, lastIp: ip, lastIpAt: new Date(), createdIp: ip },
    include: { team: true },
  });
  await attachReferral(user.id, body.ref, clientIp(req)).catch((e) => console.error('[convite] cadastro:', e.message));
  tg.info(`👤 Novo cadastro: <b>${tg.esc(user.nick)}</b> · ${tg.esc(team.name)} · ${tg.esc(body.email)} · IP <code>${tg.esc(ip)}</code>${body.ref ? ` · convite <code>${tg.esc(body.ref)}</code>` : ''}`);
  return { token: signToken(user), me: meView(user) };
}));

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe nick ou e-mail.'),
  password: z.string().min(1, 'Informe a senha.'),
});

auth.post('/login', limiter, handle(async (req) => {
  const body = loginSchema.parse(req.body);
  const key = body.login.toLowerCase();
  assertNotLocked(key); // trava por conta (lib/security.js): N senhas erradas = 15 min sem tentar
  const user = await prisma.user.findFirst({ where: { OR: [{ nickLower: key }, { email: key }] }, include: meInclude() });
  if (!user || user.deletedAt || !(await bcrypt.compare(body.password, user.passwordHash))) {
    noteLoginFail(key);
    throw new GameError(401, 'bad-credentials', 'Nick/e-mail ou senha incorretos.');
  }
  noteLoginOk(key);
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(), lastIp: clientIp(req), lastIpAt: new Date() } });
  return { token: signToken(user), me: meView(user) };
}));
