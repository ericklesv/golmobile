/**
 * Diretoria e contratações (decisões do dono, 13/09/2026; números em CLUB, rules.js).
 *
 * - Presidente: time sem presidente → qualquer VIP do time que já marcou gol por ele assume. Presidente e
 *   Diretores perdem o cargo se saírem do time, ficarem 3 dias sem VIP, 3 dias sem entrar ou forem
 *   suspensos (`clubSweep`: no scheduler e antes de cada ação/tela).
 * - O Presidente nomeia até 2 Diretores (VIPs do time); os dois fazem propostas com o VIP do próprio banco.
 * - Proposta: o VIP sai do banco na hora (fica preso na proposta) e volta se ela não fechar — recusada,
 *   cancelada, vencida (48 h) ou quem propôs saiu da diretoria. Toda volta passa por `closeOffer`, que só
 *   muda a proposta de PENDING uma vez: o VIP nunca volta duas vezes.
 * - Aceitou: vai para o time, recebe o VIP e ganha contrato de 1 dia por VIP (não troca de time nem aceita
 *   outra proposta até acabar). As outras propostas abertas para ele são canceladas (o VIP volta).
 * - Doação: VIP guardado para colega do mesmo time. Contas na mesma internet (mesmo IP) não trocam VIP
 *   nem negociam entre si (conta falsa juntando VIP numa conta só).
 */
import { prisma } from '../prisma.js';
import { GameError, badRequest, notFound, forbidden } from '../lib/errors.js';
import { CLUB, isVip } from '../lib/rules.js';
import { teamView } from './view.js';
import { invalidateRoles } from './badges.js';

const DAY = 86_400_000;
const ROLE_NAME = { PRESIDENTE: 'Presidente', DIRETOR: 'Diretor' };

const banned = (u, now = Date.now()) => !!(u.bannedUntil && u.bannedUntil.getTime() > now);
const underContract = (u, now = Date.now()) => !!(u.contractUntil && u.contractUntil.getTime() > now);
const sameNet = (a, b) => !!(a.lastIp && b.lastIp && a.lastIp === b.lastIp);
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const byNick = (nick) => prisma.user.findUnique({ where: { nickLower: String(nick ?? '').trim().toLowerCase() }, include: { team: true, teamRole: true } });
const scoredFor = async (userId, teamId) => !!(await prisma.goal.findFirst({ where: { userId, teamId }, select: { id: true } }));
/** Cargo do jogador no time em que ele está (um cargo de time antigo ainda não varrido não conta). */
const roleIn = (u) => (u.teamRole && u.teamRole.teamId === u.teamId ? u.teamRole : null);

const userLite = (u, now = Date.now()) => ({
  id: u.id, nick: u.nick, avatarUrl: u.avatarUrl ?? null, gender: u.gender, vip: isVip(u, now),
  online: new Date(u.lastSeenAt).getTime() > now - 2 * 60_000,
});

/** Motivo para perder o cargo agora (ou null). */
function roleLost(role, user, now = Date.now()) {
  const limit = now - CLUB.roleLossDays * DAY;
  if (!user || user.teamId !== role.teamId) return 'saiu do time';
  if (banned(user, now)) return 'suspenso';
  if (!user.vipUntil || user.vipUntil.getTime() < limit) return `${CLUB.roleLossDays} dias sem VIP`;
  if (new Date(user.lastSeenAt).getTime() < limit) return `${CLUB.roleLossDays} dias sem entrar`;
  return null;
}

/** Encerra uma proposta aberta e devolve o VIP a quem propôs — só se ela ainda estava PENDING (uma vez). */
async function closeOffer(tx, offer, status) {
  const r = await tx.transferOffer.updateMany({ where: { id: offer.id, status: 'PENDING' }, data: { status, decidedAt: new Date() } });
  if (r.count === 1) await tx.user.update({ where: { id: offer.fromUserId }, data: { vipDays: { increment: offer.vip } } });
  return r.count === 1;
}

/** Tira o cargo do jogador e cancela as propostas abertas que ele fez (o VIP volta para ele). */
export async function leaveClub(tx, userId) {
  await tx.teamRole.deleteMany({ where: { userId } });
  const open = await tx.transferOffer.findMany({ where: { fromUserId: userId, status: 'PENDING' } });
  for (const o of open) await closeOffer(tx, o, 'CANCELED');
}

/**
 * Faxina: cargos perdidos, propostas vencidas e propostas de quem já não é dirigente do time delas.
 * Sem filtro = tudo (scheduler); com `teamId`/`userId` = só o que a tela/ação vai usar.
 */
export async function clubSweep({ teamId, userId } = {}) {
  const now = Date.now();
  const roles = await prisma.teamRole.findMany({ where: { ...(teamId ? { teamId } : {}), ...(userId ? { userId } : {}) }, include: { user: true } });
  let dropped = 0;
  for (const r of roles) {
    const why = roleLost(r, r.user, now);
    if (!why) continue;
    await prisma.$transaction(async (tx) => {
      if ((await tx.teamRole.deleteMany({ where: { id: r.id } })).count) await leaveClub(tx, r.userId);
    });
    dropped++;
    invalidateRoles();
    console.log(`[diretoria] ${r.user?.nick} perdeu o cargo de ${ROLE_NAME[r.role]} (${why})`);
  }
  const scope = userId ? { OR: [{ fromUserId: userId }, { toUserId: userId }] } : teamId ? { teamId } : {};
  const open = await prisma.transferOffer.findMany({ where: { status: 'PENDING', ...scope }, include: { fromUser: { include: { teamRole: true } } }, take: 500 });
  for (const o of open) {
    const r = o.fromUser.teamRole;
    if (o.expiresAt.getTime() <= now) await prisma.$transaction((tx) => closeOffer(tx, o, 'EXPIRED'));
    else if (!r || r.teamId !== o.teamId || o.fromUser.teamId !== o.teamId) await prisma.$transaction((tx) => closeOffer(tx, o, 'CANCELED'));
  }
  return dropped;
}

/** Diretoria de um time (pública): presidente, cadeiras de diretor (null = vaga) e movimentações. */
export async function boardView(teamId) {
  await clubSweep({ teamId });
  const now = Date.now();
  const [roles, moves] = await Promise.all([
    prisma.teamRole.findMany({ where: { teamId }, include: { user: true } }),
    prisma.transferOffer.findMany({
      where: { status: 'ACCEPTED', OR: [{ teamId }, { fromTeamId: teamId }] }, orderBy: { decidedAt: 'desc' }, take: 10,
      include: { toUser: true, team: true, fromTeam: true },
    }),
  ]);
  const seat = (slot) => {
    const r = roles.find((x) => x.slot === slot);
    return r ? { ...userLite(r.user, now), since: r.since.getTime() } : null;
  };
  return {
    president: seat(0),
    directors: Array.from({ length: CLUB.directors }, (_, i) => seat(i + 1)),
    moves: moves.map((m) => ({
      id: m.id, nick: m.toUser.nick, avatarUrl: m.toUser.avatarUrl ?? null, vip: m.vip, at: m.decidedAt.getTime(),
      arrived: m.teamId === teamId, team: teamView(m.team), fromTeam: teamView(m.fromTeam),
    })),
  };
}

/** Por que o jogador não pode assumir a presidência (null = pode). */
async function claimBlock(me, hasPresident) {
  if (hasPresident) return 'O time já tem presidente.';
  if (banned(me)) return 'Jogador suspenso não pode ter cargo.';
  if (!isVip(me)) return 'Só VIP pode ser presidente. Ative seu VIP para assumir.';
  if (!(await scoredFor(me.id, me.teamId))) return `Marque pelo menos 1 gol pelo ${me.team.name} para assumir.`;
  return null;
}

const receivedView = (o) => ({
  id: o.id, team: teamView(o.team), vip: o.vip, days: o.vip, message: o.message,
  from: { nick: o.fromUser.nick, avatarUrl: o.fromUser.avatarUrl ?? null, role: o.fromUser.teamRole?.role ?? null },
  expiresAt: o.expiresAt.getTime(), createdAt: o.createdAt.getTime(),
});
const sentView = (o) => ({
  id: o.id, vip: o.vip, message: o.message, status: o.status, expiresAt: o.expiresAt.getTime(),
  decidedAt: o.decidedAt ? o.decidedAt.getTime() : null, createdAt: o.createdAt.getTime(),
  to: { nick: o.toUser.nick, avatarUrl: o.toUser.avatarUrl ?? null, team: teamView(o.toUser.team) },
});

/** Tudo do jogador: cargo, diretoria do time, contrato, propostas recebidas/enviadas e VIP recebido. */
export async function clubState(userId) {
  invalidateRoles(); // toda ação da diretoria termina aqui: o P/D do ranking atualiza na hora
  await clubSweep({ userId });
  const now = Date.now();
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { team: true, teamRole: true } });
  const board = await boardView(me.teamId);
  const role = roleIn(me)?.role ?? null;
  const [received, sent, gifts] = await Promise.all([
    prisma.transferOffer.findMany({ where: { toUserId: userId, status: 'PENDING', expiresAt: { gt: new Date(now) } }, orderBy: { id: 'desc' }, include: { team: true, fromUser: { include: { teamRole: true } } } }),
    prisma.transferOffer.findMany({ where: { fromUserId: userId }, orderBy: { id: 'desc' }, take: 15, include: { toUser: { include: { team: true } } } }),
    prisma.vipGift.findMany({ where: { toUserId: userId, createdAt: { gt: new Date(now - 7 * DAY) } }, orderBy: { id: 'desc' }, take: 5, include: { fromUser: true } }),
  ]);
  const block = role === 'PRESIDENTE' ? 'Você já é o presidente.' : await claimBlock(me, !!board.president);
  return {
    team: teamView(me.team), role, board,
    claim: { ok: !block, reason: block },
    contract: underContract(me, now) ? { until: me.contractUntil.getTime() } : null,
    bank: me.vipDays,
    rules: { offerMin: CLUB.offerMin, offerMax: CLUB.offerMax, offerHours: CLUB.offerHours, directors: CLUB.directors, roleLossDays: CLUB.roleLossDays, messageMax: CLUB.messageMax },
    received: received.map(receivedView),
    sent: sent.map(sentView),
    gifts: gifts.map((g) => ({ id: g.id, nick: g.fromUser.nick, days: g.days, at: g.createdAt.getTime() })),
  };
}

/** Propostas abertas para o jogador (selo na aba Time; vem no heartbeat). */
export const pendingOffers = (userId) => prisma.transferOffer.count({ where: { toUserId: userId, status: 'PENDING', expiresAt: { gt: new Date() } } });

/** Cargo e contrato para o perfil público. */
export async function playerClub(user) {
  const r = await prisma.teamRole.findUnique({ where: { userId: user.id } });
  return { role: r && r.teamId === user.teamId ? r.role : null, contractUntil: underContract(user) ? user.contractUntil.getTime() : null };
}

// ─── Cargos ─────────────────────────────────────────────────────────────────
const activity = (tx, userId, teamId, text) => tx.activity.create({ data: { userId, teamId, kind: 'AUTO', goal: false, text } });
const taken = (e, msg) => { if (e?.code === 'P2002') throw new GameError(409, 'taken', msg); throw e; };

export async function claimPresidency(userId) {
  await clubSweep({ userId });
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { team: true, teamRole: true } });
  await clubSweep({ teamId: me.teamId });
  const pres = await prisma.teamRole.findUnique({ where: { teamId_slot: { teamId: me.teamId, slot: 0 } } });
  if (pres?.userId === userId) throw badRequest('Você já é o presidente.');
  const block = await claimBlock(me, !!pres);
  if (block) throw new GameError(403, 'cant-claim', block);
  await prisma.$transaction(async (tx) => {
    await tx.teamRole.deleteMany({ where: { userId } }); // era diretor: vira presidente (as propostas dele seguem valendo)
    await tx.teamRole.create({ data: { teamId: me.teamId, userId, role: 'PRESIDENTE', slot: 0 } });
    await activity(tx, userId, me.teamId, `${me.nick} é ${me.gender === 'F' ? 'a nova presidente' : 'o novo presidente'} do ${me.team.name}!`);
  }).catch((e) => taken(e, 'Outro jogador assumiu a presidência antes de você.'));
  return clubState(userId);
}

export async function resign(userId) {
  if (!(await prisma.teamRole.findUnique({ where: { userId } }))) throw badRequest('Você não tem cargo no time.');
  await prisma.$transaction((tx) => leaveClub(tx, userId));
  return clubState(userId);
}

async function requirePresident(userId) {
  await clubSweep({ userId });
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { team: true, teamRole: true } });
  if (roleIn(me)?.role !== 'PRESIDENTE') throw forbidden('Só o presidente do time pode fazer isso.');
  return me;
}

async function teammate(me, nick) {
  const u = await byNick(nick);
  if (!u) throw notFound('Jogador não encontrado.');
  if (u.id === me.id) throw badRequest('Escolha outro jogador.');
  if (u.teamId !== me.teamId) throw badRequest(`${u.nick} não joga no ${me.team.name}.`);
  if (banned(u)) throw badRequest('Jogador suspenso não pode ter cargo.');
  return u;
}

/** VIPs do time sem cargo (lista para nomear diretor). */
export async function candidates(userId) {
  const me = await requirePresident(userId);
  const now = new Date();
  const list = await prisma.user.findMany({
    where: { teamId: me.teamId, id: { not: userId }, vipUntil: { gt: now }, teamRole: { is: null }, OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
    orderBy: [{ goalsSeason: 'desc' }, { goalsTotal: 'desc' }], take: 30,
  });
  return list.map((u) => ({ ...userLite(u, now.getTime()), goalsTotal: u.goalsTotal }));
}

export async function appointDirector(userId, nick) {
  const me = await requirePresident(userId);
  const u = await teammate(me, nick);
  if (u.teamRole) throw badRequest(`${u.nick} já tem cargo no time.`);
  if (!isVip(u)) throw badRequest(`Só VIP pode ser diretor, e ${u.nick} está sem VIP ativo.`);
  const used = (await prisma.teamRole.findMany({ where: { teamId: me.teamId, slot: { gt: 0 } } })).map((r) => r.slot);
  const slot = Array.from({ length: CLUB.directors }, (_, i) => i + 1).find((s) => !used.includes(s));
  if (!slot) throw new GameError(409, 'full', `O time já tem ${CLUB.directors} diretores. Remova um para nomear outro.`);
  await prisma.$transaction(async (tx) => {
    await tx.teamRole.create({ data: { teamId: me.teamId, userId: u.id, role: 'DIRETOR', slot } });
    await activity(tx, u.id, me.teamId, `${me.nick} nomeou ${u.nick} ${u.gender === 'F' ? 'diretora' : 'diretor'} do ${me.team.name}.`);
  }).catch((e) => taken(e, 'A diretoria mudou agora mesmo. Tente de novo.'));
  return clubState(userId);
}

export async function removeDirector(userId, nick) {
  const me = await requirePresident(userId);
  const r = await prisma.teamRole.findFirst({ where: { teamId: me.teamId, role: 'DIRETOR', user: { nickLower: String(nick ?? '').trim().toLowerCase() } } });
  if (!r) throw notFound('Esse jogador não é diretor do time.');
  await prisma.$transaction((tx) => leaveClub(tx, r.userId));
  return clubState(userId);
}

export async function passPresidency(userId, nick) {
  const me = await requirePresident(userId);
  const u = await teammate(me, nick);
  if (!isVip(u)) throw badRequest(`Só VIP pode ser presidente, e ${u.nick} está sem VIP ativo.`);
  if (!(await scoredFor(u.id, me.teamId))) throw badRequest(`${u.nick} ainda não marcou gol pelo ${me.team.name}.`);
  await prisma.$transaction(async (tx) => {
    await leaveClub(tx, userId); // quem passa sai da diretoria (as propostas dele voltam)
    await tx.teamRole.deleteMany({ where: { userId: u.id } }); // se era diretor, vira presidente
    await tx.teamRole.create({ data: { teamId: me.teamId, userId: u.id, role: 'PRESIDENTE', slot: 0 } });
    await activity(tx, u.id, me.teamId, `${me.nick} passou a presidência do ${me.team.name} para ${u.nick}.`);
  }).catch((e) => taken(e, 'A diretoria mudou agora mesmo. Tente de novo.'));
  return clubState(userId);
}

// ─── Propostas ──────────────────────────────────────────────────────────────
export async function makeOffer(userId, nick, vip, message) {
  await clubSweep({ userId });
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { team: true, teamRole: true } });
  if (!roleIn(me)) throw forbidden('Só o presidente e os diretores do time fazem propostas.');
  const n = Math.floor(Number(vip));
  if (!(n >= CLUB.offerMin && n <= CLUB.offerMax)) throw badRequest(`A proposta vai de ${CLUB.offerMin} a ${CLUB.offerMax} VIP.`);
  const text = String(message ?? '').replace(/\s+/g, ' ').trim().slice(0, CLUB.messageMax) || null;
  if (text && /(https?:\/\/|www\.)/i.test(text)) throw badRequest('Links não são permitidos no recado.');
  const u = await byNick(nick);
  if (!u) throw notFound('Jogador não encontrado.');
  if (u.id === me.id) throw badRequest('Você não pode fazer proposta para você mesmo.');
  if (u.teamId === me.teamId) throw badRequest(`${u.nick} já joga no ${me.team.name}.`);
  if (banned(u)) throw badRequest('Esse jogador está suspenso.');
  if (underContract(u)) throw new GameError(409, 'contract', `${u.nick} tem contrato com o ${u.team.name} até ${fmtDate(u.contractUntil)}.`);
  if (sameNet(me, u)) throw new GameError(403, 'same-net', 'Contas na mesma internet não podem negociar entre si.');
  const open = await prisma.transferOffer.findMany({ where: { status: 'PENDING', OR: [{ fromUserId: userId }, { teamId: me.teamId, toUserId: u.id }] } });
  if (open.some((o) => o.teamId === me.teamId && o.toUserId === u.id)) throw new GameError(409, 'dup', `O ${me.team.name} já tem uma proposta aberta para ${u.nick}.`);
  if (open.filter((o) => o.fromUserId === userId).length >= CLUB.maxOpenOffers) throw new GameError(429, 'many', `Você já tem ${CLUB.maxOpenOffers} propostas abertas. Espere as respostas ou cancele uma.`);
  await prisma.$transaction(async (tx) => {
    const paid = await tx.user.updateMany({ where: { id: userId, vipDays: { gte: n } }, data: { vipDays: { decrement: n } } });
    if (!paid.count) throw new GameError(402, 'no-vip', `Você precisa ter ${n} VIP guardados para essa proposta.`);
    await tx.transferOffer.create({ data: { teamId: me.teamId, fromUserId: userId, toUserId: u.id, vip: n, message: text, expiresAt: new Date(Date.now() + CLUB.offerHours * 3600_000) } });
  });
  return clubState(userId);
}

export async function acceptOffer(userId, id) {
  await clubSweep({ userId });
  const now = new Date();
  const res = await prisma.$transaction(async (tx) => {
    // trava o jogador: dois "aceitar" ao mesmo tempo esperam um pelo outro (nunca aceita duas propostas)
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const o = await tx.transferOffer.findFirst({ where: { id: Number(id), toUserId: userId }, include: { team: true, fromUser: { include: { teamRole: true } } } });
    if (!o) return { fail: [404, 'not-found', 'Proposta não encontrada.'] };
    if (o.status !== 'PENDING') return { fail: [409, 'closed', 'Essa proposta já foi encerrada.'] };
    if (o.expiresAt <= now) { await closeOffer(tx, o, 'EXPIRED'); return { fail: [410, 'expired', 'Essa proposta venceu.'] }; }
    const me = await tx.user.findUnique({ where: { id: userId }, include: { team: true } });
    if (underContract(me, now.getTime())) return { fail: [409, 'contract', `Você tem contrato com o ${me.team.name} até ${fmtDate(me.contractUntil)}.`] };
    const r = o.fromUser.teamRole;
    if (!r || r.teamId !== o.teamId || o.fromUser.teamId !== o.teamId) { await closeOffer(tx, o, 'CANCELED'); return { fail: [409, 'gone', 'Essa proposta não vale mais: quem fez saiu da diretoria do time.'] }; }
    if (me.teamId === o.teamId) { await closeOffer(tx, o, 'CANCELED'); return { fail: [409, 'same-team', `Você já joga no ${o.team.name}.`] }; }
    // fecha a proposta sem devolver o VIP: ele vai para o jogador
    const ok = await tx.transferOffer.updateMany({ where: { id: o.id, status: 'PENDING' }, data: { status: 'ACCEPTED', decidedAt: now, fromTeamId: me.teamId } });
    if (!ok.count) return { fail: [409, 'closed', 'Essa proposta já foi encerrada.'] };
    await leaveClub(tx, userId); // cargo no time antigo e propostas que ele tinha feito
    // igual à troca de time: zera os contadores da rodada (gols já feitos ficam com o time antigo)
    await tx.user.update({ where: { id: userId }, data: { teamId: o.teamId, goalsRound: 0, roundId: null, vipDays: { increment: o.vip }, contractUntil: new Date(now.getTime() + o.vip * DAY) } });
    const others = await tx.transferOffer.findMany({ where: { toUserId: userId, status: 'PENDING', id: { not: o.id } } });
    for (const x of others) await closeOffer(tx, x, 'CANCELED');
    await activity(tx, userId, o.teamId, `${me.nick} foi ${me.gender === 'F' ? 'contratada' : 'contratado'} pelo ${o.team.name} por ${o.vip} VIP (saiu do ${me.team.name}).`);
    return { ok: true };
  });
  if (res.fail) throw new GameError(...res.fail);
  return clubState(userId);
}

export async function refuseOffer(userId, id) {
  const o = await prisma.transferOffer.findFirst({ where: { id: Number(id), toUserId: userId } });
  if (!o) throw notFound('Proposta não encontrada.');
  if (!(await prisma.$transaction((tx) => closeOffer(tx, o, 'REFUSED')))) throw new GameError(409, 'closed', 'Essa proposta já foi encerrada.');
  return clubState(userId);
}

export async function cancelOffer(userId, id) {
  const o = await prisma.transferOffer.findFirst({ where: { id: Number(id), fromUserId: userId } });
  if (!o) throw notFound('Proposta não encontrada.');
  if (!(await prisma.$transaction((tx) => closeOffer(tx, o, 'CANCELED')))) throw new GameError(409, 'closed', 'Essa proposta já foi encerrada.');
  return clubState(userId);
}

// ─── Doação ─────────────────────────────────────────────────────────────────
export async function giftVip(userId, nick, days) {
  const n = Math.floor(Number(days));
  if (!(n >= 1)) throw badRequest('Escolha quantos VIP mandar.');
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { team: true } });
  const u = await byNick(nick);
  if (!u) throw notFound('Jogador não encontrado.');
  if (u.id === me.id) throw badRequest('Escolha um colega de time.');
  if (u.teamId !== me.teamId) throw badRequest(`Só dá para mandar VIP para quem joga no ${me.team.name}.`);
  if (banned(u)) throw badRequest('Esse jogador está suspenso.');
  if (sameNet(me, u)) throw new GameError(403, 'same-net', 'Contas na mesma internet não podem trocar VIP.');
  await prisma.$transaction(async (tx) => {
    const paid = await tx.user.updateMany({ where: { id: userId, vipDays: { gte: n } }, data: { vipDays: { decrement: n } } });
    if (!paid.count) throw new GameError(402, 'no-vip', `Você não tem ${n} VIP guardados.`);
    await tx.user.update({ where: { id: u.id }, data: { vipDays: { increment: n } } });
    await tx.vipGift.create({ data: { fromUserId: userId, toUserId: u.id, teamId: me.teamId, days: n } });
  });
  return { ok: true, to: u.nick, days: n };
}
