/**
 * Convites — link de afiliado (decisão do dono, 14/09/2026; marcos em REFERRAL, rules.js).
 *
 * - Cada jogador tem um código fixo (User.refCode, criado na 1ª vez que ele abre o convite): o link é
 *   <site>/convite/<código>. Não usa o nick — nick pode ser trocado e o link não pode mudar de dono.
 * - Quem cria conta pelo link vira convidado (User.referredById) — só no cadastro. Conta criada na MESMA
 *   internet (IP) de quem convidou não vira convidado: é o jeito de criar conta falsa para ganhar VIP.
 * - `referralSweep` (scheduler, a cada 2 min) paga os marcos que o convidado já passou (gols da carreira):
 *   o VIP vai para o banco de VIPs de quem convidou E, desde 15/09/2026 (decisão do dono), também para o
 *   CONVIDADO (mesmos marcos e valores). A linha de ReferralReward é criada na mesma transação do crédito,
 *   com @@unique([referredId, milestone, side]) — cada marco paga uma vez só para cada lado (quem já tinha
 *   marco pago só para quem convidou recebe o dele na próxima varredura). Os dois recebem mensagem na caixa.
 *   Enquanto os dois jogam na mesma internet, ou um deles está suspenso, o marco ESPERA.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { notFound } from '../lib/errors.js';
import { REFERRAL } from '../lib/rules.js';
import { teamView } from './view.js';
import { notify } from './inbox.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, que confundem ao ditar o código
const LAST = REFERRAL.milestones[REFERRAL.milestones.length - 1].goals;
const PER_FRIEND = REFERRAL.milestones.reduce((a, m) => a + m.vip, 0);
const banned = (u, now = Date.now()) => !!(u?.bannedUntil && u.bannedUntil.getTime() > now);
const sameNet = (a, b) => !!(a?.lastIp && b?.lastIp && a.lastIp === b.lastIp);
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const normCode = (c) => String(c ?? '').trim().toUpperCase().slice(0, 16);

/** Código do jogador (cria na primeira vez; o @unique resolve a rara colisão tentando outro). */
async function ensureCode(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { refCode: true } });
  if (u.refCode) return u.refCode;
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    try {
      const r = await prisma.user.updateMany({ where: { id: userId, refCode: null }, data: { refCode: code } });
      if (r.count) return code;
      return (await prisma.user.findUnique({ where: { id: userId }, select: { refCode: true } })).refCode; // outro pedido criou antes
    } catch (e) { if (e?.code !== 'P2002') throw e; }
  }
  throw new Error('não deu para criar o código de convite');
}

const nextOf = (goals) => REFERRAL.milestones.find((m) => m.goals > goals) ?? null;

/** Tela de convite do jogador: código, marcos, convidados com o progresso e o VIP já ganho. */
export async function myReferral(userId) {
  const code = await ensureCode(userId);
  const [invited, count, sum] = await Promise.all([
    prisma.user.findMany({
      where: { referredById: userId }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { nick: true, avatarUrl: true, goalsTotal: true, createdAt: true, team: true, refRewards: { where: { side: 'REFERRER' }, select: { vip: true } } },
    }),
    prisma.user.count({ where: { referredById: userId } }),
    prisma.referralReward.aggregate({ where: { referrerId: userId, side: 'REFERRER' }, _sum: { vip: true } }),
  ]);
  // eu entrei pelo convite de alguém? (o convidado também ganha nos marcos)
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { goalsTotal: true, referredBy: { select: { nick: true } }, refRewards: { where: { side: 'REFERRED' }, select: { vip: true } } } });
  return {
    code, milestones: REFERRAL.milestones, perFriend: PER_FRIEND,
    count, earned: sum._sum.vip ?? 0,
    invited: invited.map((u) => ({
      nick: u.nick, avatarUrl: u.avatarUrl ?? null, team: teamView(u.team), goals: u.goalsTotal, since: u.createdAt.getTime(),
      earned: u.refRewards.reduce((a, r) => a + r.vip, 0), next: nextOf(u.goalsTotal),
    })),
    invitee: me?.referredBy ? { by: me.referredBy.nick, earned: me.refRewards.reduce((a, r) => a + r.vip, 0), next: nextOf(me.goalsTotal) } : null,
  };
}

/** Quem convidou (tela de cadastro: "convite de fulano"). Público. */
export async function refLookup(code) {
  const u = await prisma.user.findUnique({ where: { refCode: normCode(code) }, select: { nick: true, avatarUrl: true, bannedUntil: true, team: true } });
  if (!u || banned(u)) throw notFound('Convite não encontrado.');
  return { nick: u.nick, avatarUrl: u.avatarUrl ?? null, team: teamView(u.team), perFriend: PER_FRIEND };
}

/** No cadastro: liga a conta nova a quem convidou (se o código vale e não é a mesma internet). */
export async function attachReferral(userId, code, ip) {
  if (!code) return null;
  const ref = await prisma.user.findUnique({ where: { refCode: normCode(code) }, select: { id: true, nick: true, lastIp: true, bannedUntil: true } });
  if (!ref || ref.id === userId || banned(ref)) return null;
  if (ref.lastIp && ip && ref.lastIp === ip) {
    console.log(`[convite] conta nova ${userId} pelo link de ${ref.nick} na MESMA internet — não vira convidado`);
    return null;
  }
  await prisma.user.update({ where: { id: userId }, data: { referredById: ref.id } });
  return ref.nick;
}

/** Paga os marcos que os convidados já passaram (scheduler). Devolve quantos marcos pagou. */
export async function referralSweep(now = Date.now()) {
  const users = await prisma.user.findMany({
    where: {
      referredById: { not: null }, goalsTotal: { gte: REFERRAL.milestones[0].goals },
      OR: [{ refRewards: { none: { milestone: LAST, side: 'REFERRER' } } }, { refRewards: { none: { milestone: LAST, side: 'REFERRED' } } }],
    },
    select: {
      id: true, nick: true, goalsTotal: true, lastIp: true, bannedUntil: true, referredById: true,
      referredBy: { select: { id: true, nick: true, lastIp: true, bannedUntil: true } },
      refRewards: { select: { milestone: true, side: true } },
    },
    take: 1000,
  });
  let paid = 0;
  for (const u of users) {
    if (!u.referredBy) continue;
    if (banned(u, now) || banned(u.referredBy, now) || sameNet(u, u.referredBy)) continue; // espera
    const done = new Set(u.refRewards.map((r) => `${r.milestone}:${r.side}`));
    for (const m of REFERRAL.milestones.filter((x) => x.goals <= u.goalsTotal)) {
      for (const side of ['REFERRER', 'REFERRED']) {
        if (done.has(`${m.goals}:${side}`)) continue;
        const to = side === 'REFERRER' ? u.referredBy.id : u.id;
        try {
          await prisma.$transaction(async (tx) => {
            await tx.referralReward.create({ data: { referrerId: u.referredBy.id, referredId: u.id, milestone: m.goals, vip: m.vip, side } });
            await tx.user.update({ where: { id: to }, data: { vipDays: { increment: m.vip } } });
            await (side === 'REFERRER'
              ? notify.referralInviter(to, { friend: u.nick, goals: m.goals, vip: m.vip }, tx)
              : notify.referralInvitee(to, { inviter: u.referredBy.nick, goals: m.goals, vip: m.vip }, tx)).catch((e) => console.error('[inbox] convite:', e.message));
          });
          paid++;
          console.log(`[convite] ${side === 'REFERRER' ? u.referredBy.nick : u.nick} ganhou ${m.vip} VIP: o convidado ${u.nick} chegou a ${m.goals} gols`);
        } catch (e) { if (e?.code !== 'P2002') throw e; }
      }
    }
  }
  return paid;
}
