/**
 * Habilidades do jogador (catálogo e números em `SKILLS`/`SKILL_COST` de rules.js). Quatro, na ordem em que o
 * dono desenhou a evolução (17/09/2026): **Recarga** (tira 30 s do chute direto, do pênalti e da falta, até o
 * piso de 4:30), **Pontaria** (acerto do pênalti, até 90%), **Chute** (acerto da falta, até 80%) e **Sorte**
 * (chance de vir chute de prata/ouro, de 3% a 10%).
 *
 * **Cada nível custa 1 ponto de nível — e só isso.** Dinheiro e VIP saíram em 17/09/2026 por decisão do dono:
 * "upar as habilidades só com ponto de nível, temos que dar mais valor a upada de nível… achei tosco poder
 * passar de nível comprando com vip ou ouro, tira a magia que é passar de nível". Quem já tinha comprado nível
 * com dinheiro/VIP ficou com ele (foi pago); só o teto mudou (Pontaria e Chute de 10 para 9 níveis, com o
 * ponto devolvido na migração 0039).
 * A destreza acabou junto (não soma mais no acerto; o dinheiro foi devolvido em scripts/devolver-destreza.js).
 */
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { SKILL_BY_KEY, SKILL_FIELD, SKILL_COST, levelOf, skillPointsLeft } from '../lib/rules.js';
import { meInclude } from '../lib/items.js';
import { meView } from './view.js';

/**
 * Sobe 1 nível de uma habilidade, pagando com ponto de nível. Tudo numa transação e a trava é a mesma de
 * antes (`skillPoints` = níveis já pagos com ponto): ninguém sobe dois níveis com o mesmo ponto.
 */
export async function buySkill(userId, key, currency = 'point') {
  const def = SKILL_BY_KEY[String(key || '')];
  if (!def) throw badRequest('Habilidade inválida.');
  if (currency && currency !== 'point') throw badRequest('Habilidade agora sobe só com ponto de nível.');
  const field = SKILL_FIELD[def.key];
  return prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: userId } });
    const level = me[field] ?? 0;
    if (level >= def.max) throw badRequest(`${def.name} já está no nível ${def.max}.`);
    const left = skillPointsLeft(me);
    if (left < SKILL_COST.point) throw new GameError(402, 'no-points', `Você não tem ponto de nível sobrando. Suba de nível: cada nível dá 1 ponto (você está no ${levelOf(me).lvl}).`);
    await tx.user.update({ where: { id: userId }, data: { [field]: { increment: 1 }, skillPoints: { increment: SKILL_COST.point } } });
    await tx.shopLog.create({ data: { userId, itemKey: `SKILL_${def.key}`, price: SKILL_COST.point, currency: 'point' } });
    const fresh = await tx.user.findUnique({ where: { id: userId }, include: meInclude() });
    return { me: meView(fresh) };
  });
}
