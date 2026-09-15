/**
 * Chutes — chute direto, pênalti, falta, trilha e Party GoL.
 * Tudo roda em transação; o cliente só anima o resultado.
 */
import { prisma } from '../prisma.js';
import { GameError, badRequest, cooldown as cooldownError } from '../lib/errors.js';
import { hourKey, nextMidnight } from '../lib/time.js';
import {
  COOLDOWN_TOLERANCE_MS, LAST_FIELD, MONEY, UNLOCK_LEVEL, TRAIL_LINES, FOUL_BASE_CHANCE,
  DEXTERITY_BONUS_PER_POINT, PARTY_WIN_CHANCE, REBOUND_CHANCE, KIND_LABEL,
  cooldownFor, levelOf, reboundLevel, PARTY_SPINS, MINIGAME_MONEY_KINDS, isVip } from '../lib/rules.js';
import { liveMatchForTeam } from './league.js';
import { activeItemsWhere, bootBonus, shinGuard, rollShinGuardMines } from '../lib/items.js';

const rnd = Math.random;

const NARRATION = {
  goalOpeners: ['É GOOOOL!', 'GOLAÇO!', 'NO ÂNGULO!', 'GOOOL DO', 'QUE GOL!', 'É DELE!', 'SEM CHANCE PRO GOLEIRO!'],
  penaltyGoal: ['convertendo o pênalti com segurança', 'deslocou o goleiro e mandou pro fundo da rede', 'bateu no canto e não deu chance'],
  penaltySave: ['DEFENDEU!', 'O GOLEIRO ADIVINHOU!', 'AGARROU!', 'PEGOU!'],
  foulGoal: ['cobrou a falta por cima da barreira', 'colocou a bola na gaveta', 'fez a bola desviar da barreira e morrer no ângulo'],
  foulMiss: ['NA BARREIRA!', 'PRA FORA!', 'ISOLOU!', 'O GOLEIRO ESPALMOU!'],
  trailGoal: ['driblou a defesa inteira e tocou pro gol', 'passou por todos e só empurrou', 'deixou o goleiro no chão'],
  trailMiss: ['PERDEU A BOLA!', 'DESARMADO!', 'O ZAGUEIRO CHEGOU JUNTO!'],
  autoGoal: ['chute direto certeiro', 'mandou de primeira', 'bateu cruzado e marcou'],
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function goalText(user, match, kind, phrase) {
  const team = user.team;
  const stadium = team?.stadium ? ` Aqui no ${team.stadium}!` : '';
  const placar = match
    ? ` ${match.homeTeam.name} ${match.homeGoals} x ${match.awayGoals} ${match.awayTeam.name}`
    : '';
  return `${pick(NARRATION.goalOpeners)} ${team?.name ?? ''}! CRAQUE ${user.nick} ${phrase}!${stadium} Parabéns, é o seu gol de nº ${user.goalsTotal + 1}.${placar}`;
}

/** Reserva a recarga de forma atômica; lança 429 se ainda em recarga. */
async function claimCooldown(tx, user, kind, now) {
  const field = LAST_FIELD[kind];
  const cd = cooldownFor(user, kind, now.getTime());
  const threshold = new Date(now.getTime() - cd + COOLDOWN_TOLERANCE_MS);
  const res = await tx.user.updateMany({
    where: { id: user.id, OR: [{ [field]: null }, { [field]: { lt: threshold } }] },
    data: { [field]: now },
  });
  if (res.count === 0) {
    const last = user[field] ? new Date(user[field]).getTime() : 0;
    throw cooldownError(Math.max(0, last + cd - now.getTime()));
  }
  return cd;
}

function requireUnlocked(user, kind) {
  const lvl = levelOf(user).lvl;
  if (lvl < UNLOCK_LEVEL[kind]) {
    throw new GameError(403, 'locked', `${KIND_LABEL[kind][0].toUpperCase()}${KIND_LABEL[kind].slice(1)} libera no nível ${UNLOCK_LEVEL[kind]}.`);
  }
}

/** Soma o gol no placar só se a partida ainda estiver ao vivo; se a rodada fechou no meio do chute
 *  (o fechamento já leu o placar final), o gol vai para a partida do time na rodada nova. */
async function scoreOnLiveMatch(tx, teamId, match) {
  for (let i = 0; match && i < 3; i++) {
    const side = match.homeTeamId === teamId ? 'homeGoals' : 'awayGoals';
    const { count } = await tx.match.updateMany({ where: { id: match.id, status: 'LIVE' }, data: { [side]: { increment: 1 } } });
    if (count) { match[side] += 1; return match; }
    match = await liveMatchForTeam(teamId, tx);
  }
  return null;
}

/** Aplica gol/erro: contadores, Goal, Activity, placar da partida. (Os minigames diários também usam.) */
export async function applyResult(tx, user, { kind, goal, now, match, phrase, money }) {
  const hk = hourKey(now);
  // saldo dos minigames (dono, 15/09/2026): quem manda money 0 e é minigame ganha MONEY.MINIGAME_WIN por gol
  const bonus = goal && !(money > 0) && MINIGAME_MONEY_KINDS.includes(kind);
  money = bonus ? MONEY.MINIGAME_WIN : (money ?? 0);
  if (goal && match) match = await scoreOnLiveMatch(tx, user.teamId, match); // o placar primeiro: define a rodada do gol
  const seasonId = match?.round?.seasonId ?? null;
  const roundId = match?.roundId ?? null;
  const data = {};
  const tries = { PENALTY: 'penaltyTries', FOUL: 'foulTries', TRAIL: 'trailTries' }[kind];
  if (tries) data[tries] = { increment: 1 };
  let text;
  if (goal) {
    const hits = { AUTO: 'autoGoals', PENALTY: 'penaltyGoals', FOUL: 'foulGoals', TRAIL: 'trailGoals' }[kind];
    if (hits) data[hits] = { increment: 1 }; // o Termo guarda o histórico em DailyGame
    data.goalsTotal = { increment: 1 };
    data.money = { increment: money };
    data.goalsHour = user.hourKey === hk ? { increment: 1 } : 1;
    data.hourKey = hk;
    data.goalsRound = roundId && user.roundId === roundId ? { increment: 1 } : 1;
    data.roundId = roundId;
    data.goalsSeason = seasonId && user.seasonId === seasonId ? { increment: 1 } : 1;
    data.seasonId = seasonId;
    await tx.goal.create({
      data: { userId: user.id, teamId: user.teamId, matchId: match?.id ?? null, roundId, seasonId, hourKey: hk, kind, money },
    });
    text = goalText(user, match, kind, phrase);
    if (bonus) text += ` E leva R$ ${money.toLocaleString('pt-BR')} no bolso!`;
  } else {
    text = `${phrase} ${user.nick} (${user.team?.name ?? ''}) errou ${KIND_LABEL[kind] === 'falta' ? 'a falta' : KIND_LABEL[kind] === 'trilha' ? 'na trilha' : 'o pênalti'}.`;
  }
  await tx.user.update({ where: { id: user.id }, data });
  await tx.activity.create({ data: { userId: user.id, teamId: user.teamId, kind, goal, text } });
  return { text, match };
}

export function loadUser(tx, id) {
  // `items` = itens da loja ativos (cooldownFor / chances / caneleira leem daqui)
  return tx.user.findUnique({ where: { id }, include: { team: true, items: activeItemsWhere() } });
}

function summary(user, match, kind, cooldownMs, now) {
  return {
    cooldownMs,
    kickedAt: now.getTime(),
    match: match ? { id: match.id, homeGoals: match.homeGoals, awayGoals: match.awayGoals } : null,
  };
}

// ─── Chute direto (auto-chute) ──────────────────────────────────────────────
export async function autoKick(userId) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const user = await loadUser(tx, userId);
    const cd = await claimCooldown(tx, user, 'AUTO', now);
    const match = await liveMatchForTeam(user.teamId, tx);
    const { text } = await applyResult(tx, user, { kind: 'AUTO', goal: true, now, match, phrase: pick(NARRATION.autoGoal), money: MONEY.AUTO });
    return { goal: true, money: MONEY.AUTO, text, ...summary(user, match, 'AUTO', cd, now) };
  });
}

/**
 * VIP ativo: o chute direto sai sozinho a cada recarga, MESMO com o app fechado (decisão do dono,
 * 13/09/2026 — era o item do roteiro do Guilherme). Chamado pelo scheduler; o autoKick reserva a recarga
 * de forma atômica, então nunca sai dois gols na mesma recarga (nem com o app aberto chutando junto).
 */
export async function vipOfflineAutoKicks(now = new Date()) {
  const users = await prisma.user.findMany({
    where: {
      vipUntil: { gt: now },
      AND: [
        { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
        { OR: [{ lastAutoAt: null }, { lastAutoAt: { lt: new Date(now.getTime() - 3 * 60_000) } }] }, // recarga VIP: 5 min (4 com boost)
      ],
    },
    select: { id: true }, take: 500,
  });
  let goals = 0;
  for (const u of users) {
    try { await autoKick(u.id); goals++; } catch (e) { if (e?.code !== 'cooldown') console.error('[vip] auto-chute:', e.message); }
  }
  return goals;
}

// ─── Pênalti ────────────────────────────────────────────────────────────────
const DIRS = ['left', 'center', 'right'];
export async function penalty(userId, direction) {
  if (!DIRS.includes(direction)) throw badRequest('Escolha um canto: esquerda, meio ou direita.');
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const user = await loadUser(tx, userId);
    requireUnlocked(user, 'PENALTY');
    const cd = await claimCooldown(tx, user, 'PENALTY', now);
    const match = await liveMatchForTeam(user.teamId, tx);
    const chance = 2 / 3 + user.dexterity * DEXTERITY_BONUS_PER_POINT + bootBonus(user, now.getTime()); // chuteira da loja
    const lvl = levelOf(user).lvl;
    let goal = rnd() < chance;
    let rebound = false;
    if (!goal) {
      const rb = REBOUND_CHANCE[reboundLevel(lvl, 'PENALTY')] || 0;
      if (rnd() < rb) { rebound = true; goal = rnd() < chance; }
    }
    // Goleiro: se foi gol, pulou para outro canto; se defendeu, adivinhou.
    const keeperDir = goal ? pick(DIRS.filter((d) => d !== direction)) : direction;
    const phrase = goal ? pick(NARRATION.penaltyGoal) : pick(NARRATION.penaltySave);
    const { text } = await applyResult(tx, user, { kind: 'PENALTY', goal, now, match, phrase, money: MONEY.PENALTY });
    return { goal, rebound, keeperDir, direction, money: goal ? MONEY.PENALTY : 0, text, ...summary(user, match, 'PENALTY', cd, now) };
  });
}

// ─── Falta ──────────────────────────────────────────────────────────────────
const FOUL_DIRS = ['left', 'over', 'right'];
export async function foul(userId, direction) {
  if (!FOUL_DIRS.includes(direction)) throw badRequest('Escolha: por fora à esquerda, por cima da barreira ou por fora à direita.');
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const user = await loadUser(tx, userId);
    requireUnlocked(user, 'FOUL');
    const cd = await claimCooldown(tx, user, 'FOUL', now);
    const match = await liveMatchForTeam(user.teamId, tx);
    const chance = FOUL_BASE_CHANCE + user.dexterity * DEXTERITY_BONUS_PER_POINT + bootBonus(user, now.getTime()); // chuteira da loja
    const lvl = levelOf(user).lvl;
    let goal = rnd() < chance;
    let rebound = false;
    if (!goal) {
      const rb = REBOUND_CHANCE[reboundLevel(lvl, 'FOUL')] || 0;
      if (rnd() < rb) { rebound = true; goal = rnd() < chance; }
    }
    const outcome = goal ? 'goal' : pick(direction === 'over' ? ['wall', 'keeper', 'out'] : ['keeper', 'out', 'keeper']);
    const phrase = goal ? pick(NARRATION.foulGoal) : pick(NARRATION.foulMiss);
    const { text } = await applyResult(tx, user, { kind: 'FOUL', goal, now, match, phrase, money: MONEY.FOUL });
    return { goal, rebound, outcome, direction, money: goal ? MONEY.FOUL : 0, text, ...summary(user, match, 'FOUL', cd, now) };
  });
}

// ─── Trilha ─────────────────────────────────────────────────────────────────
function shuffledLine({ total, mines }) {
  const arr = Array.from({ length: total }, (_, j) => j >= total - mines);
  for (let k = arr.length - 1; k > 0; k--) {
    const r = Math.floor(rnd() * (k + 1));
    [arr[k], arr[r]] = [arr[r], arr[k]];
  }
  return arr;
}

export async function trailState(user) {
  const st = user.trailState;
  if (!st?.active) return { active: false, phase: 0, revealed: [] };
  return { active: true, phase: st.phase, revealed: st.revealed || [], startedAt: st.startedAt };
}

export async function trailPick(userId, pickIndex) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const user = await loadUser(tx, userId);
    requireUnlocked(user, 'TRAIL');
    let state = user.trailState?.active ? user.trailState : null;
    let cd = cooldownFor(user, 'TRAIL', now.getTime());
    if (!state) {
      cd = await claimCooldown(tx, user, 'TRAIL', now);
      state = { active: true, phase: 0, layout: TRAIL_LINES.map(shuffledLine), revealed: [], startedAt: now.getTime() };
      // Caneleira (loja): sorteia menos ladrões na última linha; é consumida quando esta trilha termina
      const guard = shinGuard(user, now.getTime());
      if (guard) {
        const last = TRAIL_LINES.length - 1;
        state.layout[last] = shuffledLine({ total: TRAIL_LINES[last].total, mines: rollShinGuardMines(rnd) });
        state.shinGuardId = guard.id;
      }
    }
    const line = state.phase;
    const cfg = TRAIL_LINES[line];
    if (!cfg || !Number.isInteger(pickIndex) || pickIndex < 0 || pickIndex >= cfg.total) throw badRequest('Jogada inválida.');
    const already = (state.revealed || []).some((r) => r.phase === line && r.index === pickIndex);
    if (already) throw badRequest('Você já tentou esse jogador.');

    const lineMines = state.layout[line];
    const mine = lineMines[pickIndex] === true;
    let goal = false;
    let finished = false;
    let rebound = false;
    let nextPhase = line;
    let text = null;
    const lvl = levelOf(user).lvl;

    if (mine) {
      const rb = REBOUND_CHANCE[reboundLevel(lvl, 'TRAIL')] || 0;
      const minesLeft = lineMines.filter((m, i) => m && !(state.revealed || []).some((r) => r.phase === line && r.index === i)).length;
      if (rnd() < rb && cfg.total - cfg.mines > 0 && minesLeft > 0) {
        rebound = true; // mantém a posse: revela o errado e continua na mesma linha
        state.revealed = [...(state.revealed || []), { phase: line, index: pickIndex }];
      } else {
        finished = true;
        ({ text } = await applyResult(tx, user, { kind: 'TRAIL', goal: false, now, match: await liveMatchForTeam(user.teamId, tx), phrase: pick(NARRATION.trailMiss), money: 0 }));
      }
    } else {
      nextPhase = line + 1;
      state.revealed = [...(state.revealed || []), { phase: line, index: pickIndex }];
      if (nextPhase >= TRAIL_LINES.length) {
        goal = true;
        finished = true;
        ({ text } = await applyResult(tx, user, { kind: 'TRAIL', goal: true, now, match: await liveMatchForTeam(user.teamId, tx), phrase: pick(NARRATION.trailGoal), money: MONEY.TRAIL }));
      }
    }

    const newState = finished ? { active: false, endedAt: now.getTime() } : { ...state, phase: nextPhase };
    await tx.user.update({ where: { id: user.id }, data: { trailState: newState } });
    // Caneleira: consumida quando a trilha termina na última linha (onde ela agiu); perder antes não gasta
    if (finished && state.shinGuardId && line === TRAIL_LINES.length - 1) await tx.userItem.updateMany({ where: { id: state.shinGuardId, usedAt: null }, data: { usedAt: now } });
    return {
      mine, goal, finished, rebound,
      phase: nextPhase,
      lineMines: finished || !mine ? lineMines : null, // só revela a linha inteira ao concluir a linha
      money: goal ? MONEY.TRAIL : 0,
      text,
      cooldownMs: cd,
      kickedAt: state.startedAt ?? now.getTime(),
    };
  });
}

// ─── Party GoL (roleta) ─────────────────────────────────────────────────────
export const PARTY_SEGMENTS = ['GOL', 'ERROU', 'ERROU', 'GOL', 'ERROU', 'GOL', 'ERROU', 'ERROU'];
export async function partySpin(userId) {
  return prisma.$transaction(async (tx) => {
    // giros por dia (dono, 15/09/2026): 5 para quem não é VIP, 10 para VIP ativo — cada giro deixa uma Activity PARTY
    const me0 = await tx.user.findUnique({ where: { id: userId }, select: { vipUntil: true } });
    const max = isVip(me0) ? PARTY_SPINS.vip : PARTY_SPINS.free;
    const dayStart0 = new Date(nextMidnight(new Date()).getTime() - 24 * 3600_000);
    const spins = await tx.activity.count({ where: { userId, kind: 'PARTY', createdAt: { gte: dayStart0 } } });
    if (spins >= max) throw new GameError(429, 'party-limit', isVip(me0) ? `Você já usou os ${max} giros de hoje. A roleta volta à meia-noite.` : `Você já usou os ${max} giros de hoje. VIP tem ${PARTY_SPINS.vip} por dia — ou volte à meia-noite.`, { spins, max });
    const res = await tx.user.updateMany({
      where: { id: userId, money: { gte: MONEY.PARTY_BET } },
      data: { money: { decrement: MONEY.PARTY_BET }, partyTries: { increment: 1 } },
    });
    if (res.count === 0) throw new GameError(402, 'no-money', `Você precisa de R$ ${MONEY.PARTY_BET} para apostar.`);
    const win = rnd() < PARTY_WIN_CHANCE;
    const candidates = PARTY_SEGMENTS.map((s, i) => ({ s, i })).filter((x) => (x.s === 'GOL') === win);
    const segment = pick(candidates).i;
    const now = new Date();
    const user = await tx.user.update({
      where: { id: userId },
      data: win ? { money: { increment: MONEY.PARTY_PRIZE }, partyWins: { increment: 1 } } : {},
      include: { team: true },
    });
    // Regra do dono (13/09/2026): todo minigame vencido dá 1 gol + o bônus dele. Na roleta o gol
    // vale só na PRIMEIRA vitória do dia (Brasília) — senão dinheiro compraria gols sem limite.
    let goal = false, text;
    if (win) {
      const dayStart = new Date(nextMidnight(now).getTime() - 24 * 3600_000);
      const already = await tx.goal.count({ where: { userId, kind: 'PARTY', createdAt: { gte: dayStart } } });
      goal = already === 0;
    }
    if (goal) {
      const match = await liveMatchForTeam(user.teamId, tx);
      ({ text } = await applyResult(tx, user, { kind: 'PARTY', goal: true, now, match, money: 0, phrase: `acertou no Party GoL, faturou R$ ${MONEY.PARTY_PRIZE} e ainda marcou` }));
    } else {
      text = win ? `${user.nick} acertou no Party GoL e faturou R$ ${MONEY.PARTY_PRIZE}!` : `${user.nick} errou no Party GoL.`;
      await tx.activity.create({ data: { userId, teamId: user.teamId, kind: 'PARTY', goal: false, text } });
    }
    return { win, goal, text, segment, segments: PARTY_SEGMENTS, money: user.money, prize: win ? MONEY.PARTY_PRIZE : 0, bet: MONEY.PARTY_BET, spins: spins + 1, max, left: max - spins - 1 };
  });
}

/** Estado da roleta para a tela: giros usados hoje e o limite (VIP ativo tem mais). */
export async function partyStatus(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { vipUntil: true } });
  const max = isVip(u) ? PARTY_SPINS.vip : PARTY_SPINS.free;
  const dayStart = new Date(nextMidnight(new Date()).getTime() - 24 * 3600_000);
  const spins = await prisma.activity.count({ where: { userId, kind: 'PARTY', createdAt: { gte: dayStart } } });
  return { bet: MONEY.PARTY_BET, prize: MONEY.PARTY_PRIZE, spins, max, left: Math.max(0, max - spins), vip: isVip(u), freeMax: PARTY_SPINS.free, vipMax: PARTY_SPINS.vip };
}
