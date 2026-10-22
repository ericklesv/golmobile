/**
 * Galeria de troféus (pedido do dono, 22/10/2026: os jogadores sentiram falta de uma galeria com os campeões e os
 * artilheiros das temporadas; ela ocupa a aba que era do Perfil). Só LÊ o que os fechamentos já congelam — nada
 * novo é gravado:
 *  - campeão e vice de cada série (`Title`, gravado em finishSeason de league.js);
 *  - top da artilharia da temporada e de cada rodada (`Season.topJson` / `Round.topJson`: o quadro que todo mundo
 *    viu no ranking, com os bots junto — como no ranking);
 *  - Ranking X1 da temporada (`Season.x1Json.paid`: só os premiados, e bot não leva prêmio);
 *  - recordes de gols da hora, da rodada e da temporada (`Record`, sem bots).
 */
import { prisma } from '../prisma.js';
import { teamView } from './view.js';

const COMPETITIONS = ['Série A', 'Série B', 'Série C'];
const SCOPES = ['HOUR', 'ROUND', 'SEASON'];
const teamSel = { select: { id: true, slug: true, name: true, abbr: true, colorPrimary: true, colorSecondary: true, colorTertiary: true, kitDesign: true, stadium: true, serie: true, state: true } };

/** Pódio a partir de um top congelado (mesmo formato de linha do TopList da tela). */
const podium = (top, n = 3) => (Array.isArray(top) ? top.slice(0, n) : []).map((r, i) => ({
  position: r.position ?? i + 1, userId: r.userId, nick: r.nick, avatarUrl: r.avatarUrl ?? null,
  nickColor: r.nickColor ?? null, nickFade: r.nickFade ?? null, goals: r.goals, team: r.team ?? null, vip: false,
}));
/** Artilheiro de uma rodada fechada (o 1º do quadro congelado), ou null se ninguém marcou. */
const kingOf = (round) => (Array.isArray(round.topJson) && round.topJson[0]?.goals > 0 ? round.topJson[0] : null);

export async function gallery() {
  const [seasons, titles, records, rounds, teams, active] = await Promise.all([
    prisma.season.findMany({ where: { status: 'FINISHED' }, orderBy: { number: 'desc' }, select: { id: true, number: true, startsAt: true, endsAt: true, topJson: true, x1Json: true } }),
    prisma.title.findMany({ include: { team: teamSel } }),
    prisma.record.findMany({ include: { user: { select: { nick: true, avatarUrl: true, nickColor: true, team: teamSel } }, season: { select: { number: true } } } }),
    prisma.round.findMany({ where: { status: 'FINISHED' }, select: { number: true, seasonId: true, topJson: true }, orderBy: [{ seasonId: 'asc' }, { number: 'asc' }] }),
    prisma.team.findMany(teamSel),
    prisma.season.findFirst({ where: { status: 'ACTIVE' }, orderBy: { number: 'desc' }, select: { id: true, number: true, totalRounds: true, rounds: { where: { status: 'LIVE' }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 } } }),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const x1Ids = [...new Set(seasons.flatMap((s) => (s.x1Json?.paid ?? []).map((p) => p.userId)))];
  const x1Users = new Map((x1Ids.length ? await prisma.user.findMany({ where: { id: { in: x1Ids } }, select: { id: true, avatarUrl: true, nickColor: true } }) : []).map((u) => [u.id, u]));

  // Uma entrada por temporada fechada, a mais nova primeiro
  const seasonsOut = seasons.map((s) => ({
    number: s.number, startsAt: s.startsAt, endsAt: s.endsAt,
    titles: COMPETITIONS.map((competition) => {
      const of = (place) => titles.find((t) => t.seasonId === s.id && t.competition === competition && t.place === place);
      return { competition, champion: teamView(of(1)?.team), vice: teamView(of(2)?.team) };
    }).filter((t) => t.champion),
    scorers: podium(s.topJson),
    x1: (s.x1Json?.paid ?? []).slice(0, 3).map((p) => {
      const row = (s.x1Json.rows ?? []).find((r) => r.userId === p.userId);
      const u = x1Users.get(p.userId);
      return {
        position: p.position, userId: p.userId, nick: p.nick, avatarUrl: u?.avatarUrl ?? null, nickColor: u?.nickColor ?? null,
        goals: row?.points ?? 0, team: teamView(teamById.get(row?.teamId)), vip: false,
        fp: row ? { wins: row.wins, draws: row.draws, losses: row.losses, played: row.played, points: row.points, streak: 0, best: row.best ?? 0 } : undefined,
      };
    }),
  }));

  // Recordes de todos os tempos: o maior de cada escopo entre as temporadas (o mais antigo, no empate)
  const recordsOut = SCOPES.map((scope) => {
    const best = records.filter((r) => r.scope === scope).sort((a, b) => b.goals - a.goals || a.setAt - b.setAt)[0];
    return best ? { scope, goals: best.goals, nick: best.user.nick, avatarUrl: best.user.avatarUrl ?? null, nickColor: best.user.nickColor ?? null, team: teamView(best.user.team), season: best.season?.number ?? null, setAt: best.setAt } : null;
  }).filter(Boolean);

  // Maiores campeões: títulos por time (campeão conta antes; no empate, quem tem mais Série A, depois mais vices)
  const byTeam = new Map();
  for (const t of titles) {
    const e = byTeam.get(t.teamId) ?? { team: teamView(t.team), champion: 0, vice: 0, byCompetition: {} };
    if (t.place === 1) { e.champion++; e.byCompetition[t.competition] = (e.byCompetition[t.competition] ?? 0) + 1; } else e.vice++;
    byTeam.set(t.teamId, e);
  }
  const hall = [...byTeam.values()]
    .sort((a, b) => b.champion - a.champion || (b.byCompetition['Série A'] ?? 0) - (a.byCompetition['Série A'] ?? 0) || b.vice - a.vice || a.team.name.localeCompare(b.team.name))
    .slice(0, 10)
    .map(({ team, champion, vice, byCompetition }) => ({ team, champion, vice, titles: COMPETITIONS.filter((c) => byCompetition[c]).map((competition) => ({ competition, count: byCompetition[competition] })) }));

  // Artilheiro de cada rodada: as da temporada em andamento (a mais recente primeiro) e quem mais vezes foi o 1º
  const kingCount = new Map();
  for (const r of rounds) {
    const k = kingOf(r);
    if (!k) continue;
    const e = kingCount.get(k.userId) ?? { ...k, wins: 0 };
    kingCount.set(k.userId, { ...e, ...k, wins: e.wins + 1 }); // nick/foto/time da vez mais recente
  }
  const kings = [...kingCount.values()].sort((a, b) => b.wins - a.wins).slice(0, 5)
    .map((k, i) => ({ position: i + 1, userId: k.userId, nick: k.nick, avatarUrl: k.avatarUrl ?? null, nickColor: k.nickColor ?? null, nickFade: k.nickFade ?? null, goals: k.wins, team: k.team ?? null, vip: false }));
  const current = active ? {
    number: active.number, totalRounds: active.totalRounds, round: active.rounds[0]?.number ?? null,
    kings: rounds.filter((r) => r.seasonId === active.id).map((r) => ({ round: r.number, king: kingOf(r) })).filter((r) => r.king).reverse()
      .map(({ round, king }) => ({ round, userId: king.userId, nick: king.nick, avatarUrl: king.avatarUrl ?? null, nickColor: king.nickColor ?? null, nickFade: king.nickFade ?? null, goals: king.goals, team: king.team ?? null })),
  } : null;

  return { seasons: seasonsOut, current, records: recordsOut, hall, kings };
}
