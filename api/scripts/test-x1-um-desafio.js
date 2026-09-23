/**
 * Um desafio aberto por vez no X1 (dono, 23/09/2026: "quando um bot está desafiando, criar um desafio devia cair
 * contra esse bot e não ficar 2 desafios abertos" — print com Vilao e Loudete, dois bots, desafiando ao mesmo
 * tempo). Ponta a ponta contra a API LOCAL rodando (TX_API, padrão http://localhost:4320) com `ADMIN_KEY` no .env
 * dela e `BOTS_X1_OFF=1` (senão o motor manda outro bot ao X1 ou aceita o desafio no meio do teste; o `/api/admin/x1/bot`
 * continua mandando).
 *
 * O que ele prova:
 *  1. Bot esperando + outro bot chegando = os DOIS jogam (antes, em metade das vezes, o segundo abria o dele).
 *  2. Duas pessoas tocando "Desafiar" no mesmo instante se enfrentam (antes as duas viam a lista vazia e abriam
 *     dois desafios).
 *  3. Pessoa fora da cota dos bots abre o desafio com um bot esperando: o bot desiste do dele (fica um só).
 *  4. Pessoa fora da cota esperando e um bot chega: ele não abre um segundo desafio.
 *
 * Uso (na pasta api/, com a API local no ar):
 *   node scripts/test-x1-um-desafio.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-x1-um-desafio.js só roda no banco LOCAL (cria jogadores e bots de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { FUTPREGO: F } = await import('../src/lib/rules.js');
const { config } = await import('../src/config.js');

const API = process.env.TX_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
const ADMIN = process.env.ADMIN_KEY;
if (!ADMIN) { console.error('ADMIN_KEY não está no .env local.'); process.exit(1); }
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = (path, body) => fetch(`${API}/api/admin${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const status = () => fetch(`${API}/api/x1/status`).then((r) => r.json());
const dentro = async () => (await admin('/x1/bots')).inside ?? [];
/** Espera a condição valer (conferindo a cada 250 ms) e devolve o último valor lido. */
async function ate(fn, pred, segundos) {
  let v;
  for (let i = 0; i < segundos * 4; i++) { v = await fn(); if (pred(v)) return v; await sleep(250); }
  return v;
}

const st0 = await status().catch(() => null);
if (!st0) { console.error(`API local não respondeu em ${API}.`); process.exit(1); }
if (st0.open || st0.matches || (await dentro()).length) { console.error('Já tem desafio, partida ou bot no X1 da API local — suba ela com BOTS_X1_OFF=1.'); process.exit(1); }

// ── contas de teste
const [teamA, teamB] = await prisma.team.findMany({ take: 2, orderBy: { id: 'asc' } });
const stamp = Date.now() % 1e6;
const criados = [];
const mkBot = async (nick, team) => {
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@bots.jogagol.com.br`, passwordHash: 'x', teamId: team.id, money: 1000, isBot: true, botJson: { persona: { profile: 'regular', x1: 1 } }, tutorialStep: -1 } });
  criados.push(u.id); return u;
};
const mkGente = async (nick, team, extra = {}) => {
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@local.test`, passwordHash: 'x', teamId: team.id, money: 1000, tutorialStep: -1, ...extra } });
  criados.push(u.id); return u;
};
const b0 = await mkBot(`uz${stamp}`, teamA); // só o adversário da partida falsa (ele fica na espera de 2 min)
const b1 = await mkBot(`ua${stamp}`, teamA), b2 = await mkBot(`ub${stamp}`, teamB), b3 = await mkBot(`uc${stamp}`, teamA), b4 = await mkBot(`ud${stamp}`, teamA);
const h1 = await mkGente(`ue${stamp}`, teamA), h2 = await mkGente(`uf${stamp}`, teamB);
// fora da cota dos bots: jogou com um bot há 1 min (BOTS.x1.sameHumanMin = 30). VIP para não cair nos 2 min de
// espera para desafiar de novo depois de uma partida.
const hq = await mkGente(`ug${stamp}`, teamB, { vipUntil: new Date(Date.now() + 86_400_000) });
await prisma.x1Match.create({ data: { game: st0.today.game, aId: hq.id, bId: b0.id, aTeamId: teamB.id, bTeamId: teamA.id, aIp: '198.51.100.40', bIp: `bot:${b0.id}`, bet: F.bet, status: 'FINISHED', winnerId: hq.id, reason: 'gol', createdAt: new Date(Date.now() - 3 * 60_000), finishedAt: new Date(Date.now() - 60_000) } });

const tokenOf = (u) => jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' });
/** Tela do X1: guarda tudo que chega. */
function tela(u, ip) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(tokenOf(u))}&mode=game`, { headers: { 'X-Real-IP': ip } });
  const msgs = [];
  ws.on('message', (raw) => { try { msgs.push(JSON.parse(raw.toString())); } catch {} });
  const espera = async (pred, segundos) => {
    for (let i = 0; i < segundos * 10; i++) { const m = msgs.find(pred); if (m) return m; await sleep(100); }
    return null;
  };
  return { ws, msgs, espera, send: (m) => ws.send(JSON.stringify(m)) };
}
const telas = [];

try {
  // ── 1. bot esperando + outro bot chegando = partida, nada de dois desafios
  check((await admin('/x1/bot', { nick: b1.nick, waitSec: 20 })).started === true, `bot ${b1.nick} mandado ao X1`);
  const esp1 = await ate(dentro, (l) => l.some((b) => b.id === b1.id && b.waiting), 5);
  check(esp1.some((b) => b.id === b1.id && b.waiting), 'o 1º bot abriu o desafio dele');
  for (let i = 0; i < 6; i++) { // o sorteio antigo (50 %) passaria às vezes: 6 rodadas pegam com 98 % de chance
    if (i) {
      await admin('/x1/cancel', {});
      await ate(dentro, (l) => !l.length, 10);
      check((await admin('/x1/bot', { nick: b1.nick, waitSec: 20 })).started === true, `rodada ${i + 1}: ${b1.nick} volta a desafiar`);
      await ate(dentro, (l) => l.some((b) => b.id === b1.id && b.waiting), 5);
    }
    await admin('/x1/bot', { nick: b2.nick, waitSec: 20 });
    const l = await ate(dentro, (x) => x.filter((b) => b.playing).length === 2, 5);
    const st = await status();
    check(l.filter((b) => b.playing).length === 2 && st.open === 0, `rodada ${i + 1}: o 2º bot caiu contra o 1º (jogando ${l.filter((b) => b.playing).length}, desafios abertos ${st.open})`);
    if (st.open) break;
  }
  await admin('/x1/cancel', {});
  check((await ate(dentro, (l) => !l.length, 30)).length === 0, 'partida cancelada, os bots saíram'); // (desafio sem par: em 20 s eles cansam)

  // ── 2. duas pessoas tocando "Desafiar" no mesmo instante se enfrentam
  const t1 = tela(h1, '198.51.100.21'), t2 = tela(h2, '198.51.100.22');
  telas.push(t1, t2);
  await Promise.all([t1.espera((m) => m.t === 'hello', 5), t2.espera((m) => m.t === 'hello', 5)]);
  t1.send({ t: 'challenge' }); t2.send({ t: 'challenge' });
  const [m1, m2] = await Promise.all([t1.espera((m) => m.t === 'match', 6), t2.espera((m) => m.t === 'match', 6)]);
  const st2 = await status();
  const entreEles = !!m1 && !!m2 && m1.players?.some((p) => p.nick === h2.nick) && m2.players?.some((p) => p.nick === h1.nick);
  check(entreEles && st2.open === 0, `os dois "Desafiar" viraram UMA partida entre eles (${m1 ? 'match' : 'sem match'} / ${m2 ? 'match' : 'sem match'}, desafios abertos ${st2.open})`);
  if (m1) { t1.send({ t: 'giveup' }); await t1.espera((m) => m.t === 'over', 10); }
  else { t1.send({ t: 'cancel' }); t2.send({ t: 'cancel' }); await sleep(500); }

  // ── 3. pessoa fora da cota abre com um bot esperando: o bot desiste do dele
  check((await admin('/x1/bot', { nick: b3.nick, waitSec: 60 })).started === true, `bot ${b3.nick} mandado ao X1`);
  await ate(dentro, (l) => l.some((b) => b.id === b3.id && b.waiting), 5);
  const tq = tela(hq, '198.51.100.40');
  telas.push(tq);
  await tq.espera((m) => m.t === 'hello', 5);
  const lista = await tq.espera((m) => m.t === 'open', 5);
  check(!!lista && !lista.list.some((c) => c.from.nick === b3.nick), 'fora da cota, a pessoa não vê o desafio do bot');
  tq.send({ t: 'challenge' });
  const w = await tq.espera((m) => m.t === 'waiting' || m.t === 'match', 5);
  check(w?.t === 'waiting', 'a pessoa fora da cota abriu o desafio dela (sem casar com o bot)');
  const l3 = await ate(dentro, (l) => !l.some((b) => b.id === b3.id), 6);
  const st3 = await status();
  check(!l3.some((b) => b.id === b3.id) && st3.open === 1, `o bot desistiu do dele: sobrou 1 desafio aberto (${st3.open})`);

  // ── 4. pessoa fora da cota esperando e um bot chega: ele não abre um segundo desafio
  // o /api/admin/x1/bot responde antes de a visita começar: dá tempo de ela decidir antes de conferir (senão o
  // "não está no X1" passa sem ele ter nem entrado)
  check((await admin('/x1/bot', { nick: b4.nick, waitSec: 60 })).started === true, `bot ${b4.nick} mandado ao X1`);
  await sleep(3000);
  const l4 = await dentro();
  const st4 = await status();
  check(!l4.some((b) => b.id === b4.id) && st4.open === 1, `o bot chegou e foi embora sem abrir outro (desafios abertos ${st4.open})`);
  tq.send({ t: 'cancel' });
  await tq.espera((m) => m.t === 'canceled', 5);
} finally {
  for (const t of telas) try { t.ws.close(); } catch {}
  await admin('/x1/cancel', {}).catch(() => {});
  // nenhum bot de teste pode ficar esperando depois (a API local seguiria com o desafio de uma conta apagada)
  const sobrou = await ate(dentro, (l) => !l.length, 65).catch(() => []);
  if (sobrou?.length) console.error('ATENÇÃO: bot de teste ainda no X1 —', sobrou.map((b) => b.nick).join(', '));
  await sleep(500);
  await prisma.activity.deleteMany({ where: { userId: { in: criados } } }).catch(() => {});
  await prisma.x1Match.deleteMany({ where: { OR: [{ aId: { in: criados } }, { bId: { in: criados } }] } }).catch(() => {});
  await prisma.goal.deleteMany({ where: { userId: { in: criados } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: criados } } }).catch((e) => console.error('limpeza:', e.message));
}
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
