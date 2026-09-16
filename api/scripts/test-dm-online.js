/**
 * DEATH MATCH ponta a ponta, pelo WebSocket, contra a API LOCAL (FP_API, padrão http://localhost:4320)
 * rodando com **X1_JOGO=BOTAO e BOTAO_TURNOS=1** (a partida acaba em 1 turno e cai no death match na hora).
 *
 * Confere o que quebrou na estreia (relato do dono, 16/09/2026: "aparece DEATH MATCH e o jogador da vez
 * fica travado até perder a vez, e não perde o botão"):
 *  - assim que o aviso do death match chega, o jogador da vez CONSEGUE jogar (o peteleco é aceito);
 *  - quem deixa o tempo acabar perde um botão;
 *  - os goleiros saem, a partida segue com 1 peteleco por vez e o gol continua valendo.
 *
 * Uso (pasta api/):
 *   PORT=4320 X1_JOGO=BOTAO BOTAO_TURNOS=1 node src/index.js   (numa janela)
 *   node scripts/test-dm-online.js                             (noutra)
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-dm-online.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { config } = await import('../src/config.js');
const { botaoBotMove } = await import('../src/lib/botaoMatch.js');

const API = process.env.FP_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(`${API}/api/health`)).ok) break; } catch {} await sleep(500); }
const meta = await (await fetch(`${API}/api/meta`)).json();
const status = await (await fetch(`${API}/api/x1/status`)).json();
if (status.today?.game !== 'BOTAO') { console.error('suba a API com X1_JOGO=BOTAO'); process.exit(1); }
if ((meta.x1?.botao?.maxTurns ?? 9) !== 1) { console.error('suba a API com BOTAO_TURNOS=1 (para cair no death match na 1ª vez)'); process.exit(1); }

let seq = 0;
async function mkUser(team, money = 5000) {
  const nick = `dm${Date.now() % 1e5}${seq++}`;
  const t = await prisma.team.findUnique({ where: { slug: team } });
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@local.test`, passwordHash: 'x', teamId: t.id, money, vipUntil: new Date(Date.now() + 86_400_000) } });
  return { ...u, token: jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' }) };
}
function phone(user, mode, ip) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(user.token)}&mode=${mode}`, { headers: { 'X-Real-IP': ip } });
  const box = [], waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(m); } else box.push(m);
  });
  return {
    ws, user,
    open: new Promise((r) => ws.on('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    wait(t, ms = 9000) {
      const pred = (m) => m.t === t;
      const i = box.findIndex(pred);
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((resolve) => { const w = { pred, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); resolve(null); }, ms) }; waiters.push(w); });
    },
    close: () => ws.close(),
  };
}
let seed = 20260916;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const vivos = (bv, side) => bv.pieces.filter((p) => p.side === side).length;

// ── dois jogadores de times diferentes e uma partida
const A = await mkUser('nautico'), B = await mkUser('bahia');
const pa = phone(A, 'game', '198.51.100.31'), pb = phone(B, 'game', '198.51.100.32');
await Promise.all([pa.open, pb.open]);
await sleep(300);
pa.send({ t: 'challenge' });                 // A desafia
const waiting = await pa.wait('waiting', 9000);
await sleep(300);
pb.send({ t: 'accept', id: waiting?.id });   // B aceita
const ma = await pa.wait('match', 12000), mb = await pb.wait('match', 12000);
check(!!ma && !!mb, 'partida casada');
if (!ma) { console.log('\n1 FALHA(S)'); await prisma.$disconnect(); process.exit(1); }

const fones = { [ma.you]: pa, [mb.you]: pb };
let bv = ma.botao;
// ── primeira vez: um peteleco qualquer (com BOTAO_TURNOS=1 isso já leva ao death match)
let voltas = 0;
while (bv.phase === 'play' && voltas++ < 6) {
  const side = bv.turn;
  const mv = botaoBotMove({ phase: bv.phase, pieces: bv.pieces, ball: bv.ball, turn: side, over: null }, side, rnd, 0.2);
  fones[side].send({ t: 'snap', idx: mv.idx, dx: mv.dx, dy: -mv.dy, power: 0.3 }); // de propósito para o lado errado: sem gol
  const snap = await pa.wait('snap', 12000); await pb.wait('snap', 12000);
  if (!snap) break;
  bv = snap.botao;
  await sleep((snap.frames.length * 1000) / 30 + 600);
}
check(bv.phase === 'death', `entrou no death match (fase "${bv.phase}")`);
check(bv.pieces.every((p) => !p.gk) && vivos(bv, 0) === 6 && vivos(bv, 1) === 6, `os goleiros saíram: ${vivos(bv, 0)}x${vivos(bv, 1)} botões`);

// ── o AVISO chega e o jogador da vez consegue jogar NA HORA (era o travamento)
const turno = await pa.wait('bturn', 12000);
await pb.wait('bturn', 12000);
check(!!turno?.deathStart, 'a tela recebe o aviso do death match (deathStart)');
bv = turno?.botao ?? bv;
const daVez = bv.turn;
const antes = vivos(bv, daVez);
const mv2 = botaoBotMove({ phase: 'death', pieces: bv.pieces, ball: bv.ball, turn: daVez, over: null }, daVez, rnd, 0.9);
fones[daVez].send({ t: 'snap', idx: mv2.idx, dx: mv2.dx, dy: mv2.dy, power: 1 });
const snap2 = await pa.wait('snap', 12000);
await pb.wait('snap', 12000);
check(!!snap2, 'logo depois do aviso, o peteleco do jogador da vez é ACEITO (não trava)');
check(!!snap2?.out && snap2.out.side === daVez, 'o botão que ele jogou saiu do campo');
if (snap2) bv = snap2.botao;
check(vivos(bv, daVez) === antes - 1, `quem jogou ficou com ${vivos(bv, daVez)} botões (tinha ${antes})`);

// ── agora o outro deixa o tempo acabar: tem de perder um botão também
if (!bv.over) {
  await sleep((snap2.frames.length * 1000) / 30 + 500);
  const t2 = await pa.wait('bturn', 12000); await pb.wait('bturn', 12000);
  bv = t2?.botao ?? bv;
  const parado = bv.turn, tinha = vivos(bv, parado);
  console.log(`     (esperando o tempo do peteleco acabar: ${meta.x1?.botao?.snapSec ?? 15} s)`);
  const skip = await pa.wait('bskip', (meta.x1?.botao?.snapSec ?? 15) * 1000 + 6000);
  check(!!skip && skip.side === parado, 'quem não jogou perdeu a vez pelo tempo');
  if (skip) bv = skip.botao;
  check(vivos(bv, parado) === tinha - 1, `perdeu o tempo e PERDEU um botão: ficou com ${vivos(bv, parado)} (tinha ${tinha})`);
}

pa.close(); pb.close();
await sleep(300);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
