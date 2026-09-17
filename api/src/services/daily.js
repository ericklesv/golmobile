/**
 * Minigames diários — 1 partida por jogador, por jogo, por dia (cada jogo vira numa
 * hora própria de Brasília: RESET_HOUR em rules.js). Como nos chutes, toda a lógica
 * roda aqui; a tela recebe cores, e a palavra só quando o jogo dela acabou.
 */
import { createHash } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { dayNumber, nextMidnight, quizDayNumber, nextNoon, statsDayNumber, nextStatsReset, dayNumberAt, nextResetAt } from '../lib/time.js';
import { statsReady } from '../lib/stats/data.js';
import { TERMO, QUIZ, DAILY_GAMES, MINIGAMES, MEMORIA, QUALTIME, ALVO, RESET_HOUR, resetLabel, levelOf, PARTY_SPINS, isVip } from '../lib/rules.js';
import { layoutFor, applyShot, summarize, rewardFor } from '../lib/alvo.js';
import { questionsOfDay as qualtimeQuestions } from '../lib/qualtime/bank.js';
import { teamView } from './view.js';
import { cabecaoStatus } from '../realtime/cabecao.js';
import { x1Status } from '../realtime/x1.js';
import { evaluate, keyOf, loadDictionary } from '../lib/termo/rules.js';
import { wordOfDay } from '../lib/termo/answers.js';
import { BANK, questionsOfDay } from '../lib/quiz/questions.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam } from './league.js';

/** Calendário de cada minigame: cada um vira numa hora própria (RESET_HOUR em rules.js). */
function calendar(now) {
  return {
    TERMO: { day: dayNumber(now), nextAt: nextMidnight(now).getTime() },
    QUIZ: { day: quizDayNumber(now), nextAt: nextNoon(now).getTime() },
    MEMORIA: { day: dayNumberAt(RESET_HOUR.MEMORIA, now), nextAt: nextResetAt(RESET_HOUR.MEMORIA, now).getTime() },
    QUALTIME: { day: dayNumberAt(RESET_HOUR.QUALTIME, now), nextAt: nextResetAt(RESET_HOUR.QUALTIME, now).getTime() },
    ALVO: { day: dayNumberAt(RESET_HOUR.ALVO, now), nextAt: nextResetAt(RESET_HOUR.ALVO, now).getTime() },
    CAMISAS: { day: dayNumberAt(RESET_HOUR.CAMISAS, now), nextAt: nextResetAt(RESET_HOUR.CAMISAS, now).getTime() },
    HATTRICK: { day: dayNumberAt(RESET_HOUR.HATTRICK, now), nextAt: nextResetAt(RESET_HOUR.HATTRICK, now).getTime() },
    FALTAPRO: { day: dayNumberAt(RESET_HOUR.FALTAPRO, now), nextAt: nextResetAt(RESET_HOUR.FALTAPRO, now).getTime() },
    FRANGACO: { day: dayNumberAt(RESET_HOUR.FRANGACO, now), nextAt: nextResetAt(RESET_HOUR.FRANGACO, now).getTime() },
    GANHAPERDE: { day: dayNumberAt(RESET_HOUR.GANHAPERDE, now), nextAt: nextResetAt(RESET_HOUR.GANHAPERDE, now).getTime() },
    // Estatísticas viram às 13h; sem os dados baixados, ficam de fora
    ...(statsReady() ? { STATS: { day: statsDayNumber(now), nextAt: nextStatsReset(now).getTime() } } : {}),
  };
}

/**
 * O que está disponível agora. A Home mostra UMA faixa só (`featured`): a do jogo disponível
 * que vence primeiro — terminou esse, aparece o outro.
 */
export async function dailyStatus(userId, now = new Date()) {
  const cal = calendar(now);
  const ids = DAILY_GAMES.filter((g) => cal[g]); // um jogo sem calendário (ex.: sem dados) fica de fora
  const rows = await prisma.dailyGame.findMany({ where: { userId, OR: ids.map((g) => ({ game: g, day: cal[g].day })) } });
  const games = ids.map((id) => {
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
    if (row.finishedAt) throw new GameError(409, 'finished', `Você já jogou o Quiz. Ele renova ${resetLabel('QUIZ')}!`);
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

/**
 * Hub de minigames (slider da Home): catálogo + nível do jogador + o que já foi jogado hoje.
 * `unlocked` = nível alcançado; `available` = dá pra jogar agora; `soon` = ainda não existe.
 */
export async function minigamesHub(userId, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const lvl = levelOf(user).lvl;
  const status = await dailyStatus(userId, now);
  /**
   * O Party GoL não tem linha em DailyGame: o limite dele é por GIRO (uma Activity PARTY por giro).
   * Usados os giros do dia, o cartão vira "JOGADO · volta em …" como os outros e sai da frente
   * (dono, 17/09/2026: "quando o jogador fizer seus 10 giros tem que sumir o party gol de lá").
   */
  const partyReset = nextMidnight(now).getTime();
  const partyMax = isVip(user) ? PARTY_SPINS.vip : PARTY_SPINS.free;
  const partySpins = await prisma.activity.count({ where: { userId, kind: 'PARTY', createdAt: { gte: new Date(partyReset - 24 * 3600_000) } } });
  const partyLeft = Math.max(0, partyMax - partySpins);
  // Só o que já está no jogo (decisão do dono, 14/09/2026): minigame "em breve" (soon) não aparece no slider.
  const games = MINIGAMES.filter((g) => !g.soon).map((g) => {
    const d = g.id === 'PARTY'
      ? { available: partyLeft > 0, started: false, finished: partyLeft === 0, won: false, nextAt: partyReset }
      : status.games.find((x) => x.id === g.id);
    const unlocked = lvl >= g.unlock;
    return {
      id: g.id, name: g.name, desc: g.desc, icon: g.icon, route: g.route, rewardLabel: g.reward, daily: g.daily,
      unlockLevel: g.unlock, unlocked, soon: !!g.soon,
      available: unlocked && !g.soon && (d ? d.available : true),
      started: d?.started ?? false, finished: d?.finished ?? false, won: d?.won ?? false, nextAt: d?.nextAt ?? null,
      live: g.id === 'CABECAO' ? cabecaoStatus() : g.id === 'X1' ? x1Status() : undefined, // fila do head soccer / X1: jogo do dia e desafios
    };
  });
  // Ordem do slider (regra do dono): disponíveis primeiro (o que já começou na frente), depois
  // os já jogados pelo que volta antes, depois os bloqueados por nível, por fim os "em breve".
  const rank = (g) => (g.available ? (g.started ? 0 : 1) : g.unlocked && !g.soon ? 2 : !g.unlocked && !g.soon ? 3 : 4);
  games.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? (a.nextAt ?? 0) - (b.nextAt ?? 0) : a.unlockLevel - b.unlockLevel));
  return { level: lvl, games };
}

// ─── Memória dos Escudos ───────────────────────────────────────────────────
// Estado em DailyGame.state: { deck: [teamId × 16], matched: [índices], open: índice|null, moves }.
// O baralho é determinístico por jogador/dia (não precisa ler antes de inserir). A carta só
// é revelada na resposta da virada: o cliente nunca recebe o baralho inteiro antes do fim.

let teamsCache = { at: 0, list: [] };
async function allTeams() {
  if (Date.now() - teamsCache.at > 5 * 60_000) teamsCache = { at: Date.now(), list: await prisma.team.findMany({ orderBy: { id: 'asc' } }) };
  return teamsCache.list;
}

/** PRNG pequeno e estável (mulberry32) semeado por sha256 da chave. */
function rng(seed) {
  let a = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deckFor(userId, day, teams) {
  const r = rng(`memoria:${userId}:${day}`);
  const ids = teams.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const chosen = ids.slice(0, MEMORIA.pairs);
  const deck = [...chosen, ...chosen];
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
const memoriaPoints = (moves) => MEMORIA.levelPoints.find(([max]) => moves <= max)[1];

function memoriaView(userId, day, row, teams, now = new Date()) {
  const st = row?.state ?? {};
  const deck = st.deck ?? deckFor(userId, day, teams);
  const matched = new Set(st.matched ?? []);
  const finished = !!row?.finishedAt;
  const byId = new Map(teams.map((t) => [t.id, teamView(t)]));
  const cards = deck.map((teamId, i) => ({ i, team: finished || matched.has(i) || st.open === i ? byId.get(teamId) ?? null : null, matched: matched.has(i) }));
  return {
    day, pairs: MEMORIA.pairs, goalAtMoves: MEMORIA.goalAtMoves,
    levelPoints: MEMORIA.levelPoints.map(([max, pts]) => [max === Infinity ? null : max, pts]),
    cards, open: st.open ?? null, moves: st.moves ?? 0, matchedPairs: matched.size / 2,
    finished, won: !!row?.won, reward: row?.reward ?? null, nextAt: nextResetAt(RESET_HOUR.MEMORIA, now).getTime(),
  };
}

function memoriaUnlock(user) {
  const g = MINIGAMES.find((x) => x.id === 'MEMORIA');
  if (levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `Memória dos Escudos libera no nível ${g.unlock}.`);
}

export async function memoriaState(userId, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  memoriaUnlock(user);
  const day = dayNumberAt(RESET_HOUR.MEMORIA, now);
  const [row, teams] = await Promise.all([
    prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'MEMORIA', day } } }),
    allTeams(),
  ]);
  return memoriaView(userId, day, row, teams, now);
}

/**
 * Vira uma carta. 1ª carta da jogada fica "aberta"; a 2ª fecha a jogada: par = fica virada,
 * erro = as duas voltam (o cliente mostra as duas por um instante). Toque repetido na carta
 * aberta não conta. Fechou os 8 pares: ≤ goalAtMoves jogadas = 1 gol; pontos pela tabela.
 */
export async function memoriaFlip(userId, rawIndex, clientDay) {
  const now = new Date();
  const day = dayNumberAt(RESET_HOUR.MEMORIA, now);
  if (clientDay !== undefined && Number(clientDay) !== day) throw new GameError(409, 'day-changed', 'Virou o dia: já tem baralho novo. Recarregue a Memória.');
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= MEMORIA.pairs * 2) throw badRequest('Carta inválida.');
  const teams = await allTeams();

  return prisma.$transaction(async (tx) => {
    const user = await loadUser(tx, userId);
    memoriaUnlock(user);
    const initial = JSON.stringify({ deck: deckFor(userId, day, teams), matched: [], open: null, moves: 0 });
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'MEMORIA', ${day}, ${initial}::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'MEMORIA' AND day = ${day} FOR UPDATE`;
    if (row.finishedAt) throw new GameError(409, 'finished', `Você já jogou a Memória. Ela renova ${resetLabel('MEMORIA')}!`);
    const st = { deck: row.state.deck, matched: [...(row.state.matched ?? [])], open: row.state.open ?? null, moves: row.state.moves ?? 0 };
    if (st.matched.includes(index)) throw badRequest('Essa carta já formou par.');
    const byId = new Map(teams.map((t) => [t.id, teamView(t)]));
    const card = (i) => ({ i, team: byId.get(st.deck[i]) ?? null });

    // 1ª carta da jogada (ou toque repetido nela)
    if (st.open === null || st.open === index) {
      st.open = index;
      const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: st } });
      return { state: memoriaView(userId, day, saved, teams, now), revealed: [card(index)], match: null, reward: null };
    }

    // 2ª carta: fecha a jogada
    const first = st.open;
    st.open = null; st.moves += 1;
    const match = st.deck[first] === st.deck[index];
    if (match) st.matched.push(first, index);
    const finished = st.matched.length === MEMORIA.pairs * 2;
    let reward = null;
    if (finished) {
      const goal = st.moves <= MEMORIA.goalAtMoves;
      const levelPoints = memoriaPoints(st.moves);
      let text = null;
      if (goal) {
        const liveMatch = await liveMatchForTeam(user.teamId, tx);
        ({ text } = await applyResult(tx, user, { kind: 'MEMORIA', goal: true, now, match: liveMatch, money: 0, phrase: `fechou a Memória dos Escudos em ${st.moves} jogadas` }));
      }
      await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: levelPoints } } });
      reward = { goal, levelPoints, moves: st.moves, text };
    }
    const saved = await tx.dailyGame.update({
      where: { id: row.id },
      data: { state: st, won: finished, reward: reward ?? undefined, finishedAt: finished ? now : null },
    });
    return { state: memoriaView(userId, day, saved, teams, now), revealed: [card(first), card(index)], match, reward };
  });
}

// ─── De que time é? ────────────────────────────────────────────────────────
// Mesma mecânica do Quiz (relógio no servidor, pergunta só quando pedida). Dois formatos
// alternados: `crest` (pista → 4 escudos) e `name` (escudo → 4 pistas do mesmo tipo).
// Perguntas do dia iguais para todos (lib/qualtime/bank.js); a ordem das opções é
// embaralhada por jogador. O tempo cai a cada acerto seguido (QUALTIME.streakStep) até
// QUALTIME.minSeconds. O tipo da pista só vai ao cliente depois da resposta.
// Estado: { answers: [{ choice, correct }], servedAt }.

/** Só o que o escudo precisa — sem estádio/estado/série, que entregariam a resposta pelo devtools. */
function qualtimeTeam(t) {
  return t ? { id: t.id, slug: t.slug, name: t.name, abbr: t.abbr, colorPrimary: t.colorPrimary, colorSecondary: t.colorSecondary } : null;
}

/** Opções na ordem do jogador: { team, text } (crest: só team; name: só text). p[k] = índice em q.options (0 = resposta). */
function qualtimeOptions(userId, day, q, teamsBySlug) {
  const p = permFor(userId, day, q.key);
  const options = p.map((k) => {
    const o = q.options[k];
    return q.mode === 'crest' ? { team: qualtimeTeam(teamsBySlug.get(o)), text: null } : { team: null, text: o.text };
  });
  return { options, correctChoice: p.indexOf(0) };
}

/** Acertos seguidos no fim da lista — quanto mais, menos tempo na próxima pista. */
function qualtimeStreak(answers) {
  let n = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i].correct; i--) n++;
  return n;
}
function qualtimeSeconds(answers) {
  return Math.max(QUALTIME.minSeconds, QUALTIME.seconds - QUALTIME.streakStep * qualtimeStreak(answers));
}

function qualtimeView(userId, day, row, teams, now = new Date()) {
  const st = row?.state ?? {};
  const qs = qualtimeQuestions(day, QUALTIME.questions);
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  const answers = st.answers ?? [];
  const finished = !!row?.finishedAt;
  const results = answers.map((ans, k) => {
    const q = qs[k]; const { options, correctChoice } = qualtimeOptions(userId, day, q, bySlug);
    return { mode: q.mode, type: q.type, text: q.text, team: q.mode === 'name' ? qualtimeTeam(bySlug.get(q.answer)) : null, options, choice: ans.choice, correctChoice, correct: ans.correct };
  });
  let current = null;
  if (!finished && st.servedAt && answers.length < qs.length) {
    const q = qs[answers.length];
    const seconds = qualtimeSeconds(answers);
    current = {
      index: answers.length, mode: q.mode, text: q.text, team: q.mode === 'name' ? qualtimeTeam(bySlug.get(q.answer)) : null,
      options: qualtimeOptions(userId, day, q, bySlug).options, seconds, deadline: st.servedAt + seconds * 1000,
    };
  }
  return {
    day, total: qs.length, index: answers.length, results, current, finished,
    hits: answers.filter((a) => a.correct).length, streak: qualtimeStreak(answers), reward: row?.reward ?? null,
    seconds: QUALTIME.seconds, minSeconds: QUALTIME.minSeconds, streakStep: QUALTIME.streakStep,
    pointsPerHit: QUALTIME.pointsPerHit, goalAt: QUALTIME.goalAt,
    nextAt: nextResetAt(RESET_HOUR.QUALTIME, now).getTime(), serverTime: now.getTime(),
  };
}

function qualtimeUnlock(user) {
  const g = MINIGAMES.find((x) => x.id === 'QUALTIME');
  if (levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `"De que time é?" libera no nível ${g.unlock}.`);
}

/** Tranca a partida do dia (cria se não existe); pergunta que estourou o tempo vira erro. */
async function withQualtime(userId, clientDay, fn) {
  const now = new Date();
  const day = dayNumberAt(RESET_HOUR.QUALTIME, now);
  if (clientDay !== undefined && clientDay !== null && Number(clientDay) !== day) {
    throw new GameError(409, 'day-changed', 'Virou o dia: já tem perguntas novas. Recarregue.');
  }
  const teams = await allTeams();
  return prisma.$transaction(async (tx) => {
    const user = await loadUser(tx, userId);
    qualtimeUnlock(user);
    const fresh = JSON.stringify({ answers: [], servedAt: null });
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'QUALTIME', ${day}, ${fresh}::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'QUALTIME' AND day = ${day} FOR UPDATE`;
    const st = { answers: [...(row.state.answers ?? [])], servedAt: row.state.servedAt ?? null };
    const total = qualtimeQuestions(day, QUALTIME.questions).length;
    const expired = !row.finishedAt && st.servedAt && now.getTime() - st.servedAt > qualtimeSeconds(st.answers) * 1000 + QUALTIME.toleranceMs;
    const extra = await fn({ st, row, day, now, expired, user, teams });
    if (expired && !extra?.handledTimeout) { st.answers.push({ choice: -1, correct: false }); st.servedAt = null; }
    let reward = row.reward ?? null;
    let finishedAt = row.finishedAt;
    if (!finishedAt && st.answers.length >= total) {
      const hits = st.answers.filter((a) => a.correct).length;
      const levelPoints = hits * QUALTIME.pointsPerHit;
      reward = { goal: false, levelPoints, hits, total, text: null };
      if (hits >= QUALTIME.goalAt) {
        const match = await liveMatchForTeam(user.teamId, tx);
        const { text } = await applyResult(tx, user, { kind: 'QUALTIME', goal: true, now, match, money: 0, phrase: `acertou ${hits} de ${total} no "De que time é?"` });
        Object.assign(reward, { goal: true, text });
      }
      if (levelPoints) await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: levelPoints } } });
      finishedAt = now;
    }
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: st, won: !!reward?.goal, reward: reward ?? undefined, finishedAt } });
    const { handledTimeout, ...out } = extra ?? {};
    return { ...out, state: qualtimeView(userId, day, saved, teams, now) };
  });
}

export function qualtimeState(userId) { return withQualtime(userId, undefined, async () => ({})); }

/** Mostra a próxima pergunta e começa o relógio (idempotente enquanto ela estiver no ar). */
export function qualtimeNext(userId, clientDay) {
  return withQualtime(userId, clientDay, async ({ st, row, expired, now }) => {
    if (row.finishedAt || expired) return {};
    if (!st.servedAt && st.answers.length < QUALTIME.questions) st.servedAt = now.getTime();
    return {};
  });
}

/** Responde a pergunta da vez. choice = posição da opção (0..3); -1 = acabou o tempo. */
export function qualtimeAnswer(userId, index, choice, clientDay) {
  return withQualtime(userId, clientDay, async ({ st, row, day, expired, teams }) => {
    if (row.finishedAt) throw new GameError(409, 'finished', `Você já jogou o "De que time é?". Ele renova ${resetLabel('QUALTIME')}!`);
    if (!Number.isInteger(index) || index !== st.answers.length) throw new GameError(409, 'out-of-sync', 'Essa pergunta já passou.');
    if (!st.servedAt) throw new GameError(409, 'not-served', 'Peça a pergunta antes de responder.');
    const q = qualtimeQuestions(day, QUALTIME.questions)[index];
    const { correctChoice } = qualtimeOptions(userId, day, q, new Map(teams.map((t) => [t.slug, t])));
    const c = expired ? -1 : Number.isInteger(choice) && choice >= 0 && choice <= 3 ? choice : -1;
    const correct = c >= 0 && c === correctChoice;
    st.answers.push({ choice: c, correct });
    st.servedAt = null;
    return { correct, timeout: c === -1, correctChoice, type: q.type, handledTimeout: true };
  });
}

// ─── Alvo no Gol ───────────────────────────────────────────────────────────
// Batalha naval no gol: grade cols x rows com goleiro, zagueiros e cones escondidos (posições
// sorteadas por jogador/dia em lib/alvo.js e guardadas no estado na 1ª chamada). Cada chute é
// um POST: o servidor responde vazio / acertou / derrubou. A posição das peças nunca vai ao
// cliente antes do fim (só as casas de peça já derrubada). Estado: { pieces, shots: [index] }.

/** O que a tela vê. As casas de uma peça só aparecem quando ela caiu (ou no fim, para revelar). */
function alvoView(day, row, now = new Date()) {
  const st = row?.state ?? {};
  const pieces = st.pieces ?? [];
  const shots = st.shots ?? [];
  const finished = !!row?.finishedAt;
  const sum = summarize(pieces, shots);
  const pieceAt = (index) => pieces.findIndex((p) => p.cells.includes(index));
  return {
    day, cols: ALVO.cols, rows: ALVO.rows, maxShots: ALVO.shots, shotsLeft: sum.shotsLeft,
    shots: shots.map((index) => { const pi = pieceAt(index); return { index, hit: pi >= 0, piece: pi >= 0 && (sum.sunk[pi] || finished) ? pi : null }; }),
    pieces: pieces.map((p, k) => ({ id: k, kind: p.kind, name: p.name, size: p.size, sunk: sum.sunk[k], cells: sum.sunk[k] || finished ? p.cells : null })),
    hits: sum.hits, occupied: sum.occupied, sunkCount: sum.sunkCount, finished,
    reward: row?.reward ?? null,
    pointsPerHit: ALVO.pointsPerHit, sinkAllPoints: ALVO.sinkAllPoints, goalAt: ALVO.goalAt,
    nextAt: nextResetAt(RESET_HOUR.ALVO, now).getTime(), serverTime: now.getTime(),
  };
}

function alvoUnlock(user) {
  const g = MINIGAMES.find((x) => x.id === 'ALVO');
  if (levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `Alvo no Gol libera no nível ${g.unlock}.`);
}

/** Tranca a partida do dia (cria com o tabuleiro sorteado se não existe) e fecha quando acaba. */
async function withAlvo(userId, clientDay, fn) {
  const now = new Date();
  const day = dayNumberAt(RESET_HOUR.ALVO, now);
  if (clientDay !== undefined && clientDay !== null && Number(clientDay) !== day) {
    throw new GameError(409, 'day-changed', 'Virou o dia: o gol foi remontado. Recarregue.');
  }
  return prisma.$transaction(async (tx) => {
    const user = await loadUser(tx, userId);
    alvoUnlock(user);
    const fresh = JSON.stringify({ pieces: layoutFor(userId, day), shots: [] });
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'ALVO', ${day}, ${fresh}::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'ALVO' AND day = ${day} FOR UPDATE`;
    const st = { pieces: row.state.pieces ?? layoutFor(userId, day), shots: [...(row.state.shots ?? [])] };
    const extra = await fn({ st, row, day, now, user });
    if (!extra) return { state: alvoView(day, row, now) }; // só leitura: nada a salvar
    let reward = row.reward ?? null;
    let finishedAt = row.finishedAt;
    const sum = summarize(st.pieces, st.shots);
    if (!finishedAt && sum.finished) {
      const { goal, levelPoints } = rewardFor(sum.hits, sum.allSunk);
      reward = { goal: false, levelPoints, hits: sum.hits, occupied: sum.occupied, sunkCount: sum.sunkCount, allSunk: sum.allSunk, text: null };
      if (goal) {
        const match = await liveMatchForTeam(user.teamId, tx);
        const phrase = sum.allSunk ? 'derrubou goleiro, zagueiros e cones no Alvo no Gol' : `acertou ${sum.hits} de ${sum.occupied} casas no Alvo no Gol`;
        const { text } = await applyResult(tx, user, { kind: 'ALVO', goal: true, now, match, money: 0, phrase });
        Object.assign(reward, { goal: true, text });
      }
      if (levelPoints) await tx.user.update({ where: { id: userId }, data: { levelBonus: { increment: levelPoints } } });
      finishedAt = now;
    }
    const saved = await tx.dailyGame.update({ where: { id: row.id }, data: { state: st, won: !!reward?.goal, reward: reward ?? undefined, finishedAt } });
    return { ...extra, state: alvoView(day, saved, now) };
  });
}

export function alvoState(userId) { return withAlvo(userId, undefined, async () => null); }

/** Chuta numa casa da grade. Resposta: { hit, sunk (peça que caiu, com as casas) | null, state }. */
export function alvoShot(userId, index, clientDay) {
  return withAlvo(userId, clientDay, async ({ st, row }) => {
    if (row.finishedAt) throw new GameError(409, 'finished', `Você já jogou o Alvo no Gol. Ele renova ${resetLabel('ALVO')}!`);
    let res;
    try { res = applyShot(st.pieces, st.shots, index); } catch (e) {
      if (e.code === 'repeated') throw new GameError(409, 'repeated', e.message);
      throw badRequest(e.message);
    }
    st.shots.push(index);
    const piece = res.sunk ? st.pieces[res.piece] : null;
    return { hit: res.hit, sunk: piece ? { id: res.piece, kind: piece.kind, name: piece.name, size: piece.size, cells: piece.cells } : null };
  });
}
