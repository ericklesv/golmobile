/**
 * Minigame PAREDÃO — você é o goleiro (vira às 22h). Porte do "Mini Cup" do Google, pedido do dono em
 * 17/09/2026 ("monte o mais próximo possível do mini cup sem perder a identidade do jogo"); a matemática
 * está em lib/paredao.js.
 *
 * Como roda sem depender da internet no meio da jogada (a mesma razão de o X1 ser por turnos): o servidor
 * manda as bolas JÁ SORTEADAS em lotes de 40 e a tela só anima. Durante a partida não há uma única ida ao
 * servidor. No fim, a tela manda o RASTRO DO DEDO e o servidor **refaz a partida** para saber quantas
 * defesas houve — quem conta não é o cliente.
 *
 * Identidade do JogaGol no lugar do contador de países: **cada defesa soma no placar do seu time contra o
 * adversário da rodada** (tabela `ParedaoTeam`, zera junto com a rodada) e o goleiro veste o seu uniforme.
 *
 * Prêmio (regra da casa: um minigame vencido = exatamente 1 gol): 10 defesas seguidas = 1 gol (kind
 * `PAREDAO`) + o dinheiro de MINIGAME_MONEY; cada defesa dá 3 de nível, até 30. O recorde pessoal fica em
 * `User.paredaoBest` e é o que faz a faixa "NOVA MAIOR PONTUAÇÃO" aparecer.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { dayNumberAt, nextResetAt } from '../lib/time.js';
import { MINIGAMES, RESET_HOUR, resetLabel, levelOf } from '../lib/rules.js';
import { PAREDAO as C, shots, judge, traceProblem } from '../lib/paredao.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam, liveRound } from './league.js';
import { teamView } from './view.js';

const HOUR = RESET_HOUR.PAREDAO;
const DONE = () => `Você já jogou o Paredão hoje. Ele renova ${resetLabel('PAREDAO')}!`;
// Teste local (nunca em produção): joga quantas vezes quiser.
const FREE = process.env.NODE_ENV !== 'production' && process.env.MINIGAMES_LIVRES === '1';

/** Placar do dia: quantas defesas o meu time e o adversário da rodada já fizeram. */
async function placar(user, db = prisma) {
  const round = liveRound();
  if (!round?.roundId || !user.teamId) return null;
  const match = await liveMatchForTeam(user.teamId, db);
  const rival = match ? (match.homeTeamId === user.teamId ? match.awayTeam : match.homeTeam) : null;
  const ids = [user.teamId, rival?.id].filter(Boolean);
  const linhas = await db.paredaoTeam.findMany({ where: { roundId: round.roundId, teamId: { in: ids } } });
  const saves = (id) => linhas.find((l) => l.teamId === id)?.saves ?? 0;
  return {
    mine: { team: teamView(user.team), saves: saves(user.teamId) },
    rival: rival ? { team: teamView(rival), saves: saves(rival.id) } : null,
  };
}

function view(row, now, user) {
  const st = row?.state ?? {};
  return {
    day: dayNumberAt(HOUR, now), nextAt: nextResetAt(HOUR, now).getTime(),
    goalTarget: C.goalTarget, pointsPerSave: C.pointsPerSave, maxPoints: C.maxPoints,
    keeper: C.keeper, gap: C.gap,
    playing: !!st.seed && !st.over, finished: !!row?.finishedAt, freePlay: FREE,
    saves: st.saves ?? 0, points: st.points ?? 0, best: user?.paredaoBest ?? 0,
    record: !!st.record, // bateu o recorde nesta partida
  };
}

export async function paredaoState(userId) {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { team: true } });
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'PAREDAO', day: dayNumberAt(HOUR, now) } } });
  return { state: view(row, now, user), scoreboard: await placar(user) };
}

async function withParedao(userId, fn) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'PAREDAO', ${day}, '{}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'PAREDAO' AND day = ${day} FOR UPDATE`;
    const ctx = { tx, row, st: { ...row.state }, now, patch: {} };
    const extra = (await fn(ctx)) ?? {};
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: ctx.st, ...ctx.patch } });
    const user = await tx.user.findUnique({ where: { id: userId }, include: { team: true } });
    return { ...extra, state: view(saved, now, user), scoreboard: await placar(user, tx) };
  }, { timeout: 20_000 });
}

/** Começa a partida do dia: sorteia a semente e manda o primeiro lote de bolas. */
export function paredaoStart(userId) {
  return withParedao(userId, async (ctx) => {
    const { st, row, tx } = ctx;
    if (row.finishedAt && !FREE) throw new GameError(409, 'finished', DONE());
    if (row.finishedAt) ctx.patch = { finishedAt: null, won: false }; // teste local: recomeça
    const g = MINIGAMES.find((m) => m.id === 'PAREDAO');
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (g && levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `O Paredão libera no nível ${g.unlock}.`);
    if (!st.seed || st.over) Object.assign(st, { seed: `${userId}:${Date.now()}:${randomInt(0, 2 ** 31)}`, saves: 0, points: 0, over: false, record: false });
    return { shots: shots(st.seed, 1, C.batch) };
  });
}

/** Mais bolas, para quem está indo longe (a tela pede antes de acabar o lote — nada de pausa). */
export async function paredaoMore(userId, from) {
  const i = Number(from);
  if (!Number.isInteger(i) || i < 2 || i > 5000) throw badRequest('Bola inválida.');
  const now = new Date();
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'PAREDAO', day: dayNumberAt(HOUR, now) } } });
  const st = row?.state ?? {};
  if (!st.seed || st.over) throw new GameError(409, 'no-run', 'Comece o Paredão.');
  return { shots: shots(st.seed, i, C.batch) };
}

/**
 * Fim da partida. A tela manda `trace` ([[ms, x], …], o rastro do dedo) e `crossings` ([{ i, t }], quando
 * cada bola cruzou o gol na tela dela). O servidor REFAZ a partida com a mesma semente: ele decide quantas
 * defesas houve, paga o gol do dia, soma as defesas no placar do time e guarda o recorde.
 */
export async function paredaoEnd(userId, body = {}) {
  const trace = Array.isArray(body.trace) ? body.trace : null;
  const problema = traceProblem(trace);
  if (problema) throw badRequest(`Partida não confere (${problema}).`);
  const crossings = Array.isArray(body.crossings) ? body.crossings.slice(0, 5000) : [];
  return withParedao(userId, async (ctx) => {
    const { st, tx, now } = ctx;
    if (!st.seed || st.over) throw new GameError(409, 'no-run', ctx.row.finishedAt ? DONE() : 'Comece o Paredão.');
    const r = judge(st.seed, trace, crossings);
    const user = await loadUser(tx, userId);
    const antes = user.paredaoBest ?? 0;
    const record = r.saves > antes;

    // XP por defesa, com teto — como nos outros minigames
    const pontos = Math.min(C.maxPoints, r.saves * C.pointsPerSave);
    const dados = { paredaoBest: Math.max(antes, r.saves) };
    if (pontos > 0) dados.levelBonus = { increment: pontos };
    await tx.user.update({ where: { id: userId }, data: dados });

    // placar do time na rodada (o contador de países do Mini Cup, à moda do JogaGol)
    const round = liveRound();
    if (round?.roundId && user.teamId && r.saves > 0) {
      await tx.$executeRaw`
        INSERT INTO "ParedaoTeam" ("roundId", "teamId", saves, "updatedAt")
        VALUES (${round.roundId}, ${user.teamId}, ${r.saves}, now())
        ON CONFLICT ("roundId", "teamId") DO UPDATE SET saves = "ParedaoTeam".saves + ${r.saves}, "updatedAt" = now()`;
    }

    let goal = null;
    if (r.saves >= C.goalTarget && !ctx.row.won) {
      const match = await liveMatchForTeam(user.teamId, tx);
      const frase = r.saves >= 20 ? `fez ${r.saves} defesas seguidas no Paredão e virou muralha` : `segurou ${r.saves} bolas seguidas no Paredão`;
      const { text, match: m } = await applyResult(tx, user, { kind: 'PAREDAO', goal: true, now, match, money: 0, phrase: frase });
      goal = { text, match: m ? { id: m.id, homeGoals: m.homeGoals, awayGoals: m.awayGoals } : null };
    }
    Object.assign(st, { saves: r.saves, points: pontos, over: true, record });
    ctx.patch = { finishedAt: now, won: r.saves >= C.goalTarget || ctx.row.won, reward: { saves: r.saves, levelPoints: pontos } };
    return { saves: r.saves, goalAt: r.goalAt, levelPoints: pontos, record, best: Math.max(antes, r.saves), goal, shots: r.shots };
  });
}
