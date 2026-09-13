/**
 * Liga — temporadas, rodadas de 24h (fecham às 19:00), partidas time x time,
 * classificação por série, premiações e recordes. Porta do BRGOL original.
 */
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { nextRoundClose, hourKey } from '../lib/time.js';
import { PRIZES, prizeFor } from '../lib/rules.js';

const SERIES = ['A', 'B', 'C'];

// ─── Round-robin (método do círculo) — determinístico por ordem de id ───────
function roundRobinPairs(teamIds, roundNumber) {
  const teams = [...teamIds].sort((a, b) => a - b);
  if (teams.length % 2 !== 0) teams.push(null);
  const n = teams.length;
  const single = n - 1; // rodadas do turno
  const r = (roundNumber - 1) % (single * 2);
  const base = r % single;
  const returno = r >= single;
  const arr = [...teams];
  for (let i = 0; i < base; i++) {
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(1, arr.length - 1, ...rest);
  }
  const pairs = [];
  for (let i = 0; i < n / 2; i++) {
    const a = arr[i];
    const b = arr[n - 1 - i];
    if (a == null || b == null) continue;
    let [home, away] = base % 2 === 0 ? [a, b] : [b, a];
    if (returno) [home, away] = [away, home];
    pairs.push({ home, away });
  }
  return pairs;
}

async function createRound(tx, season, number, now) {
  const endsAt = nextRoundClose(now);
  const round = await tx.round.create({
    data: { seasonId: season.id, number, startsAt: now, endsAt, status: 'LIVE' },
  });
  const teams = await tx.team.findMany({ select: { id: true, serie: true } });
  const data = [];
  for (const serie of SERIES) {
    const ids = teams.filter((t) => t.serie === serie).map((t) => t.id);
    for (const { home, away } of roundRobinPairs(ids, number)) {
      data.push({ roundId: round.id, serie, homeTeamId: home, awayTeamId: away });
    }
  }
  if (data.length) await tx.match.createMany({ data });
  return round;
}

async function createSeason(tx, number, now) {
  const teams = await tx.team.findMany({ select: { id: true, serie: true } });
  const season = await tx.season.create({
    data: { number, startsAt: now, totalRounds: config.totalRounds, status: 'ACTIVE' },
  });
  await tx.standing.createMany({
    data: teams.map((t) => ({ seasonId: season.id, teamId: t.id, serie: t.serie })),
  });
  await createRound(tx, season, 1, now);
  return season;
}

// Rodada viva guardada em memória (boot, cada volta do relógio e cada fechamento): a tela usa para
// zerar os contadores "da rodada/temporada" na virada sem consultar o banco a cada /me (view.js).
let liveNow = null;
export const liveRound = () => liveNow;
export async function refreshLiveRound() {
  const r = await prisma.round.findFirst({ where: { status: 'LIVE' }, orderBy: { number: 'desc' }, select: { id: true, seasonId: true, endsAt: true } });
  liveNow = r ? { roundId: r.id, seasonId: r.seasonId, endsAt: r.endsAt.getTime() } : null;
  return liveNow;
}

/** Ordem da tabela — a MESMA na tela, na página do time e no fechamento (título, acesso e
 *  rebaixamento): pontos, saldo, gols pró e, empatado em tudo, o nome do time. */
export function standingOrder(x, y) {
  return y.points - x.points
    || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst)
    || y.goalsFor - x.goalsFor
    || x.team.name.localeCompare(y.team.name);
}

/** Garante temporada ativa com rodada viva (chamado no boot). */
export async function ensureSeason() {
  const season = await openSeason();
  await refreshLiveRound();
  return season;
}

async function openSeason() {
  const active = await prisma.season.findFirst({ where: { status: 'ACTIVE' } });
  if (active) {
    const live = await prisma.round.findFirst({ where: { seasonId: active.id, status: 'LIVE' } });
    if (live) return active;
    const last = await prisma.round.findFirst({ where: { seasonId: active.id }, orderBy: { number: 'desc' } });
    return prisma.$transaction(async (tx) => {
      await createRound(tx, active, (last?.number ?? 0) + 1, new Date());
      return active;
    });
  }
  const last = await prisma.season.findFirst({ orderBy: { number: 'desc' } });
  return prisma.$transaction((tx) => createSeason(tx, (last?.number ?? 0) + 1, new Date()));
}

export async function currentRound() {
  return prisma.round.findFirst({
    where: { status: 'LIVE' },
    orderBy: { number: 'desc' },
    include: { season: true },
  });
}

/** Partida viva do time (ou null). */
export async function liveMatchForTeam(teamId, tx = prisma) {
  return tx.match.findFirst({
    where: { status: 'LIVE', OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }], round: { status: 'LIVE' } },
    include: { homeTeam: true, awayTeam: true, round: true },
  });
}

// ─── Top N de gols por filtro ───────────────────────────────────────────────
export async function topScorers(where, take = 10, tx = prisma) {
  const groups = await tx.goal.groupBy({
    by: ['userId'],
    where,
    _count: { _all: true },
    orderBy: { _count: { userId: 'desc' } },
    take,
  });
  if (!groups.length) return [];
  const users = await tx.user.findMany({
    where: { id: { in: groups.map((g) => g.userId) } },
    include: { team: { select: { slug: true, name: true, abbr: true, colorPrimary: true, colorSecondary: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return groups.map((g, i) => {
    const u = byId.get(g.userId);
    return {
      position: i + 1,
      userId: g.userId,
      nick: u?.nick,
      avatarUrl: u?.avatarUrl ?? null,
      nickColor: u?.nickColor ?? null,
      goals: g._count._all,
      team: u?.team,
      vip: !!(u?.vipUntil && u.vipUntil > new Date()),
    };
  });
}

async function applyRecord(tx, scope, seasonId, top) {
  if (!top?.length) return null;
  const best = top[0];
  const current = await tx.record.findUnique({ where: { scope_seasonId: { scope, seasonId } } });
  if (!current || best.goals > current.goals) {
    await tx.record.upsert({
      where: { scope_seasonId: { scope, seasonId } },
      create: { scope, seasonId, userId: best.userId, goals: best.goals },
      update: { userId: best.userId, goals: best.goals, setAt: new Date() },
    });
    return best;
  }
  return null;
}

async function payPrizes(tx, top, table) {
  for (const row of top) {
    const p = prizeFor(table, row.position);
    if (!p) continue;
    await tx.user.update({
      where: { id: row.userId },
      data: { money: { increment: p.money }, vipDays: { increment: p.vip } },
    });
  }
}

function outcome(h, a) {
  if (h === a) return 'draw';
  return h > a ? 'home' : 'away';
}

// ─── Fechamento de rodada ───────────────────────────────────────────────────
export async function settleDueRounds(now = new Date()) {
  const due = await prisma.round.findMany({
    where: { status: 'LIVE', endsAt: { lte: now } },
    include: { season: true },
  });
  const results = [];
  for (const round of due) {
    const r = await prisma.$transaction(async (tx) => settleRound(tx, round, now), { timeout: 60_000 });
    results.push(r);
  }
  if (due.length) await refreshLiveRound();
  return results;
}

async function settleRound(tx, round, now) {
  const season = round.season;
  // Encerra as partidas e lê o placar FINAL no mesmo comando (trava as linhas): um gol que já estava
  // entrando termina antes e conta aqui; um que chegar depois vai para a rodada nova (applyResult).
  // Antes, lendo e encerrando em passos separados, esse gol ficava no placar e fora da tabela.
  const matches = await tx.$queryRaw`
    UPDATE "Match" SET status = 'FINISHED'
    WHERE "roundId" = ${round.id} AND status = 'LIVE'
    RETURNING "homeTeamId", "awayTeamId", "homeGoals", "awayGoals"`;
  for (const m of matches) {
    const res = outcome(m.homeGoals, m.awayGoals);
    const upd = (team, gf, ga, o) =>
      tx.standing.update({
        where: { seasonId_teamId: { seasonId: season.id, teamId: team } },
        data: {
          points: { increment: o === 'win' ? 3 : o === 'draw' ? 1 : 0 },
          played: { increment: 1 },
          wins: { increment: o === 'win' ? 1 : 0 },
          draws: { increment: o === 'draw' ? 1 : 0 },
          losses: { increment: o === 'loss' ? 1 : 0 },
          goalsFor: { increment: gf },
          goalsAgainst: { increment: ga },
        },
      });
    await upd(m.homeTeamId, m.homeGoals, m.awayGoals, res === 'home' ? 'win' : res === 'away' ? 'loss' : 'draw');
    await upd(m.awayTeamId, m.awayGoals, m.homeGoals, res === 'away' ? 'win' : res === 'home' ? 'loss' : 'draw');
  }

  // Artilharia da rodada: prêmios + recorde
  const top = await topScorers({ roundId: round.id }, 10, tx);
  await payPrizes(tx, top, PRIZES.round);
  const rec = await applyRecord(tx, 'ROUND', season.id, top);
  if (rec) {
    await tx.user.update({ where: { id: rec.userId }, data: { vipDays: { increment: PRIZES.roundRecord.vip } } });
  }
  await tx.round.update({ where: { id: round.id }, data: { status: 'FINISHED', topJson: top } });

  if (round.number < season.totalRounds) {
    const next = await createRound(tx, season, round.number + 1, now);
    return { round: round.number, next: next.number };
  }
  // Fim da temporada
  await finishSeason(tx, season, now);
  const last = await tx.season.findFirst({ orderBy: { number: 'desc' } });
  await createSeason(tx, (last?.number ?? 0) + 1, now);
  return { round: round.number, seasonFinished: season.number };
}

async function finishSeason(tx, season, now) {
  const standings = await tx.standing.findMany({ where: { seasonId: season.id }, include: { team: true } });
  const promote = [];
  const relegate = [];
  const teamPrizes = [];
  for (const serie of SERIES) {
    const table = standings.filter((s) => s.serie === serie).sort(standingOrder);
    if (!table.length) continue;
    await tx.title.create({ data: { seasonId: season.id, teamId: table[0].teamId, competition: `Série ${serie}`, place: 1 } });
    teamPrizes.push({ teamId: table[0].teamId, vip: PRIZES.team[serie].champion });
    if (table[1]) {
      await tx.title.create({ data: { seasonId: season.id, teamId: table[1].teamId, competition: `Série ${serie}`, place: 2 } });
      teamPrizes.push({ teamId: table[1].teamId, vip: PRIZES.team[serie].runnerUp });
    }
    // Acesso e rebaixamento: 2 sobem / 2 caem (o original tinha Divisão de Acesso)
    if (serie !== 'A') promote.push(...table.slice(0, 2).map((s) => ({ teamId: s.teamId, to: serie === 'B' ? 'A' : 'B' })));
    if (serie !== 'C') relegate.push(...table.slice(-2).map((s) => ({ teamId: s.teamId, to: serie === 'A' ? 'B' : 'C' })));
  }
  for (const p of [...promote, ...relegate]) {
    await tx.team.update({ where: { id: p.teamId }, data: { serie: p.to } });
  }
  // Prêmio de time (decisão do dono, 13/09/2026): VIP para quem marcou pelo menos 1 gol pelo campeão
  // ou vice na temporada — não para quem só está no time (trocar de time é livre: daria para pular
  // para o líder no fim só pelo prêmio). Quem marcou por dois times premiados leva só o maior.
  const teamVip = new Map();
  for (const { teamId, vip } of teamPrizes) {
    const scorers = await tx.goal.groupBy({ by: ['userId'], where: { seasonId: season.id, teamId } });
    for (const { userId } of scorers) teamVip.set(userId, Math.max(teamVip.get(userId) ?? 0, vip));
  }
  for (const vip of new Set(teamVip.values())) {
    const ids = [...teamVip].filter(([, v]) => v === vip).map(([id]) => id);
    await tx.user.updateMany({ where: { id: { in: ids } }, data: { vipDays: { increment: vip } } });
  }
  // Artilharia da temporada: prêmios + recorde
  const top = await topScorers({ seasonId: season.id }, 10, tx);
  await payPrizes(tx, top, PRIZES.season);
  await applyRecord(tx, 'SEASON', season.id, top);
  await tx.season.update({ where: { id: season.id }, data: { status: 'FINISHED', endsAt: now } });
}

// ─── Fechamento de hora ─────────────────────────────────────────────────────
export async function closePastHours(now = new Date()) {
  const prev = hourKey(new Date(now.getTime() - 3600_000));
  const exists = await prisma.hourResult.findUnique({ where: { hourKey: prev } });
  if (exists) return null;
  return prisma.$transaction(async (tx) => {
    const top = await topScorers({ hourKey: prev }, 10, tx);
    const season = await tx.season.findFirst({ where: { status: 'ACTIVE' } });
    await tx.hourResult.create({
      data: { hourKey: prev, winnerUserId: top[0]?.userId ?? null, winnerGoals: top[0]?.goals ?? 0, topJson: top },
    });
    if (season) await applyRecord(tx, 'HOUR', season.id, top);
    return { hourKey: prev, winner: top[0]?.nick ?? null };
  });
}

export async function records(seasonId) {
  const recs = await prisma.record.findMany({
    where: { OR: [{ seasonId }, { seasonId: null }] },
    include: { user: { select: { nick: true, team: { select: { slug: true, abbr: true, colorPrimary: true, colorSecondary: true } } } } },
  });
  const out = {};
  for (const r of recs) out[r.scope] = { nick: r.user.nick, goals: r.goals, team: r.user.team, setAt: r.setAt };
  return out;
}

export function matchPct(m) {
  const total = m.homeGoals + m.awayGoals;
  return total === 0 ? 50 : Math.round((m.homeGoals / total) * 10000) / 100;
}
