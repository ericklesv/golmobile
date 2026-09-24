/**
 * Futgolf: física e equilíbrio dos buracos, sem banco e sem servidor (lib/futgolf.js + lib/futgolfMatch.js).
 *
 * O que ele mede, buraco por buraco (normal e espelhado), com o VENTO mudando a cada chute como na partida:
 *  - chutes para embocar de um bot sozinho em cada nível (skill) — tem de ficar perto do par;
 *  - partidas de bot contra bot: quantas rodadas duram, quantas vão para o desempate e dão empate;
 *  - quantas vezes o chute termina na lagoa, sobe numa mola, pega uma seta, cai num bueiro ou decola numa rampa;
 *  - as duas ROTAS da Bifurcação (1º chute forçado para a esquerda ou para a direita, depois o bot joga normal) — o
 *    dono pediu as duas equilibradas (24/09/2026);
 *  - o bueiro 3 do Bueiros (duas saídas sorteadas): quanto o bot o usa e quantos chutes dá com sorte e com azar;
 *  - o CAMPO DO DESEMPATE: quantas vezes emboca de primeira (tem de ser raro) e a que distância a bola para;
 *  - o tempo da jogada do bot (roda no servidor: não pode segurar a API);
 * e confere: a mesma jogada dá sempre o mesmo resultado, e nenhuma bola para fora do campo.
 *
 * Uso (pasta api/):  node scripts/futgolf-balance.js [partidas por buraco = 60]
 */
import { HOLES, TIEBREAK_HOLE, courseOf, simulateKick, inPlay, windRoll, windShift, distanceField, surfaceAt } from '../src/lib/futgolf.js';
import { newFutgolfMatch, golfKick, golfCloseRound, golfRoundDone, golfActive, futgolfAiKick } from '../src/lib/futgolfMatch.js';

const N = Number(process.argv[2]) || 60;
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let fails = 0;
const check = (ok, label) => { if (!ok) { fails++; console.log(`FALHOU ${label}`); } };

// determinismo: o mesmo chute duas vezes (com vento e rampa)
for (const h of HOLES) {
  const c = courseOf(h.id, false);
  const w = { ang: 75, str: 3 };
  const a = simulateKick(c, c.tee, 0.3, -1, 0.8, 1, w), b = simulateKick(c, c.tee, 0.3, -1, 0.8, 1, w);
  check(JSON.stringify(a) === JSON.stringify(b), `${h.id}: o mesmo chute deu resultados diferentes`);
}

// toda saída de bueiro (as duas, no de duas saídas) tem de ficar dentro do campo, longe da placa
for (const h of HOLES) for (const mirror of [false, true]) {
  const c = courseOf(h.id, mirror);
  c.tuneis.forEach((t, k) => {
    for (const sai of [t, t.alt].filter(Boolean)) {
      const [ux, uy] = [Math.sin((sai.out * Math.PI) / 180), -Math.cos((sai.out * Math.PI) / 180)];
      const ok = [0, 22, 40].every((d) => inPlay(c, sai.b.x + ux * d, sai.b.y + uy * d));
      check(ok, `${h.id}${mirror ? ' espelhado' : ''}: a saída do bueiro ${k + 1} em (${sai.b.x}, ${sai.b.y}) está fora do campo ou colada na placa`);
    }
  });
}

const aiTimes = [];
const EV = () => ({ agua: 0, mola: 0, seta: 0, tunel: 0, rampa: 0, sorte: 0, azar: 0 });
/** A partida no buraco pedido (newFutgolfMatch espelha quando o 2º sorteio dá < 0,5), com vento e bueiros sorteados. */
function matchOn(holeId, mirror) {
  const s = newFutgolfMatch(() => (mirror ? 0.1 : 0.9), holeId);
  s.wind = windRoll(rnd); s.luck = 1 + Math.floor(rnd() * 2147483645);
  return s;
}
/** Um bot sozinho até embocar (ou 12 chutes). `first` = um chute forçado no começo (as rotas). */
function solo(holeId, mirror, skill, first = null) {
  const s = matchOn(holeId, mirror);
  s.cap = 99;
  const ev = EV();
  while (!s.holed[0] && s.strokes[0] < 12) {
    const t0 = performance.now();
    const k = s.strokes[0] === 0 && first ? first(s) : futgolfAiKick(s, 0, { skill, rnd });
    aiTimes.push(performance.now() - t0);
    const r = golfKick(s, 0, k.dx, k.dy, k.power, k.spin);
    for (const e of r.sim.events) { if (e.t in ev) ev[e.t]++; if (e.azar !== undefined) ev[e.azar ? 'azar' : 'sorte']++; }
    check(inPlay(s.course, s.balls[0].x, s.balls[0].y), `${holeId}${mirror ? ' espelhado' : ''}: a bola parou fora do campo em (${s.balls[0].x}, ${s.balls[0].y})`);
    s.kicked = [false, false];
    s.wind = windShift(s.wind, rnd);
  }
  return { strokes: s.strokes[0], holed: s.holed[0], ev };
}

function versus(holeId, mirror, skills) {
  const s = matchOn(holeId, mirror);
  let rounds = 0, tb = false;
  for (let guard = 0; guard < 40 && !s.over; guard++) {
    for (const side of [0, 1]) if (golfActive(s, side) && !s.kicked[side]) { const k = futgolfAiKick(s, side, { skill: skills[side], rnd }); golfKick(s, side, k.dx, k.dy, k.power, k.spin); }
    if (golfRoundDone(s)) { rounds++; const r = golfCloseRound(s, rnd); if (r.t === 'tiebreak') tb = true; }
  }
  return { over: s.over, rounds, tb };
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
console.log(`Futgolf — ${N} jogadas por buraco e nível (bot sozinho) e ${N} partidas de bot x bot por buraco, com vento\n`);
console.log('buraco        par | chutes p/ embocar (skill 0,25 · 0,4 · 0,55 · 0,9) | lagoa  mola  seta bueiro rampa por chute | bot x bot: rodadas  desempate  empate  vence o melhor');
for (const h of HOLES) {
  const cols = [], ev = EV();
  let kicks = 0;
  for (const skill of [0.25, 0.4, 0.55, 0.9]) {
    const xs = [];
    let miss = 0;
    for (let i = 0; i < N; i++) {
      const r = solo(h.id, i % 2 === 1, skill);
      xs.push(r.strokes); kicks += r.strokes;
      for (const k in ev) ev[k] += r.ev[k];
      if (!r.holed) miss++;
    }
    // um bot muito azarado passar de 12 acontece; um buraco em que 1 de cada 10 não emboca está quebrado
    check(miss <= Math.max(1, N * 0.05), `${h.id}: skill ${skill} não embocou em 12 chutes em ${miss} de ${N}`);
    cols.push(avg(xs).toFixed(2));
  }
  let rounds = [], tbs = 0, draws = 0, better = 0, decided = 0;
  for (let i = 0; i < N; i++) {
    const sk = i % 2 ? [0.3, 0.55] : [0.55, 0.3];
    const v = versus(h.id, i % 4 >= 2, sk);
    rounds.push(v.rounds); if (v.tb) tbs++;
    if (!v.over || v.over.winner === null) draws++;
    else { decided++; if (sk[v.over.winner] === 0.55) better++; }
  }
  const pct = (n, d) => `${Math.round((100 * n) / (d || 1))}%`.padStart(4);
  const per = (k) => (ev[k] / kicks).toFixed(2).padStart(5);
  console.log(`${h.id.padEnd(12)} ${h.par}  | ${cols.map((c) => c.padStart(5)).join('  ')}                 | ${per('agua')} ${per('mola')} ${per('seta')} ${per('tunel')} ${per('rampa')}          | ${avg(rounds).toFixed(1).padStart(8)} ${pct(tbs, N).padStart(10)} ${pct(draws, N).padStart(7)} ${pct(better, decided).padStart(10)}`);
}

// ── as duas rotas da Bifurcação: o 1º chute é o melhor que TERMINA naquela pista (com o erro do nível), depois o bot
console.log('\nBifurcação — as duas rotas (1º chute forçado para a pista, depois o bot joga normal):');
function routeKick(side, skill) {
  return (s) => {
    const c = s.course, from = s.balls[0], field = distanceField(c);
    const inLane = (e) => (side === 'esq' ? e.x < c.W / 2 - 60 : e.x > c.W / 2 + 60) && e.y < from.y - 150;
    let best = null;
    for (let deg = -75; deg <= 75; deg += 5) for (let pw = 0.3; pw <= 1.001; pw += 0.1) for (const sp of [-1, 0, 1]) {
      const a = ((deg - 90) * Math.PI) / 180;
      const r = simulateKick(c, from, Math.cos(a), Math.sin(a), pw, sp, s.wind);
      if (r.water || !inLane(r.end)) continue;
      const sc = -field.at(r.end.x, r.end.y) - (surfaceAt(c, r.end.x, r.end.y) === 'areia' ? 60 : 0);
      if (!best || sc > best.sc) best = { a, pw, sp, sc };
    }
    if (!best) return { dx: 0, dy: -1, power: 0.5, spin: 0 };
    const ang = best.a + gauss() * (0.012 + (1 - skill) * 0.07), pw = Math.max(0.03, Math.min(1, best.pw * (1 + gauss() * (0.03 + (1 - skill) * 0.09))));
    return { dx: Math.cos(ang), dy: Math.sin(ang), power: pw, spin: best.sp };
  };
}
for (const skill of [0.4, 0.7]) {
  const res = {};
  for (const side of ['esq', 'dir']) {
    const xs = [], ev = EV();
    for (let i = 0; i < Math.max(20, Math.round(N / 2)); i++) { const r = solo('bifurcacao', false, skill, routeKick(side, skill)); xs.push(r.strokes); for (const k in ev) ev[k] += r.ev[k]; }
    res[side] = { m: avg(xs), agua: ev.agua / xs.length, rampa: ev.rampa / xs.length, seta: ev.seta / xs.length };
  }
  const d = Math.abs(res.esq.m - res.dir.m);
  console.log(`  skill ${skill}: esquerda (setas + lagoa) ${res.esq.m.toFixed(2)} chutes · ${res.esq.agua.toFixed(2)} lagoa/partida | direita (rampa + terrão) ${res.dir.m.toFixed(2)} chutes · ${res.dir.rampa.toFixed(2)} rampa/partida | diferença ${d.toFixed(2)}`);
  check(d <= 0.45, `Bifurcação desequilibrada no skill ${skill}: ${res.esq.m.toFixed(2)} × ${res.dir.m.toFixed(2)}`);
}

// ── o bueiro 3 do Bueiros: metade das vezes sai perto do buraco, metade volta para trás
console.log('\nBueiros — o bueiro de duas saídas (bot sozinho, normal e espelhado):');
for (const skill of [0.4, 0.7]) {
  const by = { sorte: [], azar: [], nao: [] };
  for (let i = 0; i < N; i++) {
    const r = solo('bueiros', i % 2 === 1, skill);
    (r.ev.azar ? by.azar : r.ev.sorte ? by.sorte : by.nao).push(r.strokes);
  }
  const f = (xs) => `${xs.length} partidas, ${avg(xs).toFixed(2)} chutes`;
  console.log(`  skill ${skill}: só sorte ${f(by.sorte)} · pegou azar ${f(by.azar)} · não usou ${f(by.nao)}`);
  check(by.sorte.length + by.azar.length > 0, `Bueiros: o bot nunca usou o bueiro de duas saídas no skill ${skill}`);
  if (by.sorte.length >= 3 && by.azar.length >= 3) check(avg(by.azar) - avg(by.sorte) >= 1, `Bueiros: o azar do bueiro não pesa (${avg(by.sorte).toFixed(2)} × ${avg(by.azar).toFixed(2)})`);
}

// ── campo do desempate: embocar de primeira tem de ser raro
console.log('\nCampo do desempate — um chute de cada, do X (vento sorteado):');
const tbc = courseOf(TIEBREAK_HOLE.id);
for (const skill of [0.4, 0.9]) {
  let hio = 0, water = 0;
  const ds = [];
  for (let i = 0; i < N * 2; i++) {
    const s = { course: tbc, balls: [{ ...tbc.tb }, { ...tbc.tb }], phase: 'tiebreak', wind: windRoll(rnd) };
    const k = futgolfAiKick(s, 0, { skill, rnd });
    const r = simulateKick(tbc, tbc.tb, k.dx, k.dy, k.power, k.spin, s.wind);
    if (r.holed) hio++; else if (r.water) water++; else ds.push(Math.hypot(r.end.x - tbc.cup.x, r.end.y - tbc.cup.y));
    check(inPlay(tbc, r.end.x, r.end.y), 'desempate: bola fora do campo');
  }
  ds.sort((a, b) => a - b);
  console.log(`  skill ${skill}: embocou de primeira ${((100 * hio) / (N * 2)).toFixed(1)}% · distância mediana ${ds[Math.floor(ds.length / 2)]?.toFixed(0)} · 10% mais perto ${ds[Math.floor(ds.length / 10)]?.toFixed(0)}`);
  check(hio / (N * 2) <= 0.08, `desempate: embocou de primeira em ${hio} de ${N * 2} no skill ${skill} (tem de ser raro)`);
}

aiTimes.sort((a, b) => a - b);
console.log(`\njogada do bot: média ${avg(aiTimes).toFixed(0)} ms · 95% até ${aiTimes[Math.floor(aiTimes.length * 0.95)].toFixed(0)} ms · pior ${aiTimes[aiTimes.length - 1].toFixed(0)} ms`);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
