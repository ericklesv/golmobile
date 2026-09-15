import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { handle, GameError, notFound, badRequest } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { meView, publicView, teamView } from '../services/view.js';
import { liveMatchForTeam } from '../services/league.js';
import { MONEY, DEXTERITY_MAX, NERF_MIN_LEVEL, levelOf, isVip } from '../lib/rules.js';
import { meInclude, parseNickFade } from '../lib/items.js';
import { captchaRequired } from '../lib/captcha.js';
import { clientIp } from '../lib/ip.js';
import { pendingOffers } from '../services/club.js';
import { changeTeam } from '../services/shop.js';
import { unreadCount } from '../services/inbox.js';

export const me = Router();
me.use(requireAuth);

async function fresh(id) {
  return prisma.user.findUnique({ where: { id }, include: meInclude() });
}

me.get('/', handle(async (req) => {
  const u = await fresh(req.user.id);
  return { ...meView(u), captchaRequired: captchaRequired(u), unread: await unreadCount(u.id) }; // captcha dos chutes manuais (lib/captcha.js); mensagens não lidas
}));

// Troca VIP guardado por saldo (pedido do dono/erickles, 15/09/2026: "1 VIP por 100k"): MONEY.VIP_TO_MONEY por VIP.
me.post('/vip-to-money', handle(async (req) => {
  const qtd = Math.max(1, Math.min(1000, Math.floor(Number(req.body?.qtd || 1))));
  const u = await prisma.$transaction(async (tx) => {
    const res = await tx.user.updateMany({ where: { id: req.user.id, vipDays: { gte: qtd } }, data: { vipDays: { decrement: qtd }, money: { increment: qtd * MONEY.VIP_TO_MONEY } } });
    if (res.count === 0) throw badRequest('Você não tem VIP guardado suficiente.');
    await tx.shopLog.create({ data: { userId: req.user.id, itemKey: 'VIP_MONEY', price: qtd, currency: 'vip' } });
    return tx.user.findUnique({ where: { id: req.user.id }, include: meInclude() });
  });
  return { ...meView(u), money_added: qtd * MONEY.VIP_TO_MONEY };
}));

// Adversário da rodada atual (goleiro/barreira das cenas 3D vestem a camisa dele)
me.get('/opponent', handle(async (req) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { teamId: true } });
  const match = u ? await liveMatchForTeam(u.teamId) : null;
  const opp = match ? (match.homeTeamId === u.teamId ? match.awayTeam : match.homeTeam) : null;
  return { opponent: teamView(opp) };
}));

// Presença: o cliente chama a cada 60 s enquanto está aberto (necessário p/ auto-chute)
me.post('/heartbeat', handle(async (req) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { lastSeenAt: new Date(), lastIp: clientIp(req), lastIpAt: new Date() } });
  const online = await prisma.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 2 * 60_000) } } });
  const active = await prisma.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 24 * 3600_000) } } });
  const offers = await pendingOffers(req.user.id); // propostas de contratação abertas (selo na aba Time)
  const unread = await unreadCount(req.user.id); // mensagens não lidas (selo no envelope do topo)
  return { ok: true, online, active, offers, unread, serverTime: Date.now() };
}));

me.put('/bio', handle(async (req) => {
  const bio = z.string().max(400, 'Máximo de 400 caracteres.').parse(req.body?.bio ?? '');
  const u = await prisma.user.update({ where: { id: req.user.id }, data: { bio }, include: meInclude() });
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

// Nick em degradê (benefício do VIP): {from, to} = chaves de NICK_FADE_COLORS; {from: null} tira.
me.post('/nick-fade', handle(async (req) => {
  const from = req.body?.from ?? null, to = req.body?.to ?? null;
  let value = null;
  if (from !== null || to !== null) {
    if (!isVip(req.user)) throw new GameError(403, 'vip', 'O nick em degradê é um benefício do VIP. Ative seus dias de VIP para usar.');
    value = `${from}>${to ?? from}`;
    if (!parseNickFade(value)) throw badRequest('Escolha duas cores da paleta.');
  }
  const u = await prisma.user.update({ where: { id: req.user.id }, data: { nickFade: value }, include: meInclude() });
  return meView(u);
}));

// Ativar dias de VIP do banco (unidades ganhas em prêmios)
me.post('/activate-vip', handle(async (req) => {
  const days = Math.max(1, Math.floor(Number(req.body?.days || 1)));
  const u = await prisma.$transaction(async (tx) => {
    const res = await tx.user.updateMany({ where: { id: req.user.id, vipDays: { gte: days } }, data: { vipDays: { decrement: days } } });
    if (res.count === 0) throw badRequest('Você não tem unidades de VIP suficientes.');
    const cur = await tx.user.findUnique({ where: { id: req.user.id } });
    const base = cur.vipUntil && cur.vipUntil > new Date() ? cur.vipUntil.getTime() : Date.now();
    return tx.user.update({ where: { id: req.user.id }, data: { vipUntil: new Date(base + days * 86_400_000) }, include: meInclude() });
  });
  return meView(u);
}));

// Trocar de time é PAGO desde 15/09/2026 (item "Troca de time" da Loja: R$ 50 mil ou 1 VIP) — este endereço antigo
// cobra igual (services/shop.js changeTeam); nunca voltar a trocar de graça por aqui.
me.post('/change-team', handle((req) => changeTeam(req.user.id, req.body?.teamSlug, req.body?.currency || 'money')));
