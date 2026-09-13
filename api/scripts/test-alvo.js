/**
 * Teste das regras puras do Alvo no Gol (lib/alvo.js), sem banco:
 *   node scripts/test-alvo.js
 * Confere tabuleiro determinístico e sem sobreposição, contagem de acerto/derrubado,
 * fim de jogo e a tabela de recompensa; no fim, simula um jogador "caçador" para dar
 * uma ideia da dificuldade (% de gol e % de derrubar tudo).
 */
import assert from 'node:assert/strict';
import { ALVO } from '../src/lib/rules.js';
import { layoutFor, applyShot, summarize, rewardFor, occupiedCells } from '../src/lib/alvo.js';

const total = ALVO.cols * ALVO.rows;
const occupied = ALVO.pieces.reduce((n, p) => n + p.size, 0);

// 1) determinístico + sem sobreposição + peças em linha/coluna, dentro da grade
for (let u = 1; u <= 2000; u++) {
  const day = 100 + (u % 7);
  const a = layoutFor(u, day);
  const b = layoutFor(u, day);
  assert.deepEqual(a, b, 'mesmo jogador/dia = mesmo tabuleiro');
  assert.equal(a.length, ALVO.pieces.length);
  const all = a.flatMap((p) => p.cells);
  assert.equal(all.length, occupied);
  assert.equal(new Set(all).size, occupied, `sobreposição no jogador ${u}`);
  for (const p of a) {
    assert.equal(p.cells.length, p.size);
    assert.ok(p.cells.every((c) => c >= 0 && c < total), 'casa fora da grade');
    const rows = new Set(p.cells.map((c) => Math.floor(c / ALVO.cols)));
    const cols = new Set(p.cells.map((c) => c % ALVO.cols));
    assert.ok(rows.size === 1 || cols.size === 1, 'peça torta');
    const sorted = [...p.cells].sort((x, y) => x - y);
    const step = rows.size === 1 ? 1 : ALVO.cols;
    for (let k = 1; k < sorted.length; k++) assert.equal(sorted[k] - sorted[k - 1], step, 'peça com buraco');
  }
}
assert.notDeepEqual(layoutFor(1, 100), layoutFor(1, 101), 'dia diferente = tabuleiro diferente');
assert.notDeepEqual(layoutFor(1, 100), layoutFor(2, 100), 'jogador diferente = tabuleiro diferente');
console.log('ok  tabuleiro determinístico, sem sobreposição (2000 jogadores)');

// 2) acerto / vazio / derrubou / repetido / fora da grade
{
  const pieces = layoutFor(7, 123);
  const gk = pieces.find((p) => p.kind === 'goleiro');
  const empty = Array.from({ length: total }, (_, i) => i).find((i) => !pieces.some((p) => p.cells.includes(i)));
  let shots = [];
  assert.deepEqual(applyShot(pieces, shots, empty), { hit: false, piece: null, sunk: false });
  shots.push(empty);
  assert.throws(() => applyShot(pieces, shots, empty), (e) => e.code === 'repeated');
  assert.throws(() => applyShot(pieces, shots, total), (e) => e.code === 'bad-cell');
  assert.throws(() => applyShot(pieces, shots, -1), (e) => e.code === 'bad-cell');
  assert.throws(() => applyShot(pieces, shots, 1.5), (e) => e.code === 'bad-cell');
  const gi = pieces.indexOf(gk);
  let r = applyShot(pieces, shots, gk.cells[0]); shots.push(gk.cells[0]);
  assert.deepEqual(r, { hit: true, piece: gi, sunk: false });
  r = applyShot(pieces, shots, gk.cells[1]); shots.push(gk.cells[1]);
  assert.deepEqual(r, { hit: true, piece: gi, sunk: false });
  r = applyShot(pieces, shots, gk.cells[2]); shots.push(gk.cells[2]);
  assert.deepEqual(r, { hit: true, piece: gi, sunk: true }, 'goleiro cai na 3ª casa');
  const s = summarize(pieces, shots);
  assert.equal(s.hits, 3); assert.equal(s.sunkCount, 1); assert.equal(s.sunk[gi], true);
  assert.equal(s.finished, false); assert.equal(s.shotsLeft, ALVO.shots - 4);
  assert.equal(s.occupied, occupied); assert.equal(occupiedCells(pieces), occupied);
  console.log('ok  acerto / vazio / derrubou / repetido / fora da grade');
}

// 3) fim de jogo: chutes acabaram (sem derrubar tudo) e tudo derrubado (antes de acabar)
{
  const pieces = layoutFor(9, 200);
  const empties = Array.from({ length: total }, (_, i) => i).filter((i) => !pieces.some((p) => p.cells.includes(i)));
  assert.ok(empties.length >= ALVO.shots, 'precisa dar para errar todos os chutes');
  const shots = empties.slice(0, ALVO.shots);
  const s = summarize(pieces, shots);
  assert.equal(s.finished, true); assert.equal(s.hits, 0); assert.equal(s.shotsLeft, 0); assert.equal(s.allSunk, false);
  assert.deepEqual(rewardFor(s.hits, s.allSunk), { goal: false, levelPoints: 0 });

  const perfect = pieces.flatMap((p) => p.cells);
  const before = summarize(pieces, perfect.slice(0, -1));
  assert.equal(before.finished, false); assert.equal(before.allSunk, false);
  const done = summarize(pieces, perfect);
  assert.equal(done.finished, true); assert.equal(done.allSunk, true); assert.equal(done.sunkCount, ALVO.pieces.length);
  assert.equal(done.shotsLeft, ALVO.shots - occupied);
  assert.deepEqual(rewardFor(done.hits, done.allSunk), { goal: true, levelPoints: ALVO.sinkAllPoints });
  console.log('ok  fim de jogo (chutes acabaram / tudo derrubado)');
}

// 4) tabela de recompensa: nunca mais de 1 gol
for (let hits = 0; hits <= occupied; hits++) {
  const r = rewardFor(hits, false);
  assert.equal(r.goal, hits >= ALVO.goalAt);
  assert.equal(r.levelPoints, hits * ALVO.pointsPerHit);
  assert.ok(r.levelPoints <= ALVO.sinkAllPoints);
}
assert.equal(rewardFor(occupied, true).levelPoints, ALVO.sinkAllPoints);
console.log(`ok  recompensa: <${ALVO.goalAt} acertos = sem gol (+${ALVO.pointsPerHit}/casa); ${ALVO.goalAt}-${occupied - 1} = gol; tudo = gol +${ALVO.sinkAllPoints}`);

// 5) dificuldade: jogador que chuta ao acaso até acertar e depois caça as casas vizinhas
function playHunter(pieces, seed) {
  let x = seed | 0;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const shots = [];
  const queue = [];
  while (!summarize(pieces, shots).finished) {
    let idx;
    while (queue.length && shots.includes(queue[0])) queue.shift();
    if (queue.length) idx = queue.shift();
    else { const free = Array.from({ length: total }, (_, i) => i).filter((i) => !shots.includes(i)); idx = free[Math.floor(rnd() * free.length)]; }
    const r = applyShot(pieces, shots, idx);
    shots.push(idx);
    if (r.hit && !r.sunk) {
      const c = idx % ALVO.cols, rw = Math.floor(idx / ALVO.cols);
      if (c > 0) queue.push(idx - 1); if (c < ALVO.cols - 1) queue.push(idx + 1);
      if (rw > 0) queue.push(idx - ALVO.cols); if (rw < ALVO.rows - 1) queue.push(idx + ALVO.cols);
    }
  }
  return summarize(pieces, shots);
}
let goals = 0, all = 0, hitsSum = 0;
const N = 3000;
for (let u = 1; u <= N; u++) {
  const s = playHunter(layoutFor(u, 300 + (u % 5)), u * 7919);
  const r = rewardFor(s.hits, s.allSunk);
  if (r.goal) goals++; if (s.allSunk) all++; hitsSum += s.hits;
}
console.log(`sim jogador caçador (${N} partidas): média ${(hitsSum / N).toFixed(1)} acertos de ${occupied} · gol em ${(100 * goals / N).toFixed(0)}% · derrubou tudo em ${(100 * all / N).toFixed(0)}%`);
console.log('TUDO OK');
