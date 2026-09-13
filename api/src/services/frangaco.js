/**
 * Minigame Frangaço — duelo de pênaltis ALTERNADO contra um clube IA da mesma série
 * (vira às 20h: RESET_HOUR). Você bate 5 e defende 5, alternando; empate = morte súbita
 * (até 3 rodadas; persistindo, defesas mais rápidas decidem). Mata-mata de 4 fases, um
 * duelo por dia: venceu = 1 gol do time (kind FRANGACO) e avança; CAMPEÃO (4ª vitória)
 * leva ainda +R$ 500 e +20 de nível; perdeu = eliminado, torneio novo no dia seguinte.
 * A matemática do lance fica em lib/frangaco.js; o cliente só anima.
 *
 * Estado em DailyGame.state (game 'FRANGACO'):
 *   { phase (0..3), history: [{ phase, teamId, golsUser, golsIa, venceu }], teamId,
 *     duel: { turn: 'kick'|'defense'|'over', kicks: [...], defenses: [...], pending }, outcome, champion }
 * O progresso do torneio atravessa os dias DENTRO das linhas de DailyGame: ao começar o
 * duelo de hoje, a linha mais recente de dias anteriores diz a fase (venceu e não é campeão
 * = fase seguinte; senão, torneio novo). O alvo da defesa só é servido com a janela correndo.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { dayNumberAt, nextResetAt } from '../lib/time.js';
import { MINIGAMES, RESET_HOUR, resetLabel, levelOf } from '../lib/rules.js';
import { FRANGACO as C, resolveKick, newDefense, resolveSave, duelStatus } from '../lib/frangaco.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';
import { teamView } from './view.js';

const HOUR = RESET_HOUR.FRANGACO;
const DONE = () => `Você já jogou o Frangaço. Ele renova ${resetLabel('FRANGACO')}!`;
const rand = () => randomInt(0, 2 ** 32) / 2 ** 32; // sorteio criptográfico (não dá para prever)
// Teste local (MINIGAMES_LIVRES=1 no api/.env, NUNCA em produção): joga de novo sem esperar as 20h.
const FREE = process.env.NODE_ENV !== 'production' && process.env.MINIGAMES_LIVRES === '1';

let teamsCache = { at: 0, list: [] };
async function allTeams() {
  if (Date.now() - teamsCache.at > 5 * 60_000) teamsCache = { at: Date.now(), list: await prisma.team.findMany({ orderBy: { id: 'asc' } }) };
  return teamsCache.list;
}

const budgetMs = (pending) => C.prepMs + pending.flightMs + pending.windowMs + C.netToleranceMs;
const expired = (pending, now) => !!pending && now.getTime() - pending.servedAt > budgetMs(pending);

function view(row, teams, now) {
  const st = row?.state ?? {};
  const byId = new Map(teams.map((t) => [t.id, t]));
  const duel = st.duel ?? null;
  const playing = !!duel && !st.outcome;
  return {
    day: dayNumberAt(HOUR, now), nextAt: nextResetAt(HOUR, now).getTime(), serverTime: now.getTime(),
    freePlay: FREE,
    phases: C.phases, kicks: C.kicks, suddenMax: C.suddenMax,
    championMoney: C.championMoney, championLevelPoints: C.championLevelPoints,
    playing, finished: !!row?.finishedAt,
    outcome: st.outcome ?? null, champion: !!st.champion,
    phase: st.phase ?? 0, phaseName: C.phases[st.phase ?? 0],
    opponent: teamView(byId.get(st.teamId) ?? null),
    history: (st.history ?? []).map((h) => ({
      phase: h.phase, phaseName: C.phases[h.phase], opponent: teamView(byId.get(h.teamId) ?? null),
      golsUser: h.golsUser, golsIa: h.golsIa, venceu: h.venceu,
    })),
    duel: duel ? {
      turn: st.outcome ? 'over' : duel.turn,
      round: duel.turn === 'kick' ? duel.kicks.length + 1 : duel.defenses.length + 1,
      sudden: duel.kicks.length >= C.kicks && duel.defenses.length >= C.kicks && !st.outcome,
      golsUser: duel.kicks.filter((k) => k.gol).length,
      golsIa: duel.defenses.filter((d) => d.gol).length,
      user: duel.kicks, ia: duel.defenses,
      pending: duel.pending ?? null, // o alvo já está no ar: a janela corre desde servedAt
    } : null,
    reward: row?.reward ?? null,
  };
}

function requireUnlocked(user) {
  const g = MINIGAMES.find((m) => m.id === 'FRANGACO');
  if (g && levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `Frangaço libera no nível ${g.unlock}.`);
}

async function withFrangaco(userId, fn) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  const teams = await allTeams();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'FRANGACO', ${day}, '{}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'FRANGACO' AND day = ${day} FOR UPDATE`;
    const ctx = { tx, row, st: { ...row.state }, now, day, teams, userId, patch: {} };
    // defesa que estourou o tempo com a aba fechada: resolve sozinha como gol da IA
    if (!row.finishedAt && !ctx.st.outcome && expired(ctx.st.duel?.pending, now)) {
      await applyDefense(ctx, null);
    }
    const extra = (await fn(ctx)) ?? {};
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: ctx.st, ...ctx.patch } });
    return { ...extra, state: view(saved, teams, now) };
  });
}

/** Fase/histórico herdados da linha mais recente de dias anteriores (o "carry" do torneio). */
function carryOf(prevState) {
  const ps = prevState;
  if (ps?.outcome === 'venceu' && !ps.champion && ps.phase < C.phases.length - 1) {
    return { phase: ps.phase + 1, history: [...(ps.history ?? []), summaryOf(ps)] };
  }
  return { phase: 0, history: [] };
}

/** Só leitura: abrir a tela não começa o duelo (mas fecha uma defesa vencida pelo relógio). */
export async function frangacoState(userId) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  const teams = await allTeams();
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'FRANGACO', day } } });
  if (row && !row.finishedAt && !row.state?.outcome && expired(row.state?.duel?.pending, now)) {
    return withFrangaco(userId, async () => ({})); // resolve a defesa estourada e devolve o estado
  }
  if (!row?.state?.duel) {
    // ainda não começou hoje: mostra a fase que o torneio herdou de ontem
    const prev = await prisma.dailyGame.findFirst({ where: { userId, game: 'FRANGACO', day: { lt: day } }, orderBy: { day: 'desc' } });
    const c = carryOf(prev?.state);
    return { state: view({ ...(row ?? {}), state: { ...(row?.state ?? {}), ...c } }, teams, now) };
  }
  return { state: view(row, teams, now) };
}

/** Começa (ou retoma) o duelo do dia: fase herdada do torneio + adversário da mesma série. */
export function frangacoStart(userId) {
  return withFrangaco(userId, async (ctx) => {
    const { st, row, tx, day } = ctx;
    if (st.duel && !st.outcome) return {}; // duelo aberto: retoma
    if (row.finishedAt && !FREE) throw new GameError(409, 'finished', DONE());
    if (row.finishedAt) ctx.patch = { finishedAt: null, won: false, reward: null }; // teste local
    const user = await loadUser(tx, userId);
    requireUnlocked(user);
    // torneio: a linha mais recente de dias anteriores diz se avança de fase ou recomeça
    let phase = 0, history = [];
    if (!st.duel) {
      const prev = await tx.dailyGame.findFirst({ where: { userId, game: 'FRANGACO', day: { lt: day } }, orderBy: { day: 'desc' } });
      ({ phase, history } = carryOf(prev?.state));
    } else { phase = st.phase; history = st.history; } // FREE: recomeça na mesma fase
    // adversário IA: clube da MESMA série do jogador, fora o dele e os já enfrentados no torneio
    const used = new Set([user.teamId, ...history.map((h) => h.teamId)]);
    const pool = ctx.teams.filter((t) => t.serie === user.team.serie && !used.has(t.id));
    const candidates = pool.length ? pool : ctx.teams.filter((t) => t.id !== user.teamId);
    const opp = candidates[randomInt(candidates.length)];
    Object.assign(st, {
      phase, history, teamId: opp.id,
      duel: { turn: 'kick', kicks: [], defenses: [], pending: null },
      outcome: null, champion: false,
    });
    return {};
  });
}

const summaryOf = (ps) => ({
  phase: ps.phase, teamId: ps.teamId,
  golsUser: ps.duel.kicks.filter((k) => k.gol).length,
  golsIa: ps.duel.defenses.filter((d) => d.gol).length,
  venceu: ps.outcome === 'venceu',
});

const num01 = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/** A minha cobrança: mira {x, y} 0..1 no gol + finta opcional (canto anunciado). */
export function frangacoKick(userId, body = {}) {
  const x = num01(body.x), y = num01(body.y);
  if (x === null || y === null) throw badRequest('Mire dentro do gol.', 'bad-aim');
  const anunciado = body.anunciado == null ? null : num01(body.anunciado);
  if (body.anunciado != null && anunciado === null) throw badRequest('Finta inválida.', 'bad-aim');
  return withFrangaco(userId, async (ctx) => {
    const { st, tx, now } = ctx;
    if (!st.duel || st.outcome) throw new GameError(409, 'no-duel', ctx.row.finishedAt ? DONE() : 'Comece o duelo do Frangaço.');
    if (st.duel.turn !== 'defense' && st.duel.turn !== 'kick') throw new GameError(409, 'over', 'O duelo já acabou.');
    if (st.duel.turn !== 'kick') throw new GameError(409, 'not-your-kick', 'Agora é a vez de DEFENDER.');
    const user = await loadUser(tx, userId);
    const r = resolveKick(rand, { x, y, anunciado, dexterity: user.dexterity });
    const n = st.duel.kicks.length + 1;
    st.duel.kicks.push({ n, gol: r.gol, motivo: r.motivo, x, y, anunciado, fintou: r.fintou, xBola: r.xBola, yBola: r.yBola, xGk: r.xGk, keeperMs: r.keeperMs });
    const status = duelStatus(st.duel.kicks, st.duel.defenses);
    if (status.over) await finishDuel(ctx, user, status);
    else {
      st.duel.turn = 'defense';
      const sudden = st.duel.kicks.length > C.kicks;
      st.duel.pending = { n: st.duel.defenses.length + 1, ...newDefense(rand, st.phase, sudden), servedAt: now.getTime() };
    }
    return { kick: st.duel.kicks.at(-1), defense: st.duel.pending ?? null, reward: ctx.patch.reward ?? null };
  });
}

/** A minha defesa: toque {x, y} 0..1 + `ms` relativo ao alvo aparecer (null = não tocou). */
export function frangacoSave(userId, body = {}) {
  return withFrangaco(userId, async (ctx) => {
    const { st } = ctx;
    if (!st.duel || st.outcome) {
      // a defesa pode ter sido fechada pelo relógio na entrada do withFrangaco — devolve o resultado
      if (st.outcome && st.duel?.defenses?.length) return { save: st.duel.defenses.at(-1), reward: ctx.patch.reward ?? ctx.row.reward ?? null };
      throw new GameError(409, 'no-duel', ctx.row.finishedAt ? DONE() : 'Comece o duelo do Frangaço.');
    }
    if (st.duel.turn !== 'defense' || !st.duel.pending) {
      // idem: janela estourada já resolvida agora há pouco
      if (st.duel.defenses.length && st.duel.turn === 'kick') return { save: st.duel.defenses.at(-1), reward: null };
      throw new GameError(409, 'not-your-defense', 'Agora é a vez de BATER.');
    }
    const ms = typeof body.ms === 'number' && Number.isFinite(body.ms) ? Math.round(body.ms) : null;
    const click = ms === null ? null : { x: num01(body.x) ?? NaN, y: num01(body.y) ?? NaN, ms };
    const user = await loadUser(ctx.tx, userId);
    await applyDefense(ctx, click, user);
    return { save: st.duel.defenses.at(-1), reward: ctx.patch.reward ?? null };
  });
}

/** Resolve a defesa pendente (click null = não tocou) e move o duelo adiante. */
async function applyDefense(ctx, click, user = null) {
  const { st, tx, now } = ctx;
  const pending = st.duel.pending;
  const r = resolveSave(pending, click, now.getTime() - pending.servedAt);
  st.duel.defenses.push({
    n: pending.n, gol: !r.defendeu, defendeu: r.defendeu, motivo: r.motivo,
    alvo: pending.target, clique: click && Number.isFinite(click.x) ? { x: click.x, y: click.y } : null,
    ms: click?.ms ?? null, janelaMs: pending.windowMs,
  });
  st.duel.pending = null;
  const status = duelStatus(st.duel.kicks, st.duel.defenses);
  if (status.over) await finishDuel(ctx, user ?? await loadUser(tx, ctx.userId), status);
  else st.duel.turn = 'kick';
}

/** Fim do duelo: venceu = 1 gol (kind FRANGACO) e avança; campeão leva R$ 500 + 20 de nível. */
async function finishDuel(ctx, user, status) {
  const { st, tx, now } = ctx;
  st.duel.turn = 'over';
  st.outcome = status.venceu ? 'venceu' : 'perdeu';
  st.champion = status.venceu && st.phase >= C.phases.length - 1;
  const opp = ctx.teams.find((t) => t.id === st.teamId);
  const placar = `${status.golsUser} x ${status.golsIa}`;
  const reward = {
    goal: status.venceu, venceu: status.venceu, champion: st.champion,
    golsUser: status.golsUser, golsIa: status.golsIa, phase: st.phase,
    money: st.champion ? C.championMoney : 0, levelPoints: st.champion ? C.championLevelPoints : 0, text: null,
  };
  if (status.venceu) {
    const match = await liveMatchForTeam(user.teamId, tx);
    const phrase = st.champion
      ? `é CAMPEÃO do Frangaço: bateu o ${opp?.name ?? 'adversário'} por ${placar} na final`
      : `venceu o ${opp?.name ?? 'adversário'} por ${placar} nos pênaltis do Frangaço (${C.phases[st.phase]})`;
    const { text } = await applyResult(tx, user, { kind: 'FRANGACO', goal: true, now, match, money: reward.money, phrase });
    reward.text = text;
    if (st.champion) await tx.user.update({ where: { id: user.id }, data: { levelBonus: { increment: C.championLevelPoints } } });
  }
  ctx.patch = { ...ctx.patch, finishedAt: now, won: status.venceu, reward };
}
