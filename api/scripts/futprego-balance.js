/**
 * FutPrego — confere a física (lib/futprego.js) e mede o equilíbrio, sem banco:
 * - a mesma jogada dá sempre o mesmo caminho; toda jogada termina; a bola nunca atravessa prego;
 * - de quantos jeitos dá para marcar do meio de campo (chute forte, 360 direções);
 * - partidas simuladas entre dois "jogadores" que miram no gol com erro de mira: quantas acabam em gol
 *   dentro das 10 jogadas de cada (o resto é empate), em quantas jogadas, e quantos gols contra.
 *
 * Uso (na pasta api/):  node scripts/futprego-balance.js   → tem de terminar em "TUDO OK".
 */
import { BOARD, PHYS, simulateFlick, scorerOf, targetOf } from '../src/lib/futprego.js';
import { FUTPREGO } from '../src/lib/rules.js';

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// determinismo
const a = simulateFlick(BOARD.center, 0.3, -1, 0.8), b = simulateFlick(BOARD.center, 0.3, -1, 0.8);
check(JSON.stringify(a) === JSON.stringify(b), `mesma jogada, mesmo caminho (${a.frames.length} quadros, ${a.hits} batidas em prego)`);

// termina sempre, nunca atravessa prego nem sai da tábua (fora da boca do gol)
let worst = 0, inside = 0, outside = 0;
const rr = BOARD.ball + BOARD.nail;
for (let i = 0; i < 3000; i++) {
  const start = { x: 20 + rnd() * (BOARD.W - 40), y: 20 + rnd() * (BOARD.H - 40) };
  const ang = rnd() * Math.PI * 2;
  const r = simulateFlick(start, Math.cos(ang), Math.sin(ang), rnd());
  worst = Math.max(worst, r.frames.length);
  for (const [x, y] of r.frames.slice(1, r.goal ? -1 : undefined)) {
    if (BOARD.nails.some((n) => Math.hypot(x - n.x, y - n.y) < rr - 0.6)) inside++;
    const inMouth = x > BOARD.goalX[0] && x < BOARD.goalX[1];
    if (x < BOARD.ball - 0.6 || x > BOARD.W - BOARD.ball + 0.6 || (!inMouth && (y < BOARD.ball - 0.6 || y > BOARD.H - BOARD.ball + 0.6))) outside++;
  }
}
check(worst <= PHYS.maxSec * 30 + 3, `toda jogada termina (a mais longa: ${worst} quadros = ${(worst / 30).toFixed(1)} s)`);
check(inside === 0, `a bola nunca fica dentro de um prego (${inside} quadros)`);
check(outside === 0, `a bola nunca sai da tábua fora do gol (${outside} quadros)`);

// do meio de campo, chute forte: quantas das 360 direções entram no gol de cima (o lado 0 ataca para cima)
let top = 0, bottom = 0;
for (let d = 0; d < 360; d++) {
  const ang = (d * Math.PI) / 180;
  const r = simulateFlick(BOARD.center, Math.cos(ang), Math.sin(ang), 1);
  if (r.goal === 'top') top++; else if (r.goal === 'bottom') bottom++;
}
console.log(`     do meio, força máxima: ${top} de 360 direções entram no gol de cima, ${bottom} no de baixo`);
check(top >= 3 && top <= 60, 'do meio dá para marcar, mas não de qualquer jeito');

// partidas simuladas: cada um mira no gol do outro com erro de mira (desvio padrão `aimErr` graus)
function matchSim(aimErr) {
  let ball = { ...BOARD.center }, turn = rnd() < 0.5 ? 0 : 1;
  const turns = [0, 0];
  while (turns[0] < FUTPREGO.maxTurns || turns[1] < FUTPREGO.maxTurns) {
    const t = targetOf(turn);
    const base = Math.atan2(t.y - ball.y, t.x - ball.x) + (gauss() * aimErr * Math.PI) / 180;
    const r = simulateFlick(ball, Math.cos(base), Math.sin(base), 0.55 + rnd() * 0.45);
    turns[turn]++;
    if (r.goal) { const s = scorerOf(r.goal); return { goal: true, own: s !== turn, turns: turns[0] + turns[1] }; }
    ball = r.end; turn = 1 - turn;
  }
  return { goal: false, turns: turns[0] + turns[1] };
}
for (const err of [6, 12, 20]) {
  const res = Array.from({ length: 4000 }, () => matchSim(err));
  const goals = res.filter((r) => r.goal);
  const avg = goals.reduce((s, r) => s + r.turns, 0) / (goals.length || 1);
  const own = goals.filter((r) => r.own).length;
  console.log(`     mira ±${String(err).padStart(2)}°: ${(goals.length / 40).toFixed(1)}% das partidas têm gol (média ${avg.toFixed(1)} jogadas no total), ${(own / 40).toFixed(1)}% gol contra, ${((res.length - goals.length) / 40).toFixed(1)}% empate`);
  if (err === 12) check(goals.length / res.length > 0.6, 'com mira razoável, a maioria das partidas termina em gol (poucos empates)');
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
