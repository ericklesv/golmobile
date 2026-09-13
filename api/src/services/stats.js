/**
 * Minigame Estatísticas — "quem tem mais X?" entre dois jogadores do Brasileirão 2025.
 * Acertou, segue; errou, acaba. UMA partida por dia (vira às 13h), valendo prêmio; a maior
 * sequência fica em User.statsBest. Mistura pares da API com duelos do dono (curated.js).
 * O par e os números ficam no servidor: a tela só recebe os números depois de escolher.
 *
 * Estado em DailyGame.state (game 'STATS'): { run: { mode, streak, pair, over } | null,
 * dailyScore, runs }. finishedAt = a partida valendo do dia acabou.
 */
import { prisma } from '../prisma.js';
import { GameError } from '../lib/errors.js';
import { statsDayNumber, nextStatsReset } from '../lib/time.js';
import { STATS, MINIGAMES, levelOf } from '../lib/rules.js';
import { CATEGORIES, categoryOf, dataset, eligible, playerCard, statsReady, teamFor } from '../lib/stats/data.js';
import { CURATED } from '../lib/stats/curated.js';

// ~1 em cada 3 pares é um duelo do dono (história do Brasileirão). Fora de produção,
// STATS_CURATED_SHARE força outra proporção (teste visual dos duelos).
const CURATED_SHARE = process.env.NODE_ENV !== 'production' && process.env.STATS_CURATED_SHARE ? Number(process.env.STATS_CURATED_SHARE) : 0.3;
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Um par novo. Às vezes um duelo do dono (sem repetir na mesma partida, lados sorteados);
 * senão, dois jogadores na mesma categoria, sem empate e não os dois zerados.
 */
function newPair(avoid = [], usedCurated = []) {
  const left = CURATED.filter((c) => !usedCurated.includes(c.id));
  if (left.length && Math.random() < CURATED_SHARE) return { curated: pickOne(left).id, flip: Math.random() < 0.5 };
  for (let i = 0; i < 300; i++) {
    const cat = pickOne(CATEGORIES);
    const pool = eligible(cat);
    if (pool.length < 2) continue;
    const a = pickOne(pool), b = pickOne(pool);
    if (a.id === b.id || avoid.includes(a.id) || avoid.includes(b.id)) continue;
    if (a[cat.key] === b[cat.key] || a[cat.key] + b[cat.key] === 0) continue;
    return { cat: cat.key, a: a.id, b: b.id };
  }
  throw new GameError(500, 'no-pair', 'Não deu para montar a próxima pergunta.');
}

function curatedView(pair, reveal) {
  const c = CURATED.find((x) => x.id === pair.curated);
  const [left, right] = pair.flip ? [c.b, c.a] : [c.a, c.b];
  const card = (s, k) => {
    const team = s.team ? teamFor(s.team) : { slug: null, name: s.name, abbr: s.abbr ?? s.name.slice(0, 3).toUpperCase(), colorPrimary: '#0B2D6B', colorSecondary: '#FFFFFF' };
    return {
      id: `${c.id}${k}`, name: s.name, position: '', subtitle: s.sub ?? (c.kind === 'state' ? 'Estado' : ''), team, photo: null,
      ...(reveal ? { value: s.value, show: s.show ?? String(s.value) } : {}),
    };
  };
  const lowWins = c.better === 'low';
  const winner = (left.value > right.value) !== lowWins ? 'a' : 'b';
  return { category: 'curated', label: '', question: c.q, note: c.note ?? 'História do Brasileirão', a: card(left, 'a'), b: card(right, 'b'), ...(reveal ? { winner } : {}) };
}

function pairView(pair, reveal = false) {
  if (!pair) return null;
  if (pair.curated) return curatedView(pair, reveal);
  const ds = dataset();
  const cat = categoryOf(pair.cat);
  const va = ds.byId.get(pair.a)[cat.key], vb = ds.byId.get(pair.b)[cat.key];
  const side = (id, v) => ({ ...playerCard(ds.byId.get(id)), ...(reveal ? { value: v, show: String(v) } : {}) });
  return { category: cat.key, label: cat.label, question: `Quem tem mais ${cat.label}?`, a: side(pair.a, va), b: side(pair.b, vb), ...(reveal ? { winner: va > vb ? 'a' : 'b' } : {}) };
}

function view(row, best, now) {
  const st = row?.state ?? {};
  const run = st.run ?? null;
  return {
    day: statsDayNumber(now), nextAt: nextStatsReset(now).getTime(), season: STATS.season,
    daily: { finished: !!row?.finishedAt, score: st.dailyScore ?? null, reward: row?.reward ?? null },
    run: run ? { mode: run.mode, streak: run.streak, over: run.over, pair: run.over ? null : pairView(run.pair) } : null,
    best,
  };
}

async function withStats(userId, fn) {
  if (!statsReady()) throw new GameError(503, 'no-data', 'As estatísticas ainda não foram carregadas.');
  const now = new Date();
  const day = statsDayNumber(now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'STATS', ${day}, '{"run":null,"dailyScore":null,"runs":0}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'STATS' AND day = ${day} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { statsBest: true } });
    const ctx = { tx, row, st: { ...row.state }, best: user.statsBest, now, patch: {} };
    const extra = (await fn(ctx)) ?? {};
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: ctx.st, ...ctx.patch } });
    return { ...extra, state: view(saved, ctx.best, now) };
  });
}

export const statsState = (userId) => withStats(userId, () => ({}));

/**
 * Começa a partida do dia. Só existe UMA por dia, valendo gol — sem partida livre pelo recorde
 * (poucos duelos do dono; decisão de 13/09/2026). Acabou, só na próxima virada (13h).
 */
export function statsStart(userId) {
  return withStats(userId, async ({ st, row, tx }) => {
    if (st.run && !st.run.over) return {}; // já tem uma em andamento: continua nela
    if (row.finishedAt) throw new GameError(409, 'finished', 'Você já jogou as Estatísticas. Elas renovam às 13h!');
    // nível que libera (catálogo do hub de minigames), conferido no servidor como nos outros
    const g = MINIGAMES.find((m) => m.id === 'STATS');
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (g && levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `Estatísticas libera no nível ${g.unlock}.`);
    st.run = { mode: 'daily', streak: 0, pair: newPair(), over: false, usedCurated: [] };
    st.runs = (st.runs ?? 0) + 1;
    return {};
  });
}

/** Escolhe um lado ('a' ou 'b'). Devolve os números do par e o próximo par (se acertou). */
export function statsPick(userId, side) {
  return withStats(userId, async (ctx) => {
    const { st, tx, now } = ctx;
    const run = st.run;
    if (!run || run.over || !run.pair) throw new GameError(409, 'no-run', 'Comece uma partida primeiro.');
    if (side !== 'a' && side !== 'b') throw new GameError(400, 'bad-side', 'Escolha um dos dois jogadores.');
    const shown = pairView(run.pair, true);
    const correct = shown.winner === side;
    if (correct) {
      run.streak += 1;
      if (run.pair.curated) run.usedCurated = [...(run.usedCurated ?? []), run.pair.curated];
      run.pair = newPair(run.pair.curated ? [] : [run.pair.a, run.pair.b], run.usedCurated ?? []);
    } else {
      run.over = true;
      run.pair = null;
      if (run.streak > ctx.best) {
        ctx.best = run.streak;
        await tx.user.update({ where: { id: userId }, data: { statsBest: run.streak } });
      }
      if (run.mode === 'daily') ctx.patch = await finishDaily(tx, userId, st, run.streak, now);
    }
    st.run = run;
    return { correct, picked: side, revealed: shown };
  });
}

async function finishDaily(tx, userId, st, streak, now) {
  const levelPoints = Math.min(STATS.maxPoints, streak * STATS.pointsPerHit);
  const reward = { goal: false, levelPoints, streak, text: null, match: null };
  if (streak >= STATS.goalAt) {
    const user = await loadUser(tx, userId);
    const match = await liveMatchForTeam(user.teamId, tx);
    const { text } = await applyResult(tx, user, { kind: 'STATS', goal: true, now, match, money: 0, phrase: `emendou ${streak} acertos seguidos nas Estatísticas` });
    Object.assign(reward, { goal: true, text, match: match ? { id: match.id, homeGoals: match.homeGoals, awayGoals: match.awayGoals } : null });
  }
  if (levelPoints) await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: levelPoints } } });
  st.dailyScore = streak;
  return { won: reward.goal, reward, finishedAt: now };
}
