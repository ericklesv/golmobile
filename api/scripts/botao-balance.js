/**
 * Futebol de Botão — confere a física (lib/botao.js) e as regras (lib/botaoMatch.js), sem banco:
 * - a mesma jogada dá sempre o mesmo resultado; toda jogada termina;
 * - botão de linha nunca entra em área; goleiro nunca sai da área; nada sai do campo (só a bola, no gol);
 * - saída do meio: quantos petelecos da 1ª jogada entram direto no gol;
 * - partidas bot x bot: como terminam (3 gols, tempo, pênaltis, empate), quantos turnos e petelecos.
 *
 * Uso (na pasta api/):  node scripts/botao-balance.js   → tem de terminar em "TUDO OK".
 */
import { BOTAO_FIELD as F, kickoffLayout, penaltyLayout, simulateSnap, botaoScorer } from '../src/lib/botao.js';
import { newBotaoMatch, applySnap, skipSnap, botaoBotMove, movablePieces } from '../src/lib/botaoMatch.js';
import { BOTAO } from '../src/lib/rules.js';

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
let seed = 2024;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// determinismo
const k = kickoffLayout();
const a = simulateSnap(k, 6, 0.1, -1, 0.9), b = simulateSnap(k, 6, 0.1, -1, 0.9);
check(JSON.stringify(a) === JSON.stringify(b), `mesma jogada, mesmo resultado (${a.frames.length} quadros)`);

// regras de posição, com petelecos sorteados a partir de posições embaralhadas
let worst = 0, badBox = 0, badGk = 0, outside = 0;
const inBox = (p, box, r) => p.x > box.x0 - r + 0.8 && p.x < box.x1 + r - 0.8 && p.y > box.y0 - r + 0.8 && p.y < box.y1 + r - 0.8
  && Math.hypot(Math.max(box.x0 - p.x, 0, p.x - box.x1), Math.max(box.y0 - p.y, 0, p.y - box.y1)) < r - 0.8;
let state = kickoffLayout();
for (let i = 0; i < 1500; i++) {
  const idx = Math.floor(rnd() * state.pieces.length);
  const ang = rnd() * Math.PI * 2;
  const r = simulateSnap(state, idx, Math.cos(ang), Math.sin(ang), rnd());
  worst = Math.max(worst, r.frames.length);
  for (const fr of r.frames.slice(1, r.goal ? -1 : undefined)) {
    fr.slice(1).forEach(([x, y], j) => {
      const p = state.pieces[j];
      if (!p.gk && F.boxes.some((bx) => inBox({ x, y }, bx, F.piece))) badBox++;
      if (p.gk) { const bx = F.boxes[p.side]; if (x < bx.x0 + F.piece - 0.8 || x > bx.x1 - F.piece + 0.8 || y < bx.y0 + F.piece - 0.8 - (bx.y0 === 0 ? 0 : 0) || y > bx.y1 - F.piece + 0.8) badGk++; }
      if (x < F.piece - 0.8 || x > F.W - F.piece + 0.8 || y < F.piece - 0.8 || y > F.H - F.piece + 0.8) outside++;
    });
  }
  state = r.goal ? kickoffLayout() : { ball: r.ball, pieces: r.pieces };
}
check(worst <= 8 * 30 + 3, `toda jogada termina (máx. ${(worst / 30).toFixed(1)} s)`);
check(badBox === 0, `botão de linha nunca entra na área (${badBox})`);
check(badGk === 0, `goleiro nunca sai da área (${badGk})`);
check(outside === 0, `nenhum botão sai do campo (${outside})`);

// saída do meio: a 1ª jogada da partida (qualquer botão do lado 0, qualquer direção e força)
let koGoals = 0, koN = 0;
const ko = kickoffLayout();
for (const idx of [1, 2, 3, 4, 5, 6]) for (let i = 0; i < 360; i++) for (const p of [0.3, 0.6, 0.8, 1]) {
  const ang = (i / 360) * Math.PI * 2; koN++;
  if (botaoScorer(simulateSnap(ko, idx, Math.cos(ang), Math.sin(ang), p).goal) !== null) koGoals++;
}
console.log(`     saída: ${koGoals} de ${koN} petelecos da 1ª jogada viram gol (${((100 * koGoals) / koN).toFixed(2)}%)`);

// pênalti: o bot cobrando contra o goleiro parado num lugar sorteado
let penGoals = 0;
for (let i = 0; i < 300; i++) {
  const lay = penaltyLayout(0, Math.round((rnd() * 2 - 1) * 16));
  const s = { phase: 'penalties', pieces: lay.pieces, ball: lay.ball, turn: 0, over: null };
  const mv = botaoBotMove(s, 0, rnd, 0.55);
  if (botaoScorer(simulateSnap(s, mv.idx, mv.dx, mv.dy, mv.power).goal) === 0) penGoals++;
}
console.log(`     pênalti (bot): ${((100 * penGoals) / 300).toFixed(0)}% de gols`);
check(penGoals > 30 && penGoals < 290, 'pênalti não é certo nem impossível');

// partidas bot x bot
const ends = { gols: 0, tempo: 0, penaltis: 0, empate: 0 }; // gols = acabou no gol (o 1º gol acaba)
let turnsSum = 0, snapsSum = 0, goalsSum = 0;
const N = 150;
for (let g = 0; g < N; g++) {
  const s = newBotaoMatch(g % 2);
  let snaps = 0, guard = 0;
  while (!s.over && guard++ < 400) {
    const side = s.turn;
    const mv = botaoBotMove(s, side, rnd, 0.5);
    if (!mv) { skipSnap(s, rnd); continue; }
    const r = applySnap(s, side, mv.idx, mv.dx, mv.dy, mv.power, rnd);
    snaps++;
    if (!r) break;
  }
  ends[s.over?.reason ?? 'empate']++;
  turnsSum += s.turnNo; snapsSum += snaps; goalsSum += s.score[0] + s.score[1];
}
console.log(`     ${N} partidas bot x bot: ${ends.gols} no gol, ${ends.tempo} no tempo, ${ends.penaltis} nos pênaltis, ${ends.empate} empate | média ${(turnsSum / N).toFixed(1)} turnos, ${(snapsSum / N).toFixed(0)} petelecos, ${(goalsSum / N).toFixed(1)} gols`);
check(ends.gols + ends.tempo + ends.penaltis >= N - 2, 'quase toda partida tem vencedor');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
