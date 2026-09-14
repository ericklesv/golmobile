/**
 * Minigame Ganha ou Perde — roleta de duas fatias (pedido do dono, 14/09/2026). O círculo tem GANHA e
 * PERDE; a 1ª girada do dia começa com 50% de GANHA e cada acerto baixa esse ponto de partida em 5
 * (ganhaPerdeBase). Antes de girar, o jogador escolhe a chance: de graça fica na base; pagando, sobe de
 * 5 em 5 até 75% (ganhaPerdePrice — cada degrau custa mais e tudo encarece a cada acerto). Caiu no GANHA
 * = 1 gol do time + 5 de nível e gira de novo; caiu no PERDE = acabou o jogo do dia (vira às 21h).
 * Vários gols por dia enquanto não perder (como o Camisas). O dinheiro só aumenta a chance: sem pagar
 * também dá para marcar.
 *
 * Estado em DailyGame.state (game 'GANHAPERDE'): { wins, goals, points, spent, spins, last }.
 * O sorteio é todo no servidor (crypto): a tela recebe onde a seta parou (`at`) só para animar.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError } from '../lib/errors.js';
import { dayNumberAt, nextResetAt } from '../lib/time.js';
import { GANHAPERDE, MINIGAMES, RESET_HOUR, resetLabel, levelOf, ganhaPerdeBase, ganhaPerdePrice } from '../lib/rules.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';

const GAME = 'GANHAPERDE';
const HOUR = RESET_HOUR.GANHAPERDE; // vira às 21h (cada minigame numa hora própria)
const DONE = () => `Você já jogou o Ganha ou Perde. Ele renova ${resetLabel(GAME)}!`;

/** As chances que dá para escolher agora (da base até 75%) e o preço de cada uma. */
function options(wins) {
  const base = ganhaPerdeBase(wins);
  const out = [];
  for (let c = base; c <= GANHAPERDE.max; c += GANHAPERDE.step) out.push({ chance: c, price: ganhaPerdePrice(wins, c) });
  return out;
}

function view(row, now) {
  const st = row?.state ?? {};
  const wins = st.wins ?? 0;
  const finished = !!row?.finishedAt;
  return {
    day: dayNumberAt(HOUR, now), nextAt: nextResetAt(HOUR, now).getTime(),
    max: GANHAPERDE.max, step: GANHAPERDE.step, pointsPerHit: GANHAPERDE.pointsPerHit,
    finished, started: (st.spins ?? 0) > 0 && !finished,
    wins, goals: st.goals ?? 0, points: st.points ?? 0, spent: st.spent ?? 0, spins: st.spins ?? 0,
    base: ganhaPerdeBase(wins), options: finished ? [] : options(wins),
    last: st.last ?? null, // a última girada: { chance, at, win, price }
  };
}

/** Só leitura: abrir a tela não "começa" o jogo. */
export async function ganhaPerdeState(userId) {
  const now = new Date();
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: GAME, day: dayNumberAt(HOUR, now) } } });
  return { state: view(row, now) };
}

/**
 * Onde a seta para, em % do círculo contado a partir do começo do GANHA (GANHA = [0, chance),
 * PERDE = [chance, 100)). Longe das bordas, para nunca ficar em dúvida de qual fatia foi.
 */
function landing(win, chance) {
  const [a, b] = win ? [0, chance] : [chance, 100];
  const margin = Math.min(2, (b - a) * 0.2);
  return a + margin + (randomInt(0, 10_000) / 10_000) * (b - a - 2 * margin);
}

/**
 * Gira com `chance`% de GANHA (da base do momento até 75%, de 5 em 5); cobra o aumento antes. `spins` =
 * quantas giradas a tela viu: se não bate (toque duplo, dia virou), recusa em vez de cobrar outro preço.
 */
export async function ganhaPerdeSpin(userId, rawChance, rawSpins) {
  const chance = Number(rawChance);
  if (!Number.isInteger(chance)) throw new GameError(400, 'bad-chance', 'Escolha a chance de ganhar.');
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'GANHAPERDE', ${day}, '{}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'GANHAPERDE' AND day = ${day} FOR UPDATE`;
    if (row.finishedAt) throw new GameError(409, 'finished', DONE());
    const g = MINIGAMES.find((m) => m.id === GAME);
    const me = await tx.user.findUnique({ where: { id: userId } });
    if (g && levelOf(me).lvl < g.unlock) throw new GameError(403, 'locked', `Ganha ou Perde libera no nível ${g.unlock}.`);

    const st = { wins: 0, goals: 0, points: 0, spent: 0, spins: 0, ...row.state };
    if (rawSpins !== undefined && rawSpins !== null && Number(rawSpins) !== st.spins) throw new GameError(409, 'stale', 'A roleta mudou. Confira a chance e gire de novo.');
    const base = ganhaPerdeBase(st.wins);
    if (chance < base || chance > GANHAPERDE.max || (chance - base) % GANHAPERDE.step !== 0) {
      throw new GameError(400, 'bad-chance', `A chance vai de ${base}% a ${GANHAPERDE.max}%, de ${GANHAPERDE.step} em ${GANHAPERDE.step}.`);
    }
    const price = ganhaPerdePrice(st.wins, chance);
    if (price > 0) {
      const paid = await tx.user.updateMany({ where: { id: userId, money: { gte: price } }, data: { money: { decrement: price } } });
      if (paid.count === 0) throw new GameError(402, 'no-money', `Você precisa de R$ ${price} para girar com ${chance}%.`);
    }

    const win = randomInt(0, 10_000) < chance * 100;
    const at = landing(win, chance);
    st.spins += 1;
    st.spent += price;
    st.last = { chance, at, win, price };
    let goal = null, levelPoints = 0;
    const patch = {};
    if (win) {
      st.wins += 1;
      st.goals += 1;
      levelPoints = GANHAPERDE.pointsPerHit;
      st.points += levelPoints;
      await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: levelPoints } } });
      const user = await loadUser(tx, userId);
      const live = await liveMatchForTeam(user.teamId, tx);
      const phrase = st.wins > 1
        ? `caiu no GANHA da roleta pela ${st.wins}ª vez seguida, com ${chance}% de chance`
        : `caiu no GANHA da roleta com ${chance}% de chance`;
      const { text, match } = await applyResult(tx, user, { kind: GAME, goal: true, now, match: live, money: 0, phrase });
      goal = { text, match: match ? { id: match.id, homeGoals: match.homeGoals, awayGoals: match.awayGoals } : null };
      Object.assign(patch, { won: true, reward: { goals: st.goals, levelPoints: st.points, spent: st.spent } });
    } else {
      Object.assign(patch, { finishedAt: now, won: st.goals > 0, reward: { goals: st.goals, levelPoints: st.points, spent: st.spent } });
    }
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: st, ...patch } });
    const { money } = await tx.user.findUnique({ where: { id: userId }, select: { money: true } });
    return { win, at, chance, price, goal, levelPoints, money, state: view(saved, now) };
  });
}
