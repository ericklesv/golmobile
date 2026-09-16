/**
 * Habilidades do jogador (dono, 16/09/2026, no modelo do BRGOL 2.0; catálogo e números em `SKILLS`/`SKILL_COST`
 * de rules.js). Duas por enquanto: **Pontaria** (acerto do pênalti) e **Chute** (acerto da falta), 10 níveis cada.
 * Cada nível custa **1 ponto de nível, R$ 25 mil OU 1 VIP do banco** — o jogador escolhe na Loja. Cada nível do
 * jogador dá 1 ponto (`skillPointsLeft` = nível − `User.skillPoints`), então subir de nível voltou a valer a pena
 * (era a reclamação: "nível só diminui o tempo da Trilha").
 * A destreza acabou junto (não soma mais no acerto; o dinheiro foi devolvido em scripts/devolver-destreza.js).
 */
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { SKILL_BY_KEY, SKILL_FIELD, SKILL_COST, levelOf, skillPointsLeft } from '../lib/rules.js';
import { meInclude } from '../lib/items.js';
import { meView } from './view.js';

const fmt = (n) => `R$ ${n.toLocaleString('pt-BR')}`;

/**
 * Sobe 1 nível de uma habilidade. `currency`: 'point' (ponto de nível), 'money' (R$) ou 'vip' (banco de VIPs).
 * Tudo numa transação, com o débito atômico (como o resto da loja): ninguém sobe dois níveis com o mesmo dinheiro.
 */
export async function buySkill(userId, key, currency = 'point') {
  const def = SKILL_BY_KEY[String(key || '')];
  if (!def) throw badRequest('Habilidade inválida.');
  if (!['point', 'money', 'vip'].includes(currency)) throw badRequest('Escolha como pagar: ponto, dinheiro ou VIP.');
  const field = SKILL_FIELD[def.key];
  return prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: userId } });
    const level = me[field] ?? 0;
    if (level >= def.max) throw badRequest(`${def.name} já está no nível ${def.max}.`);
    const data = { [field]: { increment: 1 } };
    if (currency === 'point') {
      // pontos vêm do nível: trava por `skillPoints` (quantos níveis já foram pagos com ponto)
      const left = skillPointsLeft(me);
      if (left < SKILL_COST.point) throw new GameError(402, 'no-points', `Você não tem ponto de nível sobrando. Suba de nível: cada nível dá 1 ponto (você está no ${levelOf(me).lvl}).`);
      data.skillPoints = { increment: SKILL_COST.point };
    } else if (currency === 'money') {
      const paid = await tx.user.updateMany({ where: { id: userId, money: { gte: SKILL_COST.money } }, data: { money: { decrement: SKILL_COST.money } } });
      if (!paid.count) throw new GameError(402, 'no-money', `Você precisa de ${fmt(SKILL_COST.money)} para subir ${def.name}.`);
    } else {
      const paid = await tx.user.updateMany({ where: { id: userId, vipDays: { gte: SKILL_COST.vip } }, data: { vipDays: { decrement: SKILL_COST.vip } } });
      if (!paid.count) throw new GameError(402, 'no-vip', `Você precisa de ${SKILL_COST.vip} VIP guardado para subir ${def.name}.`);
    }
    await tx.user.update({ where: { id: userId }, data });
    await tx.shopLog.create({ data: { userId, itemKey: `SKILL_${def.key}`, price: currency === 'point' ? SKILL_COST.point : currency === 'vip' ? SKILL_COST.vip : SKILL_COST.money, currency } });
    const fresh = await tx.user.findUnique({ where: { id: userId }, include: meInclude() });
    return { me: meView(fresh) };
  });
}
