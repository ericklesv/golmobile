/**
 * Tutorial de boas-vindas (dono, 18/09/2026: "precisamos fazer um tutorial de boas vindas pro jogo").
 *
 * Regra de ouro: **na primeira vez o jogador não vê pop-up nenhum** — nem Presença da Semana, nem convite de
 * grupo, nem aviso de nível. Só o tutorial, que se apresenta, explica que ele faz gols para o time vencer as
 * rodadas e pergunta se ele quer fazer as três etapas em troca de 1 VIP:
 *
 *   1. PÊNALTI  — a principal forma de marcar gol para o time.
 *   2. TERMO    — os minigames viram de hora em hora, um por dia, e o nível libera mais.
 *   3. X1       — partida ao vivo contra outro jogador: ganhou, +1 gol para o time; perdeu, −1.
 *
 * O passo só anda quando o jogador FEZ a coisa (o servidor confere no banco), então o VIP não sai de graça.
 * `User.tutorialStep`: 0 = ainda não respondeu · 1..3 = na etapa · 9 = terminou · −1 = recusou/pulou.
 * O VIP cai uma vez só: o `updateMany` exige `tutorialStep: 3` e a mesma linha não passa duas vezes.
 *
 * No passo 3 o X1 ganha um empurrão: se ninguém aceitar o desafio em `TUTORIAL.botAcceptSec`, um dos bots
 * (services/bots.js) aceita e joga como se fosse gente — decisão do dono, e SÓ no tutorial (realtime/x1.js).
 */
import { prisma } from '../prisma.js';
import { GameError } from '../lib/errors.js';
import { TUTORIAL, FUTPREGO } from '../lib/rules.js';
import { dayNumber } from '../lib/time.js';
import { tg } from '../lib/telegram.js';

const { DONE, RECUSOU } = TUTORIAL;

/** O que a tela precisa saber. `pending` = está no meio do tutorial → NENHUM pop-up pode aparecer. */
export function tutorialView(user) {
  const step = user?.tutorialStep ?? 0;
  return {
    step,
    pending: step >= 0 && step < DONE, // 0 = ainda vai responder; 1..3 = fazendo
    done: step === DONE,
    steps: TUTORIAL.steps,
    vip: TUTORIAL.vip,
    botAcceptSec: TUTORIAL.botAcceptSec,
    bet: FUTPREGO.bet, // o X1 custa isto; a etapa 3 garante o dinheiro de quem não tem
  };
}

const carregar = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, nick: true, tutorialStep: true, penaltyTries: true } });
  if (!user) throw new GameError(404, 'not-found', 'Conta não encontrada.');
  return user;
};

export async function tutorialState(userId) {
  return tutorialView(await carregar(userId));
}

/** "Quero fazer": sai do 0 e vai para a etapa 1. Quem já terminou ou recusou não recomeça. */
export async function tutorialStart(userId) {
  const { count } = await prisma.user.updateMany({ where: { id: userId, tutorialStep: 0 }, data: { tutorialStep: 1 } });
  if (!count) {
    const user = await carregar(userId);
    if (user.tutorialStep > 0 && user.tutorialStep < DONE) return tutorialView(user); // já estava fazendo
    throw new GameError(409, 'tutorial-off', 'Este tutorial já foi respondido.');
  }
  return tutorialView(await carregar(userId));
}

/** "Agora não" (ou o X do tutorial): fecha sem VIP e libera os pop-ups normais. */
export async function tutorialSkip(userId) {
  await prisma.user.updateMany({
    where: { id: userId, tutorialStep: { gte: 0, lt: DONE } },
    data: { tutorialStep: RECUSOU, tutorialAt: new Date() },
  });
  return tutorialView(await carregar(userId));
}

/** O jogador fez mesmo a etapa? (conferido no banco, não na palavra da tela) */
async function conferir(userId, step, user) {
  if (step === 1) {
    return user.penaltyTries > 0 ? null : 'Bata o pênalti para continuar.';
  }
  if (step === 2) {
    const jogou = await prisma.dailyGame.findFirst({ where: { userId, game: 'TERMO', day: dayNumber() }, select: { id: true } });
    return jogou ? null : 'Jogue o Termo do dia para continuar.';
  }
  const partida = await prisma.x1Match.findFirst({ where: { OR: [{ aId: userId }, { bId: userId }] }, select: { id: true } });
  return partida ? null : 'Dispute uma partida do X1 para terminar.';
}

/**
 * Fecha a etapa `step` e anda. Na última, paga o VIP — uma vez só (o `where` exige a etapa 3).
 * Devolve `{ ...view, vipGanho }` para a tela comemorar.
 */
export async function tutorialDone(userId, step) {
  const n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > TUTORIAL.steps) throw new GameError(400, 'bad-step', 'Etapa inválida.');
  const user = await carregar(userId);
  if (user.tutorialStep === DONE || user.tutorialStep === RECUSOU) return { ...tutorialView(user), vipGanho: 0 };
  if (user.tutorialStep !== n) return { ...tutorialView(user), vipGanho: 0 }; // dois toques: o segundo não anda de novo

  const falta = await conferir(userId, n, user);
  if (falta) throw new GameError(409, 'tutorial-pendente', falta);

  if (n < TUTORIAL.steps) {
    await prisma.user.updateMany({ where: { id: userId, tutorialStep: n }, data: { tutorialStep: n + 1 } });
    // Entrando na etapa do X1: quem chegou hoje começa com R$ 0 e o desafio custa a aposta — sem isto o
    // tutorial mandaria fazer uma coisa que o jogador não tem como pagar. A casa paga o primeiro X1 (uma vez
    // só, e só até o valor da aposta: quem já fez dinheiro não ganha nada).
    if (n + 1 === TUTORIAL.steps) {
      await prisma.user.updateMany({ where: { id: userId, money: { lt: FUTPREGO.bet } }, data: { money: FUTPREGO.bet } });
    }
    return { ...tutorialView(await carregar(userId)), vipGanho: 0 };
  }
  // última etapa: 1 VIP no banco, numa tacada só
  const { count } = await prisma.user.updateMany({
    where: { id: userId, tutorialStep: TUTORIAL.steps },
    data: { tutorialStep: DONE, tutorialAt: new Date(), vipDays: { increment: TUTORIAL.vip } },
  });
  if (count) tg.info(`🎓 ${tg.esc(user.nick)} terminou o tutorial e levou ${TUTORIAL.vip} VIP`);
  return { ...tutorialView(await carregar(userId)), vipGanho: count ? TUTORIAL.vip : 0 };
}

/** O jogador está na etapa do X1? (realtime/x1.js usa para deixar um bot aceitar o desafio) */
export async function noPassoDoX1(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tutorialStep: true } });
  return (u?.tutorialStep ?? -1) === TUTORIAL.steps;
}
