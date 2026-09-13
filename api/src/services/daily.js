/**
 * Minigames diários — 1 partida por jogador, por jogo, por dia (o dia vira à
 * meia-noite de Brasília). Hoje: o Termo do dia. Como nos chutes, toda a lógica
 * roda aqui; a tela recebe cores, e a palavra só quando o jogo dela acabou.
 */
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { dayNumber, nextMidnight } from '../lib/time.js';
import { TERMO, DAILY_GAMES } from '../lib/rules.js';
import { evaluate, keyOf, loadDictionary } from '../lib/termo/rules.js';
import { wordOfDay } from '../lib/termo/answers.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';

/** O que está disponível hoje (a faixa da Home aparece enquanto houver jogo por fazer). */
export async function dailyStatus(userId, now = new Date()) {
  const day = dayNumber(now);
  const rows = await prisma.dailyGame.findMany({ where: { userId, day, game: { in: DAILY_GAMES } } });
  return {
    day,
    nextAt: nextMidnight(now).getTime(),
    games: DAILY_GAMES.map((id) => {
      const row = rows.find((r) => r.game === id);
      const finished = !!row?.finishedAt;
      return { id, available: !finished, started: !!row && !finished, finished, won: !!row?.won };
    }),
  };
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
