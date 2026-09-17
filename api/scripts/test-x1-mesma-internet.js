/**
 * X1 entre duas contas na MESMA INTERNET (dono, 17/09/2026: "libere, às vezes as pessoas só querem se
 * divertir um pouco"). Antes o desafio nem aparecia; agora vale, mas como TREINO:
 *   - os dois se enfrentam normalmente (o desafio aparece e dá para aceitar);
 *   - ninguém paga a aposta e ninguém ganha dinheiro;
 *   - não vale gol para o time nem ponto no Ranking X1 (X1_COUNTED ignora `aIp = bIp`).
 *
 * Uso (pasta api/, com a API LOCAL de pé em 4320 e X1_JOGO=BOTAO, SEM FUTPREGO_MESMO_IP):
 *   PORT=4320 X1_JOGO=BOTAO node src/index.js
 *   node scripts/test-x1-mesma-internet.js
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
if (process.env.FUTPREGO_MESMO_IP === '1') { console.error('rode a API SEM FUTPREGO_MESMO_IP: é ele que faz a mesma internet valer como partida de verdade.'); process.exit(1); }
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { config } = await import('../src/config.js');
const { botaoBotMove } = await import('../src/lib/botaoMatch.js');
const { x1Record } = await import('../src/services/x1.js');

const API = process.env.FP_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
const IP = '203.0.113.77'; // a MESMA internet para os dois
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(`${API}/api/health`)).ok) break; } catch {} await sleep(500); }
const status = await (await fetch(`${API}/api/x1/status`)).json();
if (status.today?.game !== 'BOTAO') { console.error('suba a API com X1_JOGO=BOTAO'); process.exit(1); }

let seq = 0;
async function mkUser(team, money = 5000) {
  const nick = `mi${Date.now() % 1e5}${seq++}`;
  const t = await prisma.team.findUnique({ where: { slug: team } });
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@local.test`, passwordHash: 'x', teamId: t.id, money, vipUntil: new Date(Date.now() + 86_400_000) } });
  return { ...u, token: jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' }) };
}
const dinheiro = async (u) => (await prisma.user.findUnique({ where: { id: u.id } })).money;
function phone(user, mode) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(user.token)}&mode=${mode}`, { headers: { 'X-Real-IP': IP } });
  const box = [], waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(m); } else box.push(m);
  });
  return {
    ws, user, open: new Promise((r) => ws.on('open', r)), send: (m) => ws.send(JSON.stringify(m)),
    wait(t, ms = 9000) {
      const pred = (m) => m.t === t;
      const i = box.findIndex(pred);
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((resolve) => { const w = { pred, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); resolve(null); }, ms) }; waiters.push(w); });
    },
    close: () => ws.close(),
  };
}
let seed = 777; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// ── dois jogadores de times DIFERENTES (para provar que o que segura é o IP), na mesma internet
const A = await mkUser('nautico'), B = await mkUser('bahia');
const lobB = phone(B, 'lobby'); await lobB.open;
const pa = phone(A, 'game'); await pa.open; await sleep(300);
pa.send({ t: 'challenge' });
const waiting = await pa.wait('waiting', 9000);
check(!!waiting, 'A conseguiu abrir o desafio');
const convite = await lobB.wait('invite', 4000);
check(!!convite && convite.freeplay === true && convite.bet === 0, `o convite CHEGA para quem está na mesma internet e avisa que é treino (aposta ${convite?.bet})`);

const pb = phone(B, 'game'); await pb.open; await sleep(200);
const lista = await pb.wait('open', 4000);
check(!!lista?.list?.some((c) => c.id === waiting.id && c.freeplay), 'o desafio aparece na lista do X1 marcado como treino');

pb.send({ t: 'accept', id: waiting.id });
const ma = await pa.wait('match', 9000), mb = await pb.wait('match', 9000);
check(!!ma && !!mb, 'a partida COMEÇA (antes de 17/09 o desafio nem aparecia)');
check(ma?.freeplay === true && ma?.bet === 0, 'a tela recebe: treino, sem aposta');
check((await dinheiro(A)) === 5000 && (await dinheiro(B)) === 5000, 'ninguém pagou aposta');

// ── joga até acabar
const fones = { [ma.you]: pa, [mb.you]: pb };
let bv = ma.botao, voltas = 0;
while (!bv.over && voltas++ < 60) {
  const side = bv.turn;
  const mv = botaoBotMove({ phase: bv.phase, pieces: bv.pieces, ball: bv.ball, turn: side, over: null }, side, rnd, 1);
  if (!mv) break;
  fones[side].send({ t: 'snap', idx: mv.idx, dx: mv.dx, dy: mv.dy, power: mv.power });
  const snap = await pa.wait('snap', 12000); await pb.wait('snap', 12000);
  if (!snap) break;
  bv = snap.botao;
  await sleep((snap.frames.length * 1000) / 30 + (snap.goal ? 1200 : 400));
}
const oa = await pa.wait('over', 12000), ob = await pb.wait('over', 12000);
check(!!oa && !!ob, `a partida terminou ("${oa?.reason}")`);
check(oa?.why === 'mesma-internet' && ob?.why === 'mesma-internet', 'os dois recebem o motivo "mesma internet"');
check(oa?.money === 0 && ob?.money === 0 && !oa?.goal && !ob?.goal, 'ninguém levou dinheiro nem gol');
check((await dinheiro(A)) === 5000 && (await dinheiro(B)) === 5000, 'o dinheiro dos dois continua igual ao do começo');

const row = await prisma.x1Match.findFirst({ where: { OR: [{ aId: A.id }, { bId: A.id }] }, orderBy: { id: 'desc' } });
check(row?.status === 'FINISHED' && row.bet === 0 && !row.goalAwarded, `gravada com aposta 0 e sem gol (placar ${row?.scoreA} x ${row?.scoreB})`);
const campA = await x1Record(A.id);
check((campA?.total?.played ?? 0) === 0 && (campA?.total?.points ?? 0) === 0, `fora do Ranking X1 (campanha: ${campA?.total?.played ?? 0} partida(s))`);

pa.close(); pb.close(); lobB.close();
await sleep(300);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
