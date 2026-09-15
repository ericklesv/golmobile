/**
 * X1 — jogos 1x1 ao vivo, um por dia (dono, 15/09/2026: "jogos X1 rotativos, cada dia 1 jogo para não
 * ficar enjoativo"): FutPrego e Futebol de Botão se alternando (x1GameOf em lib/rules.js). WebSocket em
 * `/api/ws/x1?token=<jwt>&mode=lobby|game` (o endereço antigo /api/ws/futprego continua valendo).
 *
 * - mode=lobby: aberto pelas telas com as abas (Layout). Só recebe o convite pequeno ("Fulano está te
 *   desafiando no X1") por FUTPREGO.inviteSec. Dentro de minigame/chute a Layout não está montada, então o
 *   convite nunca aparece lá.
 * - mode=game: a tela do X1. Desafia no jogo do dia (se já houver um desafio compatível aberto, vira partida
 *   na hora), aceita, joga, desiste.
 * Pareamento: jogadores, times e IPs diferentes, sem bloqueio entre eles. Cada um paga FUTPREGO.bet ao
 * começar (a partida é gravada PLAYING); o servidor calcula cada peteleco (lib/futprego.js ou lib/botao.js)
 * e manda os quadros para as duas telas. Gol, dinheiro e travas: settle() — iguais nos dois jogos. Uma
 * instância PM2 só — o estado fica em memória; se a API reiniciar no meio, refundStale() devolve a aposta.
 */
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { randomInt } from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { BOARDS, simulateFlick, scorerOf, targetOf } from '../lib/futprego.js';
import { BOTAO_FIELD } from '../lib/botao.js';
import { newBotaoMatch, botaoView, applySnap, skipSnap, botaoBotMove } from '../lib/botaoMatch.js';
import { FUTPREGO, BOTAO, X1, x1GameOf, MINIGAMES, levelOf, isVip } from '../lib/rules.js';
import { applyResult, loadUser } from '../services/play.js';
import { liveMatchForTeam, currentRound } from '../services/league.js';
import { teamView } from '../services/view.js';
import { X1_COUNTED } from '../services/x1.js';
import { dayNumberAt, nextResetAt, nextHourStart } from '../lib/time.js';
import { h2hOf, rivalryLine } from '../lib/rivalidade.js';

const F = FUTPREGO; // regras de convite, aposta, gol e travas (valem para todo o X1)
const BOT_NAMES = ['Zagalinho', 'Pé de Pano', 'Perna Longa', 'Canhotinha', 'Bicudo', 'Matador', 'Camisa 10', 'Prego Torto'];
const INVITE_GAP_MS = 20_000; // uma tela não recebe mais de um convite novo a cada 20 s
const MAX_TIMEOUTS = 3;       // perdeu a vez 3 vezes seguidas = W.O.
const conns = new Set();       // { ws, user, ip, mode, match, side, challenge, seen, ... }
const challenges = new Map();  // id -> { id, game, from, at, shownTo, botTimer, expireTimer }
const matches = new Map();     // id -> partida
const lastOver = new Map();    // userId -> { at, msg } (quem caiu vê o resultado ao voltar)
let nextId = 1;

function send(ws, msg) { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); }
const err = (conn, code, message) => send(conn.ws, { t: 'error', code, message });
const rnd01 = () => randomInt(1_000_000) / 1_000_000;

/** O jogo do X1 agora, o próximo e quando troca (às X1.switchHour = 20h de Brasília). */
// SÓ NO PC (X1_JOGO=BOTAO ou FUTPREGO no api/.env; ignorado em produção): força o jogo do dia para testar.
const forcedGame = () => (process.env.NODE_ENV !== 'production' && X1.games.includes(process.env.X1_JOGO) ? process.env.X1_JOGO : null);

export function x1Today(now = new Date()) {
  const day = dayNumberAt(X1.switchHour, now);
  const game = forcedGame() ?? x1GameOf(day);
  const next = forcedGame() ? X1.games.find((g) => g !== game) : x1GameOf(day + 1); // forçado: o "próximo" mostra o outro
  return { game, name: X1.names[game], next, nextName: X1.names[next], switchAt: nextResetAt(X1.switchHour, now).getTime(), switchHour: X1.switchHour };
}

/** Início da hora cheia de Brasília em que `now` está (a trava de gols do X1 conta por hora, como a artilharia da hora). */
const hourStart = (now) => new Date(nextHourStart(now).getTime() - 3600_000);

/**
 * Retrospecto entre dois jogadores (pedido do dono, 15/09/2026): partidas de verdade que terminaram entre
 * eles no X1 (os dois jogos juntos) — W.O. cedo (aposta devolvida) e canceladas não contam —, a mais recente
 * primeiro. Vai na mensagem `match` (sendMatch) e, já com a partida que acabou, na `over` com a frase de
 * provocação (rivalry()) — sempre na perspectiva de quem recebe (h2hOf em lib/rivalidade.js).
 */
async function headToHead(aId, bId) {
  return prisma.x1Match.findMany({
    where: { ...X1_COUNTED, OR: [{ aId, bId }, { aId: bId, bId: aId }] },
    orderBy: { id: 'desc' }, select: { id: true, winnerId: true, finishedAt: true },
  });
}

export function x1Status() {
  return { open: challenges.size, playing: [...matches.values()].reduce((n, m) => n + (m.bot ? 1 : 2), 0), today: x1Today() };
}

// (Campanha do perfil e Ranking X1 — pontos 3·1·−2, prêmios por rodada/temporada: services/x1.js.)

/** IP de verdade: o nginx da VPS grava o X-Real-IP (o 1º valor do X-Forwarded-For o próprio jogador forja). */
function clientIp(req) {
  const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '?').trim();
  return ip.replace(/^::ffff:/, '');
}

async function authenticate(req) {
  const url = new URL(req.url, 'http://x');
  const payload = jwt.verify(url.searchParams.get('token') || '', config.jwtSecret);
  const user = await prisma.user.findUnique({ where: { id: payload.uid }, include: { team: true } });
  if (!user || user.deletedAt || (user.bannedUntil && user.bannedUntil.getTime() > Date.now())) throw new Error('unauthorized');
  return { user, mode: url.searchParams.get('mode') === 'game' ? 'game' : 'lobby' };
}

const playerView = (c) => ({ id: c.user.id, nick: c.user.nick, avatarUrl: c.user.avatarUrl ?? null, team: teamView(c.user.team), bot: !!c.bot });
const rulesView = () => ({
  bet: F.bet, turnSec: F.turnSec, maxTurns: F.maxTurns, inviteSec: F.inviteSec, botAfterSec: F.botAfterSec, maxGoalsPerHour: F.maxGoalsPerHour, challengeCooldownSec: F.challengeCooldownSec,
  botao: { snapsPerTurn: BOTAO.snapsPerTurn, firstTurnSnaps: BOTAO.firstTurnSnaps, snapSec: BOTAO.snapSec, goalsToWin: BOTAO.goalsToWin, maxTurns: BOTAO.maxTurns, penalties: BOTAO.penalties },
});
/** Jogador ocupado: numa partida ou com desafio aberto (em qualquer conexão). */
const busyUser = (userId) => [...conns].some((c) => c.user.id === userId && (c.match || c.challenge));

/**
 * Até quando (ms) quem NÃO é VIP espera para DESAFIAR de novo: challengeCooldownSec depois de terminar a
 * última partida de verdade (qualquer resultado; treino com bot não conta). null = pode desafiar agora.
 * Aceitar desafio nunca espera. Vem do banco: vale também depois de a API reiniciar.
 */
async function challengeCooldownUntil(user) {
  if (isVip(user)) return null;
  const last = await prisma.x1Match.findFirst({
    where: { status: 'FINISHED', finishedAt: { not: null }, OR: [{ aId: user.id }, { bId: user.id }] },
    orderBy: { finishedAt: 'desc' }, select: { finishedAt: true },
  });
  const until = last ? last.finishedAt.getTime() + F.challengeCooldownSec * 1000 : 0;
  return until > Date.now() ? until : null;
}
const cooldownText = (until) => {
  const s = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  return `Você pode desafiar de novo em ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}. Aceitar desafio pode na hora. Vire VIP e jogue o X1 ilimitado!`;
};

export function attachX1(server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', async (req, socket, head) => {
    if (!req.url.startsWith('/api/ws/x1') && !req.url.startsWith('/api/ws/futprego')) return; // o Cabeção cuida do dele
    let auth;
    try { auth = await authenticate(req); } catch { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, auth));
  });
  wss.on('connection', (ws, req, { user, mode }) => {
    const conn = { ws, user, ip: clientIp(req), mode, alive: true, match: null, side: -1, challenge: null, seen: new Set(), lastInviteAt: 0 };
    if (mode === 'game') {
      // uma tela de jogo por jogador: a antiga cai, e uma partida em andamento passa para a nova
      for (const c of [...conns]) if (c.mode === 'game' && c.user.id === user.id) { c.replaced = true; send(c.ws, { t: 'kicked' }); c.ws.close(); takeOver(c, conn); }
      for (const m of matches.values()) for (const c of m.conns) if (!c.bot && c.user.id === user.id && c !== conn && c.dropped) takeOver(c, conn);
    }
    conns.add(conn);
    send(ws, { t: 'hello', me: user.id, rules: rulesView(), today: x1Today() });
    if (mode === 'lobby') offerOpen(conn).catch(() => {});
    else if (conn.match) sendMatch(conn, true);
    else {
      const lo = lastOver.get(user.id);
      if (lo && Date.now() - lo.at < 10 * 60_000) { send(ws, { ...lo.msg, late: true }); lastOver.delete(user.id); }
      sendOpenList(conn).catch(() => {});
    }
    // quem não é VIP: até quando espera para desafiar de novo (a tela mostra o relógio)
    if (mode === 'game') challengeCooldownUntil(user).then((until) => send(ws, { t: 'cooldown', until, vip: isVip(user) })).catch(() => {});
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; } onMessage(conn, m).catch((e) => console.error('[x1]', e)); });
    ws.on('close', () => {
      conns.delete(conn);
      if (conn.challenge && !conn.replaced) cancelChallenge(conn.challenge, 'saiu');
      if (conn.match && !conn.replaced) onDisconnect(conn);
    });
    ws.on('pong', () => { conn.alive = true; });
  });
  setInterval(() => { // keepalive (o nginx fecha conexão parada)
    for (const c of conns) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch {} }
  }, 25_000).unref();
  refundStale().catch((e) => console.error('[x1] devolução das partidas abertas', e));
  return wss;
}

async function onMessage(conn, m) {
  if (m.t === 'ping') return send(conn.ws, { t: 'pong', at: m.at, now: Date.now() });
  if (conn.mode !== 'game') return;
  if (m.t === 'challenge') return createChallenge(conn);
  if (m.t === 'cancel') { if (conn.challenge) cancelChallenge(conn.challenge, 'cancelou'); return send(conn.ws, { t: 'canceled' }); }
  if (m.t === 'accept') return acceptChallenge(conn, Number(m.id));
  if (m.t === 'bot') return startBot(conn);
  if (m.t === 'flick') return onFlick(conn, m);
  if (m.t === 'snap') return onSnap(conn, m);
  // desistir = derrota (se o resultado já está decidido e só falta a animação, vale ele — não a desistência)
  if (m.t === 'giveup' && conn.match && !conn.match.done) return finish(conn.match, conn.match.pending ?? { winner: 1 - conn.side, reason: 'desistiu' });
}

// ─── Desafios e convites ────────────────────────────────────────────────────

// SÓ NO PC (FUTPREGO_MESMO_IP=1 no api/.env; ignorado em produção): deixa jogar com duas janelas na mesma
// internet para testar. NUNCA na VPS.
const sameIpOk = () => process.env.NODE_ENV !== 'production' && process.env.FUTPREGO_MESMO_IP === '1';

/** Os dois podem se enfrentar? (jogadores, times e IPs diferentes, sem bloqueio) */
async function compatible(a, b) {
  if (a.user.id === b.user.id || a.user.teamId === b.user.teamId || (a.ip === b.ip && !sameIpOk())) return false;
  const block = await prisma.userBlock.findFirst({ where: { OR: [{ userId: a.user.id, blockedId: b.user.id }, { userId: b.user.id, blockedId: a.user.id }] }, select: { id: true } });
  return !block;
}

async function canPlay(conn) {
  const u = await prisma.user.findUnique({ where: { id: conn.user.id }, include: { team: true } });
  if (!u || u.deletedAt) return 'Conta indisponível.';
  conn.user = u; // time, dinheiro e foto atualizados
  const g = MINIGAMES.find((x) => x.id === 'X1');
  if (g && levelOf(u).lvl < g.unlock) return `O X1 libera no nível ${g.unlock}.`;
  if (u.money < F.bet) return `Você precisa de R$ ${F.bet} para jogar.`;
  return null;
}

const challengeView = (ch) => ({ id: ch.id, game: ch.game, gameName: X1.names[ch.game], from: playerView(ch.from), at: ch.at });

async function createChallenge(conn) {
  if (conn.match || conn.challenge) return;
  if (busyUser(conn.user.id)) return err(conn, 'busy', 'Você já está numa partida ou desafiando em outra tela.');
  const problem = await canPlay(conn);
  if (problem) return err(conn, 'no-money', problem);
  // não é VIP e terminou uma partida há menos de 2 min: não desafia (aceitar pode)
  const until = await challengeCooldownUntil(conn.user);
  if (until) return send(conn.ws, { t: 'error', code: 'cooldown', until, message: cooldownText(until) });
  if (conn.match || conn.challenge || conn.ws.readyState !== conn.ws.OPEN) return;
  const game = x1Today().game;
  // alguém já está desafiando no jogo de hoje e dá para jogar com ele: vira partida na hora
  for (const ch of [...challenges.values()].sort((a, b) => a.at - b.at)) {
    if (ch.game === game && (await compatible(ch.from, conn))) return acceptChallenge(conn, ch.id);
  }
  const ch = { id: nextId++, game, from: conn, at: Date.now(), shownTo: new Set() };
  ch.botTimer = setTimeout(() => send(conn.ws, { t: 'bot-offer' }), F.botAfterSec * 1000);
  ch.expireTimer = setTimeout(() => { if (challenges.has(ch.id)) { send(conn.ws, { t: 'expired', message: 'Ninguém aceitou o desafio. Tente de novo mais tarde.' }); cancelChallenge(ch, 'expirou'); } }, F.challengeMaxSec * 1000);
  challenges.set(ch.id, ch);
  conn.challenge = ch;
  send(conn.ws, { t: 'waiting', id: ch.id, game, gameName: X1.names[game], at: ch.at, botAt: ch.at + F.botAfterSec * 1000, until: ch.at + F.challengeMaxSec * 1000 });
  await broadcastInvite(ch);
  await refreshOpenLists();
}

function cancelChallenge(ch, _why) {
  if (!challenges.has(ch.id)) return;
  challenges.delete(ch.id);
  clearTimeout(ch.botTimer); clearTimeout(ch.expireTimer);
  if (ch.from.challenge === ch) ch.from.challenge = null;
  for (const c of ch.shownTo) send(c.ws, { t: 'invite-close', id: ch.id });
  refreshOpenLists().catch(() => {});
}

/** Quem pode receber o convite agora: nas telas com abas, livre, com dinheiro e compatível. */
async function inviteTargets(ch, only = null) {
  const cands = [...(only ? [only] : conns)].filter((c) => c.mode === 'lobby' && !c.seen.has(ch.id) && c.user.id !== ch.from.user.id && !busyUser(c.user.id));
  if (!cands.length) return [];
  const ids = [...new Set(cands.map((c) => c.user.id))];
  const rich = new Set((await prisma.user.findMany({ where: { id: { in: ids }, money: { gte: F.bet }, deletedAt: null }, select: { id: true } })).map((r) => r.id));
  const out = [];
  for (const c of cands) if (rich.has(c.user.id) && (await compatible(ch.from, c))) out.push(c);
  return out;
}

async function broadcastInvite(ch, only = null) {
  const targets = await inviteTargets(ch, only);
  const now = Date.now();
  for (const c of targets) {
    if (!challenges.has(ch.id)) return;
    if (now - c.lastInviteAt < INVITE_GAP_MS) continue;
    c.seen.add(ch.id); c.lastInviteAt = now;
    ch.shownTo.add(c);
    send(c.ws, { t: 'invite', id: ch.id, game: ch.game, gameName: X1.names[ch.game], from: playerView(ch.from), bet: F.bet, seconds: F.inviteSec });
  }
}

/** Tela com abas abriu agora: mostra o desafio aberto mais recente (se couber). */
async function offerOpen(conn) {
  const open = [...challenges.values()].sort((a, b) => b.at - a.at)[0];
  if (open) await broadcastInvite(open, conn);
}

/** Na tela do X1 (sem partida nem desafio): a lista de desafios abertos que dá para aceitar. */
async function sendOpenList(conn) {
  const list = [];
  for (const ch of challenges.values()) if (ch.from !== conn && (await compatible(ch.from, conn))) list.push(challengeView(ch));
  send(conn.ws, { t: 'open', list });
}
async function refreshOpenLists() {
  for (const c of conns) if (c.mode === 'game' && !c.match && !c.challenge) await sendOpenList(c);
}

async function acceptChallenge(conn, id) {
  const ch = challenges.get(id);
  if (!ch) return send(conn.ws, { t: 'taken', message: 'Esse desafio já começou ou foi cancelado.' });
  if (conn.match || ch.from === conn) return;
  if (conn.challenge) cancelChallenge(conn.challenge, 'aceitou-outro');
  const problem = await canPlay(conn);
  if (problem) return err(conn, 'no-money', problem);
  if (!challenges.has(id) || conn.match) return send(conn.ws, { t: 'taken', message: 'Esse desafio já começou ou foi cancelado.' });
  if (!(await compatible(ch.from, conn))) return err(conn, 'incompatible', 'Vocês não podem se enfrentar (mesmo time ou mesma internet).');
  if (!challenges.has(id) || conn.match) return send(conn.ws, { t: 'taken', message: 'Esse desafio já começou ou foi cancelado.' });
  const a = ch.from, b = conn, game = ch.game;
  cancelChallenge(ch, 'aceito'); // sai da lista e fecha os convites (antes de qualquer espera: ninguém mais pega)
  const round = await currentRound().catch(() => null);
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const pa = await tx.user.updateMany({ where: { id: a.user.id, money: { gte: F.bet } }, data: { money: { decrement: F.bet } } });
      if (!pa.count) throw Object.assign(new Error('a'), { who: 'a' });
      const pb = await tx.user.updateMany({ where: { id: b.user.id, money: { gte: F.bet } }, data: { money: { decrement: F.bet } } });
      if (!pb.count) throw Object.assign(new Error('b'), { who: 'b' });
      return tx.x1Match.create({ data: { game, seasonId: round?.seasonId ?? null, aId: a.user.id, bId: b.user.id, aTeamId: a.user.teamId, bTeamId: b.user.teamId, aIp: a.ip, bIp: b.ip, bet: F.bet } });
    });
  } catch (e) {
    if (e.who === 'a') { err(a, 'no-money', `Você precisa de R$ ${F.bet} para jogar.`); return send(b.ws, { t: 'taken', message: `${a.user.nick} ficou sem dinheiro para jogar.` }); }
    if (e.who === 'b') { err(b, 'no-money', `Você precisa de R$ ${F.bet} para jogar.`); return createChallenge(a); } // o desafio dele volta
    throw e;
  }
  const h2h = await headToHead(a.user.id, b.user.id).catch((e) => { console.error('[x1] retrospecto:', e.message); return null; });
  startMatch(a, b, row.id, game, h2h);
  for (const c of [a, b]) if (!conns.has(c)) onDisconnect(c);
}

// ─── Partida ────────────────────────────────────────────────────────────────

let teamsCache = { at: 0, list: [] };
async function randomTeamExcept(teamId) {
  if (Date.now() - teamsCache.at > 5 * 60_000) teamsCache = { at: Date.now(), list: await prisma.team.findMany() };
  const pool = teamsCache.list.filter((t) => t.id !== teamId);
  return pool[randomInt(pool.length)];
}

/** Ninguém aceitou e o jogador topou treinar: bot de time aleatório no jogo do dia (não vale gol nem dinheiro). */
async function startBot(conn) {
  if (conn.match) return;
  const game = conn.challenge?.game ?? x1Today().game;
  if (conn.challenge) cancelChallenge(conn.challenge, 'bot');
  const team = await randomTeamExcept(conn.user.teamId);
  const nick = `BOT ${BOT_NAMES[randomInt(BOT_NAMES.length)]}`;
  const bot = { ws: null, user: { id: -1, nick, avatarUrl: null, team, teamId: team.id }, ip: 'bot', bot: true, match: null, side: -1 };
  startMatch(conn, bot, null, game);
}

function startMatch(a, b, dbId, game, h2h = null) {
  const first = randomInt(2);
  const m = { id: nextId++, dbId, game, conns: [a, b], bot: !!b.bot, turn: first, turns: [0, 0], shots: [0, 0], timeouts: [0, 0], done: false, startedAt: Date.now(), busyUntil: 0, h2h };
  if (game === 'BOTAO') m.bs = newBotaoMatch(first);
  else { m.board = BOARDS[randomInt(BOARDS.length)]; m.ball = { ...m.board.center }; } // FutPrego: um desenho de tábua por partida (ninguém decora a jogada)
  a.match = m; a.side = 0; b.match = m; b.side = 1; // quem desafiou fica embaixo no campo do servidor
  matches.set(m.id, m);
  if (game === 'BOTAO') scheduleSnap(m, 1500, false); else scheduleTurn(m, 1500, false);
  for (const c of m.conns) sendMatch(c, false);
}

function sendMatch(c, resumed) {
  const m = c.match;
  const base = {
    t: 'match', id: m.id, game: m.game, gameName: X1.names[m.game], you: c.side, players: m.conns.map(playerView), turnEndsAt: m.turnEndsAt, bet: m.bot ? 0 : F.bet, training: m.bot, resumed,
    // retrospecto contra ESTE adversário no X1, do ponto de vista de quem recebe (null no treino contra bot)
    h2h: m.h2h ? h2hOf(m.h2h, c.user.id) : null,
  };
  if (m.game === 'BOTAO') send(c.ws, { ...base, field: BOTAO_FIELD, botao: botaoView(m.bs), turn: m.bs.turn, snapSec: BOTAO.snapSec });
  else send(c.ws, { ...base, board: m.board, ball: m.ball, turn: m.turn, turns: m.turns, maxTurns: F.maxTurns, turnSec: F.turnSec });
}

// ─── FutPrego: 1 peteleco na bola por vez ───────────────────────────────────

/** Passa a vez para m.turn depois de `delayMs` (a animação do peteleco anterior). */
function scheduleTurn(m, delayMs, announce = true) {
  clearTimeout(m.turnTimer); clearTimeout(m.botTimer);
  m.turnEndsAt = Date.now() + delayMs + F.turnSec * 1000;
  if (announce) for (const c of m.conns) send(c.ws, { t: 'turn', turn: m.turn, turnEndsAt: m.turnEndsAt, turns: m.turns });
  m.turnTimer = setTimeout(() => timeoutTurn(m), delayMs + F.turnSec * 1000 + 800); // 0,8 s de folga para a internet
  const cur = m.conns[m.turn];
  if (cur.bot) m.botTimer = setTimeout(() => botPlay(m), delayMs + 900 + randomInt(1400));
}

function onFlick(conn, msg) {
  const m = conn.match;
  if (!m || m.done || m.game !== 'FUTPREGO' || conn.side !== m.turn || Date.now() < m.busyUntil) return;
  const dx = Number(msg.dx), dy = Number(msg.dy), power = Number(msg.power);
  if (![dx, dy, power].every(Number.isFinite) || Math.hypot(dx, dy) < 1e-6) return;
  playShot(m, conn.side, dx, dy, Math.max(0.05, Math.min(1, power)));
}

function playShot(m, side, dx, dy, power) {
  clearTimeout(m.turnTimer); clearTimeout(m.botTimer);
  // 1ª jogada da partida (saída do meio): nunca é gol — os pregos quase nunca deixam, e a garantia segura o resto
  const r = simulateFlick(m.ball, dx, dy, power, m.board, { closedGoals: m.shots[0] + m.shots[1] === 0 });
  m.turns[side]++;
  m.shots[side]++;
  m.timeouts[side] = 0;
  m.ball = r.end;
  const scorer = scorerOf(r.goal);
  const animMs = Math.round((r.frames.length * 1000) / 30);
  m.busyUntil = Date.now() + animMs;
  for (const c of m.conns) send(c.ws, { t: 'shot', side, frames: r.frames, ball: r.end, goal: scorer, own: scorer !== null && scorer !== side, turns: m.turns });
  if (scorer !== null) {
    // gol decidido: fica pendente até a animação acabar — quem desistir ou cair nesse meio-tempo não escapa dele
    m.pending = { winner: scorer, reason: scorer === side ? 'gol' : 'gol-contra' };
    m.turnTimer = setTimeout(() => finish(m, m.pending), animMs + 900);
    return;
  }
  nextTurn(m, side, animMs + 400);
}

function nextTurn(m, side, delayMs) {
  if (m.turns[0] >= F.maxTurns && m.turns[1] >= F.maxTurns) { m.turnTimer = setTimeout(() => finish(m, { winner: null, reason: 'empate' }), delayMs + 500); return; }
  m.turn = 1 - side;
  if (m.turns[m.turn] >= F.maxTurns) m.turn = side; // o outro já usou todas: segue quem falta
  scheduleTurn(m, delayMs);
}

function timeoutTurn(m) {
  if (m.done) return;
  const side = m.turn;
  m.turns[side]++;
  m.timeouts[side]++;
  for (const c of m.conns) send(c.ws, { t: 'skip', side, turns: m.turns });
  if (m.timeouts[side] >= MAX_TIMEOUTS) return finish(m, { winner: 1 - side, reason: 'wo' });
  nextTurn(m, side, 300);
}

/** O bot mira no gol com erro; às vezes escolhe a melhor de algumas tentativas (dá para vencer). */
function botPlay(m) {
  if (m.done) return;
  const side = m.turn;
  if (!m.conns[side].bot) return;
  const t = targetOf(side);
  const base = Math.atan2(t.y - m.ball.y, t.x - m.ball.x);
  const tries = [];
  for (let i = 0; i < 4; i++) {
    const ang = base + ((randomInt(1000) / 1000) - 0.5) * 0.8;
    const pw = 0.45 + (randomInt(550) / 1000);
    const r = simulateFlick(m.ball, Math.cos(ang), Math.sin(ang), pw, m.board, { closedGoals: m.shots[0] + m.shots[1] === 0 });
    const s = scorerOf(r.goal);
    tries.push({ ang, pw, score: s === side ? 1000 : s !== null ? -1000 : -Math.hypot(r.end.x - t.x, r.end.y - t.y) });
  }
  const pick = randomInt(100) < 45 ? tries.sort((a, b) => b.score - a.score)[0] : tries[0];
  playShot(m, side, Math.cos(pick.ang), Math.sin(pick.ang), pick.pw);
}

// ─── Futebol de Botão: 2 petelecos por vez num botão seu ────────────────────

/** Relógio do próximo peteleco (quem está na vez: m.bs.turn) depois de `delayMs` (a animação). */
function scheduleSnap(m, delayMs, announce = true, extra = {}) {
  clearTimeout(m.turnTimer); clearTimeout(m.botTimer);
  m.turnEndsAt = Date.now() + delayMs + BOTAO.snapSec * 1000;
  if (announce) for (const c of m.conns) send(c.ws, { t: 'bturn', botao: botaoView(m.bs), turnEndsAt: m.turnEndsAt, ...extra });
  m.turnTimer = setTimeout(() => timeoutSnap(m), delayMs + BOTAO.snapSec * 1000 + 800);
  if (m.conns[m.bs.turn].bot) m.botTimer = setTimeout(() => botSnap(m), delayMs + 800 + randomInt(1200));
}

function onSnap(conn, msg) {
  const m = conn.match;
  if (!m || m.done || m.game !== 'BOTAO' || conn.side !== m.bs.turn || Date.now() < m.busyUntil) return;
  const idx = Number(msg.idx), dx = Number(msg.dx), dy = Number(msg.dy), power = Number(msg.power);
  if (![idx, dx, dy, power].every(Number.isFinite) || Math.hypot(dx, dy) < 1e-6) return;
  playSnap(m, conn.side, idx, dx, dy, power);
}

function playSnap(m, side, idx, dx, dy, power) {
  const res = applySnap(m.bs, side, idx, dx, dy, power, rnd01);
  if (!res) return; // botão que não é dele, fora da vez etc.
  clearTimeout(m.turnTimer); clearTimeout(m.botTimer);
  m.shots[side]++; m.timeouts[side] = 0;
  m.turns = [m.shots[0], m.shots[1]];
  const animMs = Math.round((res.sim.frames.length * 1000) / 30);
  m.busyUntil = Date.now() + animMs;
  const goal = res.events.find((e) => e.t === 'goal');
  const pen = res.events.find((e) => e.t === 'penalty');
  const over = res.events.find((e) => e.t === 'over');
  for (const c of m.conns) send(c.ws, { t: 'snap', side, idx, frames: res.sim.frames, goal: goal ?? null, penalty: pen ?? null, botao: botaoView(m.bs) });
  if (over) {
    // resultado decidido (gol, pênaltis…): fica pendente até a animação acabar — desistir/cair agora não escapa dele
    m.pending = { winner: over.winner, reason: over.winner === null ? 'empate' : over.reason === 'gols' ? (goal?.own ? 'gol-contra' : 'gol') : over.reason };
    m.turnTimer = setTimeout(() => finish(m, m.pending), animMs + 900);
    return;
  }
  const started = res.events.find((e) => e.t === 'penalties');
  scheduleSnap(m, animMs + (goal || pen ? 1100 : 350), true, started ? { penaltiesStart: true } : {});
}

function timeoutSnap(m) {
  if (m.done) return;
  const side = m.bs.turn;
  const events = skipSnap(m.bs, rnd01);
  m.timeouts[side]++;
  for (const c of m.conns) send(c.ws, { t: 'bskip', side, botao: botaoView(m.bs) });
  if (m.timeouts[side] >= MAX_TIMEOUTS && m.bs.phase === 'play') return finish(m, { winner: 1 - side, reason: 'wo' });
  const over = events.find((e) => e.t === 'over');
  if (over) return finish(m, { winner: over.winner, reason: over.winner === null ? 'empate' : over.reason });
  scheduleSnap(m, 300, true, events.some((e) => e.t === 'penalties') ? { penaltiesStart: true } : {});
}

function botSnap(m) {
  if (m.done || !m.conns[m.bs.turn].bot) return;
  const mv = botaoBotMove(m.bs, m.bs.turn, rnd01, 0.45);
  if (!mv) return timeoutSnap(m);
  playSnap(m, m.bs.turn, mv.idx, mv.dx, mv.dy, mv.power);
}

// ─── Queda, fim e dinheiro (iguais nos dois jogos) ──────────────────────────

function takeOver(from, to) {
  const m = from.match;
  if (!m || m.done) return;
  clearTimeout(from.dropTimer);
  to.match = m; to.side = from.side;
  m.conns[from.side] = to;
  from.match = null; from.side = -1; from.dropped = false;
  const other = m.conns[1 - to.side];
  send(other.ws, { t: 'opp-back' });
}

function onDisconnect(conn) {
  const m = conn.match;
  if (!m || m.done) return;
  if (m.bot) return finish(m, { winner: 1 - conn.side, reason: 'desistiu' }); // treino: acaba
  conn.dropped = true;
  send(m.conns[1 - conn.side].ws, { t: 'opp-dropped', seconds: F.reconnectSec });
  conn.dropTimer = setTimeout(() => {
    if (m.done || !conn.dropped || m.conns[conn.side] !== conn) return;
    finish(m, m.pending ?? { winner: 1 - conn.side, reason: 'wo' });
  }, F.reconnectSec * 1000);
}

async function finish(m, result) {
  if (m.done) return;
  m.done = true;
  clearTimeout(m.turnTimer); clearTimeout(m.botTimer);
  for (const c of m.conns) clearTimeout(c.dropTimer);
  matches.delete(m.id);
  let info = null, h2h = null;
  if (!m.bot) {
    try { info = await settle(m, result); } catch (e) { console.error('[x1] falha ao fechar a partida', e); info = { error: true }; }
    if (!info.error) h2h = await headToHead(m.conns[0].user.id, m.conns[1].user.id).catch((e) => { console.error('[x1] retrospecto no fim:', e.message); return null; });
  }
  for (const c of m.conns) {
    if (c.bot) continue;
    // partida de verdade que fechou: quem não é VIP espera challengeCooldownSec para desafiar de novo
    const cd = !m.bot && info && !info.error ? { cooldownUntil: isVip(c.user) ? null : Date.now() + F.challengeCooldownSec * 1000 } : {};
    const msg = {
      t: 'over', game: m.game, winner: result.winner, reason: result.reason, you: c.side, training: m.bot, players: m.conns.map(playerView),
      score: m.bs?.score ?? null, pen: m.bs?.pen?.kicks ?? null, ...personal(info, m, c.side, result), ...rivalry(h2h, m, c), ...cd,
    };
    if (c.ws && c.ws.readyState === c.ws.OPEN) send(c.ws, msg); else lastOver.set(c.user.id, { at: Date.now(), msg });
    c.match = null; c.side = -1;
  }
  refreshOpenLists().catch(() => {});
}

/**
 * Retrospecto contra o adversário já com esta partida e a frase de provocação da tela de fim (pedido do dono,
 * 15/09/2026). Só quando a partida entrou no retrospecto (é a mais recente dos dois): W.O. cedo, treino e
 * falha ao gravar não levam nada.
 */
function rivalry(rows, m, c) {
  if (!rows || rows[0]?.id !== m.dbId) return {};
  const before = h2hOf(rows.slice(1), c.user.id), after = h2hOf(rows, c.user.id);
  return { h2h: after, rivalry: rivalryLine({ before, after, me: c.user, opp: m.conns[1 - c.side].user }) };
}

/** O que cada um recebe na tela de fim. */
function personal(info, m, side, result) {
  if (m.bot) return { money: 0, text: 'Treino contra bot não vale gol nem dinheiro.' };
  if (!info || info.error) return { money: 0, text: 'Não deu para registrar a partida. Se o dinheiro sumiu, fale com o suporte.' };
  if (info.refund) return { money: F.bet, refund: true, why: info.why };
  const won = result.winner === side;
  return {
    money: won ? info.pot : 0, pot: info.pot, goal: info.goal, why: info.why ?? null,
    goalText: won ? info.goalText ?? null : null, lost: info.lost ?? false, lostTeam: info.lostTeam ?? null, remaining: info.remaining ?? null,
    lossLimit: !won && !!info.lossLimit, // o perdedor já fez o time perder o máximo desta hora: não tirou gol
  };
}

/**
 * Fecha a partida no banco (uma vez só: só a linha PLAYING vira FINISHED). Empate = devolve a aposta.
 * **W.O. e desistência são SEMPRE derrota de quem saiu** (decisão do dono, 15/09/2026: jogadores fechavam o app
 * ou desistiam ao ver que iam perder e, antes de cada um jogar 2 vezes, a aposta voltava e nada contava — o
 * "W.O. cedo" acabou; as linhas antigas `wo-cedo` ficam no histórico e fora do ranking). Vitória: o vencedor leva o pote e,
 * se valer (no máximo maxGoalsPerHour gols na hora cheia no X1; a mesma dupla com o mesmo vencedor duas
 * vezes seguidas não vale — regras do dono), 1 gol para o time dele. O time do perdedor perde 1 gol na
 * partida da rodada (nunca abaixo de 0) quando o gol valeu e o perdedor ainda não fez o time perder
 * maxGoalsPerHour gols nesta hora. Todo resultado que conta vai para os Lances ao vivo; o Ranking X1
 * (services/x1.js: 3 por vitória, 1 por empate, −2 por derrota) conta toda partida que terminou, menos W.O. cedo.
 */
async function settle(m, result) {
  const [a, b] = m.conns;
  const now = new Date();
  const label = X1.names[m.game];
  const score = m.bs ? { scoreA: m.bs.score[0], scoreB: m.bs.score[1] } : { scoreA: result.winner === 0 ? 1 : 0, scoreB: result.winner === 1 ? 1 : 0 };
  return prisma.$transaction(async (tx) => {
    const closed = await tx.x1Match.updateMany({ where: { id: m.dbId, status: 'PLAYING' }, data: { status: 'FINISHED', finishedAt: now, turns: m.shots[0] + m.shots[1], reason: result.reason, ...score } });
    if (!closed.count) return { error: true };
    // todo resultado que conta vai para os Lances ao vivo (pedido do dono, 15/09/2026); W.O. cedo (aposta devolvida) não
    const feed = (user, text) => tx.activity.create({ data: { userId: user.id, teamId: user.teamId, kind: m.game, goal: false, text } });
    if (result.winner === null) {
      await tx.user.updateMany({ where: { id: { in: [a.user.id, b.user.id] } }, data: { money: { increment: F.bet } } });
      await feed(a.user, m.game === 'BOTAO'
        ? `${a.user.nick} e ${b.user.nick} empataram no ${label}, até nos pênaltis: aposta devolvida.`
        : `${a.user.nick} e ${b.user.nick} empataram no ${label}: ninguém marcou em ${F.maxTurns} jogadas, aposta devolvida.`);
      return { refund: true, why: 'empate' };
    }
    const w = m.conns[result.winner], l = m.conns[1 - result.winner];
    const pot = F.bet * 2;
    const how = { 'gol-contra': ' (gol contra dele)', wo: ' por W.O.', desistiu: ' (ele desistiu)', penaltis: ' nos pênaltis' }[result.reason] ?? '';
    await tx.user.update({ where: { id: w.user.id }, data: { money: { increment: pot } } });
    await tx.x1Match.update({ where: { id: m.dbId }, data: { winnerId: w.user.id } });
    const since = hourStart(now); // a trava conta na hora cheia de Brasília
    const wonThisHour = await tx.x1Match.count({ where: { winnerId: w.user.id, goalAwarded: true, finishedAt: { gte: since } } });
    if (wonThisHour >= F.maxGoalsPerHour) {
      await feed(w.user, `${w.user.nick} venceu ${l.user.nick} no ${label}${how} e levou R$ ${pot} (já fez os ${F.maxGoalsPerHour} gols desta hora no X1).`);
      return { pot, goal: false, why: 'limite' };
    }
    const prev = await tx.x1Match.findFirst({
      where: { id: { not: m.dbId }, status: 'FINISHED', reason: { not: 'wo-cedo' }, OR: [{ aId: a.user.id, bId: b.user.id }, { aId: b.user.id, bId: a.user.id }] },
      orderBy: { id: 'desc' }, select: { winnerId: true },
    });
    if (prev && prev.winnerId === w.user.id) {
      await feed(w.user, `${w.user.nick} venceu ${l.user.nick} no ${label}${how} e levou R$ ${pot} (revanche repetida: sem gol).`);
      return { pot, goal: false, why: 'repetido' };
    }

    const winner = await loadUser(tx, w.user.id);
    const live = await liveMatchForTeam(winner.teamId, tx);
    const phrase = `venceu ${l.user.nick} no ${label}${how}`;
    const { text } = await applyResult(tx, winner, { kind: m.game, goal: true, now, match: live, money: 0, phrase });
    // o time do perdedor perde 1 gol na partida da rodada (nunca abaixo de 0), até maxGoalsPerHour por hora
    // por perdedor (gols que ele já fez o time perder nesta hora no X1)
    const loser = await tx.user.findUnique({ where: { id: l.user.id }, include: { team: true } });
    let lost = null;
    const lostThisHour = await tx.x1Match.count({
      where: { id: { not: m.dbId }, status: 'FINISHED', lostTeamId: { not: null }, winnerId: { not: loser.id }, OR: [{ aId: loser.id }, { bId: loser.id }], finishedAt: { gte: since } },
    });
    const lossLimit = lostThisHour >= F.maxGoalsPerHour;
    const lm = lossLimit ? null : await liveMatchForTeam(loser.teamId, tx);
    if (lm) {
      const field = lm.homeTeamId === loser.teamId ? 'homeGoals' : 'awayGoals';
      const { count } = await tx.match.updateMany({ where: { id: lm.id, status: 'LIVE', [field]: { gt: 0 } }, data: { [field]: { decrement: 1 } } });
      if (count) lost = { matchId: lm.id, teamId: loser.teamId };
    }
    await tx.x1Match.update({ where: { id: m.dbId }, data: { goalAwarded: true, lostMatchId: lost?.matchId ?? null, lostTeamId: lost?.teamId ?? null } });
    await tx.activity.create({
      data: {
        userId: loser.id, teamId: loser.teamId, kind: m.game, goal: false,
        text: lost ? `${loser.team.name} perdeu 1 gol: ${loser.nick} perdeu para ${w.user.nick} no ${label}.` : `${loser.nick} perdeu para ${w.user.nick} no ${label}.`,
      },
    });
    return { pot, goal: true, goalText: text, lost: !!lost, lostTeam: loser.team.name, lossLimit, remaining: F.maxGoalsPerHour - wonThisHour - 1 };
  });
}

/** A API reiniciou no meio de partidas: elas viram CANCELED e a aposta volta para os dois. */
async function refundStale() {
  const stale = await prisma.x1Match.findMany({ where: { status: 'PLAYING' }, select: { id: true, aId: true, bId: true, bet: true } });
  for (const s of stale) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.x1Match.updateMany({ where: { id: s.id, status: 'PLAYING' }, data: { status: 'CANCELED', reason: 'reinicio', finishedAt: new Date() } });
      if (count) await tx.user.updateMany({ where: { id: { in: [s.aId, s.bId] } }, data: { money: { increment: s.bet } } });
    });
  }
  if (stale.length) console.log(`[x1] ${stale.length} partida(s) aberta(s) no reinício: aposta devolvida`);
}
