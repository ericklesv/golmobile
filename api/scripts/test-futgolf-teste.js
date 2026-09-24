/**
 * Futgolf em TESTE (X1.test; dono, 24/09/2026: "Libere apenas para as contas MVGIC e ericklesv. Os adversários precisam
 * ser bots, aceitando em 5 s se nem mvgic nem ericklesv aceitarem… não mostre o aviso, ainda, para outros usuários"),
 * ponta a ponta contra a API LOCAL rodando (TX_API, padrão http://localhost:4320) com X1_JOGO=BOTAO (o jogo do dia é
 * outro), X1_TESTERS=fgteste1,fgteste2 (as contas de teste deste script), BOTS_OFF=1 e BOTS_X1_OFF=1 no ambiente dela.
 * Cria as contas e um bot direto no banco e apaga no fim.
 *
 * O que ele prova:
 *  1. Para a conta de teste o X1 é o Futgolf (em teste); para o jogador comum, o jogo do dia.
 *  2. O desafio da conta de teste é de Futgolf e NÃO aparece para o jogador comum (nem na lista, nem no convite) —
 *     e ele não consegue aceitar nem sabendo o número; a outra conta de teste vê.
 *  3. Ninguém de teste aceitou: um bot aceita em ~5 s e a partida vale (aposta, sem cara de treino).
 *  4. A outra conta de teste aceita na hora e as duas jogam Futgolf.
 *  5. O jogador comum segue desafiando no jogo do dia.
 *
 * Uso (na pasta api/):  node scripts/test-futgolf-teste.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-futgolf-teste.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { config } = await import('../src/config.js');
const { FUTPREGO: F } = await import('../src/lib/rules.js');

const API = process.env.TX_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const status = await fetch(`${API}/api/x1/status`).then((r) => r.json()).catch(() => null);
if (!status) { console.error(`API local não respondeu em ${API}.`); process.exit(1); }
if (status.today?.game === 'FUTGOLF') { console.error('Suba a API com X1_JOGO=BOTAO (o jogo do dia não pode ser o de teste).'); process.exit(1); }

const T_NICKS = ['fgteste1', 'fgteste2'];
// sobras de uma rodada que quebrou no meio
const old = await prisma.user.findMany({ where: { OR: [{ nickLower: { in: T_NICKS } }, { email: { endsWith: '@fgteste.local' } }] }, select: { id: true } });
if (old.length) {
  const ids = old.map((u) => u.id);
  await prisma.activity.deleteMany({ where: { userId: { in: ids } } }); await prisma.goal.deleteMany({ where: { userId: { in: ids } } });
  await prisma.x1Match.deleteMany({ where: { OR: [{ aId: { in: ids } }, { bId: { in: ids } }] } }); await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
const [teamA, teamB, teamC] = await prisma.team.findMany({ take: 3, orderBy: { id: 'asc' } });
const created = [];
async function mk(nick, team, extra = {}) {
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@fgteste.local`, passwordHash: 'x', teamId: team.id, money: 1000, tutorialStep: -1, vipUntil: new Date(Date.now() + 86_400_000), ...extra } });
  created.push(u.id);
  return { ...u, token: jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' }) };
}
const T1 = await mk(T_NICKS[0], teamA), T2 = await mk(T_NICKS[1], teamB), N = await mk(`fgcomum${Date.now() % 1e5}`, teamB);
const BOT = await mk(`fgbot${Date.now() % 1e5}`, teamC, { isBot: true, botJson: { persona: { profile: 'regular', x1: 1 } } });

function tela(u, mode, ip) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(u.token)}&mode=${mode}`, { headers: { 'X-Real-IP': ip } });
  const msgs = [];
  ws.on('message', (raw) => { try { const m = JSON.parse(raw.toString()); m._at = Date.now(); msgs.push(m); } catch {} });
  const espera = async (pred, segundos) => {
    for (let i = 0; i < segundos * 10; i++) { const k = msgs.findIndex(pred); if (k >= 0) return msgs.splice(k, 1)[0]; await sleep(100); }
    return null;
  };
  return { ws, msgs, espera, send: (m) => ws.send(JSON.stringify(m)), open: new Promise((r) => ws.on('open', r)) };
}

try {
  const t1 = tela(T1, 'game', '198.51.100.121'), t2 = tela(T2, 'game', '198.51.100.122');
  const n = tela(N, 'game', '198.51.100.123'), nl = tela(N, 'lobby', '198.51.100.123');
  await Promise.all([t1.open, t2.open, n.open, nl.open]);
  const [h1, , hn] = await Promise.all([t1.espera((m) => m.t === 'hello', 5), t2.espera((m) => m.t === 'hello', 5), n.espera((m) => m.t === 'hello', 5)]);
  // ── 1
  check(h1?.today?.game === 'FUTGOLF' && h1.today.test === true, `para a conta de teste o X1 é o Futgolf em teste (${h1?.today?.name})`);
  check(hn?.today?.game !== 'FUTGOLF' && !hn?.today?.test, `para o jogador comum o X1 é o jogo do dia (${hn?.today?.name})`);

  // ── 2 e 3: T1 desafia; ninguém de teste aceita
  n.msgs.length = 0; nl.msgs.length = 0; t2.msgs.length = 0;
  t1.send({ t: 'challenge' });
  const w = await t1.espera((m) => m.t === 'waiting', 5);
  const abriu = Date.now();
  check(w?.game === 'FUTGOLF', 'o desafio da conta de teste é de Futgolf');
  await sleep(1200);
  const listaN = [...n.msgs].reverse().find((m) => m.t === 'open');
  check(!listaN || !listaN.list.some((c) => c.id === w?.id), 'o jogador comum NÃO vê o desafio na lista do X1');
  check(!nl.msgs.some((m) => m.t === 'invite' && m.id === w?.id), 'o jogador comum NÃO recebe o convite nas telas com abas');
  const listaT2 = [...t2.msgs].reverse().find((m) => m.t === 'open');
  check(!!listaT2 && listaT2.list.some((c) => c.id === w?.id && c.game === 'FUTGOLF'), 'a outra conta de teste vê o desafio de Futgolf');
  n.send({ t: 'accept', id: w?.id });
  const negado = await n.espera((m) => m.t === 'taken' || m.t === 'match', 3);
  check(negado?.t === 'taken', 'o jogador comum não consegue aceitar nem sabendo o número do desafio');
  const partida = await t1.espera((m) => m.t === 'match', 12);
  const levou = partida ? (partida._at - abriu) / 1000 : null;
  check(!!partida && partida.game === 'FUTGOLF', 'ninguém de teste aceitou: a partida de Futgolf começou');
  check(!!partida && partida.players[1 - partida.you].nick === BOT.nick && partida.players[1 - partida.you].bot === false, `quem aceitou foi o bot (${partida?.players?.[1 - partida.you]?.nick}), sem marca de bot`);
  check(levou !== null && levou >= 4 && levou <= 8, `o bot aceitou em ~5 s (levou ${levou?.toFixed(1)} s)`);
  check(!!partida && partida.training === false && partida.bet === F.bet, 'a partida vale de verdade (aposta, sem cara de treino)');
  t1.send({ t: 'giveup' });
  await t1.espera((m) => m.t === 'over', 10);

  // ── 4: T1 desafia de novo e T2 aceita na hora
  await sleep(800);
  t2.msgs.length = 0;
  t1.send({ t: 'challenge' });
  const w2 = await t1.espera((m) => m.t === 'waiting', 5);
  t2.send({ t: 'accept', id: w2?.id });
  const m2 = await t2.espera((m) => m.t === 'match', 5);
  check(!!m2 && m2.game === 'FUTGOLF' && m2.players.some((p) => p.nick === T1.nick), 'a outra conta de teste aceitou e as duas jogam Futgolf');
  t2.send({ t: 'giveup' });
  await t2.espera((m) => m.t === 'over', 10);

  // ── 5: o jogador comum desafia no jogo do dia
  await sleep(800);
  n.send({ t: 'challenge' });
  const wn = await n.espera((m) => m.t === 'waiting' || m.t === 'match', 5);
  check(wn?.t === 'waiting' && wn.game === hn?.today?.game, `o jogador comum desafia no jogo do dia (${wn?.game})`);
  n.send({ t: 'cancel' });
  await sleep(500);
  for (const t of [t1, t2, n, nl]) t.ws.close();
} finally {
  await sleep(1500);
  await prisma.activity.deleteMany({ where: { userId: { in: created } } }).catch(() => {});
  await prisma.goal.deleteMany({ where: { userId: { in: created } } }).catch(() => {});
  await prisma.x1Match.deleteMany({ where: { OR: [{ aId: { in: created } }, { bId: { in: created } }] } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: created } } }).catch((e) => console.error('limpeza:', e.message));
}
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
