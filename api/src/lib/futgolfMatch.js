/**
 * Futgolf — as regras da partida do X1 (funções puras: realtime/x1.js chama, grava e manda para as telas).
 *
 * - Um buraco por partida, sorteado entre os de lib/futgolf.js (e espelhado ou não). Os dois saem do mesmo lugar.
 * - Os dois chutam AO MESMO TEMPO, uma rodada por vez (FUTGOLF.kickSec para chutar); na tela a bola do outro
 *   aparece como fantasma. Cada chute conta 1; caiu na lagoa, conta mais 1 e a bola volta de onde saiu.
 * - **Quem embocar vence.** Se os dois embocam na mesma rodada, vence quem gastou menos chutes (a lagoa pode fazer
 *   diferença); empatou → DESEMPATE: um chute de cada, do mesmo lugar (`tb` do buraco), e vence quem deixar a bola
 *   mais perto do buraco (embocar = 0). Igual (os dois embocaram, por exemplo) = outro desempate, até
 *   FUTGOLF.tiebreaks vezes; depois disso é empate de verdade (a aposta volta).
 * - Quem já embocou com N chutes vence na hora se o outro já tem N ou mais sem embocar (não dá mais para empatar).
 * - Limite: par + FUTGOLF.overPar chutes sem embocar = "pegou a bola" (conta como limite + 1).
 * - Perdeu o tempo = chute sem sair do lugar (conta 1; no desempate, a bola fica "longe"). 3 seguidas = W.O. (x1.js).
 */
import { HOLES, FG_PHYS, courseOf, simulateKick, distanceField, surfaceAt } from './futgolf.js';
import { FUTGOLF } from './rules.js';

export function newFutgolfMatch(rnd = Math.random, holeId = null) {
  const spec = (holeId && HOLES.find((h) => h.id === holeId)) || HOLES[Math.floor(rnd() * HOLES.length)];
  const course = courseOf(spec.id, rnd() < 0.5);
  return {
    course, phase: 'play', round: 1, cap: course.par + FUTGOLF.overPar,
    balls: [{ ...course.tee }, { ...course.tee }], strokes: [0, 0], holed: [false, false], out: [false, false],
    kicked: [false, false], tbDist: [null, null], tbCount: 0, over: null,
  };
}

/** O que as telas recebem do andamento (o buraco em si vai uma vez só, na `match`). */
export const futgolfView = (s) => ({
  phase: s.phase, round: s.round, tbCount: s.tbCount, par: s.course.par, cap: s.cap, balls: s.balls.map((b) => ({ ...b })), strokes: [...s.strokes],
  holed: [...s.holed], out: [...s.out], kicked: [...s.kicked], tbDist: s.tbDist.map((d) => (d === null ? null : Number.isFinite(d) ? Math.round(d * 10) / 10 : -1)),
});

/** Este lado ainda chuta nesta partida/rodada? */
export const golfActive = (s, side) => !s.over && (s.phase === 'play' ? !s.holed[side] && !s.out[side] : s.tbDist[side] === null);
/** Todo mundo que chuta nesta rodada já chutou? */
export const golfRoundDone = (s) => !s.over && [0, 1].every((side) => !golfActive(s, side) || s.kicked[side]);

/** Um chute de `side`. null = não pode (já chutou nesta rodada, já embocou, acabou). */
export function golfKick(s, side, dx, dy, power, spin = 0) {
  if (!golfActive(s, side) || s.kicked[side]) return null;
  const from = s.balls[side];
  const sim = simulateKick(s.course, from, dx, dy, Math.max(0.03, Math.min(1, power)), Math.max(-1, Math.min(1, spin)));
  s.kicked[side] = true;
  if (s.phase === 'tiebreak') {
    s.tbDist[side] = sim.holed ? 0 : sim.water ? Infinity : Math.hypot(sim.end.x - s.course.cup.x, sim.end.y - s.course.cup.y);
    s.balls[side] = sim.water ? { ...from } : { ...sim.end };
    return { sim };
  }
  s.strokes[side] += sim.water ? 2 : 1;
  s.balls[side] = { ...sim.end };
  if (sim.holed) s.holed[side] = true;
  else if (s.strokes[side] >= s.cap) s.out[side] = true;
  return { sim };
}

/** Acabou o tempo sem chutar: conta como chute que não saiu do lugar. */
export function golfSkip(s, side) {
  if (!golfActive(s, side) || s.kicked[side]) return false;
  s.kicked[side] = true;
  if (s.phase === 'tiebreak') { s.tbDist[side] = Infinity; return true; }
  s.strokes[side] += 1;
  if (s.strokes[side] >= s.cap) s.out[side] = true;
  return true;
}

/**
 * Fecha a rodada (todos chutaram): decide se acabou, se vai para o desempate ou se começa a próxima.
 * Devolve { t: 'over', winner, reason } | { t: 'tiebreak' } | { t: 'round' }.
 */
export function golfCloseRound(s) {
  if (s.phase === 'tiebreak') {
    const [a, b] = s.tbDist;
    const igual = a === b || Math.abs(a - b) < 0.5;
    if (igual && s.tbCount < FUTGOLF.tiebreaks) { // os dois embocaram (ou ficaram iguais): mais um, do mesmo lugar
      s.tbCount += 1; s.round += 1; s.kicked = [false, false]; s.tbDist = [null, null];
      s.balls = [{ ...s.course.tb }, { ...s.course.tb }];
      return { t: 'tiebreak' };
    }
    s.over = igual ? { winner: null, reason: 'empate' } : { winner: a < b ? 0 : 1, reason: 'desempate' };
    return { t: 'over', ...s.over };
  }
  const done = (side) => s.holed[side] || s.out[side];
  const final = (side) => (s.holed[side] ? s.strokes[side] : s.cap + 1);
  for (const w of [0, 1]) { // embocou com N e o outro já tem N ou mais sem embocar: não dá mais para ele alcançar
    const l = 1 - w;
    if (s.holed[w] && !done(l) && s.strokes[l] >= s.strokes[w]) { s.over = { winner: w, reason: 'buraco' }; return { t: 'over', ...s.over }; }
  }
  if (done(0) && done(1)) {
    const f0 = final(0), f1 = final(1);
    if (f0 !== f1) { s.over = { winner: f0 < f1 ? 0 : 1, reason: 'buraco' }; return { t: 'over', ...s.over }; }
    s.phase = 'tiebreak'; s.tbCount = 1; s.kicked = [false, false]; s.tbDist = [null, null]; s.round += 1;
    s.balls = [{ ...s.course.tb }, { ...s.course.tb }];
    return { t: 'tiebreak' };
  }
  s.round += 1;
  s.kicked = [false, false];
  return { t: 'round' };
}

// ─── bots ───────────────────────────────────────────────────────────────────

/** Velocidade de saída para a bola rolar `d` na grama (a conta do atrito, invertida por bisseção). */
function powerFor(d) {
  const P = FG_PHYS, a = P.roll / P.damp;
  const roll = (v0) => { const t = Math.log((v0 + a) / a) / P.damp; return ((v0 + a) / P.damp) * (1 - a / (v0 + a)) - a * t; };
  let lo = P.vMin, hi = P.vMax;
  if (roll(hi) <= d) return 1;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (roll(mid) < d) lo = mid; else hi = mid; }
  return Math.max(0.03, Math.min(1, (lo - P.vMin) / (P.vMax - P.vMin)));
}
const gauss = (rnd) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());

/**
 * O chute do bot. Procura a melhor jogada simulando (a mesma física do chute de verdade): primeiro em leque
 * na direção "do caminho" (o mapa de distância, que contorna ilhas e placas e conhece os bueiros) e direto no
 * buraco, com forças perto da que a distância pede; depois refina as melhores, com e sem efeito. Aí erra como
 * gente: `skill` 0..1 (0,25–0,55 nos bots "quase reais") decide o tamanho do erro na mira e na força e, às vezes,
 * escolhe a segunda ou terceira melhor.
 */
export function futgolfAiKick(s, side, { skill = 0.4, rnd = Math.random } = {}) {
  const c = s.course, from = s.balls[side], field = distanceField(c), tiebreak = s.phase === 'tiebreak';
  const score = (r) => {
    if (r.holed) return 1e6;
    if (r.water) return -(field.at(from.x, from.y) + 260); // perdeu um chute e volta ao mesmo lugar
    if (tiebreak) return -Math.hypot(r.end.x - c.cup.x, r.end.y - c.cup.y);
    const chao = surfaceAt(c, r.end.x, r.end.y);
    return -(field.at(r.end.x, r.end.y) + (chao === 'areia' ? 60 : chao === 'mato' ? 25 : 0));
  };
  // a direção "do caminho": o ponto de menor distância num círculo em volta da bola
  let base = Math.atan2(c.cup.y - from.y, c.cup.x - from.x), bestF = Infinity;
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * 2 * Math.PI, v = field.at(from.x + Math.cos(a) * 45, from.y + Math.sin(a) * 45);
    if (v < bestF) { bestF = v; base = a; }
  }
  const direct = Math.atan2(c.cup.y - from.y, c.cup.x - from.x);
  const need = powerFor(Math.max(20, Math.min(field.at(from.x, from.y), Math.hypot(c.cup.x - from.x, c.cup.y - from.y) * 1.6)));
  const powers = [...new Set([0.7, 0.85, 1, 1.15, 1.35].map((k) => Math.round(Math.min(1, need * k) * 100) / 100).concat(need > 0.6 ? [1] : []))];
  const cands = [];
  const tryK = (ang, pw, spin) => { const r = simulateKick(c, from, Math.cos(ang), Math.sin(ang), pw, spin); cands.push({ ang, pw, spin, sc: score(r) }); };
  const centers = Math.abs(((base - direct + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.05 ? [base] : [base, direct];
  for (const cen of centers) for (let k = -5; k <= 5; k++) for (const pw of powers) tryK(cen + k * 0.12, pw, 0);
  for (let k = 0; k < 8; k++) tryK(rnd() * 2 * Math.PI, 0.55 + rnd() * 0.45, 0); // tabelas que o leque não vê
  cands.sort((a, b) => b.sc - a.sc);
  for (const t of cands.slice(0, 4)) {
    for (const [da, dp, sp] of [[0.03, 0, 0], [-0.03, 0, 0], [0, 0.05, 0], [0, -0.05, 0], [0, 0, 1], [0, 0, -1]]) tryK(t.ang + da, Math.max(0.03, Math.min(1, t.pw + dp)), sp);
  }
  cands.sort((a, b) => b.sc - a.sc);
  let pick = cands[0];
  const sk = Math.max(0, Math.min(1, skill));
  if (rnd() > 0.55 + 0.45 * sk) pick = cands[1 + Math.floor(rnd() * 2)] ?? pick; // nem sempre acha a melhor
  const ang = pick.ang + gauss(rnd) * (0.012 + (1 - sk) * 0.07);
  const pw = Math.max(0.03, Math.min(1, pick.pw * (1 + gauss(rnd) * (0.03 + (1 - sk) * 0.09))));
  return { dx: Math.cos(ang), dy: Math.sin(ang), power: pw, spin: pick.spin };
}
