import { Router } from 'express';
import { prisma } from '../prisma.js';
import { handle, notFound } from '../lib/errors.js';
import { requireAdminKey } from '../lib/auth.js';
import { settleDueRounds, ensureSeason, closePastHours } from '../services/league.js';
import { LEVELS } from '../lib/rules.js';

export const admin = Router();
admin.use(requireAdminKey);

// Força o fim da rodada atual (testes)
admin.post('/advance-round', handle(async () => {
  await prisma.round.updateMany({ where: { status: 'LIVE' }, data: { endsAt: new Date(0) } });
  const r = await settleDueRounds();
  await ensureSeason();
  return { settled: r };
}));

admin.post('/close-hour', handle(() => closePastHours()));

admin.post('/vip', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const days = Number(req.body?.days || 0);
  const base = user.vipUntil && user.vipUntil > new Date() ? user.vipUntil.getTime() : Date.now();
  const u = await prisma.user.update({ where: { id: user.id }, data: { vipUntil: new Date(base + days * 86_400_000) } });
  return { nick: u.nick, vipUntil: u.vipUntil };
}));

// Coloca o jogador no nível N (ajusta levelBonus para levelPoints = pontos do nível). Só testes.
admin.post('/level', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const lvl = Number(req.body?.level ?? 0);
  const row = LEVELS.find((l) => l.lvl === lvl);
  if (!row) throw notFound('Nível inválido.');
  const u = await prisma.user.update({ where: { id: user.id }, data: { levelBonus: Math.max(0, row.goals - user.goalsTotal) } });
  return { nick: u.nick, level: lvl, levelPoints: u.goalsTotal + u.levelBonus, levelBonus: u.levelBonus };
}));

admin.post('/money', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const u = await prisma.user.update({ where: { id: user.id }, data: { money: { increment: Number(req.body?.amount || 0) } } });
  return { nick: u.nick, money: u.money };
}));

admin.post('/ban', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const hours = Number(req.body?.hours || 24);
  const u = await prisma.user.update({ where: { id: user.id }, data: { bannedUntil: new Date(Date.now() + hours * 3600_000) } });
  return { nick: u.nick, bannedUntil: u.bannedUntil };
}));

admin.get('/stats', handle(async () => ({
  users: await prisma.user.count(),
  goals: await prisma.goal.count(),
  online: await prisma.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 2 * 60_000) } } }),
})));
