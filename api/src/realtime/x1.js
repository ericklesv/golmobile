/**
 * X1 — jogos 1x1 ao vivo, um por dia (dono, 15/09/2026: "jogos X1 rotativos, cada dia 1 jogo para não
 * ficar enjoativo"): FutPrego, Futebol de Botão e Futgolf em rodízio (x1GameOf em lib/rules.js). WebSocket em
 * `/api/ws/x1?token=<jwt>&mode=lobby|game` (o endereço antigo /api/ws/futprego continua valendo).
 *
 * - mode=lobby: aberto pelas telas com as abas (Layout). Só recebe o convite pequeno ("Fulano está te
 *   desafiando no X1") por FUTPREGO.inviteSec. Dentro de minigame/chute a Layout não está montada, então o
 *   convite nunca aparece lá.
 * - mode=game: a tela do X1. Desafia no jogo do dia (se já houver um desafio compatível aberto, vira partida
 *   na hora), aceita, joga, desiste.
 * Pareamento: jogadores e IPs diferentes, sem bloqueio entre eles. Dois do MESMO time podem jogar (dono,
 * 15/09/2026): é amistoso — vale só o dinheiro, sem gol e fora do Ranking X1 (X1_COUNTED); ao desafiar, um
 * desafio aberto de outro time tem preferência. Cada um paga FUTPREGO.bet ao
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
import { BOTAO_FIELD, simulateSnap } from '../lib/botao.js';
import { newBotaoMatch, botaoView, applySnap, skipSnap, botaoBotMove, botaoHumanMove, movablePieces } from '../lib/botaoMatch.js';
import { simulateKick as simulateGolf } from '../lib/futgolf.js';
import { newFutgolfMatch, futgolfView, golfKick, golfSkip, golfCloseRound, golfRoundDone, golfActive, futgolfAiKick } from '../lib/futgolfMatch.js';
import { FUTPREGO, BOTAO, FUTGOLF, X1, PROVOCAR, TUTORIAL, BOTS, x1GameOf, MINIGAMES, levelOf, isVip } from '../lib/rules.js';
import { noPassoDoX1 } from '../services/tutorial.js';
import { applyResult, loadUser } from '../services/play.js';
import { liveMatchForTeam, currentRound } from '../services/league.js';
import { teamView } from '../services/view.js';
import { X1_PLAYED, X1_COUNTED } from '../services/x1.js';
import { dayNumberAt, nextResetAt, nextHourStart } from '../lib/time.js';
import { h2hOf, rivalryLine } from '../lib/rivalidade.js';
import { takeSlot } from '../lib/security.js';
import { deviceOf } from '../lib/device.js';

const F = FUTPREGO; // regras de convite, aposta, gol e travas (valem para todo o X1)
const PROVOCAR_BY_KEY = new Map(PROVOCAR.list.map((e) => [e.key, e]));
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const betweenMs = ([a, b]) => Math.round((a + Math.random() * (b - a)) * 1000);
/**
 * Este lado é jogado pelo SERVIDOR? `bot` = treino (não vale nada, joga rápido e forte); `ai` = um dos bots
 * "quase reais" (services/bots.js) — vale tudo e joga COMO GENTE: demora BOTS.x1.thinkSec para bater, tem uma
 * `skill` sorteada (nem sempre ganha) e provoca de vez em quando. Chega por dois caminhos: o tutorial
 * (botDoTutorialAceita) e as visitas do motor (x1BotVisit, `engine: true`).
 */
const isAi = (c) => !!(c && (c.ai || c.bot));
const BX = BOTS.x1;
/** Quanto o lado do servidor demora para jogar: bot de treino quase na hora; bot "quase real", 3 a 8 s. */
const aiDelayMs = (c) => (c.ai ? betweenMs(BX.thinkSec) : 900 + randomInt(1400));

/** O jogo do X1 agora, o próximo e quando troca (às X1.switchHour = 19h de Brasília, com a rodada). */
// SÓ NO PC (X1_JOGO=BOTAO ou FUTPREGO no api/.env; ignorado em produção): força o jogo do dia para testar.
const forcedGame = () => (process.env.NODE_ENV !== 'production' && X1.games.includes(process.env.X1_JOGO) ? process.env.X1_JOGO : null);

export function x1Today(now = new Date()) {
  const day = dayNumberAt(X1.switchHour, now);
  const game = forcedGame() ?? x1GameOf(day);
  const next = forcedGame() ? X1.games.find((g) => g !== game) : x1GameOf(day + 1); // forçado: o "próximo" mostra o outro
  // order + names: a tela sabe qual vem depois do próximo (com 3 jogos, "inverter hoje e amanhã" não serve mais)
  return { game, name: X1.names[game], next, nextName: X1.names[next], switchAt: nextResetAt(X1.switchHour, now).getTime(), switchHour: X1.switchHour, order: forcedGame() ? null : X1.games, names: X1.names };
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
    where: { ...X1_PLAYED, OR: [{ aId, bId }, { aId: bId, bId: aId }] }, // amistosos entram (é o confronto dos dois)
    orderBy: { id: 'desc' }, select: { id: true, winnerId: true, finishedAt: true },
  });
}

export function x1Status() {
  return { open: challenges.size, playing: [...matches.values()].reduce((n, m) => n + (m.bot ? 1 : 2), 0), matches: matches.size, today: x1Today(), drain: x1Drain()?.until ?? null };
}

/**
 * As partidas em andamento, com QUEM está jogando — só para o relatório do admin (services/report.js; pedido do
 * dono, 22/09/2026: "quando tiver X1 ao vivo, mostrar quem está jogando"). `bot` = treino contra o bot de treino,
 * `ai` = bot "quase real" (jogando valendo); no front público nada disso aparece. A mais antiga primeiro.
 */
export function x1LiveMatches() {
  return [...matches.values()].sort((a, b) => a.startedAt - b.startedAt).map((m) => ({
    id: m.id, game: m.game, since: m.startedAt, training: !!m.bot, sameTeam: !!m.sameTeam, freeplay: !!m.freeplay,
    score: m.bs?.score ?? (m.fg ? [...m.fg.strokes] : null), turns: m.turns[0] + m.turns[1],
    players: m.conns.map((c) => ({ id: c.user.id, nick: c.user.nick, abbr: c.user.team?.abbr ?? null, bot: !!c.bot, ai: !!c.ai })),
  }));
}

// ─── Trava de atualização — deploy sem partida travada (pedido do dono, 15/09/2026) ─────────────────────────
// O `pm2 restart` do deploy derrubava as partidas em andamento no meio (o estado é em memória): a tela ficava
// "travada" e a aposta só voltava no reinício (refundStale). Agora o brgol-deploy.sh faz em 3 passos, pelas rotas
// de admin (x-admin-key): 1) `POST /api/admin/x1/drain` — ninguém mais desafia, aceita nem treina (a tela mostra
// "atualizando") e os desafios abertos são cancelados com o motivo; as partidas em andamento SEGUEM; 2) espera
// `GET /api/x1/status`.matches chegar a 0 (até uns 4 min); 3) `POST /api/admin/x1/cancel` — o que sobrou é
// cancelado com a aposta devolvida e o motivo na tela dos dois — e só então reinicia. Quem reconecta depois do
// reinício ainda "dentro" de uma partida recebe `no-match` e volta ao começo com o aviso.
let drain = null; // { until } enquanto a busca está travada (some sozinha no `until`, se o deploy não reiniciar)
const DRAIN_TEXT = 'O JogaGol está sendo atualizado. A busca do X1 volta em instantes.';
export const x1Drain = () => (drain && drain.until > Date.now() ? drain : (drain = null));

/** Deploy, passo 1: trava a busca por `seconds` e cancela os desafios abertos (as partidas em andamento seguem). */
export function startX1Drain(seconds = 420) {
  drain = { until: Date.now() + Math.max(10, seconds) * 1000 };
  for (const ch of [...challenges.values()]) { send(ch.from.ws, { t: 'expired', message: DRAIN_TEXT }); cancelChallenge(ch, 'atualizacao'); }
  for (const c of conns) send(c.ws, { t: 'drain', until: drain.until });
  console.log(`[x1] busca travada para atualização (${matches.size} partida(s) em andamento)`);
  return { until: drain.until, matches: matches.size };
}
/** Deploy, passo 3: cancela o que ainda estiver em andamento — aposta devolvida, nada conta, motivo na tela. */
export async function cancelX1Matches(reason = 'atualizacao') {
  const list = [...matches.values()];
  for (const m of list) await cancelMatch(m, reason).catch((e) => console.error('[x1] cancelar partida', e));
  if (list.length) console.log(`[x1] ${list.length} partida(s) cancelada(s) para atualização: aposta devolvida`);
  return { canceled: list.length };
}
/** Destrava sem reiniciar (deploy abortado). */
export function stopX1Drain() {
  drain = null;
  for (const c of conns) send(c.ws, { t: 'drain', until: null });
  return { ok: true };
}

// (Campanha do perfil e Ranking X1 — pontos 3·1·−2, prêmios por rodada/temporada: services/x1.js.)

/** IP de verdade: o nginx da VPS grava o X-Real-IP (o 1º valor do X-Forwarded-For o próprio jogador forja). */
function clientIp(req) {
  const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '?').trim();
  return ip.replace(/^::ffff:/, '');
}

/**
 * Cliente AUTOMATIZADO (dono, 20/09/2026: o Xumbera jogou 521 partidas num dia com um programa em Node ligado
 * direto neste WebSocket — User-Agent "node", sem Origin e sem o código do aparelho): não é navegador. Todo
 * navegador manda `Origin` no WebSocket (o site é jogagol.com.br; o app da Play Store abre o mesmo site) e o site
 * sempre manda `device=`. Em produção qualquer um dos três sinais marca; no PC/testes só o UA de programa (os
 * testes usam a lib `ws`, que não manda Origin). Quem é marcado joga, mas só 1 partida a cada
 * FUTPREGO.autoClientGapMin (desafiar e aceitar). Sem aviso no Telegram (viraria spam): só uma linha no log por conta.
 */
const PROGRAM_UA = /^(node|undici|python|curl|wget|go-http|okhttp|java|axios|got)\b|^$/i;
function automatedClient(req, url) {
  const ua = String(req.headers['user-agent'] || '');
  if (process.env.NODE_ENV !== 'production') return ua === 'node';
  const origin = String(req.headers.origin || '');
  return PROGRAM_UA.test(ua) || !/Mozilla\//.test(ua) || !/^https:\/\/(www\.)?jogagol\.com\.br$/.test(origin) || !url.searchParams.get('device');
}
const autoSeen = new Set(); // contas com cliente automatizado já anotadas no log (por processo)
async function autoClientWaitUntil(user) {
  const last = await prisma.x1Match.findFirst({
    where: { status: 'FINISHED', finishedAt: { not: null }, OR: [{ aId: user.id }, { bId: user.id }] },
    orderBy: { finishedAt: 'desc' }, select: { finishedAt: true },
  });
  const until = last ? last.finishedAt.getTime() + F.autoClientGapMin * 60_000 : 0;
  return until > Date.now() ? until : null;
}
/** Desafiar/aceitar de um cliente automatizado: fora do intervalo, recusa (e a tela dele — se houver — sabe por quê). */
async function autoClientBlocked(conn) {
  if (!conn.auto) return false;
  const until = await autoClientWaitUntil(conn.user);
  if (!until) return false;
  const s = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  send(conn.ws, { t: 'error', code: 'auto-cooldown', until, message: `Cliente fora do site: 1 partida a cada ${F.autoClientGapMin} min. Próxima em ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.` });
  return true;
}

async function authenticate(req) {
  const url = new URL(req.url, 'http://x');
  const payload = jwt.verify(url.searchParams.get('token') || '', config.jwtSecret);
  const user = await prisma.user.findUnique({ where: { id: payload.uid }, include: { team: true } });
  if (!user || user.deletedAt || (user.bannedUntil && user.bannedUntil.getTime() > Date.now())) throw new Error('unauthorized');
  if (!user.isAdmin) takeSlot({ ip: clientIp(req), device: deviceOf(req) }, user.id, Date.now(), user.nick); // 3 contas ao mesmo tempo (lib/security.js)
  const mode = url.searchParams.get('mode') === 'game' ? 'game' : 'lobby';
  const auto = mode === 'game' && automatedClient(req, url);
  // sem aviso no Telegram (dono, 20/09/2026: "vai virar um spam") — fica só no log do pm2, 1 linha por conta
  if (auto && !autoSeen.has(user.id)) { autoSeen.add(user.id); console.log(`[x1] cliente automatizado na conta ${user.nick} (UA "${String(req.headers['user-agent'] || '').slice(0, 40)}", ${clientIp(req)}): 1 partida a cada ${F.autoClientGapMin} min`); }
  return { user, mode, auto };
}

const playerView = (c) => ({ id: c.user.id, nick: c.user.nick, avatarUrl: c.user.avatarUrl ?? null, team: teamView(c.user.team), bot: !!c.bot });
const rulesView = () => ({
  bet: F.bet, turnSec: F.turnSec, maxTurns: F.maxTurns, inviteSec: F.inviteSec, botAfterSec: F.botAfterSec, maxGoalsPerHour: F.maxGoalsPerHour, challengeCooldownSec: F.challengeCooldownSec,
  botao: { snapsPerTurn: BOTAO.snapsPerTurn, firstTurnSnaps: BOTAO.firstTurnSnaps, snapSec: BOTAO.snapSec, goalsToWin: BOTAO.goalsToWin, maxTurns: BOTAO.maxTurns, death: BOTAO.death },
  futgolf: { kickSec: FUTGOLF.kickSec, overPar: FUTGOLF.overPar, tiebreaks: FUTGOLF.tiebreaks },
  provocar: PROVOCAR, // caretas e frases prontas (a tela não duplica o catálogo)
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
  wss.on('connection', (ws, req, { user, mode, auto }) => {
    const conn = { ws, user, ip: clientIp(req), mode, auto: !!auto, alive: true, match: null, side: -1, challenge: null, seen: new Set(), lastInviteAt: 0 };
    if (mode === 'game') {
      // uma tela de jogo por jogador: a antiga cai, e uma partida em andamento passa para a nova
      for (const c of [...conns]) if (c.mode === 'game' && c.user.id === user.id) { c.replaced = true; send(c.ws, { t: 'kicked' }); c.ws.close(); takeOver(c, conn); }
      for (const m of matches.values()) for (const c of m.conns) if (!isAi(c) && c.user.id === user.id && c !== conn && c.dropped) takeOver(c, conn);
    }
    conns.add(conn);
    send(ws, { t: 'hello', me: user.id, rules: rulesView(), today: x1Today(), drain: x1Drain()?.until ?? null });
    if (mode === 'lobby') offerOpen(conn).catch(() => {});
    else if (conn.match) sendMatch(conn, true);
    else {
      const lo = lastOver.get(user.id);
      if (lo && Date.now() - lo.at < 10 * 60_000) { send(ws, { ...lo.msg, late: true }); lastOver.delete(user.id); }
      else send(ws, { t: 'no-match' }); // a tela que voltou "dentro" de uma partida/espera que não existe mais (a API reiniciou) volta ao começo
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
    for (const c of conns) { if (isAi(c)) continue; if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch {} }
  }, 25_000).unref();
  refundStale().catch((e) => console.error('[x1] devolução das partidas abertas', e));
  return wss;
}

async function onMessage(conn, m) {
  if (m.t === 'ping') return send(conn.ws, { t: 'pong', at: m.at, now: Date.now() });
  if (conn.mode !== 'game') return;
  if (m.t === 'challenge') return createChallenge(conn);
  if (m.t === 'cancel') { if (conn.challenge) cancelChallenge(conn.challenge, 'cancelou'); return send(conn.ws, { t: 'canceled' }); }
  if (m.t === 'accept') return naFila(() => acceptChallenge(conn, Number(m.id)));
  if (m.t === 'bot') return startBot(conn);
  if (m.t === 'flick') return onFlick(conn, m);
  if (m.t === 'snap') return onSnap(conn, m);
  if (m.t === 'gkick') return onGolfKick(conn, m);
  if (m.t === 'provocar') return onProvocar(conn, m);
  if (m.t === 'preview') return onPreview(conn, m);
  if (m.t === 'xray') return onXray(conn, m);
  // desistir = derrota (se o resultado já está decidido e só falta a animação, vale ele — não a desistência)
  if (m.t === 'giveup' && conn.match && !conn.match.done) return finish(conn.match, conn.match.pending ?? { winner: 1 - conn.side, reason: 'desistiu' });
}

// ─── Desafios e convites ────────────────────────────────────────────────────

// SÓ NO PC (FUTPREGO_MESMO_IP=1 no api/.env; ignorado em produção): deixa jogar com duas janelas na mesma
// internet para testar. NUNCA na VPS.
const sameIpOk = () => process.env.NODE_ENV !== 'production' && process.env.FUTPREGO_MESMO_IP === '1';

/**
 * Os dois podem se enfrentar? Só não dá contra si mesmo ou com bloqueio entre eles.
 * **Mesma internet PODE desde 17/09/2026** (dono: "libere, às vezes as pessoas só querem se divertir um
 * pouco"): antes o desafio simplesmente não aparecia e parecia bug. Vira TREINO — ver `treinoPorIp`.
 */
async function compatible(a, b) {
  if (a.user.id === b.user.id) return false;
  // gente x bot "quase real": a mesma pessoa não joga com os bots o tempo todo (BOTS.x1.sameHumanMin/Day) — fora
  // da cota, o desafio do bot nem aparece para ela (e o bot não pega o dela)
  if (isAi(a) !== isAi(b) && !(await botQuotaOk((isAi(a) ? b : a).user.id))) return false;
  const block = await prisma.userBlock.findFirst({ where: { OR: [{ userId: a.user.id, blockedId: b.user.id }, { userId: b.user.id, blockedId: a.user.id }] }, select: { id: true } });
  return !block;
}

/** 1 = os dois são do mesmo time (amistoso: vale só dinheiro), 0 = times diferentes. */
const sameTeamOf = (a, b) => (a.user.teamId === b.user.teamId ? 1 : 0);

/**
 * Os dois estão na MESMA INTERNET: a partida é só treino — **ninguém aposta, ninguém ganha dinheiro, não
 * vale gol e não conta no Ranking X1** (dono, 17/09/2026). Assim dá para jogar com quem está na mesma casa
 * sem abrir brecha para farmar gol e dinheiro entre duas contas. No PC, FUTPREGO_MESMO_IP=1 faz valer como
 * partida de verdade — é assim que os testes casam duas janelas.
 */
const treinoPorIp = (a, b) => a.ip === b.ip && !sameIpOk();

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

const drainErr = (conn) => send(conn.ws, { t: 'error', code: 'atualizacao', until: drain.until, message: DRAIN_TEXT });

/**
 * Uma criação/aceite de desafio por vez (dono, 23/09/2026: "quando um bot está desafiando, criar um desafio devia
 * cair contra esse bot e não ficar 2 desafios abertos"). Entre olhar quem está esperando e registrar o desafio novo
 * há várias idas ao banco: dois "desafiar" no mesmo instante viam a lista vazia e abriam DOIS desafios em vez de
 * se enfrentarem (e dois aceites no mesmo desafio davam "já começou" a um deles). Na fila, o segundo espera o
 * primeiro terminar e já vê o desafio dele. **Nada dentro da fila pode esperar outra coisa que entra nela** (trava
 * para sempre): por isso o `createChallenge(a)` do "b ficou sem dinheiro" em acceptChallenge não é esperado.
 */
let fila = Promise.resolve();
function naFila(fn) {
  const run = fila.then(fn);
  fila = run.catch(() => {});
  return run;
}

async function createChallenge(conn) {
  if (conn.match || conn.challenge) return;
  if (x1Drain()) return drainErr(conn);
  if (busyUser(conn.user.id)) return err(conn, 'busy', 'Você já está numa partida ou desafiando em outra tela.');
  const problem = await canPlay(conn);
  if (problem) return err(conn, 'no-money', problem);
  // não é VIP e terminou uma partida há menos de 2 min: não desafia (aceitar pode)
  const until = await challengeCooldownUntil(conn.user);
  if (until) return send(conn.ws, { t: 'error', code: 'cooldown', until, message: cooldownText(until) });
  if (await autoClientBlocked(conn)) return; // programa ligado direto no WebSocket: 1 partida a cada 20 min
  const ch = await naFila(() => casaOuAbre(conn));
  if (!ch) return;
  send(conn.ws, { t: 'waiting', id: ch.id, game: ch.game, gameName: X1.names[ch.game], at: ch.at, botAt: ch.at + F.botAfterSec * 1000, until: ch.at + F.challengeMaxSec * 1000 });
  await broadcastInvite(ch);
  await refreshOpenLists();
}

/**
 * (Na fila.) Alguém já está desafiando no jogo de hoje e dá para jogar com ele: vira partida na hora — primeiro
 * quem é de outro time (vale gol), só depois um colega de time (amistoso); o bot do motor pega gente antes de
 * outro bot. **Nunca ficam dois desafios abertos por causa de bot** (dono, 23/09/2026): bot esperando e outro bot
 * chegando = os dois jogam (antes, em metade das vezes, o segundo abria o dele); o que ainda sobra esperando é
 * quem não pode enfrentar — pessoa fora da cota dos bots (`botQuotaOk`) ou bloqueio —, e aí o bot não abre um
 * segundo desafio e, se quem abriu é gente, o bot que esperava desiste do dele.
 * Devolve o desafio aberto, ou null (casou, ou não abriu).
 */
async function casaOuAbre(conn) {
  if (conn.match || conn.challenge || (conn.ws && conn.ws.readyState !== conn.ws.OPEN)) return null; // (bot: sem tela)
  if (x1Drain()) { drainErr(conn); return null; }
  const game = x1Today().game;
  const waitingNow = [...challenges.values()].filter((ch) => ch.game === game)
    .sort((a, b) => sameTeamOf(a.from, conn) - sameTeamOf(b.from, conn) || (isAi(conn) ? isAi(a.from) - isAi(b.from) : 0) || a.at - b.at);
  for (const ch of waitingNow) {
    if (!challenges.has(ch.id)) continue;
    if (await compatible(ch.from, conn)) { await acceptChallenge(conn, ch.id); return null; }
  }
  if (conn.engine && [...challenges.values()].some((ch) => ch.game === game)) return null; // bot não abre o segundo
  const tutorial = await noPassoDoX1(conn.user.id).catch(() => false);
  if (conn.match || conn.challenge || x1Drain()) return null; // (mudou durante a espera)
  const ch = { id: nextId++, game, from: conn, at: Date.now(), shownTo: new Set() };
  ch.botTimer = setTimeout(() => send(conn.ws, { t: 'bot-offer' }), F.botAfterSec * 1000);
  ch.expireTimer = setTimeout(() => { if (challenges.has(ch.id)) { send(conn.ws, { t: 'expired', message: 'Ninguém aceitou o desafio. Tente de novo mais tarde.' }); cancelChallenge(ch, 'expirou'); } }, F.challengeMaxSec * 1000);
  // Tutorial, etapa do X1: ninguém aceitou em TUTORIAL.botAcceptSec → um bot aceita e joga como gente
  // (dono, 18/09/2026; vale gol, dinheiro e ranking como partida de verdade, e SÓ aqui no tutorial).
  if (tutorial) {
    ch.tutorTimer = setTimeout(() => botDoTutorialAceita(ch).catch((e) => console.error('[x1] bot do tutorial:', e.message)), TUTORIAL.botAcceptSec * 1000);
  }
  // Gente de verdade esperando: passados 5–30 s sem ninguém, um bot em sessão pode aceitar (dono, 20/09/2026)
  if (!isAi(conn) && botPicker) ch.botAcceptTimer = setTimeout(() => botAceita(ch).catch((e) => console.error('[x1] bot aceitando:', e.message)), betweenMs(BX.acceptDelaySec));
  challenges.set(ch.id, ch);
  conn.challenge = ch;
  // gente abriu e ficou bot esperando (é um que ela não podia enfrentar): o bot desiste, para não ficarem dois
  if (!isAi(conn)) for (const o of [...challenges.values()]) if (o !== ch && o.game === game && o.from.engine && !o.from.match) cancelChallenge(o, 'gente-esperando');
  return ch;
}

function cancelChallenge(ch, _why) {
  if (!challenges.has(ch.id)) return;
  challenges.delete(ch.id);
  clearTimeout(ch.botTimer); clearTimeout(ch.expireTimer); clearTimeout(ch.tutorTimer); clearTimeout(ch.botAcceptTimer);
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
    send(c.ws, { t: 'invite', id: ch.id, game: ch.game, gameName: X1.names[ch.game], from: playerView(ch.from), bet: treinoPorIp(ch.from, c) ? 0 : F.bet, seconds: F.inviteSec, sameTeam: !!sameTeamOf(ch.from, c), freeplay: treinoPorIp(ch.from, c) });
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
  for (const ch of challenges.values()) if (ch.from !== conn && (await compatible(ch.from, conn))) list.push({ ...challengeView(ch), sameTeam: !!sameTeamOf(ch.from, conn), freeplay: treinoPorIp(ch.from, conn) });
  send(conn.ws, { t: 'open', list });
}
async function refreshOpenLists() {
  for (const c of conns) if (c.mode === 'game' && !isAi(c) && !c.match && !c.challenge) await sendOpenList(c);
}

async function acceptChallenge(conn, id) {
  if (x1Drain()) return drainErr(conn);
  const ch = challenges.get(id);
  if (!ch) return send(conn.ws, { t: 'taken', message: 'Esse desafio já começou ou foi cancelado.' });
  if (conn.match || ch.from === conn) return;
  if (conn.challenge) cancelChallenge(conn.challenge, 'aceitou-outro');
  const problem = await canPlay(conn);
  if (problem) return err(conn, 'no-money', problem);
  if (await autoClientBlocked(conn)) return; // programa ligado direto no WebSocket: 1 partida a cada 20 min
  if (!challenges.has(id) || conn.match) return send(conn.ws, { t: 'taken', message: 'Esse desafio já começou ou foi cancelado.' });
  if (!(await compatible(ch.from, conn))) {
    if (isAi(ch.from)) return send(conn.ws, { t: 'taken', message: 'Esse desafio já começou ou foi cancelado.' }); // cota com os bots (lista velha)
    return err(conn, 'incompatible', 'Vocês não podem se enfrentar (mesma internet ou bloqueio).');
  }
  if (!challenges.has(id) || conn.match) return send(conn.ws, { t: 'taken', message: 'Esse desafio já começou ou foi cancelado.' });
  const a = ch.from, b = conn, game = ch.game;
  const treino = treinoPorIp(a, b); // mesma internet: joga sem aposta, sem gol e fora do ranking
  cancelChallenge(ch, 'aceito'); // sai da lista e fecha os convites (antes de qualquer espera: ninguém mais pega)
  const round = await currentRound().catch(() => null);
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      if (!treino) { // mesma internet = treino: ninguém paga nada
        const pa = await tx.user.updateMany({ where: { id: a.user.id, money: { gte: F.bet } }, data: { money: { decrement: F.bet } } });
        if (!pa.count) throw Object.assign(new Error('a'), { who: 'a' });
        const pb = await tx.user.updateMany({ where: { id: b.user.id, money: { gte: F.bet } }, data: { money: { decrement: F.bet } } });
        if (!pb.count) throw Object.assign(new Error('b'), { who: 'b' });
      }
      return tx.x1Match.create({ data: { game, seasonId: round?.seasonId ?? null, aId: a.user.id, bId: b.user.id, aTeamId: a.user.teamId, bTeamId: b.user.teamId, aIp: a.ip, bIp: b.ip, bet: treino ? 0 : F.bet } });
    });
  } catch (e) {
    if (e.who === 'a') { err(a, 'no-money', `Você precisa de R$ ${F.bet} para jogar.`); return send(b.ws, { t: 'taken', message: `${a.user.nick} ficou sem dinheiro para jogar.` }); }
    if (e.who === 'b') { // o desafio de quem esperava volta — sem esperar: estamos na fila e createChallenge entra nela
      err(b, 'no-money', `Você precisa de R$ ${F.bet} para jogar.`);
      createChallenge(a).catch((e2) => console.error('[x1] desafio de volta:', e2.message));
      return;
    }
    throw e;
  }
  const h2h = await headToHead(a.user.id, b.user.id).catch((e) => { console.error('[x1] retrospecto:', e.message); return null; });
  startMatch(a, b, row.id, game, h2h, row.aTeamId === row.bTeamId, treino); // mesmo time = amistoso; mesma internet = treino
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
  if (x1Drain()) return drainErr(conn);
  const game = conn.challenge?.game ?? x1Today().game;
  if (conn.challenge) cancelChallenge(conn.challenge, 'bot');
  const team = await randomTeamExcept(conn.user.teamId);
  const nick = `BOT ${BOT_NAMES[randomInt(BOT_NAMES.length)]}`;
  const bot = { ws: null, user: { id: -1, nick, avatarUrl: null, team, teamId: team.id }, ip: 'bot', bot: true, match: null, side: -1 };
  startMatch(conn, bot, null, game);
}

/**
 * Bot do TUTORIAL: um dos bots "quase reais" (services/bots.js) aceita o desafio e joga como se fosse gente.
 * Vale tudo — aposta, gol para quem ganha, gol a menos para quem perde e Ranking X1 (decisão do dono,
 * 18/09/2026: "jogar como se fosse uma pessoa real, pra dar a impressão que o jogo tá movimentado"). Só é
 * chamado para quem está na etapa do X1 do tutorial; fora dali o X1 segue como sempre.
 */
async function escolheBot(conn) {
  const bots = await prisma.user.findMany({
    where: {
      isBot: true, deletedAt: null, money: { gte: F.bet },
      teamId: { not: conn.user.teamId }, // time diferente: a partida vale gol
      OR: [{ bannedUntil: null }, { bannedUntil: { lt: new Date() } }],
    },
    include: { team: true },
  });
  const ocupado = (id) => busyUser(id) || [...matches.values()].some((m) => !m.done && m.conns.some((c) => c.user.id === id));
  const livres = bots.filter((b) => !ocupado(b.id));
  return livres.length ? livres[randomInt(livres.length)] : null;
}

async function botDoTutorialAceita(ch) {
  const a = ch.from;
  if (!challenges.has(ch.id) || a.match || x1Drain()) return;
  const bot = await escolheBot(a);
  if (!bot) return; // nenhum bot livre: o desafio segue esperando gente de verdade
  if (!challenges.has(ch.id) || a.match) return;
  // joga como gente e fraco de propósito (é o primeiro X1 do novato): skill na faixa de baixo de BOTS.x1.skill
  const b = { ws: null, ai: true, user: bot, ip: `bot:${bot.id}`, match: null, side: -1, seen: new Set(), mode: 'game', skill: BX.skill[0] + Math.random() * 0.1 };
  cancelChallenge(ch, 'bot-tutorial');
  const round = await currentRound().catch(() => null);
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const pa = await tx.user.updateMany({ where: { id: a.user.id, money: { gte: F.bet } }, data: { money: { decrement: F.bet } } });
      if (!pa.count) throw Object.assign(new Error('a'), { who: 'a' });
      const pb = await tx.user.updateMany({ where: { id: bot.id, money: { gte: F.bet } }, data: { money: { decrement: F.bet } } });
      if (!pb.count) throw Object.assign(new Error('b'), { who: 'b' });
      return tx.x1Match.create({ data: { game: ch.game, seasonId: round?.seasonId ?? null, aId: a.user.id, bId: bot.id, aTeamId: a.user.teamId, bTeamId: bot.teamId, aIp: a.ip, bIp: `bot:${bot.id}`, bet: F.bet } });
    });
  } catch (e) {
    if (e.who === 'a') return err(a, 'no-money', `Você precisa de R$ ${F.bet} para jogar.`);
    return createChallenge(a); // o bot não tinha dinheiro: o desafio dele volta para a fila
  }
  const h2h = await headToHead(a.user.id, bot.id).catch(() => null);
  startMatch(a, b, row.id, ch.game, h2h, false, false);
}

function startMatch(a, b, dbId, game, h2h = null, sameTeam = false, freeplay = false) {
  const first = randomInt(2);
  const m = { id: nextId++, dbId, game, conns: [a, b], bot: !!b.bot, sameTeam, freeplay, turn: first, turns: [0, 0], shots: [0, 0], timeouts: [0, 0], done: false, startedAt: Date.now(), busyUntil: 0, h2h };
  if (game === 'BOTAO') m.bs = newBotaoMatch(first);
  else if (game === 'FUTGOLF') m.fg = newFutgolfMatch(rnd01); // um buraco sorteado (e espelhado ou não) por partida
  else { m.board = BOARDS[randomInt(BOARDS.length)]; m.ball = { ...m.board.center }; } // FutPrego: um desenho de tábua por partida (ninguém decora a jogada)
  a.match = m; a.side = 0; b.match = m; b.side = 1; // quem desafiou fica embaixo no campo do servidor
  matches.set(m.id, m);
  if (game === 'BOTAO') scheduleSnap(m, 1500, false); else if (game === 'FUTGOLF') scheduleGolf(m, 1500, false); else scheduleTurn(m, 1500, false);
  for (const c of m.conns) sendMatch(c, false);
}

function sendMatch(c, resumed) {
  const m = c.match;
  const base = {
    t: 'match', id: m.id, game: m.game, gameName: X1.names[m.game], you: c.side, players: m.conns.map(playerView), turnEndsAt: m.turnEndsAt, bet: m.bot || m.freeplay ? 0 : F.bet, training: m.bot, sameTeam: !!m.sameTeam, freeplay: !!m.freeplay, resumed,
    oppXray: isXrayNick(c) && !!m.conns[1 - c.side].xray, // Raio-X do adversário (só as contas que podem usar ficam sabendo)
    // retrospecto contra ESTE adversário no X1, do ponto de vista de quem recebe (null no treino contra bot)
    h2h: m.h2h ? h2hOf(m.h2h, c.user.id) : null,
  };
  if (m.game === 'BOTAO') send(c.ws, { ...base, field: BOTAO_FIELD, botao: botaoView(m.bs), turn: m.bs.turn, snapSec: BOTAO.snapSec });
  else if (m.game === 'FUTGOLF') send(c.ws, { ...base, course: m.fg.course, fg: futgolfView(m.fg), kickSec: FUTGOLF.kickSec });
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
  if (isAi(cur)) m.botTimer = setTimeout(() => botPlay(m), delayMs + aiDelayMs(cur));
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
  if (scorer !== null) aiReactsToGoal(m, scorer, animMs);
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
  if (!isAi(m.conns[side])) return; // treino OU bot do tutorial (este joga valendo)
  const t = targetOf(side);
  const base = Math.atan2(t.y - m.ball.y, t.x - m.ball.x);
  const tries = [];
  // bot "quase real": olha mais jogadas (8) — com 4 e a skill 0,25–0,55 ele perdeu as 5 primeiras de FutPrego em
  // produção (20/09), e perder sempre também entrega o bot (e vira gol de graça)
  const ai = m.conns[side].ai;
  for (let i = 0; i < (ai ? 8 : 4); i++) {
    const ang = base + ((randomInt(1000) / 1000) - 0.5) * 0.8;
    const pw = 0.45 + (randomInt(550) / 1000);
    const r = simulateFlick(m.ball, Math.cos(ang), Math.sin(ang), pw, m.board, { closedGoals: m.shots[0] + m.shots[1] === 0 });
    const s = scorerOf(r.goal);
    tries.push({ ang, pw, score: s === side ? 1000 : s !== null ? -1000 : -Math.hypot(r.end.x - t.x, r.end.y - t.y) });
  }
  // treino: a melhor das 4 em 45% das vezes; bot "quase real": a melhor das 8 em 0,35 + skill (0,6–0,9), senão a
  // segunda melhor (nem sempre ganha, mas joga com intenção)
  const sorted = [...tries].sort((a, b) => b.score - a.score);
  const pick = ai ? (Math.random() < 0.35 + (m.conns[side].skill ?? 0.4) ? sorted[0] : sorted[1] ?? sorted[0]) : randomInt(100) < 45 ? sorted[0] : tries[0];
  playShot(m, side, Math.cos(pick.ang), Math.sin(pick.ang), pick.pw);
}

// ─── Futebol de Botão: 2 petelecos por vez num botão seu ────────────────────

/** Relógio do próximo peteleco (quem está na vez: m.bs.turn) depois de `delayMs` (a animação). */
function scheduleSnap(m, delayMs, announce = true, extra = {}) {
  clearTimeout(m.turnTimer); clearTimeout(m.botTimer);
  m.turnEndsAt = Date.now() + delayMs + BOTAO.snapSec * 1000;
  if (announce) for (const c of m.conns) send(c.ws, { t: 'bturn', botao: botaoView(m.bs), turnEndsAt: m.turnEndsAt, ...extra });
  m.turnTimer = setTimeout(() => timeoutSnap(m), delayMs + BOTAO.snapSec * 1000 + 800);
  if (isAi(m.conns[m.bs.turn])) m.botTimer = setTimeout(() => botSnap(m), delayMs + aiDelayMs(m.conns[m.bs.turn]));
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
  const fora = res.events.find((e) => e.t === 'out'); // death match: o botão que jogou saiu do campo
  const over = res.events.find((e) => e.t === 'over');
  for (const c of m.conns) send(c.ws, { t: 'snap', side, idx, frames: res.sim.frames, goal: goal ?? null, out: fora ?? null, botao: botaoView(m.bs) });
  if (goal) aiReactsToGoal(m, goal.side, animMs);
  if (over) {
    // resultado decidido (gol, empate no death match…): fica pendente até a animação acabar — desistir/cair agora não escapa dele
    m.pending = { winner: over.winner, reason: over.winner === null ? 'empate' : over.reason === 'gols' ? (goal?.own ? 'gol-contra' : 'gol') : over.reason };
    m.turnTimer = setTimeout(() => finish(m, m.pending), animMs + 900);
    return;
  }
  const morte = res.events.find((e) => e.t === 'deathmatch'); // acabou o tempo normal empatado
  scheduleSnap(m, animMs + (goal ? 1100 : morte ? 1400 : 350), true, morte ? { deathStart: true } : {});
}

function timeoutSnap(m) {
  if (m.done) return;
  const side = m.bs.turn;
  const events = skipSnap(m.bs);
  m.timeouts[side]++;
  for (const c of m.conns) send(c.ws, { t: 'bskip', side, botao: botaoView(m.bs) });
  if (m.timeouts[side] >= MAX_TIMEOUTS && m.bs.phase === 'play') return finish(m, { winner: 1 - side, reason: 'wo' });
  const over = events.find((e) => e.t === 'over');
  if (over) return finish(m, { winner: over.winner, reason: over.winner === null ? 'empate' : over.reason });
  scheduleSnap(m, 300, true, events.some((e) => e.t === 'deathmatch') ? { deathStart: true } : {});
}

function botSnap(m) {
  const c = m.conns[m.bs.turn];
  if (m.done || !isAi(c)) return; // treino OU bot "quase real"
  const mv = c.ai ? botaoHumanMove(m.bs, m.bs.turn, rnd01, c.skill ?? 0.4) : botaoBotMove(m.bs, m.bs.turn, rnd01, 0.45);
  if (!mv) return timeoutSnap(m);
  playSnap(m, m.bs.turn, mv.idx, mv.dx, mv.dy, mv.power);
}

// ─── Futgolf: os dois chutam ao mesmo tempo, uma rodada por vez ─────────────

/**
 * Abre a rodada depois de `delayMs` (a animação dos chutes da anterior): cada um que ainda joga tem FUTGOLF.kickSec
 * para chutar. Chute que chega antes de a rodada abrir é ignorado. Os bots (treino ou "quase reais") chutam depois
 * do tempo de pensar deles; quem já embocou não joga mais.
 */
function scheduleGolf(m, delayMs, announce = true, extra = {}) {
  clearTimeout(m.turnTimer); for (const t of m.botTimers ?? []) clearTimeout(t);
  m.botTimers = [];
  m.golfOpenAt = Date.now() + delayMs;
  m.turnEndsAt = m.golfOpenAt + FUTGOLF.kickSec * 1000;
  if (announce) for (const c of m.conns) send(c.ws, { t: 'ground', fg: futgolfView(m.fg), turnEndsAt: m.turnEndsAt, ...extra });
  m.turnTimer = setTimeout(() => timeoutGolf(m), delayMs + FUTGOLF.kickSec * 1000 + 800); // 0,8 s de folga para a internet
  for (const side of [0, 1]) if (isAi(m.conns[side]) && golfActive(m.fg, side)) m.botTimers.push(setTimeout(() => botGolf(m, side), delayMs + aiDelayMs(m.conns[side])));
}

function onGolfKick(conn, msg) {
  const m = conn.match;
  if (!m || m.done || m.game !== 'FUTGOLF' || Date.now() < (m.golfOpenAt ?? 0) - 300) return; // (a internet pode adiantar um pouco)
  const dx = Number(msg.dx), dy = Number(msg.dy), power = Number(msg.power), spin = Number(msg.spin ?? 0);
  if (![dx, dy, power, spin].every(Number.isFinite) || Math.hypot(dx, dy) < 1e-6) return;
  playGolf(m, conn.side, dx, dy, power, Math.max(-1, Math.min(1, Math.round(spin)))); // efeito: só os três botões
}

/** O chute vai na hora para as duas telas (quem chutou vê a bola andar; o outro vê o fantasma). */
function playGolf(m, side, dx, dy, power, spin) {
  const res = golfKick(m.fg, side, dx, dy, power, spin);
  if (!res) return; // já chutou nesta rodada, já embocou etc.
  m.shots[side]++; m.timeouts[side] = 0;
  m.turns = [m.shots[0], m.shots[1]];
  const animMs = Math.round((res.sim.frames.length * 1000) / 30);
  m.golfAnimEnd = Math.max(m.golfAnimEnd ?? 0, Date.now() + animMs);
  for (const c of m.conns) send(c.ws, { t: 'gshot', side, frames: res.sim.frames, events: res.sim.events, holed: res.sim.holed, water: res.sim.water, fg: futgolfView(m.fg) });
  if (res.sim.holed && m.fg.phase === 'play') aiReactsToGoal(m, side, animMs); // o bot ri quando emboca, fica bravo quando o outro emboca
  if (golfRoundDone(m.fg)) closeGolfRound(m);
}

/** Todos chutaram (ou o tempo acabou): fim, desempate ou próxima rodada — sempre depois da animação. */
function closeGolfRound(m) {
  clearTimeout(m.turnTimer); for (const t of m.botTimers ?? []) clearTimeout(t);
  m.botTimers = [];
  const wait = Math.max(0, (m.golfAnimEnd ?? 0) - Date.now());
  const r = golfCloseRound(m.fg);
  if (r.t === 'over') {
    // resultado decidido: fica pendente até a animação acabar — desistir/cair nesse meio-tempo não escapa dele
    m.pending = { winner: r.winner, reason: r.reason };
    m.turnTimer = setTimeout(() => finish(m, m.pending), wait + 1200);
    return;
  }
  scheduleGolf(m, wait + (r.t === 'tiebreak' ? 1800 : 700), true, r.t === 'tiebreak' ? { tiebreak: true } : {});
}

/** Acabou o tempo: quem não chutou perde o chute (conta 1 sem sair do lugar); 3 vezes seguidas = W.O. */
function timeoutGolf(m) {
  if (m.done) return;
  for (const side of [0, 1]) {
    if (!golfSkip(m.fg, side)) continue;
    m.timeouts[side]++;
    for (const c of m.conns) send(c.ws, { t: 'gskip', side, fg: futgolfView(m.fg) });
    if (m.timeouts[side] >= MAX_TIMEOUTS) return finish(m, { winner: 1 - side, reason: 'wo' });
  }
  closeGolfRound(m);
}

/** O lado do servidor chuta: treino joga bem (0,5); o bot "quase real" com a skill sorteada na visita. */
function botGolf(m, side) {
  const c = m.conns[side];
  if (m.done || !isAi(c) || !golfActive(m.fg, side) || m.fg.kicked[side]) return;
  const k = futgolfAiKick(m.fg, side, { skill: c.ai ? (c.skill ?? 0.4) : 0.5, rnd: rnd01 });
  playGolf(m, side, k.dx, k.dy, k.power, k.spin);
}

// ─── Queda, fim e dinheiro (iguais nos três jogos) ──────────────────────────

function takeOver(from, to) {
  to.xray = from.xray;
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

// ─── Raio-X (brincadeira do dono, 15/09/2026) ───────────────────────────────

// Só para estas contas (dono e colaborador): a tecla R na tela do X1 mostra a trajetória exata da mira antes de
// soltar. A física dos dois jogos é determinística, então o servidor
// simula a MESMA jogada que o peteleco de verdade faria e devolve o caminho da bola. Ninguém mais recebe nada
// (mensagem ignorada). **Os dois precisam saber quando o outro está com o Raio-X ligado** (dono, 15/09/2026): a tela
// avisa o servidor ao ligar/desligar (`xray`), o adversário — se for uma destas contas — vê o selo "RAIO-X" na barra
// (`xray-opp`, e `oppXray` na `match` de quem entra no meio). **Não avisa mais no Telegram** (dono,
// 19/09/2026: "faça o bot do telegram parar de notificar o RAIO X") — quem precisa saber já vê o selo na tela.
const XRAY_NICKS = new Set(['MVGIC', 'ericklesv']);
const isXrayNick = (c) => !!c && !c.bot && XRAY_NICKS.has(c.user.nick);
function onXray(conn, msg) {
  if (!isXrayNick(conn)) return;
  const on = !!msg.on;
  if (conn.xray === on) return;
  conn.xray = on;
  const m = conn.match;
  const opp = m && !m.done ? m.conns[1 - conn.side] : null;
  if (isXrayNick(opp)) send(opp.ws, { t: 'xray-opp', on });
}
function onPreview(conn, msg) {
  if (!isXrayNick(conn)) return;
  const m = conn.match;
  if (!m || m.done) return;
  const now = Date.now();
  if (now - (conn.previewAt ?? 0) < 60) return; // no máximo ~16 por segundo (a tela manda enquanto arrasta)
  conn.previewAt = now;
  const dx = Number(msg.dx), dy = Number(msg.dy), power = Number(msg.power);
  if (![dx, dy, power].every(Number.isFinite)) return;
  let path, goal, piece = null;
  if (m.game === 'BOTAO') {
    const idx = Number(msg.idx);
    if (m.bs.turn !== conn.side || !movablePieces(m.bs, conn.side).includes(idx)) return;
    const sim = simulateSnap(m.bs, idx, dx, dy, Math.max(0.05, Math.min(1, power)));
    path = sim.frames.map((f) => f[0]); goal = sim.goal;
    piece = sim.frames.map((f) => f[idx + 1]); // o caminho do botão que leva o peteleco
  } else if (m.game === 'FUTGOLF') {
    if (!golfActive(m.fg, conn.side) || m.fg.kicked[conn.side]) return;
    const r = simulateGolf(m.fg.course, m.fg.balls[conn.side], dx, dy, Math.max(0.03, Math.min(1, power)), Math.max(-1, Math.min(1, Math.round(Number(msg.spin) || 0))));
    path = r.frames; goal = r.holed ? 'buraco' : null;
  } else {
    if (m.turn !== conn.side) return;
    const r = simulateFlick(m.ball, dx, dy, power, m.board, { closedGoals: m.shots[0] + m.shots[1] === 0 });
    path = r.frames; goal = r.goal;
  }
  // 1 ponto a cada 2 quadros (1/15 s) já desenha a curva; o último fica sempre
  const thin = (pts) => pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  send(conn.ws, { t: 'preview', seq: msg.seq ?? 0, path: thin(path), piece: piece ? thin(piece) : null, goal: goal ?? null });
}

// ─── Provocar (pedido do dono, 15/09/2026) ──────────────────────────────────

/**
 * Careta ou frase pronta durante a partida, estilo Clash Royale. Só chaves de PROVOCAR.list; as marcadas `vip`
 * pedem VIP ativo (quem não é VIP fica com as 4 caras básicas — decisão do dono). Ritmo: 1 a cada gapMs (fora do
 * ritmo = ignorada, a tela já segura o botão); `burst` dentro de burstMs = punishMs de castigo (`provocar-wait`).
 * Vai para os DOIS lados — quem mandou vê o próprio balão pela volta do servidor, assim as duas telas ficam
 * iguais. Nada vai para o banco; silenciar é só na tela de quem silenciou. No treino, o bot responde com uma
 * sorteada (dá vida ao recurso e mostra as do VIP).
 */
async function onProvocar(conn, msg) {
  const m = conn.match;
  if (!m || m.done) return;
  const e = PROVOCAR_BY_KEY.get(String(msg.key));
  if (!e) return;
  if (e.vip) {
    // o VIP pode ter sido ativado (ou tirado pelo painel) com a tela do X1 aberta: a resposta é a do banco, não a
    // da conexão (uma consulta por provocação do VIP, no máximo 1 a cada 2 s por jogador)
    const fresh = await prisma.user.findUnique({ where: { id: conn.user.id }, select: { vipUntil: true } }).catch(() => null);
    if (fresh) conn.user.vipUntil = fresh.vipUntil;
    if (!isVip(conn.user)) return send(conn.ws, { t: 'error', code: 'vip', message: 'Essa provocação é só para VIP. Vire VIP e provoque à vontade!' });
  }
  if (!conn.match || conn.match !== m || m.done) return;
  const now = Date.now();
  if ((conn.provocarBlockedUntil ?? 0) > now) return;
  const recent = (conn.provocarAt ?? []).filter((t) => now - t < PROVOCAR.burstMs);
  if (recent.length && now - recent[recent.length - 1] < PROVOCAR.gapMs) return;
  recent.push(now); conn.provocarAt = recent;
  for (const c of m.conns) send(c.ws, { t: 'provocar', side: conn.side, key: e.key, at: now });
  if (recent.length >= PROVOCAR.burst) {
    conn.provocarBlockedUntil = now + PROVOCAR.punishMs; conn.provocarAt = [];
    send(conn.ws, { t: 'provocar-wait', until: conn.provocarBlockedUntil });
  }
  const opp = m.conns[1 - conn.side];
  if (opp.bot) { // treino: responde sempre e com qualquer uma (dá vida ao recurso e mostra as do VIP)
    clearTimeout(m.provocarTimer);
    m.provocarTimer = setTimeout(() => {
      if (m.done) return;
      const r = PROVOCAR.list[randomInt(PROVOCAR.list.length)];
      for (const c of m.conns) send(c.ws, { t: 'provocar', side: 1 - conn.side, key: r.key, at: Date.now() });
    }, 1200 + randomInt(900));
  } else if (opp.ai && Math.random() < BX.provocarReply) { // bot "quase real": às vezes devolve, sem pressa, só as caras básicas
    clearTimeout(m.provocarTimer);
    m.provocarTimer = setTimeout(() => aiProvocar(m, opp.side), 1500 + randomInt(3500));
  }
}

// ─── Bots "quase reais" no X1 (dono, 20/09/2026) ────────────────────────────

/** Só as 4 caras básicas (bot não é VIP — mandar frase de VIP entregaria o bot). */
const AI_PROVOCAR = PROVOCAR.list.filter((e) => !e.vip);
function aiProvocar(m, side, keys = null) {
  if (m.done) return;
  const pool = keys ? AI_PROVOCAR.filter((e) => keys.includes(e.key)) : AI_PROVOCAR;
  const r = pool[randomInt(pool.length)] ?? AI_PROVOCAR[0];
  for (const c of m.conns) send(c.ws, { t: 'provocar', side, key: r.key, at: Date.now() });
}
/** Saiu gol: o bot "quase real" às vezes ri do gol dele, ou faz raiva/choro do gol que tomou (mais raro). */
function aiReactsToGoal(m, scorer, animMs) {
  for (const c of m.conns) {
    if (!c.ai) continue;
    const scored = c.side === scorer;
    if (Math.random() >= (scored ? BX.provocarGoal : BX.provocarConceded)) continue;
    setTimeout(() => aiProvocar(m, c.side, scored ? ['risada'] : ['raiva', 'choro']), Math.max(600, animMs - 400) + randomInt(1200));
  }
}

/**
 * Cota de gente x bot (dono: "não o tempo todo com o Xumbera, faremos partidas mais espaçadas"): a MESMA pessoa
 * joga com os bots (todos somados) no máximo BOTS.x1.sameHumanDay vezes em 24 h e com BOTS.x1.sameHumanMin
 * minutos entre uma e outra. Conta pelas linhas de X1Match com `bot:<id>` no IP (tutorial incluído). Cache de 5 s.
 */
const quotaCache = new Map();
async function botQuotaOk(humanId) {
  const hit = quotaCache.get(humanId);
  if (hit && Date.now() - hit.at < 5000) return hit.ok;
  const rows = await prisma.x1Match.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) }, status: { not: 'CANCELED' }, OR: [{ aId: humanId, bIp: { startsWith: 'bot:' } }, { bId: humanId, aIp: { startsWith: 'bot:' } }] },
    select: { createdAt: true, finishedAt: true },
  });
  const last = Math.max(0, ...rows.map((r) => (r.finishedAt ?? r.createdAt).getTime()));
  const ok = rows.length < BX.sameHumanDay && Date.now() - last >= BX.sameHumanMin * 60_000;
  quotaCache.set(humanId, { at: Date.now(), ok });
  return ok;
}

const botVisits = new Map(); // userId -> conn do bot que está no X1 agora (motor: services/bots.js)

/**
 * Quem escolhe o bot que ACEITA um desafio de gente (dono, 20/09/2026): o motor (services/bots.js) registra aqui
 * uma função `(human) => { user, skill, done(result) } | null` — ele sabe quem está em sessão, quem descansou e quem
 * "topa". Sem motor registrado (testes sem bots), ninguém aceita.
 */
let botPicker = null;
export function setX1BotPicker(fn) { botPicker = fn; }

/** Passou o tempo e o desafio de gente segue aberto: um bot em sessão aceita (se a cota da pessoa deixar). */
async function botAceita(ch) {
  if (!challenges.has(ch.id) || ch.from.match || x1Drain() || !botPicker) return;
  if (!(await botQuotaOk(ch.from.user.id))) return; // já jogou com os bots o bastante por hoje / há pouco
  const picked = await botPicker(ch.from.user);
  if (!picked || !challenges.has(ch.id) || ch.from.match) return;
  const r = await x1BotVisit(picked.user, { skill: picked.skill, acceptOnly: ch.id });
  picked.done?.(r);
}
/** Quem está no X1 agora pelo motor (para o motor não passar de BOTS.x1.concurrent e para o status). */
export const x1BotsInside = () => [...botVisits.values()].map((c) => ({ id: c.user.id, nick: c.user.nick, since: c.since, playing: !!c.match, waiting: !!c.challenge }));

/**
 * Uma visita do bot ao X1 (motor em services/bots.js, dentro da sessão dele): se alguém de OUTRO time está
 * esperando, aceita (o desafio mais antigo primeiro); senão abre o desafio dele e espera `waitMs` — a tela dos
 * outros vê "Fulano está te desafiando", como qualquer jogador. Jogou (vale tudo: aposta, gol, gol a menos,
 * lances, retrospecto) ou cansou de esperar, sai. Devolve o que aconteceu: `{ played, won, draw, opponent,
 * matchId }` ou `{ played: false, why }`. Uma visita por bot; o motor escolhe quem e quando.
 */
export async function x1BotVisit(user, { skill = 0.4, waitMs = 5 * 60_000, acceptOnly = null } = {}) {
  if (botVisits.has(user.id) || busyUser(user.id)) return { played: false, why: 'ocupado' };
  if (x1Drain()) return { played: false, why: 'atualizacao' };
  const conn = { ws: null, ai: true, engine: true, user, ip: `bot:${user.id}`, mode: 'game', alive: true, match: null, side: -1, challenge: null, seen: new Set(), lastInviteAt: 0, skill, since: Date.now() };
  const problem = await canPlay(conn); // dinheiro, nível, conta (recarrega o user com o time)
  if (problem) return { played: false, why: problem };
  conns.add(conn); botVisits.set(user.id, conn);
  try {
    if (acceptOnly) { // veio só para ACEITAR este desafio (botAceita): casou ou vai embora
      await naFila(() => (challenges.has(acceptOnly) ? acceptChallenge(conn, acceptOnly) : null));
      if (!conn.match) return { played: false, why: 'nao-casou' };
    } else {
      // quem está esperando (gente de outro time primeiro, depois outro bot, por último colega de time) casa com ele
      // na hora; ninguém = abre o dele. Sobrou alguém que ele não pode enfrentar: vai embora sem abrir (casaOuAbre)
      await createChallenge(conn);
      if (!conn.match && !conn.challenge) return { played: false, why: 'sem-desafio' }; // cooldown de 2 min, já tem desafio etc.
    }
    // "online" enquanto está no X1 (fora da sessão de chutes o motor não anda o lastSeenAt)
    const online = () => prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    await online();
    let lastBeat = Date.now();
    const deadline = Date.now() + waitMs, hardStop = Date.now() + 20 * 60_000;
    while (Date.now() < hardStop) {
      await sleep(2000);
      if (Date.now() - lastBeat > 50_000) { lastBeat = Date.now(); await online(); }
      if (conn.match) continue; // jogando: espera acabar
      if (conn.lastResult || !conn.challenge || Date.now() >= deadline) break; // acabou / o desafio caiu / cansou
    }
    if (conn.lastResult) await sleep(betweenMs(BX.afterMatchSec)); // "lê o resultado" antes de sair
    return conn.lastResult ? { played: true, ...conn.lastResult } : { played: false, why: 'ninguem' };
  } finally {
    if (conn.challenge) cancelChallenge(conn.challenge, 'saiu');
    conns.delete(conn); botVisits.delete(user.id);
  }
}

/**
 * Cancela uma partida em andamento (atualização do jogo): a linha vira CANCELED (fora do ranking, do retrospecto e
 * dos lances), os dois recebem a aposta de volta e a tela mostra o motivo. Treino: só encerra.
 */
async function cancelMatch(m, reason) {
  if (m.done) return;
  m.done = true;
  clearTimeout(m.turnTimer); clearTimeout(m.botTimer); clearTimeout(m.provocarTimer); for (const t of m.botTimers ?? []) clearTimeout(t);
  for (const c of m.conns) clearTimeout(c.dropTimer);
  matches.delete(m.id);
  if (!m.bot && m.dbId) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.x1Match.updateMany({ where: { id: m.dbId, status: 'PLAYING' }, data: { status: 'CANCELED', reason, finishedAt: new Date() } });
      if (count && !m.freeplay) await tx.user.updateMany({ where: { id: { in: [m.conns[0].user.id, m.conns[1].user.id] } }, data: { money: { increment: F.bet } } });
    });
  }
  for (const c of m.conns) {
    if (isAi(c)) { c.match = null; c.side = -1; continue; } // quem é jogado pelo servidor não tem tela para receber isto
    const msg = {
      t: 'over', game: m.game, winner: null, reason, you: c.side, training: m.bot, players: m.conns.map(playerView), score: m.bs?.score ?? null,
      money: m.bot || m.freeplay ? 0 : F.bet, refund: !m.bot && !m.freeplay, canceled: true, why: reason,
      text: m.bot || m.freeplay ? 'Treino interrompido: o JogaGol está sendo atualizado.' : `Partida cancelada: o JogaGol está sendo atualizado. Os ${F.bet} da aposta voltaram e nada contou.`,
    };
    if (c.ws && c.ws.readyState === c.ws.OPEN) send(c.ws, msg); else lastOver.set(c.user.id, { at: Date.now(), msg });
    c.match = null; c.side = -1;
  }
  refreshOpenLists().catch(() => {});
}

async function finish(m, result) {
  if (m.done) return;
  m.done = true;
  clearTimeout(m.turnTimer); clearTimeout(m.botTimer); clearTimeout(m.provocarTimer); for (const t of m.botTimers ?? []) clearTimeout(t);
  for (const c of m.conns) clearTimeout(c.dropTimer);
  matches.delete(m.id);
  let info = null, h2h = null;
  if (!m.bot) {
    try { info = await settle(m, result); } catch (e) { console.error('[x1] falha ao fechar a partida', e); info = { error: true }; }
    if (!info.error) h2h = await headToHead(m.conns[0].user.id, m.conns[1].user.id).catch((e) => { console.error('[x1] retrospecto no fim:', e.message); return null; });
  }
  for (const c of m.conns) {
    if (isAi(c)) { // quem é jogado pelo servidor não tem tela para receber isto; o motor lê `lastResult`
      if (c.engine) c.lastResult = { won: result.winner === c.side, draw: result.winner === null, reason: result.reason, opponent: m.conns[1 - c.side].user.nick, matchId: m.dbId, counted: !!(info && !info.error && info.goal) };
      c.match = null; c.side = -1;
      continue;
    }
    // partida de verdade que fechou: quem não é VIP espera challengeCooldownSec para desafiar de novo
    const cd = !m.bot && info && !info.error ? { cooldownUntil: isVip(c.user) ? null : Date.now() + F.challengeCooldownSec * 1000 } : {};
    const msg = {
      t: 'over', game: m.game, winner: result.winner, reason: result.reason, you: c.side, training: m.bot, players: m.conns.map(playerView),
      score: m.bs?.score ?? null, golf: m.fg ? { ...futgolfView(m.fg), hole: m.fg.course.name } : undefined,
      ...personal(info, m, c.side, result), ...rivalry(h2h, m, c), ...cd,
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
  if (m.freeplay) return { money: 0, pot: 0, goal: false, why: 'mesma-internet', text: 'Vocês estão na mesma internet: valeu pela diversão — sem aposta, sem gol e fora do Ranking X1.' };
  if (!info || info.error) return { money: 0, text: 'Não deu para registrar a partida. Se o dinheiro sumiu, fale com o suporte.' };
  if (info.refund) return { money: F.bet, refund: true, why: info.why };
  const won = result.winner === side;
  return {
    money: won ? info.pot : 0, pot: info.pot, goal: info.goal, why: info.why ?? null,
    goalText: won ? info.goalText ?? null : null, lost: info.lost ?? false, lostTeam: info.lostTeam ?? null, remaining: info.remaining ?? null,
    lossLimit: !won && !!info.lossLimit, // o perdedor já tinha jogado as 10 partidas da hora que valem gol: não tirou gol
  };
}

/**
 * Fecha a partida no banco (uma vez só: só a linha PLAYING vira FINISHED). Empate = devolve a aposta.
 * **W.O. e desistência são SEMPRE derrota de quem saiu** (decisão do dono, 15/09/2026: jogadores fechavam o app
 * ou desistiam ao ver que iam perder e, antes de cada um jogar 2 vezes, a aposta voltava e nada contava — o
 * "W.O. cedo" acabou; as linhas antigas `wo-cedo` ficam no histórico e fora do ranking). Vitória: o vencedor leva o pote.
 * **Só as `maxGoalsPerHour` (10) primeiras partidas válidas de CADA jogador na hora cheia de Brasília mexem no placar**
 * (dono, 15/09/2026 — antes eram dois contadores separados, 10 vitórias com gol e 10 derrotas, e quem jogava muito
 * terminava a hora no zero a zero): empate gasta uma das 10; revanche repetida (`repeated`) e amistoso não. Cada um
 * conta as suas: vitória dentro das 10 do vencedor = 1 gol para o time dele; derrota dentro das 10 do perdedor = o
 * time dele perde 1 gol na partida da rodada (nunca abaixo de 0). Da 11ª em diante, até a hora virar, só dinheiro.
 * Ganhar do mesmo adversário duas vezes SEGUIDAS (sem outra partida do vencedor no meio) = revanche repetida: sem gol,
 * sem tirar gol e fora das 10 dos dois. Todo resultado que conta vai para os Lances ao vivo; o Ranking X1
 * (services/x1.js: 3 por vitória, 1 por empate, −2 por derrota) conta toda partida que terminou, menos W.O. cedo
 * e amistoso. **Amistoso (os dois do mesmo time, `m.sameTeam`)**: o vencedor leva o pote e mais nada — nenhum
 * gol ganho ou tirado, e ele não entra nas travas por hora nem na regra da mesma dupla.
 */
async function settle(m, result) {
  const [a, b] = m.conns;
  const now = new Date();
  const label = X1.names[m.game];
  const score = m.bs ? { scoreA: m.bs.score[0], scoreB: m.bs.score[1] }
    : m.fg ? { scoreA: m.fg.strokes[0], scoreB: m.fg.strokes[1] } // Futgolf: chutes de cada um
      : { scoreA: result.winner === 0 ? 1 : 0, scoreB: result.winner === 1 ? 1 : 0 };
  return prisma.$transaction(async (tx) => {
    const closed = await tx.x1Match.updateMany({ where: { id: m.dbId, status: 'PLAYING' }, data: { status: 'FINISHED', finishedAt: now, turns: m.shots[0] + m.shots[1], reason: result.reason, ...score } });
    if (!closed.count) return { error: true };
    // todo resultado que conta vai para os Lances ao vivo (pedido do dono, 15/09/2026); W.O. cedo (aposta devolvida) não
    const feed = (user, text) => tx.activity.create({ data: { userId: user.id, teamId: user.teamId, kind: m.game, goal: false, text } });
    if (m.freeplay) { // mesma internet: só diversão — nada de dinheiro, gol ou ranking
      if (result.winner !== null) await tx.x1Match.update({ where: { id: m.dbId }, data: { winnerId: m.conns[result.winner].user.id } });
      return { pot: 0, goal: false, why: 'mesma-internet' };
    }
    if (result.winner === null) {
      await tx.user.updateMany({ where: { id: { in: [a.user.id, b.user.id] } }, data: { money: { increment: F.bet } } });
      await feed(a.user, m.game === 'BOTAO'
        ? `${a.user.nick} e ${b.user.nick} empataram no ${label}, até nos pênaltis: aposta devolvida.`
        : m.game === 'FUTGOLF'
          ? `${a.user.nick} e ${b.user.nick} empataram no ${label}, até nos desempates: aposta devolvida.`
          : `${a.user.nick} e ${b.user.nick} empataram no ${label}: ninguém marcou em ${F.maxTurns} jogadas, aposta devolvida.`);
      return { refund: true, why: 'empate' };
    }
    const w = m.conns[result.winner], l = m.conns[1 - result.winner];
    const pot = F.bet * 2;
    const how = { 'gol-contra': ' (gol contra dele)', wo: ' por W.O.', desistiu: ' (ele desistiu)', desempate: ' no desempate' }[result.reason]
      ?? (m.fg && result.reason === 'buraco' ? ` no buraco ${m.fg.course.name} (${m.fg.strokes[result.winner]} chute${m.fg.strokes[result.winner] === 1 ? '' : 's'})` : '');
    await tx.user.update({ where: { id: w.user.id }, data: { money: { increment: pot } } });
    await tx.x1Match.update({ where: { id: m.dbId }, data: { winnerId: w.user.id } });
    if (m.sameTeam) {
      await feed(w.user, `${w.user.nick} venceu ${l.user.nick} no ${label}${how} e levou R$ ${pot} (amistoso do ${w.user.team?.name ?? 'mesmo time'}: sem gol).`);
      return { pot, goal: false, why: 'mesmo-time' };
    }
    // revanche repetida ANTES das 10 da hora (dono, 15/09/2026: "não gasta, já que não conta gol"). "Duas vezes
    // seguidas" = a partida ANTERIOR do vencedor (das que contam: amistoso, W.O. cedo e cancelada não) foi contra este
    // mesmo adversário e ele ganhou também; jogou com outra pessoa no meio, a sequência quebrou (bug de 15/09/2026:
    // olhava só o último confronto dos dois, mesmo com dezenas de partidas no meio).
    const prev = await tx.x1Match.findFirst({
      where: { AND: [X1_COUNTED, { id: { not: m.dbId } }, { OR: [{ aId: w.user.id }, { bId: w.user.id }] }] },
      orderBy: { id: 'desc' }, select: { aId: true, bId: true, winnerId: true },
    });
    if (prev && (prev.aId === l.user.id || prev.bId === l.user.id) && prev.winnerId === w.user.id) {
      await tx.x1Match.update({ where: { id: m.dbId }, data: { repeated: true } }); // fica fora das 10 da hora dos dois
      await feed(w.user, `${w.user.nick} venceu ${l.user.nick} no ${label}${how} e levou R$ ${pot} (revanche repetida: sem gol).`);
      return { pot, goal: false, why: 'repetido' };
    }

    // as 10 primeiras partidas válidas de CADA um na hora cheia de Brasília (empate gasta; repetida e amistoso não)
    const since = hourStart(now);
    const usedThisHour = (uid) => tx.x1Match.count({ where: { AND: [X1_COUNTED, { id: { not: m.dbId }, repeated: false, finishedAt: { gte: since } }, { OR: [{ aId: uid }, { bId: uid }] }] } });
    const wUsed = await usedThisHour(w.user.id), lUsed = await usedThisHour(l.user.id);
    const wCounts = wUsed < F.maxGoalsPerHour, lCounts = lUsed < F.maxGoalsPerHour;

    let text = null;
    if (wCounts) {
      const winner = await loadUser(tx, w.user.id);
      const live = await liveMatchForTeam(winner.teamId, tx);
      ({ text } = await applyResult(tx, winner, { kind: m.game, goal: true, now, match: live, money: 0, phrase: `venceu ${l.user.nick} no ${label}${how}` }));
    } else {
      await feed(w.user, `${w.user.nick} venceu ${l.user.nick} no ${label}${how} e levou R$ ${pot} (já jogou as ${F.maxGoalsPerHour} partidas desta hora que valem gol).`);
    }
    // derrota dentro das 10 do perdedor: o time dele perde 1 gol na partida da rodada (nunca abaixo de 0)
    const loser = await tx.user.findUnique({ where: { id: l.user.id }, include: { team: true } });
    let lost = null;
    const lm = lCounts ? await liveMatchForTeam(loser.teamId, tx) : null;
    if (lm) {
      const field = lm.homeTeamId === loser.teamId ? 'homeGoals' : 'awayGoals';
      const { count } = await tx.match.updateMany({ where: { id: lm.id, status: 'LIVE', [field]: { gt: 0 } }, data: { [field]: { decrement: 1 } } });
      if (count) lost = { matchId: lm.id, teamId: loser.teamId };
    }
    await tx.x1Match.update({ where: { id: m.dbId }, data: { goalAwarded: wCounts, lostMatchId: lost?.matchId ?? null, lostTeamId: lost?.teamId ?? null } });
    await tx.activity.create({
      data: {
        userId: loser.id, teamId: loser.teamId, kind: m.game, goal: false,
        text: lost ? `${loser.team.name} perdeu 1 gol: ${loser.nick} perdeu para ${w.user.nick} no ${label}.` : `${loser.nick} perdeu para ${w.user.nick} no ${label}.`,
      },
    });
    return {
      pot, goal: wCounts, goalText: text, why: wCounts ? null : 'limite', lost: !!lost, lostTeam: loser.team.name,
      lossLimit: !lCounts, remaining: Math.max(0, F.maxGoalsPerHour - wUsed - 1), // partidas que ainda valem gol nesta hora
    };
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
