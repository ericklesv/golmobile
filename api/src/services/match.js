/**
 * Página da partida (/partida/:id — pedido do dono, 14/09/2026): placar, tempo que falta, artilheiro da
 * partida, artilheiros de cada time, gols hora a hora, gols por tipo, comparação dos times (tabela,
 * torcedores, artilheiro da temporada), confrontos anteriores e os últimos gols. Tudo lido dos gols
 * (Goal.matchId) — nada novo é gravado. Pública (sem login), como a página do time.
 */
import { prisma } from '../prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { hourKey } from '../lib/time.js';
import { KIND_LABEL } from '../lib/rules.js';
import { matchPct, standingOrder, topScorers } from './league.js';
import { teamView } from './view.js';
import { withBadges } from './badges.js';

const HOUR = 3_600_000;
const BASIC = ['AUTO', 'PENALTY', 'FOUL', 'TRAIL']; // o resto são minigames
const TOP_PER_TEAM = 5;

export async function matchPage(id, now = Date.now()) {
  if (!Number.isInteger(id) || id < 1) throw badRequest('Partida inválida.');
  const m = await prisma.match.findUnique({ where: { id }, include: { homeTeam: true, awayTeam: true, round: { include: { season: { select: { number: true } } } } } });
  if (!m) throw notFound('Partida não encontrada.');
  const side = (teamId) => (teamId === m.homeTeamId ? 'home' : teamId === m.awayTeamId ? 'away' : null);
  const since = new Date(now - 2 * 60_000);

  const [scorers, kinds, hours, recent, table, h2h, onHome, onAway, seasonHome, seasonAway, lostRows] = await Promise.all([
    prisma.goal.groupBy({ by: ['teamId', 'userId'], where: { matchId: id }, _count: { _all: true } }),
    prisma.goal.groupBy({ by: ['teamId', 'kind'], where: { matchId: id }, _count: { _all: true } }),
    prisma.goal.groupBy({ by: ['teamId', 'hourKey'], where: { matchId: id }, _count: { _all: true } }),
    prisma.goal.findMany({ where: { matchId: id }, orderBy: { id: 'desc' }, take: 15, select: { id: true, teamId: true, kind: true, createdAt: true, user: { select: { nick: true, avatarUrl: true } } } }),
    prisma.standing.findMany({ where: { seasonId: m.round.seasonId, serie: m.serie }, include: { team: { select: { name: true } } } }),
    prisma.match.findMany({
      where: { id: { not: id }, status: 'FINISHED', OR: [{ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId }, { homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId }] },
      orderBy: { id: 'desc' }, take: 5, include: { round: { select: { number: true, season: { select: { number: true } } } } },
    }),
    prisma.user.count({ where: { teamId: m.homeTeamId, lastSeenAt: { gt: since } } }),
    prisma.user.count({ where: { teamId: m.awayTeamId, lastSeenAt: { gt: since } } }),
    topScorers({ seasonId: m.round.seasonId, teamId: m.homeTeamId }, 1),
    topScorers({ seasonId: m.round.seasonId, teamId: m.awayTeamId }, 1),
    // gols tirados do placar: o time perdeu no FutPrego (realtime/futprego.js)
    prisma.futPregoMatch.groupBy({ by: ['lostTeamId'], where: { lostMatchId: id }, _count: { _all: true } }),
  ]);

  // artilheiros: top 5 de cada lado + o da partida (mais gols; empate = quem chegou lá primeiro na lista)
  const bySide = { home: [], away: [] };
  for (const s of scorers.sort((a, b) => b._count._all - a._count._all)) { const k = side(s.teamId); if (k) bySide[k].push(s); }
  const pick = [...bySide.home.slice(0, TOP_PER_TEAM), ...bySide.away.slice(0, TOP_PER_TEAM)];
  const users = await prisma.user.findMany({ where: { id: { in: pick.map((s) => s.userId) } }, select: { id: true, nick: true, avatarUrl: true, nickColor: true, vipUntil: true } });
  const uById = new Map(users.map((u) => [u.id, u]));
  const row = (s) => { const u = uById.get(s.userId); return { userId: s.userId, nick: u?.nick ?? '?', avatarUrl: u?.avatarUrl ?? null, nickColor: u?.nickColor ?? null, vip: !!(u?.vipUntil && u.vipUntil.getTime() > now), goals: s._count._all }; };
  const tops = { home: await withBadges(bySide.home.slice(0, TOP_PER_TEAM).map(row)), away: await withBadges(bySide.away.slice(0, TOP_PER_TEAM).map(row)) };
  const best = [tops.home[0], tops.away[0]].filter(Boolean).sort((a, b) => b.goals - a.goals)[0] ?? null;

  // gols por tipo: chute direto, pênalti, falta, trilha e minigames (com o detalhe de cada minigame)
  const byKind = { home: { AUTO: 0, PENALTY: 0, FOUL: 0, TRAIL: 0, MINI: 0 }, away: { AUTO: 0, PENALTY: 0, FOUL: 0, TRAIL: 0, MINI: 0 } };
  const mini = new Map();
  for (const k of kinds) {
    const sd = side(k.teamId); if (!sd) continue;
    const n = k._count._all;
    if (BASIC.includes(k.kind)) byKind[sd][k.kind] += n;
    else {
      byKind[sd].MINI += n;
      const e = mini.get(k.kind) ?? { kind: k.kind, label: KIND_LABEL[k.kind] ?? k.kind, home: 0, away: 0 };
      e[sd] += n; mini.set(k.kind, e);
    }
  }

  // hora a hora: da abertura da rodada até agora (ou até o fim, se já acabou)
  const count = new Map(hours.map((h) => [`${h.teamId}:${h.hourKey}`, h._count._all]));
  const start = m.round.startsAt.getTime(), end = Math.min(m.round.endsAt.getTime(), Math.max(start + 1, now));
  const timeline = [];
  for (let t = start; t < end; t += HOUR) {
    const key = hourKey(new Date(t));
    timeline.push({ key, hour: Number(key.slice(-2)), home: count.get(`${m.homeTeamId}:${key}`) ?? 0, away: count.get(`${m.awayTeamId}:${key}`) ?? 0 });
  }

  // tabela da série nesta temporada
  const sorted = table.sort(standingOrder);
  const stand = (teamId) => {
    const i = sorted.findIndex((s) => s.teamId === teamId);
    if (i < 0) return null;
    const s = sorted[i];
    return { position: i + 1, of: sorted.length, points: s.points, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst };
  };

  // confrontos anteriores, sempre do ponto de vista do mandante desta partida
  const past = h2h.map((x) => {
    const hg = x.homeTeamId === m.homeTeamId ? x.homeGoals : x.awayGoals; // gols do "nosso" mandante
    const ag = x.homeTeamId === m.homeTeamId ? x.awayGoals : x.homeGoals;
    return { id: x.id, season: x.round.season.number, round: x.round.number, homeGoals: hg, awayGoals: ag, winner: hg > ag ? 'home' : ag > hg ? 'away' : 'draw' };
  });
  const seasonTop = (r) => (r[0] ? { nick: r[0].nick, avatarUrl: r[0].avatarUrl ?? null, goals: r[0].goals } : null);

  const live = m.status === 'LIVE';
  return {
    id: m.id, status: m.status, serie: m.serie,
    round: { number: m.round.number, season: m.round.season.number, startsAt: m.round.startsAt.getTime(), endsAt: m.round.endsAt.getTime() },
    home: teamView(m.homeTeam), away: teamView(m.awayTeam),
    homeGoals: m.homeGoals, awayGoals: m.awayGoals, pct: matchPct(m),
    result: live ? null : m.homeGoals > m.awayGoals ? 'home' : m.awayGoals > m.homeGoals ? 'away' : 'draw',
    best, tops,
    scorersCount: { home: bySide.home.length, away: bySide.away.length },
    byKind, minigames: [...mini.values()].sort((a, b) => (b.home + b.away) - (a.home + a.away)),
    lost: { home: lostRows.find((r) => r.lostTeamId === m.homeTeamId)?._count._all ?? 0, away: lostRows.find((r) => r.lostTeamId === m.awayTeamId)?._count._all ?? 0 },
    timeline,
    standing: { home: stand(m.homeTeamId), away: stand(m.awayTeamId) },
    online: live ? { home: onHome, away: onAway } : null,
    seasonTop: { home: seasonTop(seasonHome), away: seasonTop(seasonAway) },
    h2h: { matches: past, home: past.filter((p) => p.winner === 'home').length, draws: past.filter((p) => p.winner === 'draw').length, away: past.filter((p) => p.winner === 'away').length },
    recent: recent.map((g) => ({ id: g.id, side: side(g.teamId), nick: g.user.nick, avatarUrl: g.user.avatarUrl ?? null, kind: g.kind, label: KIND_LABEL[g.kind] ?? g.kind, at: g.createdAt.getTime() })),
    serverTime: now,
  };
}
