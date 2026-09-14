/**
 * Presença da Semana — login diário (decisões do dono, 13/09/2026; prêmios em LOGIN_PASS, rules.js).
 *
 * - Um resgate por dia do calendário de Brasília (vira à meia-noite). O dia seguinte ao último resgate
 *   continua a semana; pulou um dia (ou mais), volta ao dia 1 e as semanas seguidas zeram.
 * - Todo dia dá XP (levelBonus — nunca gol, que mexe na liga); VIP ativo ganha o dobro de XP.
 * - O VIP do 7º dia ATIVA NA HORA (soma em vipUntil, não vai para o banco vipDays): não dá para doar nem
 *   usar em proposta — conta falsa não junta VIP. Da 2ª semana seguida em diante, o 7º dia dá 2 VIP.
 * - A linha de LoginPass é criada ANTES dos prêmios, na mesma transação: o @@unique([userId, day]) faz o
 *   segundo toque ao mesmo tempo falhar e desfazer tudo — o prêmio do dia sai uma vez só.
 */
import { prisma } from '../prisma.js';
import { GameError } from '../lib/errors.js';
import { LOGIN_PASS, DEXTERITY_MAX, MONEY, isVip } from '../lib/rules.js';
import { ITEM_BY_KEY, activeItemsWhere } from '../lib/items.js';
import { calendarDay, nextMidnight } from '../lib/time.js';

const DAY_MS = 86_400_000;
const TOTAL = LOGIN_PASS.days.length;

/** Onde o jogador está: o passo de hoje (a resgatar ou já resgatado) e as semanas seguidas. */
async function position(userId, now) {
  const today = calendarDay(now);
  const last = await prisma.loginPass.findFirst({ where: { userId }, orderBy: { day: 'desc' } });
  if (last && last.day === today) return { today, claimed: true, step: last.step, week: last.week };
  if (!last || last.day !== today - 1) return { today, claimed: false, step: 1, week: 1, broken: !!last };
  return last.step >= TOTAL
    ? { today, claimed: false, step: 1, week: last.week + 1 } // fechou a semana ontem: começa a seguinte
    : { today, claimed: false, step: last.step + 1, week: last.week };
}

/** O prêmio de um dia do passe (XP já com o dobro do VIP). */
function rewardFor(step, week, vip) {
  const d = LOGIN_PASS.days[step - 1];
  const item = d.item ? ITEM_BY_KEY[d.item.key] : null;
  return {
    xp: d.xp * (vip ? LOGIN_PASS.vipXp : 1), baseXp: d.xp,
    money: d.money ?? 0,
    item: item ? { key: item.key, level: d.item.level ?? null, name: item.name, icon: item.icon, hours: Math.round(item.durationMs / 3_600_000) } : null,
    dexterity: d.dexterity ?? 0,
    vip: d.vip ? (week >= 2 ? LOGIN_PASS.streakVip : d.vip) : 0,
  };
}

export async function passState(userId, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { vipUntil: true } });
  const vip = isVip(user, now.getTime());
  const pos = await position(userId, now);
  const done = pos.claimed ? pos.step : pos.step - 1; // dias desta semana já resgatados
  return {
    today: pos.today, claimed: pos.claimed, step: pos.step, week: pos.week, vip, broken: !!pos.broken,
    nextAt: nextMidnight(now).getTime(), vipXp: LOGIN_PASS.vipXp, streakVip: LOGIN_PASS.streakVip,
    days: LOGIN_PASS.days.map((_, i) => ({ step: i + 1, done: i + 1 <= done, ...rewardFor(i + 1, pos.week, vip) })),
  };
}

/** Energia nunca rebaixa (nível maior ativo só ganha mais tempo); Boost Auto soma 28 h ao que falta. */
async function grantItem(tx, user, item, now) {
  const def = ITEM_BY_KEY[item.key];
  const cur = user.items.find((i) => i.itemKey === item.key) || null;
  if (item.key === 'ENERGY') {
    const level = Math.max(item.level ?? 1, cur?.level ?? 0);
    const expiresAt = new Date(Math.max(now.getTime() + def.durationMs, cur ? cur.expiresAt.getTime() : 0));
    return cur
      ? tx.userItem.update({ where: { id: cur.id }, data: { level, expiresAt } })
      : tx.userItem.create({ data: { userId: user.id, itemKey: 'ENERGY', level, expiresAt } });
  }
  const base = cur ? Math.max(now.getTime(), cur.expiresAt.getTime()) : now.getTime();
  const expiresAt = new Date(base + def.durationMs);
  return cur
    ? tx.userItem.update({ where: { id: cur.id }, data: { expiresAt } })
    : tx.userItem.create({ data: { userId: user.id, itemKey: item.key, expiresAt } });
}

export async function passClaim(userId, now = new Date()) {
  const pos = await position(userId, now);
  if (pos.claimed) throw new GameError(409, 'claimed', 'Você já resgatou o prêmio de hoje. Volte amanhã!');
  let reward;
  try {
    reward = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { items: activeItemsWhere(now) } });
      const r = rewardFor(pos.step, pos.week, isVip(user, now.getTime()));
      const data = { levelBonus: { increment: r.xp } };
      let money = r.money;
      if (r.dexterity) {
        if (user.dexterity + r.dexterity <= DEXTERITY_MAX) data.dexterity = { increment: r.dexterity };
        else { money += r.dexterity * MONEY.DEXTERITY_PRICE; r.dexterityAsMoney = r.dexterity * MONEY.DEXTERITY_PRICE; }
      }
      if (money) data.money = { increment: money };
      if (r.vip) {
        const base = user.vipUntil && user.vipUntil.getTime() > now.getTime() ? user.vipUntil.getTime() : now.getTime();
        data.vipUntil = new Date(base + r.vip * DAY_MS);
        r.vipUntil = data.vipUntil.getTime();
      }
      await tx.loginPass.create({ data: { userId, day: pos.today, step: pos.step, week: pos.week, reward: r } });
      await tx.user.update({ where: { id: userId }, data });
      if (r.item) await grantItem(tx, user, r.item, now);
      return r;
    });
  } catch (e) {
    if (e?.code === 'P2002') throw new GameError(409, 'claimed', 'Você já resgatou o prêmio de hoje. Volte amanhã!');
    throw e;
  }
  return { reward: { step: pos.step, week: pos.week, ...reward }, state: await passState(userId, now) };
}
