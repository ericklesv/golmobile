/**
 * FutPrego ponta a ponta contra a API LOCAL rodando (FP_API, padrão http://localhost:4320), com
 * jogadores de teste conectados por WebSocket como se fossem celulares (IPs diferentes via X-Real-IP):
 * convite só para quem pode (time/internet/dinheiro), aceitar, cobrança dos R$ 200, gol do vencedor,
 * pote de R$ 400, o time do perdedor perdendo 1 gol, a regra da mesma dupla com o mesmo vencedor, a trava
 * de 10 gols por hora (para ganhar e para perder), empate (devolve), W.O. cedo (devolve), vez de quem não é a vez, treino com bot, e a
 * SAÍDA DO MEIO: em toda partida a 1ª jogada tenta de propósito o peteleco que entraria sem a garantia.
 * Cria jogadores fp…
 *
 * Uso (na pasta api/, com a API local no ar e X1_JOGO=FUTPREGO no .env dela):  node scripts/test-futprego.js
 *   → "TUDO OK". (O Futebol de Botão tem o dele: scripts/test-botao.js.)
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-futprego.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { simulateFlick, scorerOf } = await import('../src/lib/futprego.js');
const { FUTPREGO: F } = await import('../src/lib/rules.js');
const { liveMatchForTeam } = await import('../src/services/league.js');
const { config } = await import('../src/config.js');

const API = process.env.FP_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(`${API}/api/health`)).ok) break; } catch {} await sleep(500); }

let seq = 0;
// VIP por padrão: sem VIP há 2 min de espera para desafiar depois de cada partida (testada no passo 10)
async function mkUser(team, money, { vip = true } = {}) {
  const nick = `fp${Date.now() % 1e5}${seq++}`;
  // criado direto no banco local (o cadastro tem trava de contas por IP) e com o token assinado aqui
  const t = await prisma.team.findUnique({ where: { slug: team } });
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@local.test`, passwordHash: 'x', gender: 'M', teamId: t.id, money, vipUntil: vip ? new Date(Date.now() + 86_400_000) : null } });
  return { ...u, token: jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' }) };
}
const today = await (await fetch(`${API}/api/x1/status`)).json();
if (today.today?.game !== 'FUTPREGO') { console.error(`o X1 de hoje na API é ${today.today?.game}: suba a API com X1_JOGO=FUTPREGO`); process.exit(1); }
const money = async (u) => (await prisma.user.findUnique({ where: { id: u.id } })).money;

/** Um "celular": conexão com fila de mensagens e espera por tipo. */
function phone(user, mode, ip) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(user.token)}&mode=${mode}`, { headers: { 'X-Real-IP': ip } });
  const box = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(m); } else box.push(m);
  });
  const p = {
    ws, box, user,
    open: new Promise((r) => ws.on('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    wait(t, ms = 8000, extra = () => true) {
      const pred = (m) => m.t === t && extra(m);
      const i = box.findIndex(pred);
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((resolve) => { const w = { pred, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); resolve(null); }, ms) }; waiters.push(w); });
    },
    has: (t) => box.some((m) => m.t === t),
    clear: () => { box.length = 0; },
    close: () => ws.close(),
  };
  return p;
}

/** Um peteleco que dá gol para `side` a partir de `ball` na tábua `board` (ou que NÃO dá gol, se want = 'nada'). */
function findFlick(ball, side, want, board) {
  for (let i = 0; i < 1440; i++) {
    const ang = (i / 1440) * Math.PI * 2;
    for (const pw of want === 'nada' ? [0.05, 0.1, 0.2] : [1, 0.9, 0.8, 0.7, 0.6, 0.5]) {
      const r = simulateFlick(ball, Math.cos(ang), Math.sin(ang), pw, board);
      const s = scorerOf(r.goal);
      if (want === 'nada' ? s === null : s === side) return { dx: Math.cos(ang), dy: Math.sin(ang), power: pw, frames: r.frames.length };
    }
  }
  return null;
}

/**
 * Joga uma partida já começada: `plan(side)` diz o que cada lado faz na vez ('gol' ou 'nada').
 * Devolve a mensagem 'over' de cada um.
 */
const kickoff = { tried: 0, blocked: 0, boards: new Set() };
let lastMatchMsgs = null; // { ma, mb } da última partida (retrospecto)
async function play(pa, pb, plan) {
  const ma = await pa.wait('match'), mb = await pb.wait('match');
  if (!ma || !mb) return null;
  lastMatchMsgs = { ma, mb };
  const board = ma.board;
  kickoff.boards.add(board.id);
  const bySide = { [ma.you]: pa, [mb.you]: pb };
  let ball = ma.ball, turn = ma.turn;
  for (let n = 0; n < 2 * F.maxTurns + 2; n++) {
    const who = bySide[turn];
    // 1ª jogada: se existir um peteleco da saída que entraria (sem a garantia), tenta ele de propósito
    const ko = n === 0 ? findFlick(ball, turn, 'gol', board) : null;
    const f = ko ?? findFlick(ball, turn, n === 0 ? 'nada' : plan(turn), board) ?? { dx: 1, dy: 0, power: 0.05 };
    who.send({ t: 'flick', dx: f.dx, dy: f.dy, power: f.power });
    const shot = await pa.wait('shot', 8000);
    await pb.wait('shot', 8000);
    if (!shot) return null;
    if (ko) { kickoff.tried++; if (shot.goal === null) kickoff.blocked++; }
    ball = shot.ball;
    if (shot.goal !== null) break;
    const next = await pa.wait('turn', 8000);
    await pb.wait('turn', 8000);
    if (!next) break; // empate: vem o 'over'
    turn = next.turn;
    await sleep((shot.frames.length * 1000) / 30 + 80);
  }
  const oa = await pa.wait('over', 12000), ob = await pb.wait('over', 12000);
  return { oa, ob, youA: ma.you, youB: mb.you };
}

// ── jogadores: A (Náutico) desafia; B (Bahia) aceita; C (Náutico, mesmo time de A); D (Sport, sem dinheiro)
const A = await mkUser('nautico', 1000), B = await mkUser('bahia', 1000), C = await mkUser('nautico', 1000), D = await mkUser('sport', 100);
// as partidas do Náutico e do Bahia na rodada precisam ter gol para o perdedor perder
const teamScore = async (teamId) => { const m = await liveMatchForTeam(teamId); return m ? (m.homeTeamId === teamId ? m.homeGoals : m.awayGoals) : null; };
for (const t of [A.teamId, B.teamId]) { const m = await liveMatchForTeam(t); if (m) await prisma.match.update({ where: { id: m.id }, data: m.homeTeamId === t ? { homeGoals: 3 } : { awayGoals: 3 } }); }
const liveB = await liveMatchForTeam(B.teamId);
const scoreB = () => teamScore(B.teamId);

const lobB = phone(B, 'lobby', '10.0.0.2'), lobC = phone(C, 'lobby', '10.0.0.3'), lobD = phone(D, 'lobby', '10.0.0.4');
await Promise.all([lobB.open, lobC.open, lobD.open]);
await sleep(300);

// 1) convite
let gA = phone(A, 'game', '10.0.0.1'); await gA.open;
gA.send({ t: 'challenge' });
const waiting = await gA.wait('waiting');
const invB = await lobB.wait('invite', 3000), invC = await lobC.wait('invite', 1500), invD = await lobD.wait('invite', 500);
check(!!waiting && invB?.from?.nick === A.nick && invB.seconds === F.inviteSec && invB.bet === F.bet, `desafio aberto: B recebeu "${invB?.from?.nick} está te desafiando" por ${invB?.seconds} s`);
check(!invC && !invD, 'C (mesmo time de A) e D (sem R$ 200) não recebem convite');

// 2) aceitar
let gB = phone(B, 'game', '10.0.0.2'); await gB.open;
const open = await gB.wait('open');
check(open?.list?.some((x) => x.id === waiting.id), 'na tela do FutPrego, B vê o desafio de A para aceitar');
gB.send({ t: 'accept', id: waiting.id });
const closed = await lobB.wait('invite-close', 3000);
check(!!closed, 'aceitou: o convite some das outras telas');

// 3) partida 1: quem começar tenta o gol; o vencedor é quem marcar (gol na 1ª jogada)
const before = { a: 1000, b: 1000, teamA: await teamScore(A.teamId), teamB: await teamScore(B.teamId) }; // a aposta saiu no aceite (passo 2)
const r1 = await play(gA, gB, () => 'gol');
check(!!r1?.oa && !!r1?.ob, 'partida 1 terminou para os dois');
check(lastMatchMsgs?.ma.h2h?.total === 0 && lastMatchMsgs?.mb.h2h?.total === 0 && lastMatchMsgs.ma.h2h.last.length === 0, 'retrospecto no 1º confronto: 0 partidas para os dois');
const w1 = r1.oa.winner === r1.youA ? A : B, l1 = w1 === A ? B : A;
const o1w = w1 === A ? r1.oa : r1.ob, o1l = w1 === A ? r1.ob : r1.oa;
const after1 = { a: await money(A), b: await money(B) };
const net = (u) => (u === A ? after1.a - before.a : after1.b - before.b);
check(net(w1) === F.bet && net(l1) === -F.bet, `dinheiro: vencedor ${w1.nick} +R$ ${net(w1)} (levou R$ ${F.bet * 2}), perdedor −R$ ${-net(l1)}`);
check(o1w.goal === true && /FutPrego/.test(o1w.goalText || '') && o1w.money === F.bet * 2, `vencedor: gol valeu ("${(o1w.goalText || '').slice(0, 60)}…")`);
check(o1w.h2h?.total === 1 && o1w.h2h.wins === 1 && o1l.h2h?.losses === 1 && o1l.h2h.last[0] === 'D' && o1w.rivalry?.kind === 'estreiaV' && o1l.rivalry?.kind === 'estreiaD' && o1l.rivalry.text.includes(w1.nick),
  `fim da partida 1: retrospecto já com ela e a frase de estreia ("${o1l.rivalry?.text}")`);
const g1 = await prisma.goal.count({ where: { userId: w1.id, kind: 'FUTPREGO' } });
check(g1 === 1, 'gol gravado como FUTPREGO para o vencedor');
const row1 = await prisma.x1Match.findFirst({ where: { OR: [{ aId: A.id }, { bId: A.id }] }, orderBy: { id: 'desc' } });
check(row1.status === 'FINISHED' && row1.goalAwarded && row1.winnerId === w1.id && row1.game === 'FUTPREGO' && !!row1.seasonId, 'partida gravada: FINISHED, com gol, jogo FUTPREGO e a temporada');
if (before.teamA !== null && before.teamB !== null) {
  const [wt, lt] = w1 === A ? ['teamA', 'teamB'] : ['teamB', 'teamA'];
  const now = { teamA: await teamScore(A.teamId), teamB: await teamScore(B.teamId) };
  check(now[wt] === before[wt] + 1 && now[lt] === before[lt] - 1 && o1l.lost === true && !!row1.lostMatchId,
    `placar da rodada: time do vencedor ${before[wt]} → ${now[wt]} (+1), time do perdedor ${before[lt]} → ${now[lt]} (−1)`);
}

// 4) revanche com o MESMO vencedor: o 2º não vale gol (nem tira)
const pw = w1 === A ? gA : gB, pl = w1 === A ? gB : gA;
gA.send({ t: 'challenge' });
const w2wait = await gA.wait('waiting');
gA.clear(); gB.clear();
gB.send({ t: 'accept', id: w2wait.id });
const goalsBefore2 = liveB ? await scoreB() : null;
const r2 = await play(gA, gB, (side) => ((side === r1.youA) === (w1 === A) ? 'gol' : 'nada'));
const o2w = w1 === A ? r2.oa : r2.ob, o2l = w1 === A ? r2.ob : r2.oa;
check(o2w.h2h?.wins === 2 && o2w.rivalry?.kind === 'ampliou' && o2l.h2h?.losses === 2 && o2l.rivalry?.kind === 'ficandoFeio', `fim da revanche: ${w1.nick} "${o2w.rivalry?.text}" / ${l1.nick} "${o2l.rivalry?.text}"`);
{
  const hw = w1 === A ? lastMatchMsgs.ma.h2h : lastMatchMsgs.mb.h2h, hl = w1 === A ? lastMatchMsgs.mb.h2h : lastMatchMsgs.ma.h2h;
  check(hw?.total === 1 && hw.wins === 1 && hw.losses === 0 && hw.last[0] === 'V' && hl?.wins === 0 && hl.losses === 1 && hl.last[0] === 'D', `retrospecto na revanche: ${w1.nick} vê 1V/0D (última V), ${l1.nick} vê 0V/1D (última D)`);
}
check(r2.oa.winner === (w1 === A ? r2.youA : r2.youB), `revanche: ${w1.nick} ganhou de novo`);
check(o2w.goal === false && o2w.why === 'repetido' && o2w.money === F.bet * 2, 'mesma dupla, mesmo vencedor 2 vezes seguidas: o 2º não vale gol, mas leva o pote');
check((await prisma.goal.count({ where: { userId: w1.id, kind: 'FUTPREGO' } })) === 1 && (!liveB || (await scoreB()) === goalsBefore2), 'nenhum gol a mais e nenhum gol tirado');

// 5) agora o outro ganha: vale
gA.send({ t: 'challenge' });
const w3wait = await gA.wait('waiting');
gA.clear(); gB.clear();
gB.send({ t: 'accept', id: w3wait.id });
const r3 = await play(gA, gB, (side) => ((side === r1.youA) === (w1 === A) ? 'nada' : 'gol'));
const o3w = l1 === A ? r3.oa : r3.ob, o3l = l1 === A ? r3.ob : r3.oa;
check(o3w.rivalry?.kind === 'finalmente' && o3l.rivalry?.kind === 'tropecou', `perdia de 2 a 0 e venceu: "${o3w.rivalry?.text}" / o outro: "${o3l.rivalry?.text}"`);
check(o3w.goal === true, `terceira: ${l1.nick} ganhou e o gol valeu (resultado diferente do anterior)`);

// 6) empate: ninguém marca em 10 jogadas de cada → dinheiro volta
const bef6 = { a: await money(A), b: await money(B) };
gA.send({ t: 'challenge' });
const w6 = await gA.wait('waiting');
gA.clear(); gB.clear();
gB.send({ t: 'accept', id: w6.id });
const r6 = await play(gA, gB, () => 'nada');
check(r6?.oa?.refund === true && r6.oa.why === 'empate' && (await money(A)) === bef6.a && (await money(B)) === bef6.b, `10 jogadas de cada sem gol: empate e os R$ ${F.bet} voltaram`);
check(r6.oa.h2h?.draws === 1 && r6.oa.rivalry?.kind === 'acirrado' && r6.ob.rivalry?.kind === 'acirrado', `empate com o confronto 2 a 1: "${r6.oa.rivalry?.text}"`);

// 7) vez errada: o peteleco de quem não é a vez é ignorado; cair e não voltar = derrota, mesmo sem ter jogado (dono, 15/09/2026)
const bef7 = { a: await money(A), b: await money(B) };
gA.send({ t: 'challenge' });
const w7 = await gA.wait('waiting');
gA.clear(); gB.clear();
gB.send({ t: 'accept', id: w7.id });
const m7a = await gA.wait('match'), m7b = await gB.wait('match');
const notTurn = m7a.turn === m7a.you ? gB : gA;
notTurn.send({ t: 'flick', dx: 0, dy: -1, power: 1 });
check(!(await gA.wait('shot', 1200)), 'peteleco fora da vez: ignorado');
check((await money(A)) === bef7.a - F.bet, 'na partida: a aposta já saiu');
gB.close();
const drop = await gA.wait('opp-dropped', 3000);
const o7 = await gA.wait('over', (F.reconnectSec + 5) * 1000);
check(!!drop && o7?.reason === 'wo' && o7.winner === m7a.you && !o7.refund && (await money(A)) === bef7.a + F.bet && (await money(B)) === bef7.b - F.bet, `B caiu e não voltou em ${F.reconnectSec} s antes de jogar: W.O. = derrota do B, A leva o pote`);
check(!!o7.h2h && o7.h2h.wins >= 1, 'W.O. entra no retrospecto');
// desistir com um gol a caminho não escapa do gol: vale o gol (reason gol), não a desistência
{
  gB = phone(B, 'game', '10.0.0.2'); await gB.open;
  gA.send({ t: 'challenge' });
  const w = await gA.wait('waiting');
  gA.clear(); gB.clear();
  gB.send({ t: 'accept', id: w.id });
  const ma = await gA.wait('match'), mb = await gB.wait('match');
  lastMatchMsgs = { ma, mb };
  const bySide = { [ma.you]: gA, [mb.you]: gB };
  let ball = ma.ball, turn = ma.turn, goalShot = null;
  for (let n = 0; n < 2 * F.maxTurns + 2 && !goalShot; n++) {
    const who = bySide[turn];
    const f = findFlick(ball, turn, n === 0 ? 'nada' : 'gol', ma.board) ?? { dx: 1, dy: 0, power: 0.05 };
    who.send({ t: 'flick', dx: f.dx, dy: f.dy, power: f.power });
    const shot = await gA.wait('shot', 8000); await gB.wait('shot', 8000);
    if (!shot) break;
    if (shot.goal !== null) { goalShot = shot; break; }
    ball = shot.ball;
    const next = await gA.wait('turn', 8000); await gB.wait('turn', 8000);
    if (!next) break;
    turn = next.turn;
    await sleep((shot.frames.length * 1000) / 30 + 80);
  }
  if (goalShot) {
    const loserSide = 1 - goalShot.goal;
    bySide[loserSide].send({ t: 'giveup' }); // desiste durante a animação do gol
    const oa = await gA.wait('over', 12000), ob = await gB.wait('over', 12000);
    check(oa?.reason?.startsWith('gol') && oa.winner === goalShot.goal && ob?.reason === oa.reason, `desistir com gol a caminho: vale o gol (${oa?.reason}), não a desistência`);
  } else {
    check(false, 'não achei um peteleco de gol para testar a desistência com gol a caminho');
  }
}

// 8) trava de gols por hora (ganhar): com maxGoalsPerHour vitórias valendo nesta hora, a próxima leva o pote mas não o gol
gB = phone(B, 'game', '10.0.0.2'); await gB.open;
// (as partidas de mentira ficam no começo desta hora cheia — se a hora virar no meio do teste, não contam)
const nowH = new Date(); nowH.setUTCMinutes(0, 0, 0); const inHour = new Date(Math.max(nowH.getTime(), Date.now() - 1000));
for (let i = 0; i < F.maxGoalsPerHour; i++) await prisma.x1Match.create({ data: { aId: A.id, bId: D.id, aTeamId: A.teamId, bTeamId: D.teamId, aIp: 'x', bIp: 'y', bet: F.bet, status: 'FINISHED', winnerId: A.id, reason: 'gol', goalAwarded: true, finishedAt: inHour } });
await prisma.x1Match.create({ data: { aId: A.id, bId: B.id, aTeamId: A.teamId, bTeamId: B.teamId, aIp: 'x', bIp: 'y', bet: F.bet, status: 'FINISHED', winnerId: B.id, reason: 'gol', goalAwarded: true, finishedAt: new Date(Date.now() - 3 * 3600_000) } }); // o último A x B foi do B (há 3 h: não conta na hora)
gA.send({ t: 'challenge' });
const w8 = await gA.wait('waiting');
gA.clear(); gB.clear();
gB.send({ t: 'accept', id: w8.id });
const r8 = await play(gA, gB, (side) => (side === (r1.youA) ? 'gol' : 'nada'));
const o8 = r8.oa;
check(o8.winner === r8.youA && o8.goal === false && o8.why === 'limite' && o8.money === F.bet * 2, `A já tinha ${F.maxGoalsPerHour} gols nesta hora: levou o pote, sem gol`);

// 8b) trava de gols por hora (perder): B já fez o time perder maxGoalsPerHour gols nesta hora; C ganha dele:
// o gol de C vale, mas o time de B não perde mais
for (const t of [C.teamId, B.teamId]) { const m = await liveMatchForTeam(t); if (m) await prisma.match.update({ where: { id: m.id }, data: m.homeTeamId === t ? { homeGoals: 3 } : { awayGoals: 3 } }); }
for (let i = 0; i < F.maxGoalsPerHour; i++) await prisma.x1Match.create({ data: { aId: D.id, bId: B.id, aTeamId: D.teamId, bTeamId: B.teamId, aIp: 'x', bIp: 'y', bet: F.bet, status: 'FINISHED', winnerId: D.id, reason: 'gol', goalAwarded: true, lostTeamId: B.teamId, finishedAt: inHour } });
const gC = phone(C, 'game', '10.0.0.3'); await gC.open;
const bef8b = { c: await teamScore(C.teamId), b: await teamScore(B.teamId) };
gC.send({ t: 'challenge' });
const w8b = await gC.wait('waiting');
gC.clear(); gB.clear();
gB.send({ t: 'accept', id: w8b.id });
const r8b = await play(gC, gB, (side) => (side === 0 ? 'gol' : 'nada')); // quem desafia é o lado 0
const oC = r8b?.oa, oB = r8b?.ob;
check(oC?.winner === r8b?.youA && oC.goal === true && oB?.lost === false && oB.lossLimit === true, `B já tinha feito o time perder ${F.maxGoalsPerHour} gols nesta hora: o gol de C valeu e o time de B não perdeu`);
if (bef8b.c !== null && bef8b.b !== null) check((await teamScore(C.teamId)) === bef8b.c + 1 && (await teamScore(B.teamId)) === bef8b.b, `placar: time de C ${bef8b.c} → ${await teamScore(C.teamId)}, time de B ficou em ${await teamScore(B.teamId)}`);
gC.close();

// 10) sem VIP: espera challengeCooldownSec depois de cada partida para DESAFIAR; aceitar pode na hora; VIP não espera
const E = await mkUser('fortaleza', 1000, { vip: false });
const gE = phone(E, 'game', '10.0.0.5'); await gE.open;
const cd0 = await gE.wait('cooldown', 3000);
check(!!cd0 && cd0.until === null && cd0.vip === false, 'sem VIP e sem partida ainda: pode desafiar (sem espera)');
gE.send({ t: 'challenge' });
const wE = await gE.wait('waiting');
gB.clear();
gB.send({ t: 'accept', id: wE.id });
const rE = await play(gE, gB, (side) => (side === 0 ? 'gol' : 'nada')); // E desafiou: lado 0
check(rE?.oa?.cooldownUntil > Date.now() + (F.challengeCooldownSec - 20) * 1000 && rE?.ob?.cooldownUntil === null, `acabou a partida: E (sem VIP) espera ${F.challengeCooldownSec} s para desafiar; B (VIP) não espera`);
gE.send({ t: 'challenge' });
const eCd = await gE.wait('error', 3000);
check(eCd?.code === 'cooldown' && /Vire VIP e jogue o X1 ilimitado/.test(eCd.message) && eCd.until > Date.now(), `E tenta desafiar de novo: "${eCd?.message}"`);
gB.clear();
gB.send({ t: 'challenge' });
const wB = await gB.wait('waiting', 3000);
check(!!wB, 'B (VIP) desafia logo depois da partida');
gE.clear();
gE.send({ t: 'accept', id: wB?.id });
const mE = await gE.wait('match', 3000);
check(!!mE, 'E (esperando para desafiar) aceita o desafio de B na hora');
gE.send({ t: 'giveup' });
await gE.wait('over', 5000); await gB.wait('over', 5000);
gE.close();
const gE2 = phone(E, 'game', '10.0.0.5'); await gE2.open;
const cd1 = await gE2.wait('cooldown', 3000);
check(cd1?.until > Date.now(), 'reabriu a tela do X1: a espera continua (vem do banco)');
gE2.close();

// 9) sem dinheiro: D não consegue desafiar; treino com bot não mexe no dinheiro
const gD = phone(D, 'game', '10.0.0.4'); await gD.open;
gD.send({ t: 'challenge' });
const eD = await gD.wait('error', 3000);
check(eD?.code === 'no-money', `D sem R$ ${F.bet}: "${eD?.message}"`);
await prisma.user.update({ where: { id: D.id }, data: { money: 500 } });
gD.send({ t: 'challenge' });
await gD.wait('waiting', 3000);
gD.send({ t: 'bot' });
const mBot = await gD.wait('match', 3000);
check(mBot?.training === true && mBot.players[1].bot === true && mBot.bet === 0, `treino contra ${mBot?.players?.[1]?.nick}: não vale dinheiro`);
gD.send({ t: 'giveup' });
const oBot = await gD.wait('over', 5000);
check(oBot?.training === true && (await money(D)) === 500, 'treino acabou: dinheiro igual');

check(kickoff.tried === kickoff.blocked, `saída do meio: ${kickoff.tried} tentativas de gol de primeira (peteleco que entraria sem a garantia), nenhuma valeu; tábuas sorteadas: ${[...kickoff.boards].join(', ')}`);

// ranking do FutPrego (3 · 1 · −2) bate com o que está no banco para A
{
  const rank = await (await fetch(`${API}/api/rankings/futprego?limit=100`)).json();
  const rowA = rank.rows?.find((r) => r.userId === A.id);
  const mine = { status: 'FINISHED', reason: { not: 'wo-cedo' }, OR: [{ aId: A.id }, { bId: A.id }] };
  const wins = await prisma.x1Match.count({ where: { ...mine, winnerId: A.id } });
  const draws = await prisma.x1Match.count({ where: { ...mine, winnerId: null } });
  const losses = await prisma.x1Match.count({ where: { ...mine, winnerId: { not: null }, NOT: { winnerId: A.id } } });
  const pts = wins * F.points.win + draws * F.points.draw + losses * F.points.loss;
  check(!!rowA && rowA.goals === pts && rowA.fp.points === pts && rowA.fp.wins === wins && rowA.fp.losses === losses && rowA.fp.best >= 1,
    `ranking: ${A.nick} com ${wins}V ${draws}E ${losses}D = ${pts} pontos (linha: ${rowA?.goals}), maior sequência sem perder ${rowA?.fp?.best}`);
  const sorted = rank.rows.every((r, i) => i === 0 || rank.rows[i - 1].goals >= r.goals);
  check(sorted, 'ranking em ordem de pontos');
  // recorte da rodada com prêmios: quem tem menos de minGames não é elegível; o 1º elegível leva o 1º prêmio
  const rr = await (await fetch(`${API}/api/rankings/x1-rodada?limit=100`)).json();
  const min = F.prizes.minGames;
  const okElig = rr.rows.every((r) => r.fp.eligible === (r.fp.played >= min) && (r.fp.eligible || r.fp.prize === null));
  const elig = rr.rows.filter((r) => r.fp.eligible);
  const okPrize = elig.length === 0 || (elig[0].fp.prize?.money === F.prizes.round[0].money && elig[0].fp.prize?.vip === F.prizes.round[0].vip);
  check(okElig && okPrize, `x1-rodada: elegibilidade (mín. ${min} partidas) e prêmio do 1º elegível (${elig[0]?.nick ?? 'ninguém'}: R$ ${elig[0]?.fp.prize?.money ?? 0} + ${elig[0]?.fp.prize?.vip ?? 0} VIP)`);
}

for (const p of [gA, gB, gD, lobB, lobC, lobD]) p.close();
await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
