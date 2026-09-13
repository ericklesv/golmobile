/**
 * Minigame Hat Trick — chute de longe (vira às 18h). A bola aparece num ponto sorteado do campo, com
 * vento; o jogador mira/dá força (estilingue) e bate na bola (lado = efeito, embaixo = sobe). A física
 * e o goleiro ficam em lib/hattrick.js. 3 vidas: gol = 1 gol do time (vários no dia — exceção do
 * dono à regra de 1 gol); pra fora, na trave, por cima, defendido ou furou = perde 1 vida.
 *
 * Estado em DailyGame.state (game 'HATTRICK'): { lives, goals, points, shot: { i, ball, wind, keeper },
 * over, last }. O goleiro do lance (reação, velocidade, leitura, frango) nunca vai para a tela.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError } from '../lib/errors.js';
import { dayNumberAt, nextResetAt } from '../lib/time.js';
import { MINIGAMES, RESET_HOUR, resetLabel, levelOf } from '../lib/rules.js';
import { HATTRICK as C, newShot, simulate } from '../lib/hattrick.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';

const HOUR = RESET_HOUR.HATTRICK;
const DONE = () => `Você já jogou o Hat Trick. Ele renova ${resetLabel('HATTRICK')}!`;
const rand = () => randomInt(0, 2 ** 32) / 2 ** 32; // sorteio criptográfico (não dá para prever o lance)

function view(row, now) {
  const st = row?.state ?? {};
  const playing = !!st.shot && !st.over;
  return {
    day: dayNumberAt(HOUR, now), nextAt: nextResetAt(HOUR, now).getTime(),
    maxLives: C.lives, pointsPerGoal: C.pointsPerGoal, maxPoints: C.maxPoints,
    playing, finished: !!row?.finishedAt,
    lives: st.lives ?? C.lives, goals: st.goals ?? 0, points: st.points ?? 0,
    shot: playing ? { i: st.shot.i, ball: st.shot.ball, wind: st.shot.wind } : null, // sem o goleiro
    last: st.last ?? null,
  };
}

/** Só leitura: abrir a tela não começa o jogo. */
export async function hattrickState(userId) {
  const now = new Date();
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'HATTRICK', day: dayNumberAt(HOUR, now) } } });
  return { state: view(row, now) };
}

async function withHattrick(userId, fn) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'HATTRICK', ${day}, '{}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'HATTRICK' AND day = ${day} FOR UPDATE`;
    const ctx = { tx, row, st: { ...row.state }, now, patch: {} };
    const extra = (await fn(ctx)) ?? {};
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: ctx.st, ...ctx.patch } });
    return { ...extra, state: view(saved, now) };
  });
}

/** Começa o jogo do dia (ou devolve o que está aberto). */
export function hattrickStart(userId) {
  return withHattrick(userId, async ({ st, row, tx }) => {
    if (st.shot && !st.over) return {};
    if (row.finishedAt) throw new GameError(409, 'finished', DONE());
    const g = MINIGAMES.find((m) => m.id === 'HATTRICK');
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (g && levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `Hat Trick libera no nível ${g.unlock}.`);
    Object.assign(st, { lives: C.lives, goals: 0, points: 0, over: false, last: null, shot: { i: 1, ...newShot(rand) } });
    return {};
  });
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/**
 * O chute: { i (nº do lance), dirX, dirY (mira; dirY < 0 = rumo ao gol), power 0..1, strike: { sx, sy }
 * (onde tocou na bola, −1..1) ou null (furou/não tocou) }. Devolve o resultado, o voo para a tela
 * animar, o gol (se foi) e o próximo lance.
 */
export async function hattrickShoot(userId, body = {}) {
  const dirX = num(body.dirX), dirY = num(body.dirY), power = num(body.power);
  if (![dirX, dirY, power].every(Number.isFinite) || power < 0 || power > 1) throw new GameError(400, 'bad-shot', 'Chute inválido.');
  if (dirY >= -0.05) throw new GameError(400, 'bad-aim', 'Mire para o gol (puxe a bola para trás).');
  let strike = null;
  if (body.strike && typeof body.strike === 'object') {
    const sx = num(body.strike.sx), sy = num(body.strike.sy);
    if (Number.isFinite(sx) && Number.isFinite(sy) && sx * sx + sy * sy <= 1.05) strike = { sx, sy }; // fora da bola = furou
  }
  return withHattrick(userId, async (ctx) => {
    const { st, tx, now } = ctx;
    if (!st.shot || st.over) throw new GameError(409, 'no-run', ctx.row.finishedAt ? DONE() : 'Comece o Hat Trick.');
    if (Number(body.i) !== st.shot.i) throw new GameError(409, 'stale', 'Esse lance já foi. Veja o próximo.');
    const shot = st.shot;
    const r = simulate(shot, { dirX, dirY, power, strike });
    let goal = null, add = 0;
    if (r.result === 'goal') {
      st.goals += 1;
      add = Math.max(0, Math.min(C.pointsPerGoal, C.maxPoints - st.points));
      if (add) { st.points += add; await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: add } } }); }
      const user = await loadUser(tx, userId);
      const live = await liveMatchForTeam(user.teamId, tx);
      const phrase = st.goals === 3 ? 'completou o HAT TRICK com um chute de longe'
        : st.goals > 3 ? `marcou o ${st.goals}º gol de longe hoje no Hat Trick` : 'mandou uma bomba de longe no Hat Trick';
      const { text, match } = await applyResult(tx, user, { kind: 'HATTRICK', goal: true, now, match: live, money: 0, phrase });
      goal = { text, hatTrick: st.goals === 3, match: match ? { id: match.id, homeGoals: match.homeGoals, awayGoals: match.awayGoals } : null };
      ctx.patch = { won: true, reward: { goals: st.goals, levelPoints: st.points } };
    } else {
      st.lives -= 1;
    }
    st.last = { i: shot.i, result: r.result, ball: shot.ball, wind: shot.wind, cross: r.cross };
    if (st.lives <= 0) {
      Object.assign(st, { over: true, shot: null });
      ctx.patch = { ...ctx.patch, finishedAt: now, won: st.goals > 0, reward: { goals: st.goals, levelPoints: st.points } };
    } else {
      st.shot = { i: shot.i + 1, ...newShot(rand) };
    }
    return {
      result: r.result, levelPoints: add, goal,
      flight: { T: r.T, samples: r.samples, cross: r.cross, keeper: r.keeper ? { react: r.keeper.react, speed: r.keeper.speed, to: r.keeper.to, save: r.keeper.save } : null },
      shot: { i: shot.i, ball: shot.ball, wind: shot.wind },
    };
  });
}
