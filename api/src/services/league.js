/**
 * Liga — temporadas, rodadas de 24h (fecham às 19:00), partidas time x time,
 * classificação por série, premiações e recordes. Porta do BRGOL original.
 */
import { nickFadeOf } from '../lib/items.js';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { nextRoundClose, hourKey } from '../lib/time.js';
import { PRIZES, prizeFor, SERIE_A_SWAP } from '../lib/rules.js';
import { tg } from '../lib/telegram.js';
import { settleX1Round, settleX1Season } from './x1.js';
import { notify } from './inbox.js';

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
      nickFade: u ? nickFadeOf(u) : null,
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

/**
 * Top `take` da artilharia (o quadro, com todo mundo) e a lista PREMIADA: a mesma ordem, só sem os bots
 * (services/bots.js) — quem vem depois de um bot sobe de posição no prêmio. Sai de UMA consulta só, porque
 * duas consultas separadas embaralhavam os empates e o prêmio ia para outro do mesmo número de gols.
 */
export async function topAndPrizes(where, take, tx = prisma) {
  const botIds = new Set((await tx.user.findMany({ where: { isBot: true }, select: { id: true } })).map((u) => u.id));
  const rows = await topScorers(where, take + botIds.size, tx);
  return { top: rows.slice(0, take), prizes: rows.filter((r) => !botIds.has(r.userId)).slice(0, take).map((r, i) => ({ ...r, position: i + 1 })) };
}

/** Paga o top 10 da artilharia (`table` = PRIZES.round/season) e avisa cada premiado na caixa de mensagens. */
async function payPrizes(tx, top, table, { scope, number }) {
  for (const row of top) {
    const p = prizeFor(table, row.position);
    if (!p) continue;
    await tx.user.update({
      where: { id: row.userId },
      data: { money: { increment: p.money }, vipDays: { increment: p.vip } },
    });
    await notify.leaguePrize(row.userId, { scope, number, pos: row.position, goals: row.goals, money: p.money, vip: p.vip }, tx).catch((e) => console.error('[inbox] prêmio da artilharia:', e.message));
  }
}

function outcome(h, a) {
  if (h === a) return 'draw';
  return h > a ? 'home' : 'away';
}

// ─── Troca automática na Série A (SERIE_A_SWAP em rules.js; dono, 15/09/2026) ─
/**
 * Roda no fechamento da rodada, DEPOIS da tabela e ANTES de criar a rodada seguinte (que já sai com as séries novas),
 * na mesma transação. "Gols na rodada" = gols que os jogadores MARCARAM pelo time nela (`Goal.roundId`; gol tirado no
 * X1 não apaga o que o time marcou). Time da A com 0 gols (o pior da tabela primeiro) troca com quem mais marcou fora
 * da A, com pelo menos `minGoals` (empate: o melhor da tabela); faltou candidato, o resto fica. O da A vai para a B; se
 * quem subiu veio da C, o time da B com menos gols na rodada (empate: o pior da tabela; nunca um que já trocou agora)
 * desce para a C. A série mora em DOIS lugares — `Team.serie` (sorteio da rodada) e `Standing.serie` (tabela, título,
 * acesso) — e muda nos dois; pontos e gols vão junto (como na troca de 14/09). Os jogadores dos times que trocaram
 * recebem uma mensagem na caixa. Devolve as trocas (vão para o Telegram depois do commit).
 */
async function swapEmptySerieA(tx, season, round) {
  const rows = await tx.standing.findMany({ where: { seasonId: season.id }, include: { team: true } });
  const scored = new Map((await tx.goal.groupBy({ by: ['teamId'], where: { roundId: round.id }, _count: { _all: true } })).map((x) => [x.teamId, x._count._all]));
  const goals = (s) => scored.get(s.teamId) ?? 0;
  const worstFirst = (x, y) => standingOrder(y, x);
  const emptyA = rows.filter((s) => s.serie === 'A' && goals(s) === 0).sort(worstFirst);
  const risers = rows.filter((s) => s.serie !== 'A' && goals(s) >= SERIE_A_SWAP.minGoals).sort((x, y) => goals(y) - goals(x) || standingOrder(x, y));
  const moved = new Set();
  const setSerie = async (s, serie) => {
    await tx.team.update({ where: { id: s.teamId }, data: { serie } });
    await tx.standing.update({ where: { id: s.id }, data: { serie } });
    s.serie = serie;
    moved.add(s.teamId);
  };
  const swaps = [];
  for (const [i, down] of emptyA.entries()) {
    const up = risers[i];
    if (!up) break;
    const from = up.serie;
    // quem sobe veio da C: a B ganharia um time — desce o da B com menos gols (escolhido ANTES de o da A chegar lá)
    const drop = from === 'C'
      ? rows.filter((s) => s.serie === 'B' && !moved.has(s.teamId)).sort((x, y) => goals(x) - goals(y) || worstFirst(x, y))[0] ?? null
      : null;
    await setSerie(up, 'A');
    await setSerie(down, 'B');
    if (drop) await setSerie(drop, 'C');
    const brief = (s) => ({ id: s.teamId, name: s.team.name }); // o resultado vai para o log do scheduler
    swaps.push({ up: brief(up), down: brief(down), from, goals: goals(up), drop: drop ? brief(drop) : null, dropGoals: drop ? goals(drop) : null });
  }
  if (!swaps.length) return swaps;

  // caixa de mensagens dos jogadores dos times que trocaram de série
  const n = round.number;
  const plural = (k) => (k === 1 ? '1 gol' : `${k} gols`);
  const notes = [];
  for (const w of swaps) {
    // sem artigo antes do nome ("a Chapecoense", "o Náutico"): o nome do time abre a frase
    notes.push({ teamId: w.up.id, icon: '/ui/ico-trophy_gold.png', title: 'Seu time subiu para a Série A!', text: `${w.up.name} fez ${plural(w.goals)} na rodada ${n} e subiu da Série ${w.from} para a Série A no lugar de ${w.down.name}, que não marcou nenhum gol. Os pontos e gols da temporada vão junto.` });
    notes.push({ teamId: w.down.id, icon: '/ui/pi-bell.png', title: 'Seu time caiu para a Série B', text: `${w.down.name} não marcou nenhum gol na rodada ${n} e foi para a Série B. Quem subiu para a Série A foi ${w.up.name}, com ${plural(w.goals)}. Os pontos e gols da temporada vão junto: marque gols para o time voltar!` });
    if (w.drop) notes.push({ teamId: w.drop.id, icon: '/ui/pi-bell.png', title: 'Seu time foi para a Série C', text: `${w.up.name} subiu da Série C direto para a Série A e ${w.down.name} caiu da A para a B. Para as séries ficarem do mesmo tamanho, desceu para a C o time da Série B com menos gols na rodada ${n}: ${w.drop.name} (${plural(w.dropGoals)}). Os pontos e gols da temporada vão junto.` });
  }
  const players = await tx.user.findMany({ where: { teamId: { in: notes.map((x) => x.teamId) }, deletedAt: null }, select: { id: true, teamId: true } });
  const data = [];
  for (const note of notes) for (const u of players) if (u.teamId === note.teamId) data.push({ userId: u.id, kind: 'AVISO', title: note.title, text: note.text, icon: note.icon });
  if (data.length) await tx.message.createMany({ data });
  return swaps;
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
    for (const w of r.swaps ?? []) {
      tg.info(`🔁 Série A, rodada ${r.round}: <b>${tg.esc(w.up.name)}</b> (Série ${w.from}, ${w.goals} gols) subiu no lugar de <b>${tg.esc(w.down.name)}</b> (0 gols), que foi para a B${w.drop ? `; <b>${tg.esc(w.drop.name)}</b> (${w.dropGoals} gols na B) desceu para a C` : ''}.`);
    }
    // Ranking X1 (services/x1.js): transação própria e idempotente, DEPOIS da liga — um erro aqui não segura
    // o fechamento da rodada (que já está gravado), só fica no log e o prêmio sai na próxima volta do scheduler.
    try {
      r.x1 = await settleX1Round(round.id, now);
      if (r.seasonFinished) r.x1Season = await settleX1Season(round.seasonId, now);
    } catch (e) { console.error('[x1] fechamento:', e.message); }
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
  const { top, prizes } = await topAndPrizes({ roundId: round.id }, 10, tx); // o quadro com todo mundo; a premiação SEM os bots
  await payPrizes(tx, prizes, PRIZES.round, { scope: 'rodada', number: round.number });
  const rec = await applyRecord(tx, 'ROUND', season.id, top);
  if (rec) {
    await tx.user.update({ where: { id: rec.userId }, data: { vipDays: { increment: PRIZES.roundRecord.vip } } });
    await notify.roundRecord(rec.userId, { number: round.number, goals: rec.goals, vip: PRIZES.roundRecord.vip }, tx).catch((e) => console.error('[inbox] recorde da rodada:', e.message));
  }
  await tx.round.update({ where: { id: round.id }, data: { status: 'FINISHED', topJson: top } });

  if (round.number < season.totalRounds) {
    // time da A sem gol na rodada troca com quem mais marcou fora dela — antes de sortear os jogos da próxima
    const swaps = await swapEmptySerieA(tx, season, round);
    const next = await createRound(tx, season, round.number + 1, now);
    return { round: round.number, next: next.number, swaps };
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
    teamPrizes.push({ teamId: table[0].teamId, team: table[0].team.name, serie, place: 1, vip: PRIZES.team[serie].champion });
    if (table[1]) {
      await tx.title.create({ data: { seasonId: season.id, teamId: table[1].teamId, competition: `Série ${serie}`, place: 2 } });
      teamPrizes.push({ teamId: table[1].teamId, team: table[1].team.name, serie, place: 2, vip: PRIZES.team[serie].runnerUp });
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
  const teamVip = new Map(); // userId -> o prêmio de time que ele leva (o maior)
  for (const prize of teamPrizes) {
    const scorers = await tx.goal.groupBy({ by: ['userId'], where: { seasonId: season.id, teamId: prize.teamId, user: { isBot: false } } }); // bot não leva VIP
    for (const { userId } of scorers) if ((teamVip.get(userId)?.vip ?? 0) < prize.vip) teamVip.set(userId, prize);
  }
  for (const vip of new Set([...teamVip.values()].map((p) => p.vip))) {
    const ids = [...teamVip].filter(([, p]) => p.vip === vip).map(([id]) => id);
    await tx.user.updateMany({ where: { id: { in: ids } }, data: { vipDays: { increment: vip } } });
  }
  for (const [userId, p] of teamVip) {
    await notify.teamPrize(userId, { team: p.team, serie: p.serie, place: p.place, season: season.number, vip: p.vip }, tx).catch((e) => console.error('[inbox] prêmio de time:', e.message));
  }
  // Artilharia da temporada: prêmios + recorde
  const { top, prizes } = await topAndPrizes({ seasonId: season.id }, 10, tx); // premiação SEM os bots
  await payPrizes(tx, prizes, PRIZES.season, { scope: 'temporada', number: season.number });
  await applyRecord(tx, 'SEASON', season.id, top);
  // top 10 congelado (igual Round.topJson / HourResult.topJson) — estatísticas de top 10 do perfil
  await tx.season.update({ where: { id: season.id }, data: { status: 'FINISHED', endsAt: now, topJson: top } });
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
