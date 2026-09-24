/**
 * Futgolf (X1) ponta a ponta contra a API LOCAL rodando (FP_API, padrão http://localhost:4320) com X1_JOGO=FUTGOLF,
 * FUTGOLF_CHUTE_SEG=4 (tempo de chute curto, para o W.O. não levar um minuto) e BOTS_X1_OFF=1, com jogadores de teste
 * conectados por WebSocket como se fossem celulares (IPs diferentes via X-Real-IP). Cria jogadores fg… direto no banco.
 *
 * O que ele prova:
 *  1. Desafio e aceite: os dois recebem a partida com o buraco (contorno, par, saída) e as bolas na saída; aposta cobrada.
 *  2. Chute antes de a rodada abrir, chute com número inválido e segundo chute na mesma rodada: ignorados.
 *  3. Os dois chutam AO MESMO TEMPO: cada chute vai na hora para as duas telas (quadros e eventos) e o placar de chutes
 *     anda; a rodada seguinte só abre quando os dois chutaram.
 *  4. Quem embocar primeiro vence: pote e gol para ele, o time do outro perde 1 gol, partida gravada (FUTGOLF, chutes no
 *     placar), lance ao vivo com o nome do jogo.
 *  5. Tempo esgotado: quem não chuta perde o chute (conta 1) e, na 3ª seguida, perde por W.O.
 *  6. Desempate: os dois chutando IGUAL (a física é a mesma) embocam juntos → desempate; iguais de novo, até 3
 *     desempates → empate, aposta de volta.
 *  7. Treino com bot: o bot chuta sozinho.
 *
 * Uso (na pasta api/):  node scripts/test-futgolf.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-futgolf.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { config } = await import('../src/config.js');
const { courseOf } = await import('../src/lib/futgolf.js');
const { futgolfAiKick } = await import('../src/lib/futgolfMatch.js');
const { FUTPREGO: F } = await import('../src/lib/rules.js');

const API = process.env.FP_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(`${API}/api/health`)).ok) break; } catch {} await sleep(500); }
const status = await (await fetch(`${API}/api/x1/status`)).json();
if (status.today?.game !== 'FUTGOLF') { console.error(`o X1 de hoje na API é ${status.today?.game}: suba a API com X1_JOGO=FUTGOLF`); process.exit(1); }

const teams = await prisma.team.findMany({ take: 2, orderBy: { id: 'asc' } });
let seq = 0;
const created = [];
// VIP: sem VIP há 2 min de espera para desafiar depois de cada partida
async function mkUser(teamIdx, money = 1000) {
  const nick = `fg${Date.now() % 1e5}${seq++}`;
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@local.test`, passwordHash: 'x', teamId: teams[teamIdx].id, money, vipUntil: new Date(Date.now() + 86_400_000), tutorialStep: -1 } });
  created.push(u.id);
  return { ...u, token: jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' }) };
}
const money = async (u) => (await prisma.user.findUnique({ where: { id: u.id } })).money;

function phone(user, ip) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(user.token)}&mode=game`, { headers: { 'X-Real-IP': ip } });
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
    /** Espera a próxima mensagem que passa em `pred` (string = tipo). */
    wait(pred, ms = 8000) {
      const p = typeof pred === 'string' ? (m) => m.t === pred : pred;
      const i = box.findIndex(p);
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((resolve) => { const w = { pred: p, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); resolve(null); }, ms) }; waiters.push(w); });
    },
    has: (pred) => box.some(typeof pred === 'string' ? (m) => m.t === pred : pred),
    close: () => ws.close(),
  };
}
async function pair(ipA, ipB) {
  const A = await mkUser(0), B = await mkUser(1);
  const pa = phone(A, ipA), pb = phone(B, ipB);
  await Promise.all([pa.open, pb.open, pa.wait('hello'), pb.wait('hello')]);
  pa.send({ t: 'challenge' });
  const w = await pa.wait('waiting');
  pb.send({ t: 'accept', id: w?.id });
  const [ma, mb] = await Promise.all([pa.wait('match'), pb.wait('match')]);
  return { A, B, pa, pb, ma, mb };
}
/** Um chute bom (o mesmo bot do servidor, mira quase perfeita) a partir da bola de `side`. */
function goodKick(course, fg, side, rnd) {
  return futgolfAiKick({ course, balls: fg.balls, phase: fg.phase }, side, { skill: 0.95, rnd });
}
let seed = 777;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
/**
 * Espera a rodada fechar: a próxima `ground` ou o fim. A `ground` chega ANTES de a rodada abrir (ela espera a
 * animação dos chutes): espera abrir, como a tela faz — chute antes disso o servidor ignora.
 */
async function nextRound(p, ms = 20000) {
  const m = await p.wait((x) => x.t === 'ground' || x.t === 'over', ms);
  if (m?.t === 'ground') await sleep(Math.max(0, m.turnEndsAt - kickSec * 1000 - Date.now()) + 150);
  return m;
}
let kickSec = 20;

try {
  // ── 1 a 4: partida normal — A mira bem, B chuta fraquinho (nunca emboca)
  const { A, B, pa, pb, ma, mb } = await pair('198.51.100.61', '198.51.100.62');
  check(ma?.game === 'FUTGOLF' && mb?.game === 'FUTGOLF', 'os dois receberam a partida de Futgolf');
  check(!!ma?.course && ma.course.boundary?.length > 50 && ma.course.par >= 3 && ma.course.tee, `o buraco veio inteiro (${ma?.course?.name}, par ${ma?.course?.par}, ${ma?.course?.boundary?.length} pontos de contorno)`);
  check(ma?.fg?.strokes?.[0] === 0 && ma.fg.balls[0].x === ma.course.tee.x && ma.fg.balls[1].y === ma.course.tee.y, 'as duas bolas começam na saída, zero chutes');
  check(ma?.kickSec > 0 && typeof ma?.turnEndsAt === 'number', `tempo do chute: ${ma?.kickSec} s`);
  check((await money(A)) === 1000 - F.bet && (await money(B)) === 1000 - F.bet, 'a aposta saiu dos dois');
  const course = courseOf(ma.course.id, ma.course.mirror);
  check(JSON.stringify(course.boundary) === JSON.stringify(ma.course.boundary), 'o buraco da tela é o mesmo da física (courseOf)');
  const sa = ma.you, sb = mb.you;
  kickSec = ma.kickSec;
  // 2: cedo demais e número inválido
  pa.send({ t: 'gkick', dx: 0, dy: -1, power: 0.5, spin: 0 });
  pa.send({ t: 'gkick', dx: 'x', dy: -1, power: 0.5 });
  await sleep(700);
  check(!pa.has('gshot') && !pb.has('gshot'), 'chute antes de a rodada abrir (e com número inválido) foi ignorado');
  await sleep(Math.max(0, ma.turnEndsAt - ma.kickSec * 1000 - Date.now()) + 200);

  let fg = ma.fg, over = null, rounds = 0, sawBoth = false, repeatIgnored = null;
  while (!over && rounds < 12) {
    rounds++;
    const k = goodKick(course, fg, sa, rnd);
    pa.send({ t: 'gkick', ...k });
    const shotA = await pb.wait((m) => m.t === 'gshot' && m.side === sa, 5000); // o outro vê o chute na hora
    const mineA = await pa.wait((m) => m.t === 'gshot' && m.side === sa, 5000);
    if (rounds === 1) {
      check(!!shotA && !!mineA && shotA.frames.length > 3 && Array.isArray(shotA.events), 'o chute de A foi para as duas telas na hora (quadros e eventos)');
      check(shotA?.fg?.strokes?.[sa] === 1 && shotA.fg.kicked[sa] === true && shotA.fg.kicked[sb] === false, 'o placar de chutes andou e B ainda pode chutar');
      pa.send({ t: 'gkick', dx: 0, dy: -1, power: 1 }); // de novo na mesma rodada
      await sleep(500);
      repeatIgnored = !pa.has((m) => m.t === 'gshot' && m.side === sa);
      check(repeatIgnored, 'o segundo chute na mesma rodada foi ignorado');
    }
    // B chuta fraquinho (a rodada só fecha quando os dois chutaram — mesmo que A já tenha embocado)
    pb.send({ t: 'gkick', dx: 0.2, dy: -1, power: 0.05, spin: 0 });
    const shotB = await pa.wait((m) => m.t === 'gshot' && m.side === sb, 5000);
    if (rounds === 1) sawBoth = !!shotB && shotB.fg.strokes[sb] === 1;
    const nx = await nextRound(pa);
    if (!nx) break;
    if (nx.t === 'over') over = nx;
    else fg = nx.fg;
    pb.box.length = 0;
  }
  check(sawBoth, 'os dois chutaram na mesma rodada e o placar contou os dois');
  const overB = await pb.wait('over', 5000);
  check(!!over && over.winner === sa && over.reason === 'buraco', `A embocou primeiro e venceu (${over?.reason}, em ${over?.golf?.strokes?.[sa]} chutes, ${rounds} rodadas)`);
  check(!!overB && overB.winner === sa, 'B recebeu o fim com A vencedor');
  check(over?.golf?.hole === ma.course.name && over?.golf?.holed?.[sa] === true, 'o fim traz o placar do Futgolf (buraco e quem embocou)');
  await sleep(600);
  check((await money(A)) === 1000 - F.bet + F.bet * 2 && (await money(B)) === 1000 - F.bet, 'A levou o pote e B perdeu a aposta');
  const row = await prisma.x1Match.findFirst({ where: { OR: [{ aId: A.id }, { bId: A.id }] }, orderBy: { id: 'desc' } });
  check(row?.game === 'FUTGOLF' && row.status === 'FINISHED' && row.winnerId === A.id && row.reason === 'buraco', 'X1Match gravada: FUTGOLF, FINISHED, vencedor A, motivo buraco');
  const strokesA = sa === 0 ? row?.scoreA : row?.scoreB, strokesB = sa === 0 ? row?.scoreB : row?.scoreA;
  check(strokesA === over?.golf?.strokes?.[sa] && strokesB === over?.golf?.strokes?.[sb], `o placar gravado são os chutes (${strokesA} x ${strokesB})`);
  const lance = await prisma.activity.findFirst({ where: { userId: A.id, kind: 'FUTGOLF' }, orderBy: { id: 'desc' } });
  check(!!lance && /Futgolf/.test(lance.text), `lance ao vivo do Futgolf: "${lance?.text}"`);
  pa.close(); pb.close();

  // ── 5: W.O. — D não chuta nunca; C chuta fraquinho toda rodada
  const w = await pair('198.51.100.63', '198.51.100.64');
  await sleep(Math.max(0, w.ma.turnEndsAt - w.ma.kickSec * 1000 - Date.now()) + 200);
  let skips = 0, woOver = null;
  for (let r = 0; r < 5 && !woOver; r++) {
    w.pa.send({ t: 'gkick', dx: 0.1, dy: -1, power: 0.04 });
    const m = await w.pa.wait((x) => (x.t === 'gskip' && x.side === w.mb.you) || x.t === 'over', (w.ma.kickSec + 6) * 1000);
    if (!m) break;
    if (m.t === 'over') woOver = m;
    else { skips++; const nx = await nextRound(w.pa, (w.ma.kickSec + 6) * 1000); if (nx?.t === 'over') woOver = nx; }
  }
  check(skips >= 2, `quem não chutou perdeu o chute (${skips} vezes avisado)`);
  check(!!woOver && woOver.winner === w.ma.you && woOver.reason === 'wo', 'na 3ª vez sem chutar, W.O. para quem jogou');
  w.pa.close(); w.pb.close();

  // ── 6: desempate — os dois chutam exatamente igual
  const t = await pair('198.51.100.65', '198.51.100.66');
  const ct = courseOf(t.ma.course.id, t.ma.course.mirror);
  await sleep(Math.max(0, t.ma.turnEndsAt - t.ma.kickSec * 1000 - Date.now()) + 200);
  let fgt = t.ma.fg, tbSeen = 0, tOver = null;
  for (let r = 0; r < 20 && !tOver; r++) {
    seed = 1000 + r; // o mesmo "sorteio" para os dois
    const k = goodKick(ct, fgt, t.ma.you, rnd);
    t.pa.send({ t: 'gkick', ...k });
    t.pb.send({ t: 'gkick', ...k });
    const nx = await nextRound(t.pa);
    if (!nx) break;
    if (nx.t === 'over') tOver = nx;
    else { fgt = nx.fg; if (nx.tiebreak) tbSeen++; }
  }
  check(tbSeen >= 1, `os dois embocaram juntos: foi para o desempate (${tbSeen} desempate${tbSeen === 1 ? '' : 's'})`);
  check(!!tOver && tOver.winner === null && tOver.reason === 'empate', 'iguais em todos os desempates: empate');
  await sleep(600);
  check((await money(t.A)) === 1000 && (await money(t.B)) === 1000, 'no empate a aposta voltou para os dois');
  const lanceE = await prisma.activity.findFirst({ where: { userId: t.A.id, kind: 'FUTGOLF' }, orderBy: { id: 'desc' } });
  check(!!lanceE && /empataram no Futgolf/.test(lanceE.text), `lance do empate: "${lanceE?.text}"`);
  t.pa.close(); t.pb.close();

  // ── 7: treino com bot
  const G = await mkUser(0);
  const pg = phone(G, '198.51.100.67');
  await Promise.all([pg.open, pg.wait('hello')]);
  pg.send({ t: 'challenge' });
  await pg.wait('waiting');
  pg.send({ t: 'bot' });
  const mt = await pg.wait('match');
  check(mt?.game === 'FUTGOLF' && mt.training === true, 'treino com bot no Futgolf começou');
  const botShot = await pg.wait((m) => m.t === 'gshot' && m.side !== mt?.you, (mt?.kickSec ?? 20) * 1000 + 6000);
  check(!!botShot && botShot.frames.length > 3, 'o bot chutou sozinho');
  pg.send({ t: 'giveup' });
  const og = await pg.wait('over');
  check(!!og && og.training === true, 'desistir do treino encerra sem valer nada');
  pg.close();
} finally {
  await sleep(500);
  await prisma.activity.deleteMany({ where: { userId: { in: created } } }).catch(() => {});
  await prisma.x1Match.deleteMany({ where: { OR: [{ aId: { in: created } }, { bId: { in: created } }] } }).catch(() => {});
  await prisma.goal.deleteMany({ where: { userId: { in: created } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: created } } }).catch((e) => console.error('limpeza:', e.message));
}
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
