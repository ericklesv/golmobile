/**
 * Ranking X1 (= ranking do FutPrego; decisões do dono, 15/09/2026).
 *   - Pontos: 3 por vitória, 1 por empate, −2 por derrota (FUTPREGO.points — pode ficar negativo).
 *   - Só partida de verdade que TERMINOU conta (bot não grava; W.O. cedo = aposta devolvida, não conta);
 *     a partida entra no período em que TERMINOU (`finishedAt`).
 *   - Três recortes: rodada (fecha às 19:00 com a liga), temporada e todos os tempos. Rodada e temporada
 *     pagam prêmio (FUTPREGO.prizes) aos 3 primeiros ENTRE QUEM TEM o mínimo de partidas no período
 *     (FUTPREGO.prizes.minGames): quem tem menos aparece na lista, mas o prêmio pula para o próximo.
 *   - Sequência sem perder: vitória ou empate seguidos; derrota zera. `best` = a maior do período, `streak` = a atual.
 * O fechamento (settleX1Round/settleX1Season) roda DEPOIS da transação da liga, em transação própria e
 * idempotente (linha da rodada/temporada travada com FOR UPDATE; só paga se `x1Json` ainda for null):
 * um erro aqui nunca segura o fechamento da rodada.
 */
import { prisma } from '../prisma.js';
import { FUTPREGO, prizeFor } from '../lib/rules.js';
import { nickFadeOf } from '../lib/items.js';

/** Só o que conta: partida de verdade que terminou; W.O. cedo e cancelada, não. */
export const X1_COUNTED = { status: 'FINISHED', reason: { not: 'wo-cedo' } };

/** Filtro de período pelo fim da partida: [from, to). Sem `from` = todos os tempos. */
export const x1Period = (from, to) => (from || to ? { finishedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {});

/**
 * Soma a campanha de cada jogador a partir das partidas em ordem cronológica: vitórias, empates, derrotas,
 * pontos, `streak` (sequência atual sem perder) e `best` (a maior).
 */
export function x1Tally(rows) {
  const P = FUTPREGO.points;
  const acc = new Map();
  for (const m of rows) for (const id of [m.aId, m.bId]) {
    let s = acc.get(id);
    if (!s) acc.set(id, (s = { userId: id, wins: 0, draws: 0, losses: 0, streak: 0, best: 0 }));
    if (m.winnerId === null) { s.draws++; s.streak++; } else if (m.winnerId === id) { s.wins++; s.streak++; } else { s.losses++; s.streak = 0; }
    if (s.streak > s.best) s.best = s.streak;
  }
  for (const s of acc.values()) { s.played = s.wins + s.draws + s.losses; s.points = s.wins * P.win + s.draws * P.draw + s.losses * P.loss; }
  return acc;
}

/** Ordem do ranking: pontos, vitórias, maior sequência sem perder, menos derrotas, id (estável). */
const order = (x, y) => y.points - x.points || y.wins - x.wins || y.best - x.best || x.losses - y.losses || x.userId - y.userId;

/** Campanha de um jogador (perfil): todos os tempos. */
export async function x1Record(userId, db = prisma) {
  const rows = await db.futPregoMatch.findMany({ where: { ...X1_COUNTED, OR: [{ aId: userId }, { bId: userId }] }, orderBy: { id: 'asc' }, select: { aId: true, bId: true, winnerId: true } });
  const s = x1Tally(rows).get(userId);
  return s ? { wins: s.wins, losses: s.losses, draws: s.draws, points: s.points, streak: s.streak, best: s.best } : { wins: 0, losses: 0, draws: 0, points: 0, streak: 0, best: 0 };
}

const teamSel = { select: { id: true, slug: true, name: true, abbr: true, colorPrimary: true, colorSecondary: true, stadium: true, serie: true, state: true } };

/**
 * Ranking de um período ({from, to} pelo fim da partida; vazio = todos os tempos). Linhas no formato da
 * artilharia (`goals` = pontos) + `fp` com a campanha; com `table` (prêmios do período), marca `eligible`
 * (tem o mínimo de partidas) e `prize` = o que a posição ENTRE OS ELEGÍVEIS paga agora. Conta excluída sai.
 */
export async function x1Ranking({ from = null, to = null, table = null, take = 50 } = {}, db = prisma) {
  const rows = await db.futPregoMatch.findMany({ where: { ...X1_COUNTED, ...x1Period(from, to) }, orderBy: { id: 'asc' }, select: { aId: true, bId: true, winnerId: true } });
  const list = [...x1Tally(rows).values()].sort(order);
  const top = list.slice(0, take + 20); // folga para as contas excluídas que saem
  const users = top.length ? await db.user.findMany({ where: { id: { in: top.map((s) => s.userId) }, deletedAt: null }, include: { team: teamSel } }) : [];
  const U = new Map(users.map((u) => [u.id, u]));
  const now = new Date();
  const min = FUTPREGO.prizes.minGames;
  let elig = 0;
  return top.filter((s) => U.has(s.userId)).slice(0, take).map((s, i) => {
    const u = U.get(s.userId);
    const eligible = s.played >= min;
    const prize = table && eligible ? prizeFor(table, ++elig) : null;
    return {
      position: i + 1, userId: u.id, nick: u.nick, avatarUrl: u.avatarUrl ?? null, nickColor: u.nickColor ?? null, nickFade: nickFadeOf(u),
      team: u.team, vip: !!(u.vipUntil && u.vipUntil > now), goals: s.points,
      fp: { wins: s.wins, draws: s.draws, losses: s.losses, played: s.played, points: s.points, streak: s.streak, best: s.best, eligible, prize, ...(table ? { need: min } : {}) },
    };
  });
}

const brl = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const prizeText = (p) => [p.money > 0 ? brl(p.money) : null, p.vip > 0 ? `${p.vip} VIP` : null].filter(Boolean).join(' + ');
const ordinal = (n) => `${n}º`;

/**
 * Paga os prêmios de um período (top 3 entre os elegíveis), grava um lance ao vivo por premiado e devolve o
 * quadro congelado {rows: top 10, paid: [{userId, nick, position, money, vip}], from, to}. Roda dentro de `tx`.
 */
async function payX1(tx, { from, to, table, label }) {
  const rows = await x1Ranking({ from, to, table, take: 10 }, tx);
  const paid = [];
  for (const r of rows) {
    const p = r.fp.prize;
    if (!p || (!p.money && !p.vip)) continue;
    const pos = paid.length + 1;
    await tx.user.update({ where: { id: r.userId }, data: { money: { increment: p.money }, vipDays: { increment: p.vip } } });
    await tx.activity.create({
      data: {
        userId: r.userId, teamId: r.team.id, kind: 'FUTPREGO', goal: false,
        text: `${r.nick} foi o ${ordinal(pos)} do Ranking X1 da ${label} (${r.fp.points} pontos, ${r.fp.wins}V ${r.fp.draws}E ${r.fp.losses}D) e ganhou ${prizeText(p)}!`,
      },
    });
    paid.push({ userId: r.userId, nick: r.nick, position: pos, money: p.money, vip: p.vip });
  }
  return { from, to, rows: rows.map(({ position, userId, nick, team, fp }) => ({ position, userId, nick, teamId: team.id, ...fp })), paid };
}

/** Fecha o Ranking X1 da rodada (depois da transação da liga). Idempotente: só paga se `x1Json` for null. */
export async function settleX1Round(roundId, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw`SELECT id, number, "startsAt", "x1Json" FROM "Round" WHERE id = ${roundId} FOR UPDATE`;
    if (!row || row.x1Json !== null) return null;
    const result = await payX1(tx, { from: row.startsAt, to: now, table: FUTPREGO.prizes.round, label: `rodada ${row.number}` });
    await tx.round.update({ where: { id: roundId }, data: { x1Json: result } });
    return result;
  }, { timeout: 30_000 });
}

/** Fecha o Ranking X1 da temporada (depois de finishSeason). Idempotente como o da rodada. */
export async function settleX1Season(seasonId, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw`SELECT id, number, "startsAt", "x1Json" FROM "Season" WHERE id = ${seasonId} FOR UPDATE`;
    if (!row || row.x1Json !== null) return null;
    const result = await payX1(tx, { from: row.startsAt, to: now, table: FUTPREGO.prizes.season, label: `temporada ${row.number}` });
    await tx.season.update({ where: { id: seasonId }, data: { x1Json: result } });
    return result;
  }, { timeout: 30_000 });
}
