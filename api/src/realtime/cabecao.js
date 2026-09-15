/**
 * Cabeção — fila, partidas e WebSocket (`/api/ws/cabecao?token=<jwt>`).
 * Pareamento: times diferentes, IPs diferentes, jogadores diferentes. A simulação roda
 * aqui (30 Hz) e o cliente só manda entradas e desenha. Vencedor = 1 gol (com limites
 * antifraude em `awardWin`). Uma instância PM2 só — o estado fica em memória.
 */
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { createSim, step, setInput, snapshot, FIELD } from './cabecaoSim.js';
import { applyResult, loadUser } from '../services/play.js';
import { liveMatchForTeam } from '../services/league.js';
import { teamView } from '../services/view.js';
import { nextMidnight } from '../lib/time.js';
import { CABECAO } from '../lib/rules.js';
import { clientIp as ipOf } from '../lib/ip.js';
import { takeIpSlot } from '../lib/security.js';

const TICK_MS = 1000 / 30;
const RECONNECT_GRACE_MS = 20_000; // caiu no meio da partida: tem 20 s para voltar antes do W.O.
const BOT_AFTER_MS = 15_000; // ninguém na fila em 15 s → entra um bot (partida de treino, não vale gol)
const BOT_NAMES = ['Zagalinho', 'Pé de Pano', 'Perna Longa', 'Cabeça de Bagre', 'Canhotinha', 'Bicudo', 'Matador', 'Camisa 10'];
const queue = [];          // [{ conn }]
const matches = new Map(); // id -> match
const conns = new Set();   // todas as conexões vivas
let nextMatchId = 1;

function send(ws, msg) { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); }

export function cabecaoStatus() {
  return { queue: queue.length, playing: [...matches.values()].reduce((n, m) => n + (m.bot ? 1 : 2), 0), rules: { matchSec: FIELD.matchSec, goldenSec: FIELD.goldenSec, maxGoalWinsPerDay: CABECAO.maxGoalWinsPerDay, botAfterSec: BOT_AFTER_MS / 1000 } };
}

function broadcastQueue() {
  const st = cabecaoStatus();
  for (const q of queue) send(q.conn.ws, { t: 'queue', ...st });
}

// IP de verdade (X-Real-IP do nginx; lib/ip.js) — antes era o 1º valor do X-Forwarded-For, que o jogador falsifica
// (dava para parear duas contas suas "de internets diferentes")
const clientIp = (req) => ipOf(req) || '?';

/** Verifica o token e carrega o jogador (time incluso). */
async function authenticate(req) {
  const url = new URL(req.url, 'http://x');
  const token = url.searchParams.get('token') || '';
  const payload = jwt.verify(token, config.jwtSecret);
  const user = await prisma.user.findUnique({ where: { id: payload.uid }, include: { team: true } });
  if (!user || (user.bannedUntil && user.bannedUntil.getTime() > Date.now())) throw new Error('unauthorized');
  if (!user.isAdmin) takeIpSlot(clientIp(req), user.id, Date.now(), user.nick); // 3 contas ao mesmo tempo por internet
  return user;
}

export function attachCabecao(server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', async (req, socket, head) => {
    if (!req.url.startsWith('/api/ws/cabecao')) return; // outras rotas de upgrade (nenhuma hoje)
    let user;
    try { user = await authenticate(req); } catch { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, user));
  });
  wss.on('connection', (ws, req, user) => {
    const conn = { ws, user, ip: clientIp(req), match: null, side: -1, alive: true };
    // uma conexão por jogador: a antiga cai — mas uma partida em andamento passa para a nova
    for (const c of [...conns]) if (c.user.id === user.id) { c.replaced = true; send(c.ws, { t: 'kicked', reason: 'outra-aba' }); c.ws.close(); takeOver(c, conn); }
    // caiu há pouco e voltou: retoma a partida
    for (const m of matches.values()) for (const c of m.conns) if (c.user.id === user.id && c !== conn && c.dropped) takeOver(c, conn);
    conns.add(conn);
    send(ws, { t: 'hello', me: user.id, ...cabecaoStatus() });
    if (conn.match) resendMatch(conn);
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; } onMessage(conn, m); });
    ws.on('close', () => { conns.delete(conn); leaveQueue(conn); if (conn.match && !conn.replaced) onDisconnect(conn); });
    ws.on('pong', () => { conn.alive = true; });
  });
  // keepalive (nginx fecha conexões ociosas)
  setInterval(() => {
    for (const c of conns) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch {} }
  }, 25_000).unref();
  return wss;
}

function onMessage(conn, m) {
  if (m.t === 'join') return joinQueue(conn);
  if (m.t === 'leave') { leaveQueue(conn); return send(conn.ws, { t: 'left' }); }
  if (m.t === 'in' && conn.match && conn.side >= 0 && !conn.match.done) return setInput(conn.match.sim, conn.side, m);
  if (m.t === 'ping') return send(conn.ws, { t: 'pong', at: m.at, now: Date.now() });
}

function leaveQueue(conn) {
  const i = queue.findIndex((q) => q.conn === conn);
  if (i >= 0) { clearTimeout(queue[i].botTimer); queue.splice(i, 1); broadcastQueue(); }
}

let teamsCache = { at: 0, list: [] };
async function randomTeamExcept(teamId) {
  if (Date.now() - teamsCache.at > 5 * 60_000) teamsCache = { at: Date.now(), list: await prisma.team.findMany() };
  const pool = teamsCache.list.filter((t) => t.id !== teamId);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Ninguém apareceu: cria um adversário bot (time aleatório, nick com "BOT"). */
async function startBotMatch(conn) {
  if (conn.match || !queue.some((q) => q.conn === conn)) return;
  const team = await randomTeamExcept(conn.user.teamId);
  if (!team) return;
  leaveQueue(conn);
  const nick = `BOT ${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]}`;
  const bot = { ws: null, user: { id: -1, nick, avatarUrl: null, team, teamId: team.id }, ip: 'bot', match: null, side: -1, bot: true };
  startMatch(conn, bot);
}

/** IA simples do bot: fica um pouco atrás da bola, pula quando ela está alta e chuta quando está perto. */
function botInput(sim, side) {
  const p = sim.p[side], b = sim.b, dir = side === 0 ? 1 : -1;
  const behind = b.x - dir * 34;
  const near = Math.abs(b.x - p.x) < 95 && b.y < 170;
  const ownGoalSide = (p.x - b.x) * dir > 0; // bola atrás do bot (entre ele e o gol dele)
  return {
    l: behind < p.x - 10, r: behind > p.x + 10,
    j: near && b.y > 80 && Math.random() < 0.3,
    k: near && !ownGoalSide && Math.random() < 0.4,
  };
}

function joinQueue(conn) {
  if (conn.match || queue.some((q) => q.conn === conn)) return;
  if (!conn.user.teamId) return send(conn.ws, { t: 'error', message: 'Escolha um time antes de jogar.' });
  // parceiro compatível: outro jogador, outro time, outro IP
  const idx = queue.findIndex((q) => q.conn.user.id !== conn.user.id && q.conn.user.teamId !== conn.user.teamId && q.conn.ip !== conn.ip);
  if (idx < 0) { queue.push({ conn, at: Date.now(), botTimer: setTimeout(() => startBotMatch(conn).catch((e) => console.error('[cabecao] bot', e)), BOT_AFTER_MS) }); broadcastQueue(); return; }
  const [other] = queue.splice(idx, 1);
  clearTimeout(other.botTimer);
  broadcastQueue();
  startMatch(other.conn, conn);
}

function playerView(conn) {
  const u = conn.user;
  return { id: u.id, nick: u.nick, avatarUrl: u.avatarUrl ?? null, team: teamView(u.team), bot: !!conn.bot };
}

function startMatch(a, b) {
  const id = nextMatchId++;
  const m = { id, sim: createSim(), conns: [a, b], done: false, startedAt: Date.now(), lastSent: 0, bot: !!(a.bot || b.bot) };
  a.match = m; a.side = 0; b.match = m; b.side = 1;
  matches.set(id, m);
  const players = [playerView(a), playerView(b)];
  for (const c of [a, b]) send(c.ws, { t: 'match', id, side: c.side, players, field: FIELD, training: m.bot });
  let last = Date.now();
  m.timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    for (const c of m.conns) if (c.bot && m.sim.tick % 4 === 0) setInput(m.sim, c.side, botInput(m.sim, c.side)); // reage a 7,5 Hz: dá pra vencer
    step(m.sim, dt);
    const snap = snapshot(m.sim);
    for (const c of m.conns) send(c.ws, snap);
    if (m.sim.phase === 'over' && !m.done) finishMatch(m, m.sim.result);
  }, TICK_MS);
}

/** A partida (e o lado) de `from` passa para a conexão nova `to`. */
function takeOver(from, to) {
  const m = from.match;
  if (!m || m.done) return;
  clearTimeout(from.dropTimer);
  to.match = m; to.side = from.side;
  m.conns[from.side] = to;
  from.match = null; from.side = -1; from.dropped = false;
}
function resendMatch(conn) {
  const m = conn.match;
  send(conn.ws, { t: 'match', id: m.id, side: conn.side, players: m.conns.map(playerView), field: FIELD, training: m.bot, resumed: true });
}

function onDisconnect(conn) {
  const m = conn.match;
  if (!m || m.done) return;
  // caiu: o boneco fica parado e o jogador tem RECONNECT_GRACE_MS para voltar; senão perde por W.O.
  conn.dropped = true;
  setInput(m.sim, conn.side, { l: 0, r: 0, j: 0, k: 0 });
  const other = m.conns[1 - conn.side];
  send(other.ws, { t: 'opp-dropped', seconds: RECONNECT_GRACE_MS / 1000 });
  conn.dropTimer = setTimeout(() => {
    if (m.done || !conn.dropped || m.conns[conn.side] !== conn) return;
    finishMatch(m, { winner: conn.side === 0 ? 1 : 0, reason: 'wo' });
  }, RECONNECT_GRACE_MS);
}

async function finishMatch(m, result) {
  m.done = true;
  clearInterval(m.timer);
  for (const c of m.conns) clearTimeout(c.dropTimer);
  matches.delete(m.id);
  const [a, b] = m.conns;
  const sc = m.sim.score;
  const winnerConn = result.winner == null ? null : m.conns[result.winner];
  let award = null;
  if (m.bot) award = { goal: false, why: 'bot', text: 'Treino contra bot não vale gol. Entre na fila de novo para pegar um craque de verdade!' };
  else {
    try { award = await recordMatch(m, result, winnerConn); }
    catch (e) { console.error('[cabecao] falha ao registrar partida', e); }
  }
  for (const c of m.conns) {
    send(c.ws, { t: 'over', score: sc, winner: result.winner, reason: result.reason, you: c.side, award: award && winnerConn === c ? award : null });
    c.match = null; c.side = -1;
  }
}

/**
 * Grava a partida e dá o gol ao vencedor. Antifraude: no máximo `maxGoalWinsPerDay` gols
 * por dia no Cabeção e nunca dois gols contra o MESMO adversário no mesmo dia; W.O. antes
 * de `woMinSec` segundos de jogo não vale gol.
 */
async function recordMatch(m, result, winnerConn) {
  const [a, b] = m.conns;
  const now = new Date();
  const playedSec = (Date.now() - m.startedAt) / 1000;
  return prisma.$transaction(async (tx) => {
    const row = await tx.cabecaoMatch.create({
      data: {
        aId: a.user.id, bId: b.user.id, aTeamId: a.user.teamId, bTeamId: b.user.teamId, aIp: a.ip, bIp: b.ip,
        scoreA: m.sim.score[0], scoreB: m.sim.score[1], winnerId: winnerConn?.user.id ?? null, reason: result.reason, seconds: Math.round(playedSec),
      },
    });
    if (!winnerConn) return { goal: false, why: 'empate' };
    if (result.reason === 'wo' && playedSec < CABECAO.woMinSec) return { goal: false, why: 'wo-cedo', text: 'Vitória por W.O. antes do tempo mínimo não vale gol.' };
    const loser = winnerConn === a ? b : a;
    const dayStart = new Date(nextMidnight(now).getTime() - 24 * 3600_000);
    const todays = await tx.cabecaoMatch.findMany({ where: { winnerId: winnerConn.user.id, goalAwarded: true, createdAt: { gte: dayStart } }, select: { aId: true, bId: true } });
    if (todays.length >= CABECAO.maxGoalWinsPerDay) return { goal: false, why: 'limite', text: `Você já fez os ${CABECAO.maxGoalWinsPerDay} gols de hoje no Cabeção. Vitória registrada!` };
    if (todays.some((t) => t.aId === loser.user.id || t.bId === loser.user.id)) return { goal: false, why: 'mesmo-adversario', text: 'Gol só vale uma vez por dia contra o mesmo adversário.' };
    const user = await loadUser(tx, winnerConn.user.id);
    const match = await liveMatchForTeam(user.teamId, tx);
    const { text } = await applyResult(tx, user, { kind: 'CABECAO', goal: true, now, match, money: 0, phrase: `venceu ${loser.user.nick} no Cabeção por ${m.sim.score[winnerConn.side]} a ${m.sim.score[loser.side]}` });
    await tx.cabecaoMatch.update({ where: { id: row.id }, data: { goalAwarded: true } });
    return { goal: true, text, remaining: CABECAO.maxGoalWinsPerDay - todays.length - 1 };
  });
}
