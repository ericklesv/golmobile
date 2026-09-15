/**
 * FutPrego — confere a física (lib/futprego.js) e mede o equilíbrio de CADA tábua do sorteio, sem banco:
 * - a mesma jogada dá sempre o mesmo caminho; toda jogada termina; a bola nunca atravessa prego;
 * - SAÍDA DO MEIO: nenhum peteleco é gol (grade de direções x forças, com a garantia da 1ª jogada) e
 *   quantos entrariam SEM a garantia (os pregos é que têm de segurar quase tudo — o prego central etc.);
 * - partidas simuladas entre dois "jogadores" que miram no gol com erro de mira: quantas acabam em gol
 *   dentro das 10 jogadas de cada (o resto é empate), em quantas jogadas, e quantos gols contra.
 *
 * Uso (na pasta api/):  node scripts/futprego-balance.js   → tem de terminar em "TUDO OK".
 */
import { BOARDS, PHYS, simulateFlick, scorerOf, targetOf } from '../src/lib/futprego.js';
import { FUTPREGO } from '../src/lib/rules.js';

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

for (const B of BOARDS) {
  console.log(`\n── ${B.name}`);
  const C = B.center;
  // determinismo
  const a = simulateFlick(C, 0.3, -1, 0.8, B), b = simulateFlick(C, 0.3, -1, 0.8, B);
  check(JSON.stringify(a) === JSON.stringify(b), `mesma jogada, mesmo caminho (${a.frames.length} quadros)`);

  // termina sempre, nunca atravessa prego nem sai da tábua (fora da boca do gol)
  let worst = 0, inside = 0, outside = 0;
  const rr = B.ball + B.nail;
  for (let i = 0; i < 1500; i++) {
    const start = { x: 20 + rnd() * (B.W - 40), y: 20 + rnd() * (B.H - 40) };
    if (B.nails.some((n) => Math.hypot(start.x - n.x, start.y - n.y) < rr)) continue;
    const ang = rnd() * Math.PI * 2;
    const r = simulateFlick(start, Math.cos(ang), Math.sin(ang), rnd(), B);
    worst = Math.max(worst, r.frames.length);
    for (const [x, y] of r.frames.slice(1, r.goal ? -1 : undefined)) {
      if (B.nails.some((n) => Math.hypot(x - n.x, y - n.y) < rr - 0.6)) inside++;
      const inMouth = x > B.goalX[0] && x < B.goalX[1];
      if (x < B.ball - 0.6 || x > B.W - B.ball + 0.6 || (!inMouth && (y < B.ball - 0.6 || y > B.H - B.ball + 0.6))) outside++;
    }
  }
  check(worst <= PHYS.maxSec * 30 + 3 && inside === 0 && outside === 0, `toda jogada termina (máx. ${(worst / 30).toFixed(1)} s), não atravessa prego nem sai da tábua`);

  // saída do meio: com a garantia, zero; sem ela, os pregos seguram quase tudo
  let withGuard = 0, noGuard = 0, n = 0, natural = 0, naturalN = 0;
  for (let i = 0; i < 1440; i++) {
    const ang = (i / 1440) * Math.PI * 2;
    for (let j = 0; j < 20; j++) {
      const p = 0.05 + (j * 0.95) / 19;
      n++;
      if (simulateFlick(C, Math.cos(ang), Math.sin(ang), p, B, { closedGoals: true }).goal) withGuard++;
      const g = simulateFlick(C, Math.cos(ang), Math.sin(ang), p, B).goal;
      if (g) noGuard++;
      const fromVertical = Math.abs(((ang * 180) / Math.PI) - 270); // mirando o gol de cima (±25°)
      if (fromVertical <= 25) { naturalN++; if (g) natural++; }
    }
  }
  check(withGuard === 0, `saída do meio: nenhum dos ${n} petelecos vira gol`);
  check(noGuard / n < 0.01, `sem a garantia, os pregos já seguram ${(100 - (100 * noGuard) / n).toFixed(2)}% (mirando o gol: ${(100 - (100 * natural) / naturalN).toFixed(2)}%)`);

  // partidas simuladas
  for (const err of [8, 15, 25]) {
    let goals = 0, sum = 0, own = 0, total = 1500;
    for (let k = 0; k < total; k++) {
      let ball = { ...C }, turn = rnd() < 0.5 ? 0 : 1, shots = 0;
      const turns = [0, 0];
      let scored = false;
      while (turns[0] < FUTPREGO.maxTurns || turns[1] < FUTPREGO.maxTurns) {
        const t = targetOf(turn);
        const base = Math.atan2(t.y - ball.y, t.x - ball.x) + (gauss() * err * Math.PI) / 180;
        const r = simulateFlick(ball, Math.cos(base), Math.sin(base), 0.5 + rnd() * 0.5, B, { closedGoals: shots === 0 });
        shots++; turns[turn]++;
        if (r.goal) { goals++; sum += turns[0] + turns[1]; scored = true; if (scorerOf(r.goal) !== turn) own++; break; }
        ball = r.end; turn = 1 - turn;
      }
      if (!scored) sum += 2 * FUTPREGO.maxTurns;
    }
    console.log(`     mira ±${String(err).padStart(2)}°: ${((100 * goals) / total).toFixed(0)}% das partidas têm gol (média ${(sum / total).toFixed(1)} jogadas), ${((100 * own) / total).toFixed(0)}% gol contra`);
    if (err === 15) check(goals / total >= 0.75, 'com mira razoável, a maioria das partidas termina em gol (poucos empates)');
  }
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
