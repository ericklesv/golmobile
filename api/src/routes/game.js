/** Leitura: home, rankings, liga, times, jogadores, meta. Rotas públicas (sem token). */
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { handle, notFound, badRequest } from '../lib/errors.js';
import { hourKey } from '../lib/time.js';
import { currentRound, liveMatchForTeam, topScorers, records, matchPct, standingOrder } from '../services/league.js';
import { teamView, publicView, periodGoals, nickFadeOf } from '../services/view.js';
import { COOLDOWNS, TRAIL_MIN, MONEY, NERF_OFF, LEVELS, PRIZES, TRAIL_LINES, UNLOCK_LEVEL, FOUL_BASE_CHANCE, PENALTY_BASE_CHANCE, CHANCE_CAP, SKILLS, SKILL_COST, COOLDOWN_MIN, REBOUND_CHANCE, TERMO, QUIZ, STATS, CAMISAS, GANHAPERDE, FUTPREGO, BOTAO, X1, RESET_HOUR, MINIGAMES, CLUB, COMMUNITY, KIT_DESIGNS, SERIE_A_SWAP } from '../lib/rules.js';
import { PARTY_SEGMENTS } from '../services/play.js';
import { catalogView, NICK_FADE_COLORS } from '../lib/items.js';
import { cached, TURNSTILE_SITE_KEY, turnstileEnabled } from '../lib/security.js';
import rateLimit from 'express-rate-limit';
import { HATTRICK } from '../lib/hattrick.js';
import { FALTAPRO } from '../lib/faltapro.js';
import { BOARD as FUTPREGO_BOARD } from '../lib/futprego.js';
import { BOTAO_FIELD, kickoffLayout as botaoKickoff } from '../lib/botao.js';
import { boardView, playerClub } from '../services/club.js';
import { x1Today } from '../realtime/x1.js';
import { x1Ranking, x1Record } from '../services/x1.js';
import { withBadges, badgesOf, topHistory } from '../services/badges.js';
import { matchPage } from '../services/match.js';

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

game.get('/meta', cached(10000), handle(async () => {
  const teams = await prisma.team.findMany({ orderBy: [{ serie: 'asc' }, { name: 'asc' }] });
  return {
    nickFades: NICK_FADE_COLORS, // paleta do nick em degradê (VIP)
    turnstileSiteKey: turnstileEnabled() ? TURNSTILE_SITE_KEY : null, // captcha invisível no cadastro (lib/security.js); null = desligado
    cooldowns: COOLDOWNS, trailMin: TRAIL_MIN, money: MONEY, nerfOff: NERF_OFF, // destreza e nerf acabaram em 16/09/2026
    levels: LEVELS, prizes: PRIZES, trailLines: TRAIL_LINES, unlock: UNLOCK_LEVEL,
    serieASwap: SERIE_A_SWAP, // troca automática na Série A (time sem gol na rodada × quem mais marcou fora dela)
    chances: { penalty: PENALTY_BASE_CHANCE, foul: FOUL_BASE_CHANCE, cap: CHANCE_CAP, rebound: REBOUND_CHANCE },
    // Pontaria e Chute: a tela monta o resto com me.skills (nível) e me.chance (acerto de verdade)
    skills: SKILLS.map(({ key, name, kind, icon, desc, max, perLevel }) => ({ key, name, kind, icon, desc, max, perLevel, base: kind === 'PENALTY' ? PENALTY_BASE_CHANCE : FOUL_BASE_CHANCE, cap: CHANCE_CAP[kind] })),
    skillCost: SKILL_COST, // 1 ponto de nível, R$ 25 mil ou 1 VIP
    cooldownMin: COOLDOWN_MIN, // piso de 4:30 em todos os chutes
    partySegments: PARTY_SEGMENTS,
    termo: TERMO,
    quiz: { questions: QUIZ.questions, seconds: QUIZ.seconds, pointsPerHit: QUIZ.pointsPerHit, goalAt: QUIZ.goalAt },
    stats: STATS,
    camisas: CAMISAS,
    ganhaperde: GANHAPERDE,
    futprego: { ...FUTPREGO, board: FUTPREGO_BOARD }, // a tábua (pregos) para a tela do começo
    x1: { names: X1.names, today: x1Today(), botao: BOTAO, field: BOTAO_FIELD, kickoff: botaoKickoff() }, // X1: jogo do dia e regras do Futebol de Botão (campo de enfeite no começo)
    resetHour: RESET_HOUR, // hora de virada de cada minigame diário
    // minigames jogáveis e o nível que libera cada um (janela de "subiu de nível": LIBERADO X! JOGAR AGORA)
    minigames: MINIGAMES.filter((g) => !g.soon).map(({ id, name, unlock, route, icon }) => ({ id, name, unlock, route, icon })),
    hattrick: { lives: HATTRICK.lives, pointsPerGoal: HATTRICK.pointsPerGoal, maxPoints: HATTRICK.maxPoints },
    faltapro: { kicks: FALTAPRO.kicks, goalAt: FALTAPRO.goalAt, pointsPerGoal: FALTAPRO.pointsPerGoal, maxPoints: FALTAPRO.maxPoints, targetMoney: FALTAPRO.targetMoney },
    teams: teams.map(teamView),
    items: catalogView(), // catálogo da loja (lib/items.js)
    club: CLUB, // diretoria e contratações
    community: COMMUNITY, // grupo do WhatsApp dos jogadores (convite a cada 100 h)
    kitDesigns: KIT_DESIGNS, // desenhos de uniforme que o presidente pode escolher (cores sempre as do time)
  };
}));

game.get('/home', cached(5000), handle(async (req) => {
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
    tops: { hour: await withBadges(hour), round: await withBadges(roundTop), season: await withBadges(seasonTop) },
    records: recs,
    lastHour: hourResult ? { hourKey: hourResult.hourKey, nick: hourResult.winner?.nick ?? null, goals: hourResult.winnerGoals, team: hourResult.winner?.team ?? null } : null,
    feed: feed.map((a) => ({ id: a.id, text: a.text, goal: a.goal, kind: a.kind, at: a.createdAt, team: teamView(a.team) })),
    online, active,
  };
}));

// ─── Rankings ───────────────────────────────────────────────────────────────
const SCOPES = ['geral', 'temporada', 'rodada', 'hora', 'penal', 'falta', 'trilha', 'x1-rodada', 'x1-temporada', 'x1-geral', 'futprego', 'x1'];
game.get('/rankings/:scope', cached(5000), handle(async (req) => {
  const scope = String(req.params.scope);
  if (!SCOPES.includes(scope)) throw badRequest('Ranking inválido.');
  const take = Math.min(100, Number(req.query.limit) || 50);
  const round = await currentRound();
  if (scope === 'hora') return { scope, key: hourKey(), rows: await withBadges(await topScorers({ hourKey: hourKey() }, take)) };
  if (scope === 'rodada') return { scope, key: round?.number ?? null, rows: round ? await withBadges(await topScorers({ roundId: round.id }, take)) : [] };
  if (scope === 'temporada') return { scope, key: round?.season?.number ?? null, rows: round ? await withBadges(await topScorers({ seasonId: round.seasonId }, take)) : [] };
  // Ranking X1 (services/x1.js): rodada e temporada com prêmios (a partida conta no período em que terminou), geral = todos os tempos
  if (scope === 'x1-rodada') return { scope, key: round?.number ?? null, rows: round ? await withBadges(await x1Ranking({ from: round.startsAt, table: FUTPREGO.prizes.round, take })) : [] };
  if (scope === 'x1-temporada' || scope === 'x1') return { scope, key: round?.season?.number ?? null, rows: round ? await withBadges(await x1Ranking({ from: round.season.startsAt, table: FUTPREGO.prizes.season, take })) : [] };
  if (scope === 'x1-geral' || scope === 'futprego') return { scope: 'x1-geral', key: null, rows: await withBadges(await x1Ranking({ take })) };
  const field = { geral: 'goalsTotal', penal: 'penaltyGoals', falta: 'foulGoals', trilha: 'trailGoals' }[scope];
  const users = await prisma.user.findMany({ where: { [field]: { gt: 0 }, deletedAt: null }, orderBy: [{ [field]: 'desc' }, { id: 'asc' }], take, include: { team: teamSel } });
  return {
    scope, key: null,
    rows: await withBadges(users.map((u, i) => ({ position: i + 1, userId: u.id, nick: u.nick, avatarUrl: u.avatarUrl ?? null, nickColor: u.nickColor ?? null, nickFade: nickFadeOf(u), goals: u[field], team: u.team, vip: !!(u.vipUntil && u.vipUntil > new Date()) }))),
  };
}));

// ─── Liga ───────────────────────────────────────────────────────────────────
game.get('/league', cached(5000), handle(async () => {
  const round = await currentRound();
  if (!round) return { season: null, round: null, standings: {} };
  const rows = await prisma.standing.findMany({ where: { seasonId: round.seasonId }, include: { team: teamSel } });
  const standings = {};
  for (const s of ['A', 'B', 'C']) {
    standings[s] = rows.filter((r) => r.serie === s).sort(standingOrder).map((r, i) => ({
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

game.get('/league/rounds/:number', cached(5000), handle(async (req) => {
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

game.get('/league/titles', cached(10000), handle(async () => {
  const titles = await prisma.title.findMany({ orderBy: [{ seasonId: 'desc' }, { competition: 'asc' }, { place: 'asc' }], include: { team: teamSel, season: { select: { number: true } } } });
  return titles.map((t) => ({ season: t.season.number, competition: t.competition, place: t.place, team: teamView(t.team) }));
}));

// ─── Partida (página /partida/:id) ──────────────────────────────────────────
game.get('/matches/:id', handle((req) => matchPage(Number(req.params.id))));

// ─── Times ──────────────────────────────────────────────────────────────────
game.get('/teams', cached(30000), handle(async () => (await prisma.team.findMany({ orderBy: [{ serie: 'asc' }, { name: 'asc' }] })).map(teamView)));

game.get('/teams/:slug', cached(5000), handle(async (req) => {
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
    round ? prisma.standing.findMany({ where: { seasonId: round.seasonId, serie: team.serie }, include: { team: { select: { name: true } } } }) : [],
  ]);
  const position = standing ? allInSerie.sort(standingOrder).findIndex((s) => s.teamId === team.id) + 1 : null;
  const [totalGoals, board] = await Promise.all([prisma.goal.count({ where: { teamId: team.id } }), boardView(team.id)]);
  return {
    team: teamView(team), slogan: team.slogan,
    members, active: active.map((u) => ({ nick: u.nick, goalsTotal: u.goalsTotal, avatarUrl: u.avatarUrl, online: u.lastSeenAt.getTime() > now.getTime() - 2 * 60_000 })), totalGoals,
    standing: standing ? { position, ...standing } : null,
    match: match ? matchView(match) : null,
    tops: { hour: await withBadges(hourTop), round: await withBadges(roundTop), season: await withBadges(seasonTop) },
    titles: titles.map((t) => ({ season: t.season.number, competition: t.competition, place: t.place })),
    board, // diretoria (presidente + diretores) e movimentações
  };
}));

// ─── Jogadores ──────────────────────────────────────────────────────────────
// Jogadores ativos nas últimas 24 h (para a listagem clicável)
game.get('/players/active', cached(5000), handle(async () => {
  const now = Date.now();
  const users = await prisma.user.findMany({
    where: { lastSeenAt: { gt: new Date(now - 24 * 3600_000) }, deletedAt: null },
    orderBy: { lastSeenAt: 'desc' }, take: 300,
    select: { nick: true, goalsTotal: true, goalsRound: true, roundId: true, lastSeenAt: true, avatarUrl: true, vipUntil: true, nickColor: true, nickFade: true, team: teamSel },
  });
  return users.map((u) => ({ nick: u.nick, goalsTotal: u.goalsTotal, goalsRound: periodGoals(u).goalsRound, avatarUrl: u.avatarUrl, lastSeenAt: u.lastSeenAt, online: u.lastSeenAt.getTime() > now - 2 * 60_000, vip: !!(u.vipUntil && u.vipUntil.getTime() > now), nickColor: u.nickColor ?? null, nickFade: nickFadeOf(u, now), team: teamView(u.team) }));
}));

const searchLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'rate-limit', message: 'Muitas buscas. Aguarde um pouco.' } });
game.get('/players/search', searchLimiter, handle(async (req) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 1) return [];
  const users = await prisma.user.findMany({ where: { nickLower: { contains: q }, deletedAt: null }, take: 20, orderBy: { goalsTotal: 'desc' }, include: { team: teamSel } });
  return users.map((u) => ({ nick: u.nick, goalsTotal: u.goalsTotal, avatarUrl: u.avatarUrl, team: teamView(u.team) }));
}));

game.get('/players/:nick', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.params.nick).toLowerCase() }, include: { team: true } });
  if (!user || user.deletedAt) throw notFound('Jogador não encontrado.');
  const [geral, penal, falta, trilha, recent, round] = await Promise.all([
    prisma.user.count({ where: { goalsTotal: { gt: user.goalsTotal } } }),
    prisma.user.count({ where: { penaltyGoals: { gt: user.penaltyGoals } } }),
    prisma.user.count({ where: { foulGoals: { gt: user.foulGoals } } }),
    prisma.user.count({ where: { trailGoals: { gt: user.trailGoals } } }),
    prisma.activity.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    currentRound(),
  ]);
  return {
    ...publicView(user),
    ...(await playerClub(user)), // cargo no time e contrato
    tops: (await badgesOf(user.id)).tops, // top 3 de agora (hora/rodada/temporada)
    history: await topHistory(user.id), // vezes em 1º/2º/3º e no top 10
    x1: await x1Record(user.id, { season: round?.season ?? null, round: round ?? null }), // campanha no X1: total, por jogo, posição na rodada/temporada/geral
    positions: { geral: geral + 1, penal: penal + 1, falta: falta + 1, trilha: trilha + 1 },
    recent: recent.map((a) => ({ id: a.id, text: a.text, goal: a.goal, kind: a.kind, at: a.createdAt })),
  };
}));

game.get('/feed', cached(5000), handle(async (req) => {
  const team = req.query.team ? await prisma.team.findUnique({ where: { slug: String(req.query.team) } }) : null;
  const rows = await prisma.activity.findMany({ where: team ? { teamId: team.id } : {}, orderBy: { createdAt: 'desc' }, take: 40, include: { team: teamSel } });
  return rows.map((a) => ({ id: a.id, text: a.text, goal: a.goal, kind: a.kind, at: a.createdAt, team: teamView(a.team) }));
}));
