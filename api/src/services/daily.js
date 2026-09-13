/**
 * Minigames diários — 1 partida por jogador, por jogo, por dia (o dia vira à
 * meia-noite de Brasília). Hoje: o Termo do dia. Como nos chutes, toda a lógica
 * roda aqui; a tela recebe cores, e a palavra só quando o jogo dela acabou.
 */
import { createHash } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { dayNumber, nextMidnight, quizDayNumber, nextNoon } from '../lib/time.js';
import { TERMO, QUIZ, DAILY_GAMES } from '../lib/rules.js';
import { evaluate, keyOf, loadDictionary } from '../lib/termo/rules.js';
import { wordOfDay } from '../lib/termo/answers.js';
import { BANK, questionsOfDay } from '../lib/quiz/questions.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';

/** Calendário de cada minigame: o Termo vira à meia-noite; o Quiz, ao meio-dia. */
function calendar(now) {
  return {
    TERMO: { day: dayNumber(now), nextAt: nextMidnight(now).getTime() },
    QUIZ: { day: quizDayNumber(now), nextAt: nextNoon(now).getTime() },
  };
}

/**
 * O que está disponível agora. A Home mostra UMA faixa só (`featured`): a do jogo disponível
 * que vence primeiro — terminou esse, aparece o outro.
 */
export async function dailyStatus(userId, now = new Date()) {
  const cal = calendar(now);
  const rows = await prisma.dailyGame.findMany({ where: { userId, OR: DAILY_GAMES.map((g) => ({ game: g, day: cal[g].day })) } });
  const games = DAILY_GAMES.map((id) => {
    const row = rows.find((r) => r.game === id);
    const finished = !!row?.finishedAt;
    return { id, day: cal[id].day, nextAt: cal[id].nextAt, available: !finished, started: !!row && !finished, finished, won: !!row?.won };
  });
  const featured = games.filter((g) => g.available).sort((a, b) => a.nextAt - b.nextAt)[0]?.id ?? null;
  return { day: cal.TERMO.day, nextAt: cal.TERMO.nextAt, games, featured };
}

// ─── Termo ─────────────────────────────────────────────────────────────────

function termoView(day, row, now = new Date()) {
  const answer = wordOfDay(day);
  const finished = !!row?.finishedAt;
  const guesses = row?.state?.guesses ?? [];
  return {
    day,
    guesses: guesses.map((word) => ({ word, colors: evaluate(word, answer) })),
    finished,
    won: !!row?.won,
    answer: finished ? answer : null, // antes do fim, nem no JSON
    reward: row?.reward ?? null,
    nextAt: nextMidnight(now).getTime(),
  };
}

export async function termoState(userId, now = new Date()) {
  const day = dayNumber(now);
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'TERMO', day } } });
  return termoView(day, row, now);
}

const triesLabel = (n) => (n === 1 ? '1 tentativa' : `${n} tentativas`);

/**
 * Um chute. Confere o dicionário, grava e devolve as cores. Toque duplo não vira
 * dois chutes (o mesmo chute como último devolve o jogo como está); palavra
 * repetida é recusada; jogo acabado não aceita mais nada. Acertou: 1 gol normal
 * (placar, artilharia, lances) + pontos de nível pela tentativa.
 */
export async function termoGuess(userId, rawWord, clientDay) {
  const now = new Date();
  const day = dayNumber(now);
  if (clientDay !== undefined && Number(clientDay) !== day) {
    throw new GameError(409, 'day-changed', 'Virou o dia: já tem palavra nova. Recarregue o Termo.');
  }
  const key = keyOf(rawWord ?? '');
  if (!new RegExp(`^[a-z]{${TERMO.letters}}$`).test(key)) throw badRequest(`A palavra tem ${TERMO.letters} letras.`, 'bad-word');

  const answer = wordOfDay(day);
  const hit = key === keyOf(answer);
  const dictionary = await loadDictionary();
  const form = hit ? answer : dictionary.get(key)?.toUpperCase();
  if (!form) throw badRequest('Essa palavra não é aceita.', 'not-a-word');

  return prisma.$transaction(async (tx) => {
    // cria a partida do dia se ainda não existe e tranca a linha até o fim da transação
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'TERMO', ${day}, '{"guesses":[]}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'TERMO' AND day = ${day} FOR UPDATE`;
    const done = (row.state?.guesses ?? []).map(keyOf);

    if (done.at(-1) === key) return { state: termoView(day, row, now), reward: row.reward ?? null };
    if (row.finishedAt || done.length >= TERMO.tries) throw new GameError(409, 'finished', 'Você já jogou o Termo de hoje. Volte amanhã!');
    if (done.includes(key)) throw badRequest('Você já tentou essa palavra.', 'repeated');

    const guesses = [...(row.state?.guesses ?? []), form];
    const finished = hit || guesses.length >= TERMO.tries;
    let reward = null;
    if (hit) {
      const user = await loadUser(tx, userId);
      const match = await liveMatchForTeam(user.teamId, tx);
      const levelPoints = TERMO.levelPoints[guesses.length - 1] ?? 0;
      const { text } = await applyResult(tx, user, {
        kind: 'TERMO', goal: true, now, match, money: 0,
        phrase: `acertou o Termo do dia em ${triesLabel(guesses.length)}`,
      });
      await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: levelPoints } } });
      reward = {
        goal: true, levelPoints, tries: guesses.length, text,
        match: match ? { id: match.id, homeGoals: match.homeGoals, awayGoals: match.awayGoals } : null,
      };
    }
    const saved = await tx.dailyGame.update({
      where: { id: row.id },
      data: { state: { guesses }, won: hit, reward: reward ?? undefined, finishedAt: finished ? now : null },
    });
    return { state: termoView(day, saved, now), reward };
  });
}

// ─── Quiz ──────────────────────────────────────────────────────────────────
// Estado em DailyGame.state: { ids: [5 ids], answers: [{ choice, correct }], servedAt }.
// A pergunta só é mostrada quando o jogador pede (POST next): aí o relógio de 20 s começa,
// no servidor. Estourou o tempo (com tolerância de rede) = erro. A resposta certa só é
// revelada depois de responder.

/** Alternativas embaralhadas por jogador/dia/pergunta, estável. p[k] = índice no banco (0 = correta). */
function permFor(userId, day, qid) {
  const h = createHash('sha256').update(`${userId}:${day}:${qid}`).digest();
  const p = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = h[i] % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}
const shown = (q, p) => p.map((k) => q.a[k]);

function quizView(userId, day, row, now = new Date()) {
  const st = row?.state ?? {};
  const ids = st.ids ?? questionsOfDay(day, QUIZ.questions).map((q) => q.id);
  const answers = st.answers ?? [];
  const finished = !!row?.finishedAt;
  const results = answers.map((ans, k) => {
    const q = BANK.get(ids[k]); const p = permFor(userId, day, q.id);
    return { q: q.q, options: shown(q, p), choice: ans.choice, correctChoice: p.indexOf(0), correct: ans.correct };
  });
  let current = null;
  if (!finished && st.servedAt && answers.length < ids.length) {
    const q = BANK.get(ids[answers.length]);
    current = { index: answers.length, q: q.q, options: shown(q, permFor(userId, day, q.id)), deadline: st.servedAt + QUIZ.seconds * 1000 };
  }
  return {
    day, total: ids.length, index: answers.length, results, current, finished,
    hits: answers.filter((a) => a.correct).length, reward: row?.reward ?? null,
    nextAt: nextNoon(now).getTime(), serverTime: now.getTime(),
  };
}

/** Tranca a partida do dia (cria se não existe), marca como erro a pergunta que estourou o tempo. */
async function withQuiz(userId, clientDay, fn) {
  const now = new Date();
  const day = quizDayNumber(now);
  if (clientDay !== undefined && clientDay !== null && Number(clientDay) !== day) {
    throw new GameError(409, 'day-changed', 'Virou o dia do Quiz: já tem perguntas novas. Recarregue.');
  }
  return prisma.$transaction(async (tx) => {
    const fresh = JSON.stringify({ ids: questionsOfDay(day, QUIZ.questions).map((q) => q.id), answers: [], servedAt: null });
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'QUIZ', ${day}, ${fresh}::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'QUIZ' AND day = ${day} FOR UPDATE`;
    const st = { ids: row.state.ids, answers: [...(row.state.answers ?? [])], servedAt: row.state.servedAt ?? null };
    const expired = !row.finishedAt && st.servedAt && now.getTime() - st.servedAt > QUIZ.seconds * 1000 + QUIZ.toleranceMs;
    const extra = await fn({ st, row, day, now, expired });
    if (expired && !extra?.handledTimeout) { st.answers.push({ choice: -1, correct: false }); st.servedAt = null; }
    let reward = row.reward ?? null;
    let finishedAt = row.finishedAt;
    if (!finishedAt && st.answers.length >= st.ids.length) {
      reward = await finishQuiz(tx, userId, st, now);
      finishedAt = now;
    }
    const saved = await tx.dailyGame.update({
      where: { id: row.id },
      data: { state: st, won: !!reward?.goal, reward: reward ?? undefined, finishedAt },
    });
    const { handledTimeout, ...out } = extra ?? {};
    return { ...out, state: quizView(userId, day, saved, now) };
  });
}

async function finishQuiz(tx, userId, st, now) {
  const hits = st.answers.filter((a) => a.correct).length;
  const levelPoints = hits * QUIZ.pointsPerHit;
  const reward = { goal: false, levelPoints, hits, total: st.ids.length, text: null, match: null };
  if (hits >= QUIZ.goalAt) {
    const user = await loadUser(tx, userId);
    const match = await liveMatchForTeam(user.teamId, tx);
    const { text } = await applyResult(tx, user, {
      kind: 'QUIZ', goal: true, now, match, money: 0,
      phrase: `acertou ${hits} de ${st.ids.length} no Quiz do dia`,
    });
    Object.assign(reward, { goal: true, text, match: match ? { id: match.id, homeGoals: match.homeGoals, awayGoals: match.awayGoals } : null });
  }
  if (levelPoints) await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: levelPoints } } });
  return reward;
}

export function quizState(userId) {
  return withQuiz(userId, undefined, async () => ({}));
}

/** Mostra a próxima pergunta e começa o relógio dela (idempotente enquanto ela estiver no ar). */
export function quizNext(userId, clientDay) {
  return withQuiz(userId, clientDay, async ({ st, row, expired, now }) => {
    if (row.finishedAt || expired) return {};
    if (!st.servedAt && st.answers.length < st.ids.length) st.servedAt = now.getTime();
    return {};
  });
}

/** Responde a pergunta da vez. choice = posição mostrada (0..3); -1 = acabou o tempo. */
export function quizAnswer(userId, index, choice, clientDay) {
  return withQuiz(userId, clientDay, async ({ st, row, day, expired }) => {
    if (row.finishedAt) throw new GameError(409, 'finished', 'Você já jogou o Quiz de hoje. Volte amanhã, ao meio-dia!');
    if (!Number.isInteger(index) || index !== st.answers.length) throw new GameError(409, 'out-of-sync', 'Essa pergunta já passou.');
    if (!st.servedAt) throw new GameError(409, 'not-served', 'Peça a pergunta antes de responder.');
    const q = BANK.get(st.ids[index]);
    const p = permFor(userId, day, q.id);
    const c = expired ? -1 : Number.isInteger(choice) && choice >= 0 && choice <= 3 ? choice : -1;
    const correct = c >= 0 && p[c] === 0;
    st.answers.push({ choice: c, correct });
    st.servedAt = null;
    return { correct, timeout: c === -1, correctChoice: p.indexOf(0), handledTimeout: true };
  });
}
