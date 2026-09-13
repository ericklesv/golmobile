/**
 * Loja — compra de itens (Energia, Boost Auto, Caneleira, chuteiras), troca e cor
 * do nick. Catálogo/efeitos em lib/items.js; o que o jogador tem em UserItem;
 * toda compra vai para ShopLog. Tudo em transação; o débito é atômico (updateMany
 * com `money >= preço`), como o resto do jogo.
 */
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { levelOf } from '../lib/rules.js';
import {
  ITEM_BY_KEY, ENERGY_MAX_LEVEL, ENERGY_PRICES, NICK_COLORS, NICK_RULE, NICK_COLOR_MIN_LEVEL,
  activeItemsWhere, itemsView, catalogView, energyLevel, meInclude,
} from '../lib/items.js';
import { meView } from './view.js';

const fmt = (n) => `R$ ${n.toLocaleString('pt-BR')}`;

/** Cobra `price` na moeda escolhida (dinheiro ou unidades de VIP). Lança 402 se não der. */
async function charge(tx, userId, price, currency) {
  if (price <= 0) return;
  const field = currency === 'vip' ? 'vipDays' : 'money';
  const res = await tx.user.updateMany({ where: { id: userId, [field]: { gte: price } }, data: { [field]: { decrement: price } } });
  if (res.count === 0) {
    throw new GameError(402, 'no-money', currency === 'vip' ? `Você precisa de ${price} unidade(s) de VIP.` : `Você precisa de ${fmt(price)}.`);
  }
}

async function log(tx, userId, itemKey, price, currency) {
  await tx.shopLog.create({ data: { userId, itemKey, price, currency } });
}

async function freshMe(tx, userId) {
  return tx.user.findUnique({ where: { id: userId }, include: meInclude() });
}

/** Catálogo + meus itens + histórico recente. */
export async function shopView(userId) {
  const now = new Date();
  const [user, history] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { items: activeItemsWhere(now) } }),
    prisma.shopLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  return {
    catalog: catalogView(),
    items: itemsView(user, now.getTime()),
    nickColor: user.nickColor ?? null,
    energyLevel: energyLevel(user, now.getTime()),
    level: levelOf(user).lvl,
    history: history.map((h) => ({ key: h.itemKey, name: ITEM_BY_KEY[h.itemKey]?.name ?? h.itemKey, price: h.price, currency: h.currency, at: h.createdAt.getTime() })),
    serverTime: now.getTime(),
  };
}

/** Compra um item do catálogo (boost ou chuteira). Retorna { me, item }. */
export async function buy(userId, key, currency = 'money') {
  const def = ITEM_BY_KEY[String(key || '')];
  if (!def || def.kind === 'service') throw badRequest('Item inválido.');
  if (!['money', 'vip'].includes(currency)) throw badRequest('Moeda inválida.');
  if (currency === 'vip' && !def.priceVip) throw badRequest('Esse item não é vendido por VIP.');

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const user = await tx.user.findUnique({ where: { id: userId }, include: { items: activeItemsWhere(now) } });
    const active = user.items;
    let created;

    if (def.key === 'ENERGY') {
      // Nível seguinte só com o anterior ativo; no máximo, a compra renova as 28 h.
      const cur = active.find((i) => i.itemKey === 'ENERGY') || null;
      const level = cur ? Math.min(ENERGY_MAX_LEVEL, cur.level + 1) : 1;
      const price = ENERGY_PRICES[level];
      await charge(tx, userId, price, 'money');
      const expiresAt = new Date(now.getTime() + def.durationMs);
      created = cur
        ? await tx.userItem.update({ where: { id: cur.id }, data: { level, expiresAt } })
        : await tx.userItem.create({ data: { userId, itemKey: 'ENERGY', level, expiresAt } });
      await log(tx, userId, 'ENERGY', price, 'money');
    } else if (def.kind === 'boost') {
      const cur = active.find((i) => i.itemKey === def.key) || null;
      if (def.single && cur) throw badRequest(`Você já tem ${def.name} ativa.`);
      const price = currency === 'vip' ? def.priceVip : def.price;
      await charge(tx, userId, price, currency);
      // Boost Auto: comprar de novo soma 28 h ao que ainda falta.
      const base = cur ? Math.max(now.getTime(), new Date(cur.expiresAt).getTime()) : now.getTime();
      const expiresAt = new Date(base + def.durationMs);
      created = cur
        ? await tx.userItem.update({ where: { id: cur.id }, data: { expiresAt } })
        : await tx.userItem.create({ data: { userId, itemKey: def.key, expiresAt } });
      await log(tx, userId, def.key, price, currency);
    } else if (def.kind === 'boot') {
      const cur = active.find((i) => i.itemKey === def.key) || null;
      await charge(tx, userId, def.price, 'money');
      // Comprar a mesma chuteira soma 30 dias; a nova chuteira já vem equipada (só uma).
      const base = cur ? Math.max(now.getTime(), new Date(cur.expiresAt).getTime()) : now.getTime();
      const expiresAt = new Date(base + def.durationMs);
      await tx.userItem.updateMany({ where: { userId, equipped: true }, data: { equipped: false } });
      created = cur
        ? await tx.userItem.update({ where: { id: cur.id }, data: { expiresAt, equipped: true } })
        : await tx.userItem.create({ data: { userId, itemKey: def.key, expiresAt, equipped: true } });
      await log(tx, userId, def.key, def.price, 'money');
    }
    return { me: meView(await freshMe(tx, userId), now.getTime()), item: { id: created.id, key: created.itemKey, level: created.level, expiresAt: created.expiresAt.getTime() } };
  });
}

/** Equipa uma chuteira que o jogador tem (desequipa as outras). */
export async function equip(userId, key) {
  const def = ITEM_BY_KEY[String(key || '')];
  if (!def || def.kind !== 'boot') throw badRequest('Só chuteiras podem ser equipadas.');
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const it = await tx.userItem.findFirst({ where: { userId, itemKey: def.key, usedAt: null, expiresAt: { gt: now } } });
    if (!it) throw badRequest(`Você não tem ${def.name} válida.`);
    await tx.userItem.updateMany({ where: { userId, equipped: true }, data: { equipped: false } });
    await tx.userItem.update({ where: { id: it.id }, data: { equipped: true } });
    return meView(await freshMe(tx, userId), now.getTime());
  });
}

/** Troca de nick (paga). Valida formato e unicidade; atualiza nick e nickLower. */
export async function changeNick(userId, nick) {
  const def = ITEM_BY_KEY.NICK_CHANGE;
  const clean = String(nick || '').trim();
  if (!NICK_RULE.test(clean)) throw badRequest('Nick: 3 a 14 caracteres (letras, números, _ . -).');
  const nickLower = clean.toLowerCase();
  return prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: userId } });
    if (me.nickLower === nickLower && me.nick === clean) throw badRequest('Esse já é o seu nick.');
    const clash = await tx.user.findUnique({ where: { nickLower } });
    if (clash && clash.id !== userId) throw new GameError(409, 'taken', 'Esse nick já está em uso.');
    await charge(tx, userId, def.price, 'money');
    await tx.user.update({ where: { id: userId }, data: { nick: clean, nickLower } });
    await log(tx, userId, 'NICK_CHANGE', def.price, 'money');
    await tx.activity.create({ data: { userId, teamId: me.teamId, kind: 'AUTO', goal: false, text: `${me.nick} agora se chama ${clean}.` } });
    return meView(await freshMe(tx, userId));
  });
}

/** Cor do nick (paga; nível 8+). `color` = chave da paleta, ou null para voltar ao padrão (grátis). */
export async function changeNickColor(userId, color) {
  const def = ITEM_BY_KEY.NICK_COLOR;
  const key = color == null || color === '' ? null : String(color);
  if (key && !NICK_COLORS.some((c) => c.key === key)) throw badRequest('Cor inválida.');
  return prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: userId } });
    if (key && levelOf(me).lvl < NICK_COLOR_MIN_LEVEL) throw new GameError(403, 'locked', `Cor do nick libera no nível ${NICK_COLOR_MIN_LEVEL} (Titular).`);
    if ((me.nickColor ?? null) === key) throw badRequest('Essa já é a cor do seu nick.');
    if (key) {
      await charge(tx, userId, def.price, 'money');
      await log(tx, userId, 'NICK_COLOR', def.price, 'money');
    }
    await tx.user.update({ where: { id: userId }, data: { nickColor: key } });
    return meView(await freshMe(tx, userId));
  });
}
