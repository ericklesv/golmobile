/**
 * Chutes — chute direto, pênalti, falta, trilha e Party GoL.
 * Tudo roda em transação; o cliente só anima o resultado.
 */
import { prisma } from '../prisma.js';
import { GameError, badRequest, cooldown as cooldownError } from '../lib/errors.js';
import { hourKey, nextMidnight } from '../lib/time.js';
import {
  COOLDOWN_TOLERANCE_MS, LAST_FIELD, MONEY, UNLOCK_LEVEL, TRAIL_LINES, FOUL_BASE_CHANCE, PENALTY_BASE_CHANCE,
  CHANCE_CAP, skillBonus, PARTY_PRIZES, REBOUND_CHANCE, KIND_LABEL,
  cooldownFor, levelOf, reboundLevel, PARTY_SPINS, MINIGAME_MONEY_KINDS, MINIGAME_MONEY, isVip, rollBall, BALL } from '../lib/rules.js';
import { ballNextOf, ballLeftOf, kicksOf, saveNextBall, saveBallLeft } from '../lib/bola.js';
import { liveMatchForTeam } from './league.js';
import { activeItemsWhere, bootBonus, shinGuard, rollShinGuardMines, strikerOn } from '../lib/items.js';

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

/**
 * Reserva a batida: se a recarga que está rolando é de prata/ouro e ainda sobra batida, ela sai DE GRAÇA
 * (a recarga já foi cobrada na primeira). Senão cobra a recarga normal, marca quantas batidas esta bola dá
 * e sorteia a bola da PRÓXIMA recarga — é ela que deixa o card prateado/dourado enquanto o tempo corre.
 */
async function claimKick(tx, user, kind, now) {
  const andando = ballLeftOf(user, kind);
  if (andando) {
    await saveBallLeft(tx, user.id, kind, andando.ball, andando.left - 1);
    return { cd: cooldownFor(user, kind, now.getTime()), ball: andando.ball, left: andando.left - 1, extra: true };
  }
  const cd = await claimCooldown(tx, user, kind, now);
  const ball = ballNextOf(user, kind);
  const left = kicksOf(ball) - 1; // as batidas que sobram desta mesma recarga
  if (BALL.kinds.includes(kind)) {
    await saveBallLeft(tx, user.id, kind, ball, left);
    await saveNextBall(tx, user.id, kind, rollBall(user, kind, rnd));
  }
  return { cd, ball, left, extra: false };
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
export async function applyResult(tx, user, { kind, goal, now, match, phrase, money, ball = null }) {
  const hk = hourKey(now);
  // saldo dos minigames: quem manda money 0 e é minigame ganha o valor do MINIGAME_MONEY (quanto mais
  // difícil o minigame, mais paga — dono, 17/09/2026); sem valor na tabela, o piso de MINIGAME_WIN
  const bonus = goal && !(money > 0) && MINIGAME_MONEY_KINDS.includes(kind);
  money = bonus ? (MINIGAME_MONEY[kind] ?? MONEY.MINIGAME_WIN) : (money ?? 0);
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
      data: { userId: user.id, teamId: user.teamId, matchId: match?.id ?? null, roundId, seasonId, hourKey: hk, kind, money, ball },
    });
    text = goalText(user, match, kind, phrase);
    if (ball) text = `BOLA ${ball}! ${text}`; // chute de prata/ouro: a torcida vê de onde veio
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
    const { cd, ball, left } = await claimKick(tx, user, 'PENALTY', now);
    const match = await liveMatchForTeam(user.teamId, tx);
    const chance = Math.min(CHANCE_CAP.PENALTY, PENALTY_BASE_CHANCE + skillBonus(user, 'PENALTY') + bootBonus(user, now.getTime())); // base + Pontaria + chuteira
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
    const { text } = await applyResult(tx, user, { kind: 'PENALTY', goal, now, match, phrase, money: MONEY.PENALTY, ball });
    return { goal, rebound, keeperDir, direction, money: goal ? MONEY.PENALTY : 0, text, ball, ballLeft: left, ...summary(user, match, 'PENALTY', cd, now) };
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
    const { cd, ball, left } = await claimKick(tx, user, 'FOUL', now);
    const match = await liveMatchForTeam(user.teamId, tx);
    const chance = Math.min(CHANCE_CAP.FOUL, FOUL_BASE_CHANCE + skillBonus(user, 'FOUL') + bootBonus(user, now.getTime())); // base + Chute + chuteira
    const lvl = levelOf(user).lvl;
    let goal = rnd() < chance;
    let rebound = false;
    if (!goal) {
      const rb = REBOUND_CHANCE[reboundLevel(lvl, 'FOUL')] || 0;
      if (rnd() < rb) { rebound = true; goal = rnd() < chance; }
    }
    const outcome = goal ? 'goal' : pick(direction === 'over' ? ['wall', 'keeper', 'out'] : ['keeper', 'out', 'keeper']);
    const phrase = goal ? pick(NARRATION.foulGoal) : pick(NARRATION.foulMiss);
    const { text } = await applyResult(tx, user, { kind: 'FOUL', goal, now, match, phrase, money: MONEY.FOUL, ball });
    return { goal, rebound, outcome, direction, money: goal ? MONEY.FOUL : 0, text, ball, ballLeft: left, ...summary(user, match, 'FOUL', cd, now) };
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
      const claim = await claimKick(tx, user, 'TRAIL', now);
      cd = claim.cd;
      state = { active: true, phase: 0, layout: TRAIL_LINES.map(shuffledLine), revealed: [], startedAt: now.getTime(), ball: claim.ball, ballLeft: claim.left };
      // Última linha (o ataque) com ajuda da loja: o Atacante extra tira 1 ladrão fixo enquanto dura, e a
      // Caneleira sorteia (pode abrir até 3 casas) e é consumida quando esta trilha termina. Valem juntos:
      // fica sempre a linha mais fácil das duas.
      const last = TRAIL_LINES.length - 1;
      const guard = shinGuard(user, now.getTime());
      const striker = strikerOn(user, now.getTime());
      if (guard || striker) {
        let mines = TRAIL_LINES[last].mines;
        if (striker) mines = Math.max(0, mines - 1);
        if (guard) { mines = Math.min(mines, rollShinGuardMines(rnd)); state.shinGuardId = guard.id; }
        state.layout[last] = shuffledLine({ total: TRAIL_LINES[last].total, mines });
        state.striker = striker;
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
        ({ text } = await applyResult(tx, user, { kind: 'TRAIL', goal: false, now, match: await liveMatchForTeam(user.teamId, tx), phrase: pick(NARRATION.trailMiss), money: 0, ball: state.ball }));
      }
    } else {
      nextPhase = line + 1;
      state.revealed = [...(state.revealed || []), { phase: line, index: pickIndex }];
      if (nextPhase >= TRAIL_LINES.length) {
        goal = true;
        finished = true;
        ({ text } = await applyResult(tx, user, { kind: 'TRAIL', goal: true, now, match: await liveMatchForTeam(user.teamId, tx), phrase: pick(NARRATION.trailGoal), money: MONEY.TRAIL, ball: state.ball }));
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
      ball: state.ball ?? null,
      ballLeft: state.ballLeft ?? 0,
      cooldownMs: cd,
      kickedAt: state.startedAt ?? now.getTime(),
    };
  });
}

// ─── Party GoL (roleta) ─────────────────────────────────────────────────────
/**
 * Rótulos das 8 casas, na ordem em que a roda desenha. Os valores vêm de PARTY_PRIZES (rules.js):
 * três casas pagam, e pagam DIFERENTE. Mantido como 'GOL'/'ERROU' porque telas antigas (o app só
 * troca de versão quando o jogador toca em "Atualizar") leem daqui; o valor de cada casa vai em
 * `partyPrizes` no /api/meta.
 */
export const PARTY_SEGMENTS = PARTY_PRIZES.map((p) => (p > 0 ? 'GOL' : 'ERROU'));
export async function partySpin(userId) {
  return prisma.$transaction(async (tx) => {
    // giros por dia (PARTY_SPINS em rules.js; desde 17/09/2026 são 10 para todo mundo) — cada giro deixa uma Activity PARTY
    const me0 = await tx.user.findUnique({ where: { id: userId }, select: { vipUntil: true } });
    const max = isVip(me0) ? PARTY_SPINS.vip : PARTY_SPINS.free;
    const dayStart0 = new Date(nextMidnight(new Date()).getTime() - 24 * 3600_000);
    const spins = await tx.activity.count({ where: { userId, kind: 'PARTY', createdAt: { gte: dayStart0 } } });
    if (spins >= max) throw new GameError(429, 'party-limit', PARTY_SPINS.vip > max ? `Você já usou os ${max} giros de hoje. VIP tem ${PARTY_SPINS.vip} por dia — ou volte à meia-noite.` : `Você já usou os ${max} giros de hoje. A roleta volta à meia-noite.`, { spins, max });
    const res = await tx.user.updateMany({
      where: { id: userId, money: { gte: MONEY.PARTY_BET } },
      data: { money: { decrement: MONEY.PARTY_BET }, partyTries: { increment: 1 } },
    });
    if (res.count === 0) throw new GameError(402, 'no-money', `Você precisa de R$ ${MONEY.PARTY_BET} para apostar.`);
    // Cada casa tem a mesma chance (1 em 8): 3 pagam (300, 800 e 1.500) e 5 não pagam nada.
    const segment = Math.floor(rnd() * PARTY_PRIZES.length);
    const prize = PARTY_PRIZES[segment];
    const win = prize > 0;
    const now = new Date();
    const user = await tx.user.update({
      where: { id: userId },
      data: win ? { money: { increment: prize }, partyWins: { increment: 1 } } : {},
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
      ({ text } = await applyResult(tx, user, { kind: 'PARTY', goal: true, now, match, money: 0, phrase: `acertou no Party GoL, faturou R$ ${prize.toLocaleString('pt-BR')} e ainda marcou` }));
    } else {
      text = win ? `${user.nick} acertou no Party GoL e faturou R$ ${prize.toLocaleString('pt-BR')}!` : `${user.nick} errou no Party GoL.`;
      await tx.activity.create({ data: { userId, teamId: user.teamId, kind: 'PARTY', goal: false, text } });
    }
    return { win, goal, text, segment, segments: PARTY_SEGMENTS, prizes: PARTY_PRIZES, money: user.money, prize, bet: MONEY.PARTY_BET, spins: spins + 1, max, left: max - spins - 1 };
  });
}

/** Estado da roleta para a tela: giros usados hoje e o limite (VIP ativo tem mais). */
export async function partyStatus(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { vipUntil: true } });
  const max = isVip(u) ? PARTY_SPINS.vip : PARTY_SPINS.free;
  const dayStart = new Date(nextMidnight(new Date()).getTime() - 24 * 3600_000);
  const spins = await prisma.activity.count({ where: { userId, kind: 'PARTY', createdAt: { gte: dayStart } } });
  return { bet: MONEY.PARTY_BET, prize: MONEY.PARTY_PRIZE, prizes: PARTY_PRIZES, spins, max, left: Math.max(0, max - spins), vip: isVip(u), freeMax: PARTY_SPINS.free, vipMax: PARTY_SPINS.vip };
}
