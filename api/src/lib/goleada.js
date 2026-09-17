/**
 * GOLEADA — porte do "Mini Cup" do Google (o dono mandou o vídeo em 17/09/2026: "monte o mais próximo
 * possível do mini cup sem perder a identidade do jogo", e corrigiu a leitura: **você é o jogador, não o
 * goleiro**). A bola fica no seu pé, grande, na frente da tela; você DESLIZA o dedo para chutar e ela some
 * rumo ao gol, onde o goleiro adversário tenta pegar. Fez o gol, vem outra bola — cada vez mais difícil.
 * Pegou, acabou a série.
 *
 * A identidade do JogaGol entra em dois lugares: o goleiro veste o uniforme do **adversário da rodada**
 * (como no pênalti e na falta) e cada gol soma no placar do **seu time contra esse adversário**
 * (services/goleada.js), no lugar do contador de países do Google.
 *
 * Este arquivo é só matemática — nada de banco, nada de tela. E o goleiro é uma REGRA, não um sorteio
 * escondido: ele espera a reação dele, corre até onde a bola vai cruzar e pega se chegar a tempo. Os dois
 * lados (tela e servidor) rodam a mesma conta, então a tela anima sem falar com o servidor (nada de lag) e
 * no fim o servidor REFAZ todos os chutes para contar os gols — quem conta é ele.
 *
 * Medidas: a boca do gol é 1 de largura e 1 de altura.
 */
import { createHash } from 'node:crypto';

export const GOLEADA = {
  goalTarget: 10, // gols seguidos que valem o gol do dia (a regra da casa: 1 gol por minigame vencido)
  pointsPerGoal: 3, // XP por gol…
  maxPoints: 30, // …até este teto
  keeper: {
    reactFirst: 430, // ms até o goleiro sair do lugar na 1ª bola…
    reactLast: 200, // …e da `ramp` em diante
    speedFirst: 0.55, // larguras de gol por segundo, na 1ª…
    speedLast: 0.85, // …e da `ramp` em diante (calibrado em scripts/goleada-balance.js)
    ramp: 20,
    afterRamp: 0.02, // depois da rampa ele ainda ganha isto de velocidade por bola: o vão vai fechando
    reach: 0.075, // meio corpo + luva
    highReach: 0.80, // bola no alto: ele alcança menos
    highFrom: 0.60,
    leanHelp: 0.45, // quanto ele adianta para o lado em que se jogou (e perde do outro)
  },
  shot: { fast: 520, slow: 900 }, // voo da bola: chute forte é rápido, fraco é lento
  aim: { margin: 0.045, top: 0.05 }, // rente à trave = fora; por cima do travessão também
  gap: 420, // respiro entre um gol e a próxima bola (ms)
  batch: 40, // quantas bolas o servidor manda por vez
};

function rng(key) {
  let a = createHash('sha256').update(String(key)).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const passo = (i) => Math.min(1, (i - 1) / GOLEADA.keeper.ramp);

/**
 * O goleiro da bola nº i: quanto ele demora para reagir, quão rápido corre e para que lado se jogou antes
 * do chute (−1 esquerda, 0 parado, +1 direita). O "lean" vai para a tela de propósito: é a dica visual do
 * Mini Cup — o jogador VÊ o goleiro cair para um lado e chuta no outro.
 */
export function keeperOf(seed, i) {
  const r = rng(`${seed}:gk:${i}`);
  const d = passo(i);
  const K = GOLEADA.keeper;
  const sorte = r();
  return {
    i,
    react: Math.round(K.reactFirst + (K.reactLast - K.reactFirst) * d),
    speed: K.speedFirst + (K.speedLast - K.speedFirst) * d + Math.max(0, i - K.ramp) * K.afterRamp,
    lean: i < 4 || sorte < 0.45 ? 0 : sorte < 0.725 ? -1 : 1, // nas 3 primeiras ele espera parado
  };
}

/** As bolas de uma vez (o que a tela precisa para animar sozinha). */
export const keepers = (seed, from = 1, count = GOLEADA.batch) =>
  Array.from({ length: count }, (_, k) => keeperOf(seed, from + k));

/** Tempo de voo pela força do chute (0..1): forte chega antes. */
export const flightOf = (power) => {
  const p = Math.max(0, Math.min(1, Number(power) || 0));
  return Math.round(GOLEADA.shot.slow + (GOLEADA.shot.fast - GOLEADA.shot.slow) * p);
};

/** Alcance do goleiro naquela altura (bola no alto é mais difícil de alcançar). */
export const reachAt = (y) => GOLEADA.keeper.reach * (y > GOLEADA.keeper.highFrom ? GOLEADA.keeper.highReach : 1);

/**
 * O chute: `aim` = { x, y, power } (0..1 na boca do gol; y 0 = rasteiro, 1 = embaixo do travessão).
 * Devolve { goal, why, T, kx } — `kx` é onde o goleiro parou, para a tela animar o mergulho.
 *  - fora da boca do gol ou muito rente à trave = 'fora';
 *  - o goleiro reage, corre até o ponto de chegada e pega se estiver ao alcance.
 */
export function shoot(seed, i, aim) {
  const x = Number(aim?.x), y = Number(aim?.y), power = Number(aim?.power);
  if (![x, y, power].every(Number.isFinite)) return { goal: false, why: 'invalido', T: GOLEADA.shot.slow, kx: 0.5 };
  const T = flightOf(power);
  const k = keeperOf(seed, i);
  if (x < GOLEADA.aim.margin || x > 1 - GOLEADA.aim.margin || y < 0 || y > 1 - GOLEADA.aim.top) return { goal: false, why: 'fora', T, kx: 0.5, keeper: k };

  // ele se jogou antes: adianta para aquele lado (e fica devendo para o outro)
  const partida = 0.5 + k.lean * GOLEADA.keeper.leanHelp * 0.5;
  const util = Math.max(0, T - k.react) / 1000;
  const anda = k.speed * util;
  const kx = partida + Math.max(-anda, Math.min(anda, x - partida));
  const pegou = Math.abs(kx - x) <= reachAt(y);
  return { goal: !pegou, why: pegou ? 'defendeu' : 'gol', T, kx: Number(kx.toFixed(4)), keeper: k };
}

/**
 * Refaz a série inteira no servidor. `shots` é o que a tela mandou ([{ i, x, y, power }]); a conta de
 * quantos gols saíram é daqui. Para no primeiro chute que não for gol.
 */
export function judge(seed, shots = []) {
  const lista = Array.isArray(shots) ? shots.slice(0, GOLEADA.batch * 25) : [];
  const out = [];
  let goals = 0, stoppedAt = null;
  for (let n = 0; n < lista.length; n++) {
    const s = lista[n];
    if (Number(s?.i) !== n + 1) break; // fora de ordem ou faltando: acaba aqui
    const r = shoot(seed, n + 1, s);
    out.push({ i: n + 1, goal: r.goal, why: r.why });
    if (!r.goal) { stoppedAt = n + 1; break; }
    goals += 1;
  }
  return { goals, stoppedAt, shots: out };
}
