/** Leitura: home, rankings, liga, times, jogadores, meta. Rotas públicas (sem token). */
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { handle, notFound, badRequest } from '../lib/errors.js';
import { hourKey } from '../lib/time.js';
import { currentRound, liveMatchForTeam, topScorers, records, matchPct } from '../services/league.js';
import { teamView, publicView } from '../services/view.js';
import { COOLDOWNS, TRAIL_MIN, MONEY, DEXTERITY_MAX, NERF_MIN_LEVEL, LEVELS, PRIZES, TRAIL_LINES, UNLOCK_LEVEL, FOUL_BASE_CHANCE, DEXTERITY_BONUS_PER_POINT, REBOUND_CHANCE, TERMO, QUIZ } from '../lib/rules.js';
import { PARTY_SEGMENTS } from '../services/play.js';
import { catalogView } from '../lib/items.js';

export const game = Router();

const teamSel = { select: { id: true, slug: true, name: true, abbr: true, colorPrimary: true, colorSecondary: true, stadium: true, serie: true, state: true } };

function matchView(m) {
  return {
    id: m.id, serie: m.serie, status: m.status,
    home: teamView(m.homeTeam), away: teamView(m.awayTeam),
    homeGoals: m.homeGoals, awayGoals: m.awayGoals, pct: matchPct(m),
    round: m.round ? { id: m.round.id, number: m.round.number, endsAt: m.round.endsAt } : undefined,
  };
}

game.get('/meta', handle(async () => {
  const teams = await prisma.team.findMany({ orderBy: [{ serie: 'asc' }, { name: 'asc' }] });
  return {
    cooldowns: COOLDOWNS, trailMin: TRAIL_MIN, money: MONEY, dexterityMax: DEXTERITY_MAX, nerfMinLevel: NERF_MIN_LEVEL,
    levels: LEVELS, prizes: PRIZES, trailLines: TRAIL_LINES, unlock: UNLOCK_LEVEL,
    chances: { penalty: 2 / 3, foul: FOUL_BASE_CHANCE, perDexterity: DEXTERITY_BONUS_PER_POINT, rebound: REBOUND_CHANCE },
    partySegments: PARTY_SEGMENTS,
    termo: TERMO,
    quiz: { questions: QUIZ.questions, seconds: QUIZ.seconds, pointsPerHit: QUIZ.pointsPerHit, goalAt: QUIZ.goalAt },
    teams: teams.map(teamView),
    items: catalogView(), // catálogo da loja (lib/items.js)
  };
}));

game.get('/home', handle(async (req) => {
  const now = new Date();
  const round = await currentRound();
  const teamSlug = req.query.team ? String(req.query.team) : null;
  const team = teamSlug ? await prisma.team.findUnique({ where: { slug: teamSlug } }) : null;
  const [hour, roundTop, seasonTop, feed, online, recs, hourResult, active] = await Promise.all([
    topScorers({ hourKey: hourKey(now) }, 10),
    round ? topScorers({ roundId: round.id }, 10) : [],
    round ? topScorers({ seasonId: round.seasonId }, 10) : [],
    prisma.activity.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { team: teamSel } }),
    prisma.user.count({ where: { lastSeenAt: { gt: new Date(now.getTime() - 2 * 60_000) } } }),
    round ? records(round.seasonId) : {},
    prisma.hourResult.findFirst({ orderBy: { closedAt: 'desc' }, include: { winner: { select: { nick: true, team: teamSel } } } }),
    prisma.user.count({ where: { lastSeenAt: { gt: new Date(now.getTime() - 24 * 3600_000) } } }),
  ]);
  const myMatch = team ? await liveMatchForTeam(team.id) : null;
  return {
    serverTime: now.getTime(),
    hourKey: hourKey(now),
    season: round ? { id: round.seasonId, number: round.season.number, totalRounds: round.season.totalRounds } : null,
    round: round ? { id: round.id, number: round.number, startsAt: round.startsAt, endsAt: round.endsAt } : null,
    myMatch: myMatch ? matchView(myMatch) : null,
    tops: { hour, round: roundTop, season: seasonTop },
    records: recs,
    lastHour: hourResult ? { hourKey: hourResult.hourKey, nick: hourResult.winner?.nick ?? null, goals: hourResult.winnerGoals, team: hourResult.winner?.team ?? null } : null,
    feed: feed.map((a) => ({ id: a.id, text: a.text, goal: a.goal, kind: a.kind, at: a.createdAt, team: teamView(a.team) })),
    online, active,
  };
}));

// ─── Rankings ───────────────────────────────────────────────────────────────
const SCOPES = ['geral', 'temporada', 'rodada', 'hora', 'penal', 'falta', 'trilha'];
game.get('/rankings/:scope', handle(async (req) => {
  const scope = String(req.params.scope);
  if (!SCOPES.includes(scope)) throw badRequest('Ranking inválido.');
  const take = Math.min(100, Number(req.query.limit) || 50);
  const round = await currentRound();
  if (scope === 'hora') return { scope, key: hourKey(), rows: await topScorers({ hourKey: hourKey() }, take) };
  if (scope === 'rodada') return { scope, key: round?.number ?? null, rows: round ? await topScorers({ roundId: round.id }, take) : [] };
  if (scope === 'temporada') return { scope, key: round?.season?.number ?? null, rows: round ? await topScorers({ seasonId: round.seasonId }, take) : [] };
  const field = { geral: 'goalsTotal', penal: 'penaltyGoals', falta: 'foulGoals', trilha: 'trailGoals' }[scope];
  const users = await prisma.user.findMany({ where: { [field]: { gt: 0 } }, orderBy: [{ [field]: 'desc' }, { id: 'asc' }], take, include: { team: teamSel } });
  return {
    scope, key: null,
    rows: users.map((u, i) => ({ position: i + 1, userId: u.id, nick: u.nick, avatarUrl: u.avatarUrl ?? null, nickColor: u.nickColor ?? null, goals: u[field], team: u.team, vip: !!(u.vipUntil && u.vipUntil > new Date()) })),
  };
}));

// ─── Liga ───────────────────────────────────────────────────────────────────
game.get('/league', handle(async () => {
  const round = await currentRound();
  if (!round) return { season: null, round: null, standings: {} };
  const rows = await prisma.standing.findMany({ where: { seasonId: round.seasonId }, include: { team: teamSel } });
  const sortFn = (x, y) => y.points - x.points || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor || x.team.name.localeCompare(y.team.name);
  const standings = {};
  for (const s of ['A', 'B', 'C']) {
    standings[s] = rows.filter((r) => r.serie === s).sort(sortFn).map((r, i) => ({
      position: i + 1, team: teamView(r.team), points: r.points, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses,
      goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, diff: r.goalsFor - r.goalsAgainst,
    }));
  }
  const rounds = await prisma.round.findMany({ where: { seasonId: round.seasonId }, orderBy: { number: 'asc' }, select: { id: true, number: true, status: true, startsAt: true, endsAt: true } });
  return {
    season: { id: round.seasonId, number: round.season.number, totalRounds: round.season.totalRounds },
    round: { id: round.id, number: round.number, endsAt: round.endsAt },
    standings, rounds,
  };
}));

game.get('/league/rounds/:number', handle(async (req) => {
  const number = Number(req.params.number);
  const season = await prisma.season.findFirst({ where: { status: 'ACTIVE' } });
  if (!season) throw notFound();
  const round = await prisma.round.findUnique({ where: { seasonId_number: { seasonId: season.id, number } }, include: { matches: { include: { homeTeam: true, awayTeam: true }, orderBy: [{ serie: 'asc' }, { id: 'asc' }] } } });
  if (!round) throw notFound('Rodada não encontrada.');
  return {
    round: { id: round.id, number: round.number, status: round.status, startsAt: round.startsAt, endsAt: round.endsAt, top: round.topJson ?? null },
    matches: round.matches.map(matchView),
  };
}));

game.get('/league/titles', handle(async () => {
  const titles = await prisma.title.findMany({ orderBy: [{ seasonId: 'desc' }, { competition: 'asc' }, { place: 'asc' }], include: { team: teamSel, season: { select: { number: true } } } });
  return titles.map((t) => ({ season: t.season.number, competition: t.competition, place: t.place, team: teamView(t.team) }));
}));

// ─── Times ──────────────────────────────────────────────────────────────────
game.get('/teams', handle(async () => (await prisma.team.findMany({ orderBy: [{ serie: 'asc' }, { name: 'asc' }] })).map(teamView)));

game.get('/teams/:slug', handle(async (req) => {
  const team = await prisma.team.findUnique({ where: { slug: String(req.params.slug) } });
  if (!team) throw notFound('Time não encontrado.');
  const now = new Date();
  const round = await currentRound();
  const [match, standing, members, active, roundTop, seasonTop, hourTop, titles, allInSerie] = await Promise.all([
    liveMatchForTeam(team.id),
    round ? prisma.standing.findUnique({ where: { seasonId_teamId: { seasonId: round.seasonId, teamId: team.id } } }) : null,
    prisma.user.count({ where: { teamId: team.id } }),
    // torcedores ativos = entraram nas últimas 24 h
    prisma.user.findMany({ where: { teamId: team.id, lastSeenAt: { gt: new Date(now.getTime() - 24 * 3600_000) } }, select: { nick: true, goalsTotal: true, lastSeenAt: true, avatarUrl: true }, orderBy: { lastSeenAt: 'desc' }, take: 100 }),
    round ? topScorers({ roundId: round.id, teamId: team.id }, 10) : [],
    round ? topScorers({ seasonId: round.seasonId, teamId: team.id }, 10) : [],
    topScorers({ hourKey: hourKey(now), teamId: team.id }, 10),
    prisma.title.findMany({ where: { teamId: team.id }, include: { season: { select: { number: true } } }, orderBy: { seasonId: 'desc' } }),
    round ? prisma.standing.findMany({ where: { seasonId: round.seasonId, serie: team.serie } }) : [],
  ]);
  const sortFn = (x, y) => y.points - x.points || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor || x.teamId - y.teamId;
  const position = standing ? allInSerie.sort(sortFn).findIndex((s) => s.teamId === team.id) + 1 : null;
  const totalGoals = await prisma.goal.count({ where: { teamId: team.id } });
  return {
    team: teamView(team), slogan: team.slogan,
    members, active: active.map((u) => ({ nick: u.nick, goalsTotal: u.goalsTotal, avatarUrl: u.avatarUrl, online: u.lastSeenAt.getTime() > now.getTime() - 2 * 60_000 })), totalGoals,
    standing: standing ? { position, ...standing } : null,
    match: match ? matchView(match) : null,
    tops: { hour: hourTop, round: roundTop, season: seasonTop },
    titles: titles.map((t) => ({ season: t.season.number, competition: t.competition, place: t.place })),
  };
}));

// ─── Jogadores ──────────────────────────────────────────────────────────────
// Jogadores ativos nas últimas 24 h (para a listagem clicável)
game.get('/players/active', handle(async () => {
  const now = Date.now();
  const users = await prisma.user.findMany({
    where: { lastSeenAt: { gt: new Date(now - 24 * 3600_000) } },
    orderBy: { lastSeenAt: 'desc' }, take: 300,
    select: { nick: true, goalsTotal: true, goalsRound: true, lastSeenAt: true, avatarUrl: true, vipUntil: true, team: teamSel },
  });
  return users.map((u) => ({ nick: u.nick, goalsTotal: u.goalsTotal, goalsRound: u.goalsRound, avatarUrl: u.avatarUrl, lastSeenAt: u.lastSeenAt, online: u.lastSeenAt.getTime() > now - 2 * 60_000, vip: !!(u.vipUntil && u.vipUntil.getTime() > now), team: teamView(u.team) }));
}));

game.get('/players/search', handle(async (req) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const users = await prisma.user.findMany({ where: { nickLower: { contains: q } }, take: 20, orderBy: { goalsTotal: 'desc' }, include: { team: teamSel } });
  return users.map((u) => ({ nick: u.nick, goalsTotal: u.goalsTotal, avatarUrl: u.avatarUrl, team: teamView(u.team) }));
}));

game.get('/players/:nick', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.params.nick).toLowerCase() }, include: { team: true } });
  if (!user) throw notFound('Jogador não encontrado.');
  const [geral, penal, falta, trilha, recent] = await Promise.all([
    prisma.user.count({ where: { goalsTotal: { gt: user.goalsTotal } } }),
    prisma.user.count({ where: { penaltyGoals: { gt: user.penaltyGoals } } }),
    prisma.user.count({ where: { foulGoals: { gt: user.foulGoals } } }),
    prisma.user.count({ where: { trailGoals: { gt: user.trailGoals } } }),
    prisma.activity.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  return {
    ...publicView(user),
    positions: { geral: geral + 1, penal: penal + 1, falta: falta + 1, trilha: trilha + 1 },
    recent: recent.map((a) => ({ id: a.id, text: a.text, goal: a.goal, kind: a.kind, at: a.createdAt })),
  };
}));

game.get('/feed', handle(async (req) => {
  const team = req.query.team ? await prisma.team.findUnique({ where: { slug: String(req.query.team) } }) : null;
  const rows = await prisma.activity.findMany({ where: team ? { teamId: team.id } : {}, orderBy: { createdAt: 'desc' }, take: 40, include: { team: teamSel } });
  return rows.map((a) => ({ id: a.id, text: a.text, goal: a.goal, kind: a.kind, at: a.createdAt, team: teamView(a.team) }));
}));
