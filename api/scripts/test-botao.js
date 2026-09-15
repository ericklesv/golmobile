/**
 * Futebol de Botão (X1) ponta a ponta contra a API LOCAL rodando (FP_API, padrão http://localhost:4320) com
 * X1_JOGO=BOTAO no .env dela, com jogadores de teste conectados por WebSocket como se fossem celulares (IPs
 * diferentes via X-Real-IP): convite com o nome do jogo, aceite e cobrança, peteleco fora da vez e em botão
 * do outro (ignorados), a partida até o gol que acaba (ou pênaltis), pote e gol para o vencedor, −1 do time
 * do perdedor, partida gravada (jogo, placar, temporada), Ranking do X1 e perfil; W.O. cedo; treino com bot.
 * Cria jogadores bt… direto no banco (a trava de cadastro por internet barra cadastro em série).
 *
 * Uso (na pasta api/):  node scripts/test-botao.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-botao.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { config } = await import('../src/config.js');
const { botaoBotMove } = await import('../src/lib/botaoMatch.js');
const { FUTPREGO: F } = await import('../src/lib/rules.js');
const { liveMatchForTeam } = await import('../src/services/league.js');

const API = process.env.FP_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(`${API}/api/health`)).ok) break; } catch {} await sleep(500); }
const status = await (await fetch(`${API}/api/x1/status`)).json();
if (status.today?.game !== 'BOTAO') { console.error(`o X1 de hoje na API é ${status.today?.game}: suba a API com X1_JOGO=BOTAO`); process.exit(1); }

let seq = 0;
// VIP: sem VIP há 2 min de espera para desafiar depois de cada partida (testada no test-futprego.js)
async function mkUser(team, money) {
  const nick = `bt${Date.now() % 1e5}${seq++}`;
  const t = await prisma.team.findUnique({ where: { slug: team } });
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@local.test`, passwordHash: 'x', teamId: t.id, money, vipUntil: new Date(Date.now() + 86_400_000) } });
  return { ...u, token: jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' }) };
}
const money = async (u) => (await prisma.user.findUnique({ where: { id: u.id } })).money;

function phone(user, mode, ip) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(user.token)}&mode=${mode}`, { headers: { 'X-Real-IP': ip } });
  const box = [], waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(m); } else box.push(m);
  });
  return {
    ws, box, user,
    open: new Promise((r) => ws.on('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    wait(t, ms = 8000) {
      const pred = (m) => m.t === t;
      const i = box.findIndex(pred);
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((resolve) => { const w = { pred, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); resolve(null); }, ms) }; waiters.push(w); });
    },
    clear: () => { box.length = 0; },
    close: () => ws.close(),
  };
}

let seed = 4321;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

/** Joga a partida de Botão com o bot (mira boa) dos dois lados até acabar. Devolve os 'over' e o placar. */
async function play(pa, pb) {
  const ma = await pa.wait('match'), mb = await pb.wait('match');
  if (!ma || !mb) return null;
  const phones = { [ma.you]: pa, [mb.you]: pb };
  let view = ma.botao, snaps = 0, goals = 0, penalties = 0;
  while (!view.over && snaps < 80) {
    const side = view.turn;
    const mv = botaoBotMove({ phase: view.phase, pieces: view.pieces, ball: view.ball, turn: side, over: null }, side, rnd, 1);
    phones[side].send({ t: 'snap', idx: mv.idx, dx: mv.dx, dy: mv.dy, power: mv.power });
    const snap = await pa.wait('snap', 10000);
    await pb.wait('snap', 10000);
    if (!snap) break;
    snaps++;
    if (snap.goal) goals++;
    if (snap.penalty) penalties++;
    view = snap.botao;
    await sleep((snap.frames.length * 1000) / 30 + (snap.goal || snap.penalty ? 1200 : 450));
    pa.box.splice(0).filter((m) => m.t !== 'bturn').forEach((m) => pa.box.push(m));
    pb.box.splice(0).filter((m) => m.t !== 'bturn').forEach((m) => pb.box.push(m));
    if (view.over) break;
  }
  const oa = await pa.wait('over', 12000), ob = await pb.wait('over', 12000);
  return { oa, ob, youA: ma.you, snaps, goals, penalties, view };
}

// ── A (Náutico) desafia; B (Bahia) está nas telas com abas e recebe o convite
const A = await mkUser('nautico', 1000), B = await mkUser('bahia', 1000);
for (const t of [A.teamId, B.teamId]) { const m = await liveMatchForTeam(t); if (m) await prisma.match.update({ where: { id: m.id }, data: m.homeTeamId === t ? { homeGoals: 3 } : { awayGoals: 3 } }); }
const lobB = phone(B, 'lobby', '10.7.0.2');
await lobB.open; await sleep(300);
const gA = phone(A, 'game', '10.7.0.1'); await gA.open;
const hello = await gA.wait('hello');
check(hello?.today?.game === 'BOTAO' && hello.today.name === 'Futebol de Botão', `hello: o X1 de hoje é ${hello?.today?.name}, amanhã ${hello?.today?.nextName}`);
gA.send({ t: 'challenge' });
const waiting = await gA.wait('waiting');
const inv = await lobB.wait('invite', 3000);
check(waiting?.game === 'BOTAO' && inv?.gameName === 'Futebol de Botão' && inv.from.nick === A.nick, `convite: "${inv?.from?.nick} está te desafiando" no ${inv?.gameName}`);

const gB = phone(B, 'game', '10.7.0.2'); await gB.open;
gB.send({ t: 'accept', id: waiting.id });
const ma0 = await gA.wait('match'), mb0 = await gB.wait('match');
check(ma0?.game === 'BOTAO' && ma0.botao.pieces.length === 14 && ma0.field?.boxes?.length === 2, 'partida de Futebol de Botão: 14 botões e as duas áreas');
check((await money(A)) === 800 && (await money(B)) === 800, 'a aposta de R$ 200 saiu dos dois');
check(ma0.botao.snapsLeft === 1 && ma0.botao.goalsToWin === 1, 'quem começa dá 1 peteleco na 1ª vez; o 1º gol acaba');
// peteleco fora da vez e em botão do outro: ignorados
const turnSide = ma0.botao.turn;
const turnPhone = ma0.you === turnSide ? gA : gB, otherPhone = turnPhone === gA ? gB : gA;
otherPhone.send({ t: 'snap', idx: ma0.botao.pieces.findIndex((p) => p.side !== turnSide), dx: 0, dy: -1, power: 1 });
const oppPiece = ma0.botao.pieces.findIndex((p) => p.side !== turnSide);
turnPhone.send({ t: 'snap', idx: oppPiece, dx: 0, dy: -1, power: 1 });
check(!(await gA.wait('snap', 1500)), 'peteleco fora da vez e em botão do adversário: ignorados');
// devolve as mensagens de partida para o play() (ele espera a 'match')
gA.box.unshift(ma0); gB.box.unshift(mb0);

const r = await play(gA, gB);
check(!!r?.oa && !!r?.ob, `partida terminou: ${r?.snaps} petelecos, ${r?.goals} gol(s), ${r?.penalties} pênalti(s) — "${r?.oa?.reason}"`);
const wSide = r.oa.winner, w = wSide === r.youA ? A : B, l = w === A ? B : A;
const ow = w === A ? r.oa : r.ob, ol = w === A ? r.ob : r.oa;
check(['gol', 'gol-contra', 'penaltis'].includes(r.oa.reason), 'acabou no 1º gol ou nos pênaltis');
check((await money(w)) === 1200 && (await money(l)) === 800, `dinheiro: ${w.nick} levou R$ ${F.bet * 2}, ${l.nick} perdeu R$ ${F.bet}`);
check(ow.goal === true && /Futebol de Botão/.test(ow.goalText || ''), `gol do vencedor valeu ("${(ow.goalText || '').slice(0, 70)}…")`);
const row = await prisma.x1Match.findFirst({ where: { aId: A.id }, orderBy: { id: 'desc' } });
check(row.game === 'BOTAO' && !!row.seasonId && row.status === 'FINISHED' && row.goalAwarded && row.winnerId === w.id && (row.scoreA + row.scoreB >= (r.oa.reason === 'penaltis' ? 0 : 1)), `gravada: jogo BOTAO, temporada, placar ${row.scoreA} x ${row.scoreB}`);
check((await prisma.goal.count({ where: { userId: w.id, kind: 'BOTAO' } })) === 1, 'gol gravado como BOTAO');
check(ol.lost === true, `o time do perdedor (${ol.lostTeam}) perdeu 1 gol na rodada`);

// Ranking X1 (pontos 3·1·−2, services/x1.js) conta o Botão; perfil com o total, cada jogo e a temporada
check(ow.h2h?.total === 1 && ow.h2h.wins === 1 && ol.h2h?.losses === 1 && !!ow.rivalry?.text && !!ol.rivalry?.text, `fim: retrospecto já com a partida e a frase ("${ol.rivalry?.text}")`);
const rk = await (await fetch(`${API}/api/rankings/x1-temporada?limit=100`)).json();
const inRank = rk.rows?.find((x) => x.userId === w.id);
const P = F.points;
check(!!inRank && inRank.goals === P.win && inRank.fp.wins === 1 && !('email' in inRank) && !('passwordHash' in inRank), `Ranking X1 da temporada ${rk.key}: ${w.nick} com ${inRank?.goals} pontos (${inRank?.fp?.wins}V), em ${inRank?.position}º (sem dados privados)`);
const lRank = rk.rows?.find((x) => x.userId === l.id);
check(!!lRank && lRank.goals === P.loss && lRank.fp.losses === 1, `o perdedor ${l.nick} aparece com ${lRank?.goals} pontos`);
const pw = await (await fetch(`${API}/api/players/${w.nick}`)).json();
check(pw.x1?.wins === 1 && pw.x1.points === P.win && pw.x1.games.BOTAO.wins === 1 && pw.x1.games.FUTPREGO.wins === 0 && pw.x1.season?.points === P.win && pw.x1.season.position === inRank?.position,
  `perfil: X1 ${pw.x1?.wins}V ${pw.x1?.losses}D, ${pw.x1?.points} pontos (Botão ${pw.x1?.games?.BOTAO?.wins}V), temporada ${pw.x1?.season?.points} pontos, ${pw.x1?.season?.position}º`);
const pl = await (await fetch(`${API}/api/players/${l.nick}`)).json();
check(pl.x1?.losses === 1 && pl.x1.games.BOTAO.losses === 1 && pl.x1.points === P.loss, `perfil do perdedor: ${pl.x1?.losses} derrota, ${pl.x1?.points} pontos`);

// cair e não voltar = derrota, mesmo antes de jogar (dono, 15/09/2026 — o "W.O. cedo" com aposta devolvida acabou)
const bef = { a: await money(A), b: await money(B) };
gA.clear(); gB.clear();
gA.send({ t: 'challenge' });
const w2 = await gA.wait('waiting');
gB.send({ t: 'accept', id: w2.id });
await gA.wait('match'); await gB.wait('match');
gB.close();
const o2 = await gA.wait('over', (F.reconnectSec + 5) * 1000);
check(o2?.reason === 'wo' && !o2.refund && o2.winner === (o2.you) && (await money(A)) === bef.a + F.bet && (await money(B)) === bef.b - F.bet, `B caiu antes de jogar: W.O. = derrota do B, A leva o pote`);

// treino contra o bot no Botão: o bot joga sozinho e a partida acaba
gA.clear();
gA.send({ t: 'challenge' });
await gA.wait('waiting');
gA.send({ t: 'bot' });
const mbot = await gA.wait('match');
check(mbot?.training === true && mbot.game === 'BOTAO', `treino de Botão contra ${mbot?.players?.[1]?.nick}`);
let botSnaps = 0, last = mbot.botao;
for (let i = 0; i < 40 && !last.over; i++) {
  if (last.turn === mbot.you) {
    const mv = botaoBotMove({ phase: last.phase, pieces: last.pieces, ball: last.ball, turn: last.turn, over: null }, last.turn, rnd, 0.3);
    gA.send({ t: 'snap', idx: mv.idx, dx: mv.dx, dy: mv.dy, power: mv.power });
  }
  const s = await gA.wait('snap', 12000);
  if (!s) break;
  if (s.side !== mbot.you) botSnaps++;
  last = s.botao;
  await sleep((s.frames.length * 1000) / 30 + 500);
  gA.box.splice(0).filter((m) => m.t !== 'bturn').forEach((m) => gA.box.push(m));
}
const obot = await gA.wait('over', 15000);
check(botSnaps > 0 && obot?.training === true && (await money(A)) === bef.a, `o bot jogou (${botSnaps} petelecos), o treino acabou e o dinheiro ficou igual`);

for (const p of [gA, lobB]) p.close();
await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
