/**
 * Futgolf: física e equilíbrio dos buracos, sem banco e sem servidor (lib/futgolf.js + lib/futgolfMatch.js).
 *
 * O que ele mede, buraco por buraco (normal e espelhado):
 *  - chutes para embocar de um bot sozinho em cada nível (skill) — tem de ficar perto do par;
 *  - partidas de bot contra bot: quantas rodadas duram, quantas vão para o desempate e dão empate;
 *  - quantas vezes o chute termina na lagoa, sobe numa mola, pega uma seta ou cai num bueiro;
 *  - o tempo da jogada do bot (roda no servidor: não pode segurar a API);
 * e confere: a mesma jogada dá sempre o mesmo resultado, e nenhuma bola para fora do campo.
 *
 * Uso (pasta api/):  node scripts/futgolf-balance.js [partidas por buraco = 60]
 */
import { HOLES, courseOf, simulateKick, inPlay } from '../src/lib/futgolf.js';
import { newFutgolfMatch, golfKick, golfCloseRound, golfRoundDone, golfActive, futgolfAiKick } from '../src/lib/futgolfMatch.js';

const N = Number(process.argv[2]) || 60;
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let fails = 0;
const check = (ok, label) => { if (!ok) { fails++; console.log(`FALHOU ${label}`); } };

// determinismo: o mesmo chute duas vezes
for (const h of HOLES) {
  const c = courseOf(h.id, false);
  const a = simulateKick(c, c.tee, 0.3, -1, 0.8, 1), b = simulateKick(c, c.tee, 0.3, -1, 0.8, 1);
  check(JSON.stringify(a) === JSON.stringify(b), `${h.id}: o mesmo chute deu resultados diferentes`);
}

const aiTimes = [];
function solo(holeId, mirror, skill) {
  const s = newFutgolfMatch(() => (mirror ? 0.9 : 0.1), holeId);
  s.cap = 99;
  const ev = { agua: 0, mola: 0, seta: 0, tunel: 0 };
  while (!s.holed[0] && s.strokes[0] < 12) {
    const t0 = performance.now();
    const k = futgolfAiKick(s, 0, { skill, rnd });
    aiTimes.push(performance.now() - t0);
    const r = golfKick(s, 0, k.dx, k.dy, k.power, k.spin);
    for (const e of r.sim.events) if (e.t in ev) ev[e.t]++;
    check(inPlay(s.course, s.balls[0].x, s.balls[0].y), `${holeId}${mirror ? ' espelhado' : ''}: a bola parou fora do campo em (${s.balls[0].x}, ${s.balls[0].y})`);
    s.kicked = [false, false];
  }
  return { strokes: s.strokes[0], holed: s.holed[0], ev };
}

function versus(holeId, mirror, skills) {
  const s = newFutgolfMatch(() => (mirror ? 0.9 : 0.1), holeId);
  let rounds = 0, tb = false;
  for (let guard = 0; guard < 40 && !s.over; guard++) {
    for (const side of [0, 1]) if (golfActive(s, side) && !s.kicked[side]) { const k = futgolfAiKick(s, side, { skill: skills[side], rnd }); golfKick(s, side, k.dx, k.dy, k.power, k.spin); }
    if (golfRoundDone(s)) { rounds++; const r = golfCloseRound(s); if (r.t === 'tiebreak') tb = true; }
  }
  return { over: s.over, rounds, tb };
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
console.log(`Futgolf — ${N} jogadas por buraco e nível (bot sozinho) e ${N} partidas de bot x bot por buraco\n`);
console.log('buraco        par | chutes p/ embocar (skill 0,25 · 0,4 · 0,55 · 0,9) | lagoa  mola  seta  bueiro por chute | bot x bot: rodadas  desempate  empate  vence o melhor');
for (const h of HOLES) {
  const cols = [], ev = { agua: 0, mola: 0, seta: 0, tunel: 0 };
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
  console.log(`${h.id.padEnd(12)} ${h.par}  | ${cols.map((c) => c.padStart(5)).join('  ')}                 | ${(ev.agua / kicks).toFixed(2).padStart(5)} ${(ev.mola / kicks).toFixed(2).padStart(5)} ${(ev.seta / kicks).toFixed(2).padStart(5)} ${(ev.tunel / kicks).toFixed(2).padStart(6)}          | ${avg(rounds).toFixed(1).padStart(8)} ${pct(tbs, N).padStart(10)} ${pct(draws, N).padStart(7)} ${pct(better, decided).padStart(10)}`);
}
aiTimes.sort((a, b) => a - b);
console.log(`\njogada do bot: média ${avg(aiTimes).toFixed(0)} ms · 95% até ${aiTimes[Math.floor(aiTimes.length * 0.95)].toFixed(0)} ms · pior ${aiTimes[aiTimes.length - 1].toFixed(0)} ms`);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
