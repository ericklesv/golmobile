/**
 * Cliente automatizado no X1 (dono, 20/09/2026): um programa ligado direto no WebSocket da partida (User-Agent
 * "node", como o do Xumbera) só joga 1 partida a cada FUTPREGO.autoClientGapMin minutos — desafiar E aceitar; o
 * navegador de verdade segue normal. Contra a API LOCAL rodando (TX_API, padrão http://localhost:4320), qualquer
 * jogo do dia. No PC só o UA "node" marca (em produção também sem Origin ou sem `device=`).
 *
 * Uso (na pasta api/, com a API local no ar):  node scripts/test-x1-cliente-auto.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-x1-cliente-auto.js só roda no banco LOCAL (cria contas de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { FUTPREGO: F } = await import('../src/lib/rules.js');
const { config } = await import('../src/config.js');

const API = process.env.TX_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const status = await fetch(`${API}/api/x1/status`).then((r) => r.json()).catch(() => null);
if (!status) { console.error(`API local não respondeu em ${API}.`); process.exit(1); }

const [teamA, teamB] = await prisma.team.findMany({ take: 2, orderBy: { id: 'asc' } });
const stamp = Date.now() % 1e6;
const vip = new Date(Date.now() + 86_400_000); // VIP: sem a espera de 2 min de quem não é VIP (isola a regra do cliente automatizado)
const mk = (nick, teamId) => prisma.user.create({ data: { nick, nickLower: nick, email: `${nick}@local.test`, passwordHash: 'x', teamId, money: 5000, vipUntil: vip, tutorialStep: -1 } });
const robo = await mk(`ta${stamp}`, teamA.id), gente = await mk(`tb${stamp}`, teamB.id);
const tokenOf = (u) => jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' });
/** Uma partida terminada entre os dois há `minAgo` minutos. */
const partida = (minAgo) => prisma.x1Match.create({ data: { game: status.today.game, aId: robo.id, bId: gente.id, aTeamId: teamA.id, bTeamId: teamB.id, aIp: '198.51.100.1', bIp: '198.51.100.2', bet: F.bet, status: 'FINISHED', reason: 'gol', winnerId: robo.id, createdAt: new Date(Date.now() - minAgo * 60_000 - 30_000), finishedAt: new Date(Date.now() - minAgo * 60_000) } });

function tela(u, mode, ip, ua = null) {
  const headers = { 'X-Real-IP': ip, ...(ua ? { 'User-Agent': ua } : {}) };
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(tokenOf(u))}&mode=${mode}`, { headers });
  const msgs = [];
  ws.on('message', (raw) => { try { msgs.push(JSON.parse(raw.toString())); } catch {} });
  const espera = async (pred, segundos = 5) => { for (let i = 0; i < segundos * 10; i++) { const m = msgs.find(pred); if (m) return m; await sleep(100); } return null; };
  return { ws, msgs, espera, send: (m) => ws.send(JSON.stringify(m)), clear: () => { msgs.length = 0; } };
}

try {
  // ── 1. programa (UA node) com partida terminada há 1 min: desafiar é recusado
  const m1 = await partida(1);
  const bot = tela(robo, 'game', '198.51.100.1', 'node');
  await bot.espera((m) => m.t === 'hello');
  bot.send({ t: 'challenge' });
  const e1 = await bot.espera((m) => m.t === 'error' || m.t === 'waiting');
  check(e1?.t === 'error' && e1.code === 'auto-cooldown', `programa com partida há 1 min: desafiar recusado (${e1?.code}: "${e1?.message}")`);
  check(e1?.until > Date.now() && e1.until <= Date.now() + F.autoClientGapMin * 60_000, 'o "até quando" bate com o intervalo de 20 min');

  // ── 2. o mesmo programa também não ACEITA um desafio aberto
  const pessoa = tela(gente, 'game', '198.51.100.2');
  await pessoa.espera((m) => m.t === 'hello');
  pessoa.send({ t: 'challenge' });
  const w = await pessoa.espera((m) => m.t === 'waiting');
  check(!!w, 'a pessoa (navegador) abriu o desafio normalmente, mesmo com partida há 1 min (é VIP)');
  bot.clear();
  bot.send({ t: 'accept', id: w.id });
  const e2 = await bot.espera((m) => m.t === 'error' || m.t === 'match');
  check(e2?.t === 'error' && e2.code === 'auto-cooldown', 'programa: aceitar também é recusado no intervalo');
  check(!(await pessoa.espera((m) => m.t === 'match', 2)), 'a partida NÃO começou para a pessoa');
  pessoa.send({ t: 'cancel' });

  // ── 3. passados 20 min desde a última partida, o programa joga (1 partida a cada 20 min)
  await prisma.x1Match.update({ where: { id: m1.id }, data: { finishedAt: new Date(Date.now() - (F.autoClientGapMin + 5) * 60_000) } });
  bot.clear();
  bot.send({ t: 'challenge' });
  const w2 = await bot.espera((m) => m.t === 'error' || m.t === 'waiting');
  check(w2?.t === 'waiting', 'com a última partida há 25 min, o programa consegue desafiar');
  bot.send({ t: 'cancel' });

  // ── 4. navegador de verdade (sem UA de programa) com partida há 1 min: normal
  const nav = tela(robo, 'game', '198.51.100.1');
  await nav.espera((m) => m.t === 'hello');
  await partida(1);
  nav.send({ t: 'challenge' });
  const w3 = await nav.espera((m) => m.t === 'error' || m.t === 'waiting');
  check(w3?.t === 'waiting', 'a MESMA conta pelo navegador desafia normalmente (a regra é do cliente, não da conta)');
  nav.send({ t: 'cancel' });
  bot.ws.close(); pessoa.ws.close(); nav.ws.close();
} finally {
  await sleep(300);
  await prisma.x1Match.deleteMany({ where: { OR: [{ aId: robo.id }, { bId: robo.id }] } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [robo.id, gente.id] } } }).catch((e) => console.error('limpeza:', e.message));
}
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
