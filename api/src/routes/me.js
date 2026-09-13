import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { handle, GameError, notFound, badRequest } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { meView, publicView } from '../services/view.js';
import { MONEY, DEXTERITY_MAX, NERF_MIN_LEVEL, levelOf } from '../lib/rules.js';

export const me = Router();
me.use(requireAuth);

async function fresh(id) {
  return prisma.user.findUnique({ where: { id }, include: { team: true } });
}

me.get('/', handle(async (req) => meView(await fresh(req.user.id))));

// Presença: o cliente chama a cada 60 s enquanto está aberto (necessário p/ auto-chute)
me.post('/heartbeat', handle(async (req) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { lastSeenAt: new Date() } });
  const online = await prisma.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 2 * 60_000) } } });
  const active = await prisma.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 24 * 3600_000) } } });
  return { ok: true, online, active, serverTime: Date.now() };
}));

me.put('/bio', handle(async (req) => {
  const bio = z.string().max(400, 'Máximo de 400 caracteres.').parse(req.body?.bio ?? '');
  const u = await prisma.user.update({ where: { id: req.user.id }, data: { bio }, include: { team: true } });
  return meView(u);
}));

// Destreza: R$1.000 a unidade, 0..30 — aumenta a chance em pênaltis e faltas
me.post('/buy-dexterity', handle(async (req) => {
  const qty = Math.max(1, Math.min(DEXTERITY_MAX, Number(req.body?.qty || 1)));
  const cost = qty * MONEY.DEXTERITY_PRICE;
  const res = await prisma.user.updateMany({
    where: { id: req.user.id, money: { gte: cost }, dexterity: { lte: DEXTERITY_MAX - qty } },
    data: { money: { decrement: cost }, dexterity: { increment: qty } },
  });
  if (res.count === 0) {
    if (req.user.dexterity + qty > DEXTERITY_MAX) throw badRequest(`Destreza máxima é ${DEXTERITY_MAX}.`);
    throw new GameError(402, 'no-money', `Você precisa de R$ ${cost.toLocaleString('pt-BR')}.`);
  }
  return meView(await fresh(req.user.id));
}));

// Nerfar destreza de outro jogador (lvl 14+, R$1.000): tira 1 ponto da vítima
me.post('/nerf/:nick', handle(async (req) => {
  const lvl = levelOf(req.user).lvl;
  if (lvl < NERF_MIN_LEVEL) throw new GameError(403, 'locked', `Nerfar libera no nível ${NERF_MIN_LEVEL} (Campeão).`);
  const victim = await prisma.user.findUnique({ where: { nickLower: String(req.params.nick).toLowerCase() } });
  if (!victim) throw notFound('Jogador não encontrado.');
  if (victim.id === req.user.id) throw badRequest('Você não pode nerfar a si mesmo.');
  if (levelOf(victim).lvl < NERF_MIN_LEVEL) throw badRequest('Só jogadores nível 14+ podem receber nerf.');
  if (victim.dexterity <= 0) throw badRequest('Esse jogador não tem destreza para perder.');
  await prisma.$transaction(async (tx) => {
    const paid = await tx.user.updateMany({ where: { id: req.user.id, money: { gte: MONEY.NERF_PRICE } }, data: { money: { decrement: MONEY.NERF_PRICE } } });
    if (paid.count === 0) throw new GameError(402, 'no-money', `Você precisa de R$ ${MONEY.NERF_PRICE.toLocaleString('pt-BR')}.`);
    await tx.user.updateMany({ where: { id: victim.id, dexterity: { gt: 0 } }, data: { dexterity: { decrement: 1 } } });
    await tx.nerf.create({ data: { fromUserId: req.user.id, toUserId: victim.id } });
    await tx.activity.create({ data: { userId: req.user.id, teamId: req.user.teamId, kind: 'AUTO', goal: false, text: `${req.user.nick} nerfou a destreza de ${victim.nick}!` } });
  });
  return { ok: true, me: meView(await fresh(req.user.id)), victim: publicView(await prisma.user.findUnique({ where: { id: victim.id }, include: { team: true } })) };
}));

// Ativar dias de VIP do banco (unidades ganhas em prêmios)
me.post('/activate-vip', handle(async (req) => {
  const days = Math.max(1, Math.floor(Number(req.body?.days || 1)));
  const u = await prisma.$transaction(async (tx) => {
    const res = await tx.user.updateMany({ where: { id: req.user.id, vipDays: { gte: days } }, data: { vipDays: { decrement: days } } });
    if (res.count === 0) throw badRequest('Você não tem unidades de VIP suficientes.');
    const cur = await tx.user.findUnique({ where: { id: req.user.id } });
    const base = cur.vipUntil && cur.vipUntil > new Date() ? cur.vipUntil.getTime() : Date.now();
    return tx.user.update({ where: { id: req.user.id }, data: { vipUntil: new Date(base + days * 86_400_000) }, include: { team: true } });
  });
  return meView(u);
}));

me.post('/change-team', handle(async (req) => {
  const team = await prisma.team.findUnique({ where: { slug: String(req.body?.teamSlug || '') } });
  if (!team) throw badRequest('Time inválido.');
  if (team.id === req.user.teamId) throw badRequest('Você já é desse time.');
  // Movimentação: zera contadores de rodada (gols já feitos ficam com o time antigo)
  const u = await prisma.user.update({ where: { id: req.user.id }, data: { teamId: team.id, goalsRound: 0, roundId: null }, include: { team: true } });
  await prisma.activity.create({ data: { userId: u.id, teamId: team.id, kind: 'AUTO', goal: false, text: `${u.nick} agora joga pelo ${team.name}.` } });
  return meView(u);
}));
