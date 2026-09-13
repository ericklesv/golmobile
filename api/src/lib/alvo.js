/**
 * Alvo no Gol — regras puras (sem banco), no estilo batalha naval.
 * O gol é uma grade cols x rows; as peças (goleiro, zagueiros, cones) ficam escondidas em
 * posições determinísticas por jogador/dia. Cada chute revela uma casa. Tudo aqui é função
 * pura para dar para testar com um script; quem tranca a partida no banco é services/daily.js.
 */
import { createHash } from 'node:crypto';
import { ALVO } from './rules.js';

/** PRNG pequeno e estável (mulberry32) semeado por sha256 da chave. */
export function rng(seed) {
  let a = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sorteia o tabuleiro do jogador no dia: peças em linha ou coluna, sem sobreposição.
 * Retorna [{ kind, name, size, cells: number[] }] (índice = row * cols + col).
 * Determinístico: mesmo jogador + mesmo dia = mesmas posições.
 */
export function layoutFor(userId, day, cfg = ALVO) {
  const { cols, rows } = cfg;
  // tenta o tabuleiro inteiro de novo se alguma peça não couber (não acontece com 10 casas em 24,
  // mas o laço fica fechado de qualquer jeito)
  for (let attempt = 0; attempt < 50; attempt++) {
    const r = rng(`alvo:${userId}:${day}:${attempt}`);
    const taken = new Set();
    const pieces = [];
    let ok = true;
    for (const p of cfg.pieces) {
      let placed = null;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horizontal = p.size === 1 ? true : r() < 0.5;
        const maxCol = horizontal ? cols - p.size : cols - 1;
        const maxRow = horizontal ? rows - 1 : rows - p.size;
        const c0 = Math.floor(r() * (maxCol + 1));
        const r0 = Math.floor(r() * (maxRow + 1));
        const cells = [];
        for (let k = 0; k < p.size; k++) cells.push((horizontal ? r0 : r0 + k) * cols + (horizontal ? c0 + k : c0));
        if (cells.every((c) => !taken.has(c))) placed = cells;
      }
      if (!placed) { ok = false; break; }
      placed.forEach((c) => taken.add(c));
      pieces.push({ kind: p.kind, name: p.name, size: p.size, cells: placed });
    }
    if (ok) return pieces;
  }
  throw new Error('Alvo no Gol: não coube o tabuleiro');
}

/** Quantas casas ocupadas o tabuleiro tem. */
export const occupiedCells = (pieces) => pieces.reduce((n, p) => n + p.size, 0);

/**
 * Aplica um chute. `shots` = índices já chutados (em ordem). Retorna o que aconteceu, sem mexer
 * nos argumentos: { hit, piece (índice da peça ou null), sunk (peça caiu com este chute) }.
 * Lança Error com .code para casa repetida ou fora da grade.
 */
export function applyShot(pieces, shots, index, cfg = ALVO) {
  const total = cfg.cols * cfg.rows;
  if (!Number.isInteger(index) || index < 0 || index >= total) { const e = new Error('Chute fora do gol.'); e.code = 'bad-cell'; throw e; }
  if (shots.includes(index)) { const e = new Error('Você já chutou nessa casa.'); e.code = 'repeated'; throw e; }
  const pi = pieces.findIndex((p) => p.cells.includes(index));
  if (pi < 0) return { hit: false, piece: null, sunk: false };
  const after = [...shots, index];
  const sunk = pieces[pi].cells.every((c) => after.includes(c));
  return { hit: true, piece: pi, sunk };
}

/** Resumo da partida: acertos, peças caídas, se acabou. */
export function summarize(pieces, shots, cfg = ALVO) {
  const hitSet = new Set(shots.filter((s) => pieces.some((p) => p.cells.includes(s))));
  const sunk = pieces.map((p) => p.cells.every((c) => hitSet.has(c)));
  const allSunk = sunk.every(Boolean);
  const finished = allSunk || shots.length >= cfg.shots;
  return { hits: hitSet.size, occupied: occupiedCells(pieces), sunk, sunkCount: sunk.filter(Boolean).length, allSunk, finished, shotsLeft: Math.max(0, cfg.shots - shots.length) };
}

/**
 * Recompensa ao fim (tabela em rules.js): derrubou tudo = gol + sinkAllPoints; senão 2 por casa
 * acertada e gol só com >= goalAt acertos. Nunca mais de 1 gol.
 */
export function rewardFor(hits, allSunk, cfg = ALVO) {
  if (allSunk) return { goal: true, levelPoints: cfg.sinkAllPoints };
  return { goal: hits >= cfg.goalAt, levelPoints: hits * cfg.pointsPerHit };
}
