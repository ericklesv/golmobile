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

export const auth = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate-limit', message: 'Muitas tentativas. Aguarde alguns minutos.' } });

const registerSchema = z.object({
  nick: z.string().trim().regex(/^[a-zA-Z0-9_.\-]{3,14}$/, 'Nick: 3 a 14 caracteres (letras, números, _ . -).'),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(6, 'Senha: mínimo 6 caracteres.').max(72),
  teamSlug: z.string().min(1, 'Escolha um time.'),
  gender: z.enum(['M', 'F']).default('M'),
});

auth.post('/register', limiter, handle(async (req) => {
  const body = registerSchema.parse(req.body);
  const team = await prisma.team.findUnique({ where: { slug: body.teamSlug } });
  if (!team) throw badRequest('Time inválido.');
  const nickLower = body.nick.toLowerCase();
  const clash = await prisma.user.findFirst({ where: { OR: [{ nickLower }, { email: body.email }] } });
  if (clash) throw new GameError(409, 'taken', clash.nickLower === nickLower ? 'Esse nick já está em uso.' : 'Esse e-mail já está cadastrado.');
  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: { nick: body.nick, nickLower, email: body.email, passwordHash, gender: body.gender, teamId: team.id, lastIp: clientIp(req), lastIpAt: new Date() },
    include: { team: true },
  });
  return { token: signToken(user), me: meView(user) };
}));

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe nick ou e-mail.'),
  password: z.string().min(1, 'Informe a senha.'),
});

auth.post('/login', limiter, handle(async (req) => {
  const body = loginSchema.parse(req.body);
  const key = body.login.toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ nickLower: key }, { email: key }] }, include: meInclude() });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new GameError(401, 'bad-credentials', 'Nick/e-mail ou senha incorretos.');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(), lastIp: clientIp(req), lastIpAt: new Date() } });
  return { token: signToken(user), me: meView(user) };
}));
