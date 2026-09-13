/**
 * Minigame Falta PRO — cobrança de falta 3D estilo Free Kick Classic (vira às 19h).
 * O jogador ARRASTA a partir da bola; a tela resume o gesto em { dirX, dirY, power, spin }
 * e o servidor simula tudo (lib/faltapro.js): barreira, goleiro, trave, alvos bônus.
 * 5 cobranças por dia; 3+ gols = 1 gol do time (kind FALTAPRO — nunca mais de 1);
 * +4 de nível por cobrança convertida (até +20); alvo bônus no ângulo = +R$ 50.
 *
 * Estado em DailyGame.state (game 'FALTAPRO'): { i, goals, points, money, kicks: [5 sorteios
 * completos], results: [{ i, result, target }], over }. O goleiro e o "pula/não pula" da
 * barreira nunca vão para a tela antes do chute.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError } from '../lib/errors.js';
import { dayNumberAt, nextResetAt } from '../lib/time.js';
import { MINIGAMES, RESET_HOUR, resetLabel, levelOf } from '../lib/rules.js';
import { FALTAPRO as C, newKick, publicKick, simulateKick } from '../lib/faltapro.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';

const HOUR = RESET_HOUR.FALTAPRO;
const DONE = () => `Você já cobrou as faltas de hoje. O Falta PRO renova ${resetLabel('FALTAPRO')}!`;
const rand = () => randomInt(0, 2 ** 32) / 2 ** 32; // sorteio criptográfico (não dá para prever)
// Teste local: MINIGAMES_LIVRES=1 no api/.env (NUNCA em produção) libera jogar de novo na hora.
const FREE = process.env.NODE_ENV !== 'production' && process.env.MINIGAMES_LIVRES === '1';

function view(row, now) {
  const st = row?.state ?? {};
  const playing = Array.isArray(st.kicks) && !st.over;
  return {
    day: dayNumberAt(HOUR, now), nextAt: nextResetAt(HOUR, now).getTime(),
    kicks: C.kicks, goalAt: C.goalAt, pointsPerGoal: C.pointsPerGoal, maxPoints: C.maxPoints, targetMoney: C.targetMoney,
    playing, finished: !!row?.finishedAt, freePlay: FREE,
    i: st.i ?? 1, goals: st.goals ?? 0, points: st.points ?? 0, money: st.money ?? 0,
    kick: playing ? publicKick(st.kicks[st.i - 1], st.i) : null, // sem o goleiro e sem o pulo da barreira
    results: st.results ?? [],
  };
}

/** Só leitura: abrir a tela não começa o jogo. */
export async function faltaproState(userId) {
  const now = new Date();
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'FALTAPRO', day: dayNumberAt(HOUR, now) } } });
  return { state: view(row, now) };
}

async function withFaltapro(userId, fn) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'FALTAPRO', ${day}, '{}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'FALTAPRO' AND day = ${day} FOR UPDATE`;
    const ctx = { tx, row, st: { ...row.state }, now, patch: {} };
    const extra = (await fn(ctx)) ?? {};
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: ctx.st, ...ctx.patch } });
    return { ...extra, state: view(saved, now) };
  });
}

/** Começa o jogo do dia: sorteia as 5 cobranças (ou devolve o que está aberto). */
export function faltaproStart(userId) {
  return withFaltapro(userId, async (ctx) => {
    const { st, row, tx } = ctx;
    if (Array.isArray(st.kicks) && !st.over) return {};
    if (row.finishedAt && !FREE) throw new GameError(409, 'finished', DONE());
    if (row.finishedAt) ctx.patch = { finishedAt: null, won: false }; // teste local: recomeça
    const g = MINIGAMES.find((m) => m.id === 'FALTAPRO');
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (g && levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `Falta PRO libera no nível ${g.unlock}.`);
    Object.assign(st, { i: 1, goals: 0, points: 0, money: 0, over: false, results: [], kicks: Array.from({ length: C.kicks }, () => newKick(rand)) });
    return {};
  });
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/**
 * A cobrança: { i (nº da cobrança), dirX (−1..1), dirY (0..1), power (0..1), spin (−1..1) }.
 * Devolve o resultado, o voo para a tela animar (amostras [x, z, y] a 30/s), o gol do time
 * (na 3ª conversão) e a próxima cobrança no `state`.
 */
export async function faltaproKick(userId, body = {}) {
  const dirX = num(body.dirX), dirY = num(body.dirY), power = num(body.power), spin = num(body.spin);
  if (![dirX, dirY, power, spin].every(Number.isFinite)) throw new GameError(400, 'bad-kick', 'Cobrança inválida.');
  if (dirX < -1.2 || dirX > 1.2 || dirY < 0 || dirY > 1.2 || power < 0 || power > 1 || spin < -1.2 || spin > 1.2) {
    throw new GameError(400, 'bad-kick', 'Gesto fora da faixa física. Arraste a partir da bola.');
  }
  if (power < 0.05) throw new GameError(400, 'bad-kick', 'Arraste com mais força.');
  return withFaltapro(userId, async (ctx) => {
    const { st, tx, now } = ctx;
    if (!Array.isArray(st.kicks) || st.over) throw new GameError(409, 'no-run', ctx.row.finishedAt ? DONE() : 'Comece o Falta PRO.');
    if (Number(body.i) !== st.i) throw new GameError(409, 'stale', 'Essa cobrança já foi. Veja a próxima.');
    const kick = st.kicks[st.i - 1];
    const r = simulateKick(kick, { dirX, dirY, power, spin });
    let goal = null, add = 0, money = 0;
    if (r.result === 'goal') {
      st.goals += 1;
      add = Math.max(0, Math.min(C.pointsPerGoal, C.maxPoints - st.points));
      if (add) { st.points += add; await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: add } } }); }
      if (r.target !== null && r.target >= 0) { // alvo bônus no ângulo
        money = C.targetMoney;
        st.money = (st.money ?? 0) + money;
        await tx.user.update({ where: { id: userId }, data: { money: { increment: money } } });
      }
      if (st.goals === C.goalAt) { // venceu o dia: exatamente 1 gol do time (regra do dono)
        const user = await loadUser(tx, userId);
        const live = await liveMatchForTeam(user.teamId, tx);
        const { text, match } = await applyResult(tx, user, {
          kind: 'FALTAPRO', goal: true, now, match: live, money: 0,
          phrase: 'converteu 3 cobranças de falta no Falta PRO',
        });
        goal = { text, match: match ? { id: match.id, homeGoals: match.homeGoals, awayGoals: match.awayGoals } : null };
        ctx.patch = { won: true };
      }
    }
    st.results = [...(st.results ?? []), { i: st.i, result: r.result, target: r.target ?? null }];
    if (st.i >= C.kicks) {
      Object.assign(st, { over: true });
      ctx.patch = { ...ctx.patch, finishedAt: now, reward: { goals: st.goals, levelPoints: st.points, money: st.money ?? 0, won: st.goals >= C.goalAt } };
    } else {
      st.i += 1;
    }
    return {
      result: r.result, target: r.target ?? null, levelPoints: add, money, goal,
      flight: {
        T: r.T, samples: r.samples, cross: r.cross,
        wall: r.wall, // { jump, hit } — agora pode contar se a barreira pulou
        keeper: r.keeper ? { react: r.keeper.react, speed: r.keeper.speed, from: r.keeper.from, to: r.keeper.to, save: r.keeper.save } : null,
      },
      kick: publicKick(kick, Number(body.i)),
    };
  });
}
