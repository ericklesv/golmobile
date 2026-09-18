/**
 * PenalCup (dono, 18/09/2026: "mude o nome do GOLEADA para PenalCup"). O NOME DE TELA é PenalCup;
 * o id interno segue `GOLEADA` — é valor do enum `KickKind`, chave de `DailyGame`, tabela `GoleadaTeam` e
 * coluna `User.goleadaBest`, com gols já gravados em produção: trocar isso seria migração sem ganho.
 *
 * Minigame GOLEADA — você é o BATEDOR (vira às 22h). Porte do "Mini Cup" do Google, pedido do dono em
 * 17/09/2026 ("monte o mais próximo possível do mini cup sem perder a identidade do jogo"; e ele corrigiu
 * a leitura do vídeo: "no minicup você é o jogador e não o goleiro"). A matemática está em lib/goleada.js.
 *
 * A bola fica grande, no seu pé; você desliza o dedo para chutar e ela viaja até o gol, onde o goleiro
 * adversário tenta pegar. Fez o gol, vem outra bola — o goleiro reage mais rápido a cada uma. Ele pegou ou
 * você mandou fora, acabou a série.
 *
 * Sem depender da internet no meio da jogada (a mesma razão de o X1 ser por turnos): o servidor manda só a
 * SEMENTE da partida e a tela roda a mesma conta dele (o goleiro é uma função do tempo) para animar. No fim,
 * a tela manda os CHUTES e o servidor **refaz a série** para contar os gols — quem conta não é o cliente.
 *
 * Identidade do JogaGol no lugar do contador de países: **cada gol soma no placar do seu time contra o
 * adversário da rodada** (tabela `GoleadaTeam`, zera junto com a rodada) e o goleiro veste o uniforme desse
 * adversário, como no pênalti e na falta.
 *
 * Prêmio (regra da casa: um minigame vencido = exatamente 1 gol): 10 gols seguidos = 1 gol (kind
 * `GOLEADA`) + o dinheiro de MINIGAME_MONEY; cada gol dá 3 de nível, até 30. O recorde pessoal fica em
 * `User.goleadaBest` e é o que faz a faixa "NOVA MAIOR PONTUAÇÃO" aparecer.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { dayNumberAt, nextResetAt } from '../lib/time.js';
import { MINIGAMES, RESET_HOUR, resetLabel, levelOf } from '../lib/rules.js';
import { GOLEADA as C, judge, phaseOf } from '../lib/goleada.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam, liveRound } from './league.js';
import { teamView } from './view.js';

const HOUR = RESET_HOUR.GOLEADA;
const DONE = () => `Você já jogou o PenalCup hoje. Ele renova ${resetLabel('GOLEADA')}!`;
// Teste local (nunca em produção): joga quantas vezes quiser.
const FREE = process.env.NODE_ENV !== 'production' && process.env.MINIGAMES_LIVRES === '1';

/** Placar do dia: quantos gols os torcedores do meu time e do adversário da rodada já fizeram. */
async function placar(user, db = prisma) {
  const round = liveRound();
  if (!round?.roundId || !user.teamId) return null;
  const match = await liveMatchForTeam(user.teamId, db);
  const rival = match ? (match.homeTeamId === user.teamId ? match.awayTeam : match.homeTeam) : null;
  const ids = [user.teamId, rival?.id].filter(Boolean);
  const linhas = await db.goleadaTeam.findMany({ where: { roundId: round.roundId, teamId: { in: ids } } });
  const gols = (id) => linhas.find((l) => l.teamId === id)?.goals ?? 0;
  return {
    mine: { team: teamView(user.team), goals: gols(user.teamId) },
    rival: rival ? { team: teamView(rival), goals: gols(rival.id) } : null,
  };
}

function view(row, now, user) {
  const st = row?.state ?? {};
  return {
    day: dayNumberAt(HOUR, now), nextAt: nextResetAt(HOUR, now).getTime(),
    goalTarget: C.goalTarget, pointsPerGoal: C.pointsPerGoal, maxPoints: C.maxPoints,
    keeper: C.keeper, shot: C.shot, aim: C.aim, gap: C.gap, ramp: C.ramp, spinEdge: C.spinEdge,
    // a fase da ronda (não a semente): é só o que a tela precisa para desenhar o goleiro no lugar certo
    phase: st.seed && !st.over ? phaseOf(st.seed) : null,
    playing: !!st.seed && !st.over, finished: !!row?.finishedAt, freePlay: FREE,
    goals: st.goals ?? 0, points: st.points ?? 0, best: user?.goleadaBest ?? 0,
    record: !!st.record, // bateu o recorde nesta partida
  };
}

export async function goleadaState(userId) {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { team: true } });
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'GOLEADA', day: dayNumberAt(HOUR, now) } } });
  return { state: view(row, now, user), scoreboard: await placar(user) };
}

async function withGoleada(userId, fn) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'GOLEADA', ${day}, '{}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'GOLEADA' AND day = ${day} FOR UPDATE`;
    const ctx = { tx, row, st: { ...row.state }, now, patch: {} };
    const extra = (await fn(ctx)) ?? {};
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: ctx.st, ...ctx.patch } });
    const user = await tx.user.findUnique({ where: { id: userId }, include: { team: true } });
    return { ...extra, state: view(saved, now, user), scoreboard: await placar(user, tx) };
  }, { timeout: 20_000 });
}

/** Começa a partida do dia: sorteia a semente e manda o primeiro lote de bolas. */
export function goleadaStart(userId) {
  return withGoleada(userId, async (ctx) => {
    const { st, row, tx } = ctx;
    if (row.finishedAt && !FREE) throw new GameError(409, 'finished', DONE());
    if (row.finishedAt) ctx.patch = { finishedAt: null, won: false }; // teste local: recomeça
    const g = MINIGAMES.find((m) => m.id === 'GOLEADA');
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (g && levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `O PenalCup libera no nível ${g.unlock}.`);
    if (!st.seed || st.over) Object.assign(st, { seed: `${userId}:${Date.now()}:${randomInt(0, 2 ** 31)}`, goals: 0, points: 0, over: false, record: false });
    return {};
  });
}

/**
 * Fim da série. A tela manda `shots` ([{ i, x, y, power }] — onde ela mirou em cada bola) e o servidor
 * REFAZ a série com a mesma semente: ele conta os gols, paga o gol do dia, soma no placar do time e guarda
 * o recorde. A contagem da tela é só animação.
 */
export async function goleadaEnd(userId, body = {}) {
  const chutes = Array.isArray(body.shots) ? body.shots : null;
  if (!chutes) throw badRequest('Série não confere (sem chutes).');
  return withGoleada(userId, async (ctx) => {
    const { st, tx, now } = ctx;
    if (!st.seed || st.over) throw new GameError(409, 'no-run', ctx.row.finishedAt ? DONE() : 'Comece o PenalCup.');
    const r = judge(st.seed, chutes);
    const user = await loadUser(tx, userId);
    const antes = user.goleadaBest ?? 0;
    const record = r.goals > antes;

    // XP por gol, com teto — como nos outros minigames
    const pontos = Math.min(C.maxPoints, r.goals * C.pointsPerGoal);
    const dados = { goleadaBest: Math.max(antes, r.goals) };
    if (pontos > 0) dados.levelBonus = { increment: pontos };
    await tx.user.update({ where: { id: userId }, data: dados });

    // placar do time na rodada (o contador de países do Mini Cup, à moda do JogaGol)
    const round = liveRound();
    if (round?.roundId && user.teamId && r.goals > 0) {
      await tx.$executeRaw`
        INSERT INTO "GoleadaTeam" ("roundId", "teamId", goals, "updatedAt")
        VALUES (${round.roundId}, ${user.teamId}, ${r.goals}, now())
        ON CONFLICT ("roundId", "teamId") DO UPDATE SET goals = "GoleadaTeam".goals + ${r.goals}, "updatedAt" = now()`;
    }

    let goal = null;
    if (r.goals >= C.goalTarget && !ctx.row.won) {
      const match = await liveMatchForTeam(user.teamId, tx);
      const frase = r.goals >= 20 ? `fez ${r.goals} gols seguidos no PenalCup e não quis mais parar` : `emendou ${r.goals} gols seguidos no PenalCup`;
      const { text, match: m } = await applyResult(tx, user, { kind: 'GOLEADA', goal: true, now, match, money: 0, phrase: frase });
      goal = { text, match: m ? { id: m.id, homeGoals: m.homeGoals, awayGoals: m.awayGoals } : null };
    }
    Object.assign(st, { goals: r.goals, points: pontos, over: true, record });
    ctx.patch = { finishedAt: now, won: r.goals >= C.goalTarget || ctx.row.won, reward: { goals: r.goals, levelPoints: pontos } };
    return { goals: r.goals, stoppedAt: r.stoppedAt, why: r.shots.at(-1)?.why ?? null, levelPoints: pontos, record, best: Math.max(antes, r.goals), goal };
  });
}
