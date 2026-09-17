import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { handle, GameError, notFound, badRequest, inteiro } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { meView, publicView, teamView } from '../services/view.js';
import { liveMatchForTeam } from '../services/league.js';
import { MONEY, isVip } from '../lib/rules.js';
import { meInclude, parseNickFade } from '../lib/items.js';
import { captchaRequired } from '../lib/captcha.js';
import { clientIp } from '../lib/ip.js';
import { deviceData } from '../lib/device.js';
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
  const qtd = inteiro(req.body?.qtd, { min: 1, max: 1000, campo: 'número de VIPs' });
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
  await prisma.user.update({ where: { id: req.user.id }, data: { lastSeenAt: new Date(), lastIp: clientIp(req), lastIpAt: new Date(), ...deviceData(req) } }); // + último aparelho (lib/device.js)
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

// A DESTREZA ACABOU em 16/09/2026 (virou habilidade — services/skills.js; o dinheiro de quem tinha foi devolvido).
// O endereço continua respondendo para o site antigo em cache não quebrar feio.
me.post('/buy-dexterity', handle(async () => {
  throw new GameError(410, 'destreza-off', 'A destreza acabou: agora o acerto sobe pelas habilidades Pontaria e Chute, na Loja. O dinheiro que você gastou em destreza já voltou para a sua conta.');
}));

// NERF DESLIGADO em 16/09/2026 (dono): ele tirava destreza, que acabou. O que vem no lugar (nerf temporário ou
// o "Secar" do BRGOL) o dono decide depois.
me.post('/nerf/:nick', handle(async () => {
  throw new GameError(410, 'nerf-off', 'O nerf está desligado por enquanto: ele tirava destreza, que acabou.');
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
  const days = inteiro(req.body?.days, { min: 1, max: 100_000, campo: 'número de dias' });
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
