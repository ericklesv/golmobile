/**
 * Jogo em TESTE no X1 (X1.test; dono, 24/09/2026: primeiro "libere apenas para as contas MVGIC e ericklesv… os
 * adversários precisam ser bots, aceitando em 5 s", depois "adicione um botão embaixo de 'Desafiar alguém' chamado
 * 'Testar FutGolf', visível apenas para os admins… os admins devem voltar a ter o botão de desafiar de antes"), ponta
 * a ponta contra a API LOCAL rodando (TX_API, padrão http://localhost:4320) com X1_JOGO=BOTAO (o jogo do dia é outro),
 * BOTS_OFF=1 e BOTS_X1_OFF=1 no ambiente dela. Cria dois ADMINS, um jogador comum e um bot direto no banco e apaga no fim.
 *
 * Com um jogo em teste (fora do rodízio de hoje), ele prova:
 *  1. O admin recebe `today.test` (o botão "Testar FutGolf") e o jogo de hoje normal; o jogador comum, sem `test`.
 *  2. O "Desafiar alguém" do admin é no jogo do dia; o "Testar" (`challenge` com `game`) é no jogo em teste.
 *  3. O desafio de teste NÃO aparece para o jogador comum (nem na lista, nem no convite) — e ele não consegue aceitar
 *     nem sabendo o número, nem desafiar no jogo de teste; o outro admin vê.
 *  4. Nenhum admin aceitou: um bot aceita em ~5 s e a partida vale (aposta, sem cara de treino).
 *  5. O outro admin aceita na hora e os dois jogam o jogo em teste.
 *  6. O jogador comum segue desafiando no jogo do dia.
 * Sem jogo em teste (o Futgolf entrou no rodízio em 24/09/2026 às 19h): confere que ninguém recebe `test` e que
 * desafiar no Futgolf fora do dia dele é recusado.
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
const { X1 } = await import('../src/lib/rules.js');
const TG = X1.test?.game ?? 'FUTGOLF';
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
const T1 = await mk(T_NICKS[0], teamA, { isAdmin: true }), T2 = await mk(T_NICKS[1], teamB, { isAdmin: true }), N = await mk(`fgcomum${Date.now() % 1e5}`, teamB);
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
  const hoje = hn?.today?.game;
  if (!h1?.today?.test) {
    // ── sem jogo em teste: ninguém recebe o botão, e desafiar no jogo que não é o de hoje é recusado
    console.log(`  (nenhum jogo em teste agora: o ${X1.names[TG]} está no rodízio)`);
    check(!hn?.today?.test && !h1?.today?.test, 'ninguém recebe o botão de teste');
    if (TG !== hoje) {
      t1.send({ t: 'challenge', game: TG });
      const e = await t1.espera((m) => m.t === 'error' || m.t === 'waiting', 4);
      check(e?.t === 'error' && e.code === 'jogo', `desafiar no ${X1.names[TG]} fora do dia dele é recusado (${e?.message})`);
    }
  } else {
  // ── 1
  check(h1.today.test.game === TG && h1.today.game === hoje, `o admin recebe o botão "Testar" (${h1.today.test.name}) e o jogo de hoje normal (${h1.today.name})`);
  check(hn?.today?.game !== TG && !hn?.today?.test, `o jogador comum não recebe o botão (${hn?.today?.name})`);

  // ── 2: o "Desafiar alguém" do admin é no jogo do dia
  t1.send({ t: 'challenge' });
  const wd = await t1.espera((m) => m.t === 'waiting', 5);
  check(wd?.game === hoje, `o "Desafiar alguém" do admin é no jogo do dia (${wd?.game})`);
  t1.send({ t: 'cancel' });
  await t1.espera((m) => m.t === 'canceled', 3);
  await sleep(300);

  // ── 3 e 4: o admin testa; nenhum admin aceita
  n.msgs.length = 0; nl.msgs.length = 0; t2.msgs.length = 0;
  t1.send({ t: 'challenge', game: TG });
  const w = await t1.espera((m) => m.t === 'waiting', 5);
  const abriu = Date.now();
  check(w?.game === TG, `o "Testar" abre o desafio no jogo em teste (${w?.game})`);
  await sleep(1200);
  const listaN = [...n.msgs].reverse().find((m) => m.t === 'open');
  check(!listaN || !listaN.list.some((c) => c.id === w?.id), 'o jogador comum NÃO vê o desafio na lista do X1');
  check(!nl.msgs.some((m) => m.t === 'invite' && m.id === w?.id), 'o jogador comum NÃO recebe o convite nas telas com abas');
  const listaT2 = [...t2.msgs].reverse().find((m) => m.t === 'open');
  check(!!listaT2 && listaT2.list.some((c) => c.id === w?.id && c.game === TG), 'o outro admin vê o desafio de teste');
  n.send({ t: 'accept', id: w?.id });
  const negado = await n.espera((m) => m.t === 'taken' || m.t === 'match', 3);
  check(negado?.t === 'taken', 'o jogador comum não consegue aceitar nem sabendo o número do desafio');
  n.send({ t: 'challenge', game: TG });
  const recusa = await n.espera((m) => m.t === 'error' || m.t === 'waiting', 3);
  check(recusa?.t === 'error' && recusa.code === 'jogo', `o jogador comum não consegue desafiar no jogo em teste (${recusa?.message})`);
  const partida = await t1.espera((m) => m.t === 'match', 12);
  const levou = partida ? (partida._at - abriu) / 1000 : null;
  check(!!partida && partida.game === TG, 'nenhum admin aceitou: a partida do jogo em teste começou');
  check(!!partida && partida.players[1 - partida.you].nick === BOT.nick && partida.players[1 - partida.you].bot === false, `quem aceitou foi o bot (${partida?.players?.[1 - partida.you]?.nick}), sem marca de bot`);
  check(levou !== null && levou >= 4 && levou <= 8, `o bot aceitou em ~5 s (levou ${levou?.toFixed(1)} s)`);
  check(!!partida && partida.training === false && partida.bet === F.bet, 'a partida vale de verdade (aposta, sem cara de treino)');
  t1.send({ t: 'giveup' });
  await t1.espera((m) => m.t === 'over', 10);

  // ── 5: o admin testa de novo e o outro admin aceita na hora
  await sleep(800);
  t2.msgs.length = 0;
  t1.send({ t: 'challenge', game: TG });
  const w2 = await t1.espera((m) => m.t === 'waiting', 5);
  t2.send({ t: 'accept', id: w2?.id });
  const m2 = await t2.espera((m) => m.t === 'match', 5);
  check(!!m2 && m2.game === TG && m2.players.some((p) => p.nick === T1.nick), 'o outro admin aceitou e os dois jogam o jogo em teste');
  t2.send({ t: 'giveup' });
  await t2.espera((m) => m.t === 'over', 10);

  // ── 6: o jogador comum desafia no jogo do dia
  await sleep(800);
  n.send({ t: 'challenge' });
  const wn = await n.espera((m) => m.t === 'waiting' || m.t === 'match', 5);
  check(wn?.t === 'waiting' && wn.game === hoje, `o jogador comum desafia no jogo do dia (${wn?.game})`);
  n.send({ t: 'cancel' });
  await sleep(500);
  }
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
