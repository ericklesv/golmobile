/**
 * Bots "quase reais" no X1 (dono, 20/09/2026), ponta a ponta contra a API LOCAL rodando (TX_API, padrão
 * http://localhost:4320) com `X1_JOGO=BOTAO` e `ADMIN_KEY` no .env dela.
 *
 * O que ele prova:
 *  1. O bot mandado ao X1 abre um desafio que a tela de gente vê (lista `open` e convite no lobby) SEM marca de bot.
 *  2. Alguém aceita e a partida é de verdade: aposta cobrada dos dois, linha em X1Match com `bot:<id>` no IP.
 *  3. O bot JOGA e demora como gente: cada peteleco dele sai entre BOTS.x1.thinkSec (3 a 8 s) depois da vez.
 *  4. A partida fecha (FINISHED, vencedor, dinheiro) e o bot vai embora (ninguém mais no X1).
 *  5. Cota: a MESMA pessoa não pega os bots de novo em seguida (o desafio novo do bot não aparece para ela).
 *  6. Ranking X1: o bot aparece, mas nunca é `eligible` para prêmio (e não recebe `need`).
 *
 * Uso (na pasta api/, com a API local no ar):
 *   node scripts/test-bots-x1.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-bots-x1.js só roda no banco LOCAL (cria jogador e bot de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
const { prisma } = await import('../src/prisma.js');
const { FUTPREGO: F, BOTS } = await import('../src/lib/rules.js');
const { config } = await import('../src/config.js');

const API = process.env.TX_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
const ADMIN = process.env.ADMIN_KEY;
if (!ADMIN) { console.error('ADMIN_KEY não está no .env local.'); process.exit(1); }
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = (path, body) => fetch(`${API}/api/admin${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

const status = await fetch(`${API}/api/x1/status`).then((r) => r.json()).catch(() => null);
if (!status) { console.error(`API local não respondeu em ${API}.`); process.exit(1); }
if (status.today?.game !== 'BOTAO') { console.error('Este teste precisa de X1_JOGO=BOTAO no .env da API local.'); process.exit(1); }

// ── contas de teste: um bot (time A) e uma pessoa (time B), com dinheiro
const [teamA, teamB] = await prisma.team.findMany({ take: 2, orderBy: { id: 'asc' } });
const stamp = Date.now() % 1e6;
const botNick = `bx${stamp}`;
const bot = await prisma.user.create({
  data: { nick: botNick, nickLower: botNick, email: `${botNick}@bots.jogagol.com.br`, passwordHash: await bcrypt.hash('x', 4), teamId: teamA.id, money: 1000, isBot: true, botJson: { persona: { profile: 'regular', x1: 1 } }, tutorialStep: -1 },
});
const mk = async (nick) => prisma.user.create({ data: { nick, nickLower: nick, email: `${nick}@local.test`, passwordHash: 'x', teamId: teamB.id, money: 1000, tutorialStep: -1 } });
const gente = await mk(`tx${stamp}`);
const outro = await mk(`ty${stamp}`);
const tokenOf = (u) => jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' });

/** Conexão de tela: guarda tudo que chega. */
function tela(u, mode, ip) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(tokenOf(u))}&mode=${mode}`, { headers: { 'X-Real-IP': ip } });
  const msgs = [];
  ws.on('message', (raw) => { try { const m = JSON.parse(raw.toString()); m._at = Date.now(); msgs.push(m); } catch {} });
  const espera = async (pred, segundos) => {
    for (let i = 0; i < segundos * 10; i++) { const m = msgs.find(pred); if (m) return m; await sleep(100); }
    return null;
  };
  return { ws, msgs, espera, send: (m) => ws.send(JSON.stringify(m)) };
}

try {
  // ── 1. o bot entra e desafia; a tela de gente vê o desafio como se fosse de qualquer jogador
  const lobby = tela(outro, 'lobby', '198.51.100.9');
  await lobby.espera((m) => m.t === 'hello', 5);
  const r1 = await admin('/x1/bot', { nick: botNick, waitSec: 120, skill: 0.5 });
  check(r1.started === true, `o admin mandou o bot ${botNick} ao X1`);
  await sleep(1500);
  const dentro = await admin('/x1/bots');
  check(dentro.inside?.some((b) => b.id === bot.id && b.waiting), 'o bot está no X1 com o desafio aberto');
  const convite = await lobby.espera((m) => m.t === 'invite', 5);
  check(!!convite && convite.from?.nick === botNick && convite.from?.bot === false, 'a tela com abas recebeu "Fulano está te desafiando" sem marca de bot');

  const eu = tela(gente, 'game', '198.51.100.77');
  await eu.espera((m) => m.t === 'hello', 5);
  const lista = await eu.espera((m) => m.t === 'open' && m.list?.length, 5);
  check(!!lista && lista.list.some((c) => c.from.nick === botNick), 'a tela do X1 lista o desafio do bot');

  // ── 2. aceita: partida de verdade
  eu.send({ t: 'accept', id: lista.list.find((c) => c.from.nick === botNick).id });
  const partida = await eu.espera((m) => m.t === 'match', 5);
  check(!!partida && partida.training === false && partida.bet === F.bet, `a partida vale de verdade (aposta R$ ${partida?.bet})`);
  const linha = await prisma.x1Match.findFirst({ where: { OR: [{ aId: bot.id }, { bId: bot.id }] }, orderBy: { id: 'desc' } });
  check(!!linha && linha.aIp === `bot:${bot.id}` && linha.bet === F.bet, 'X1Match gravada com bot:<id> no IP e a aposta');
  const [gb, bb] = await Promise.all([prisma.user.findUnique({ where: { id: gente.id } }), prisma.user.findUnique({ where: { id: bot.id } })]);
  check(gb.money === 1000 - F.bet && bb.money === 1000 - F.bet, 'a aposta saiu dos dois');

  // ── 3. joga: eu bato qualquer coisa na minha vez; o bot demora 3–8 s na dele
  const botSide = 1 - partida.you;
  const thinks = [];
  let over = null;
  const t0 = Date.now();
  while (!over && Date.now() - t0 < 240_000) {
    await sleep(150);
    over = eu.msgs.find((m) => m.t === 'over');
    if (over) break;
    // minha vez e a bola parada: bato num botão meu, para o gol
    const turno = [...eu.msgs].reverse().find((m) => m.t === 'bturn' || m.t === 'match' || m.t === 'snap');
    const st = turno?.botao;
    if (!st || st.turn !== partida.you || turno._jogado) continue;
    const anim = turno.t === 'snap' ? (turno.frames?.length ?? 0) * 34 + 400 : 0;
    if (Date.now() - turno._at < anim) continue;
    const idx = st.pieces.findIndex((p) => p.side === partida.you && !p.gk);
    const alvoY = partida.you === 0 ? -50 : 99999;
    eu.send({ t: 'snap', idx, dx: 0, dy: alvoY < 0 ? -1 : 1, power: 0.7 });
    turno._jogado = true;
    await sleep(600);
  }
  // tempo do bot: da vez dele (bturn com turn = botSide, ou início) até o snap dele
  for (const m of eu.msgs) {
    if (m.t === 'snap' && m.side === botSide) {
      const antes = [...eu.msgs].reverse().find((x) => x._at < m._at && ((x.t === 'bturn' && x.botao?.turn === botSide) || (x.t === 'match' && x.turn === botSide) || (x.t === 'snap' && x.side === botSide && x !== m)));
      if (antes) thinks.push((m._at - antes._at) / 1000);
    }
  }
  console.log(`     petelecos do bot: ${thinks.length}, tempo até bater: ${thinks.map((s) => s.toFixed(1)).join(', ')} s`);
  check(thinks.length >= 1, 'o bot jogou (mandou peteleco)');
  const [tmin, tmax] = BOTS.x1.thinkSec;
  // a vez seguinte de um mesmo peteleco inclui a animação (até ~2 s); o 1º da partida tem 1,5 s de espera
  check(thinks.every((s) => s >= tmin - 0.3 && s <= tmax + 3.5), `todo peteleco do bot saiu entre ~${tmin} e ~${tmax} s (nem na hora, nem no limite)`);
  check(!!over, 'a partida acabou');
  if (over) {
    check(over.training === false && over.players?.[botSide]?.bot === false, 'o fim mostra o bot como jogador normal');
    const fim = await prisma.x1Match.findUnique({ where: { id: linha.id } });
    check(fim.status === 'FINISHED' && fim.winnerId !== undefined, `X1Match fechou: ${fim.reason}, vencedor ${fim.winnerId === bot.id ? 'bot' : fim.winnerId === gente.id ? 'eu' : 'ninguém'}`);
    const bd = await prisma.user.findUnique({ where: { id: bot.id } });
    check(fim.winnerId !== bot.id || bd.money === 1000 + F.bet, 'ganhou o bot = ele levou o pote (ou não ganhou)');
  }

  // ── 4. o bot vai embora
  await sleep(BOTS.x1.afterMatchSec[1] * 1000 + 3000);
  const depois = await admin('/x1/bots');
  check(!depois.inside?.some((b) => b.id === bot.id), 'depois da partida o bot saiu do X1');

  // ── 5. cota: o bot entra de novo, mas para MIM (que acabei de jogar com bot) o desafio não aparece
  await sleep(F.challengeCooldownSec * 1000 + 1500); // bot não é VIP: 2 min para desafiar de novo
  const r2 = await admin('/x1/bot', { nick: botNick, waitSec: 30, skill: 0.5 });
  check(r2.started === true, 'o bot foi mandado de novo ao X1');
  await sleep(2000);
  const de2 = await admin('/x1/bots');
  check(de2.inside?.some((b) => b.id === bot.id && b.waiting), 'o desafio novo do bot está aberto');
  const eu2 = tela(gente, 'game', '198.51.100.77');
  await eu2.espera((m) => m.t === 'hello', 5);
  const lista2 = await eu2.espera((m) => m.t === 'open', 5);
  check(!!lista2 && !lista2.list.some((c) => c.from.nick === botNick), 'para quem acabou de jogar com bot, o desafio do bot NÃO aparece (cota de 45 min)');
  const outroGame = tela(outro, 'game', '198.51.100.9');
  await outroGame.espera((m) => m.t === 'hello', 5);
  const lista3 = await outroGame.espera((m) => m.t === 'open' && m.list?.length, 5);
  check(!!lista3 && lista3.list.some((c) => c.from.nick === botNick), 'para outra pessoa, o desafio do bot aparece');
  eu2.ws.close(); outroGame.ws.close();

  // ── 6. ranking: o bot aparece e nunca é elegível a prêmio
  const rk = await fetch(`${API}/api/rankings/x1-rodada`).then((r) => r.json());
  const rows = Array.isArray(rk) ? rk : rk.rows ?? rk.list ?? [];
  const linhaBot = rows.find((r) => r.nick === botNick);
  check(!!linhaBot, 'o bot aparece no Ranking X1 da rodada');
  check(!linhaBot || (linhaBot.fp.eligible === false && linhaBot.fp.need === undefined && !linhaBot.fp.prize), 'o bot nunca é elegível a prêmio (e sem "faltam N partidas")');
  check(!('isBot' in (linhaBot || {})), 'isBot não vai para a tela');

  eu.ws.close(); lobby.ws.close();
} finally {
  await sleep(500);
  await prisma.activity.deleteMany({ where: { userId: { in: [bot.id, gente.id, outro.id] } } }).catch(() => {});
  await prisma.x1Match.deleteMany({ where: { OR: [{ aId: bot.id }, { bId: bot.id }] } }).catch(() => {});
  await prisma.goal.deleteMany({ where: { userId: { in: [bot.id, gente.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [bot.id, gente.id, outro.id] } } }).catch((e) => console.error('limpeza:', e.message));
}
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
