/**
 * Minigame Camisas — maior ou menor. Uma sequência de 4 camisas numeradas de 1 a 11 (sem repetir
 * número): a 1ª aparece e o jogador diz se a próxima é maior ou menor. Acertou as 4 = 1 gol do time
 * e vem outra sequência; errou, acaba o jogo do dia (vira à meia-noite). Vários gols por dia enquanto
 * não errar — EXCEÇÃO à regra de 1 gol por minigame (decisão do dono, 13/09/2026). +3 de nível por
 * acerto (até +30).
 *
 * Estado em DailyGame.state (game 'CAMISAS'): { seq: [n×4], pos, goals, hits, points, over, last }.
 * As camisas ainda escondidas ficam só no servidor. Gol e nível entram NA HORA: sair no meio não
 * perde nada, e a sequência aberta continua quando voltar (no mesmo dia).
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError } from '../lib/errors.js';
import { dayNumber, nextMidnight } from '../lib/time.js';
import { CAMISAS, MINIGAMES, levelOf } from '../lib/rules.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';

/** 4 números diferentes de 1 a 11, embaralhados com sorteio criptográfico (não dá para prever). */
function newSeq() {
  const pool = Array.from({ length: CAMISAS.max - CAMISAS.min + 1 }, (_, i) => CAMISAS.min + i);
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, CAMISAS.shirts);
}

function view(row, now) {
  const st = row?.state ?? {};
  const playing = !!st.seq && !st.over;
  return {
    day: dayNumber(now), nextAt: nextMidnight(now).getTime(),
    shirts: CAMISAS.shirts, min: CAMISAS.min, max: CAMISAS.max, pointsPerHit: CAMISAS.pointsPerHit, maxPoints: CAMISAS.maxPoints,
    playing, finished: !!row?.finishedAt,
    shown: playing ? st.seq.slice(0, st.pos + 1) : [], // só as camisas já viradas da sequência aberta
    goals: st.goals ?? 0, hits: st.hits ?? 0, points: st.points ?? 0,
    last: st.last ?? null, // a última sequência fechada: { seq, miss } (no fim do jogo, a do erro)
  };
}

/** Só leitura: abrir a tela não "começa" o jogo (o hub não mostra CONTINUAR à toa). */
export async function camisasState(userId) {
  const now = new Date();
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'CAMISAS', day: dayNumber(now) } } });
  return { state: view(row, now) };
}

async function withCamisas(userId, fn) {
  const now = new Date();
  const day = dayNumber(now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'CAMISAS', ${day}, '{}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'CAMISAS' AND day = ${day} FOR UPDATE`;
    const ctx = { tx, row, st: { ...row.state }, now, patch: {} };
    const extra = (await fn(ctx)) ?? {};
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: ctx.st, ...ctx.patch } });
    return { ...extra, state: view(saved, now) };
  });
}

/** Começa o jogo do dia (ou devolve o que está aberto). Acabou, só amanhã. */
export function camisasStart(userId) {
  return withCamisas(userId, async ({ st, row, tx }) => {
    if (st.seq && !st.over) return {};
    if (row.finishedAt) throw new GameError(409, 'finished', 'Você já jogou o Camisas hoje. Volte amanhã!');
    const g = MINIGAMES.find((m) => m.id === 'CAMISAS');
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (g && levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `Camisas libera no nível ${g.unlock}.`);
    Object.assign(st, { seq: newSeq(), pos: 0, goals: 0, hits: 0, points: 0, over: false, last: null });
    return {};
  });
}

/**
 * Palpite para a próxima camisa: 'maior' ou 'menor'. Devolve o número dela; se fechou as 4, o gol
 * (e a sequência inteira, para a tela mostrar antes de começar a próxima).
 */
export function camisasGuess(userId, guess) {
  if (guess !== 'maior' && guess !== 'menor') throw new GameError(400, 'bad-guess', 'Escolha maior ou menor.');
  return withCamisas(userId, async (ctx) => {
    const { st, tx, now } = ctx;
    if (!st.seq || st.over) throw new GameError(409, 'no-run', ctx.row.finishedAt ? 'Você já jogou o Camisas hoje. Volte amanhã!' : 'Comece o Camisas de hoje.');
    const cur = st.seq[st.pos], next = st.seq[st.pos + 1];
    const correct = guess === 'maior' ? next > cur : next < cur;
    if (!correct) {
      const seq = st.seq.slice(0, st.pos + 2); // até a camisa do erro
      Object.assign(st, { over: true, last: { seq, miss: true } });
      ctx.patch = { finishedAt: now, won: st.goals > 0, reward: { goals: st.goals, levelPoints: st.points, hits: st.hits } };
      return { correct, number: next, seq, goal: null, levelPoints: 0 };
    }
    st.hits += 1;
    st.pos += 1;
    const add = Math.max(0, Math.min(CAMISAS.pointsPerHit, CAMISAS.maxPoints - st.points));
    if (add) {
      st.points += add;
      await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: add } } });
    }
    let goal = null;
    if (st.pos === CAMISAS.shirts - 1) { // acertou as 4: gol, e começa outra sequência
      st.goals += 1;
      const user = await loadUser(tx, userId);
      const live = await liveMatchForTeam(user.teamId, tx);
      const phrase = st.goals > 1 ? `acertou as ${CAMISAS.shirts} camisas pela ${st.goals}ª vez hoje` : `acertou as ${CAMISAS.shirts} camisas`;
      const { text, match } = await applyResult(tx, user, { kind: 'CAMISAS', goal: true, now, match: live, money: 0, phrase });
      goal = { text, seq: st.seq, match: match ? { id: match.id, homeGoals: match.homeGoals, awayGoals: match.awayGoals } : null };
      Object.assign(st, { last: { seq: st.seq, miss: false }, seq: newSeq(), pos: 0 });
      ctx.patch = { won: true, reward: { goals: st.goals, levelPoints: st.points, hits: st.hits } };
    }
    return { correct, number: next, goal, levelPoints: add };
  });
}
