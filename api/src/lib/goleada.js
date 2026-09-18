/**
 * PenalCup — nome de tela desde 18/09/2026; o id interno continua GOLEADA (enum e banco).
 * GOLEADA — porte do "Mini Cup" do Google (dono, 17/09/2026). Você é o BATEDOR: a bola fica no seu pé e
 * você **puxa o dedo como na Falta PRO** para chutar (dono, 18/09/2026: "a ideia não é clicar onde você
 * quer chutar a bola, é fazer o movimento do chute assim como no falta pro"; e antes: "o chute tem que ser
 * mais rápido sem mira" — por isso não há alvo desenhado nem barra de força: o gesto é a mira).
 *
 * O gesto vira três coisas, como lá: **direção** (para onde você puxou), **força** (a VELOCIDADE do puxão,
 * que encurta o voo da bola) e **efeito** (o arco que o dedo desenhou, que faz a bola sair para um lado e
 * fechar no outro — o goleiro lê a saída e se engana).
 *
 * O goleiro **nunca fica parado**: ele vai de uma trave à outra o tempo todo ("ele está parado no meio, ele
 * tem que se movimentar de um lado pro outro"). O jogo é de TIMING — você espera ele sair do canto que quer
 * e toca. Quando vê a bola, ele ainda tenta voltar: tem tempo de reação e velocidade de mergulho.
 *
 * E aperta pelo RELÓGIO, não pelo número de gols ("a velocidade do goleiro tem que ir aumentando conforme o
 * tempo que você tá com o jogo aberto"): quanto mais a série dura, mais rápido ele vai e volta, mais cedo
 * reage e menos tempo a bola leva até o gol. Ninguém fica lá para sempre.
 *
 * Só matemática aqui — nada de banco, nada de tela. A posição do goleiro é uma FUNÇÃO DO TEMPO com uma fase
 * sorteada por partida: a tela roda a mesma conta para animar (sem falar com o servidor, nada de lag) e no
 * fim o servidor REFAZ todos os chutes para contar os gols — quem conta é ele.
 *
 * Medidas: a boca do gol é 1 de largura e 1 de altura; o tempo é em ms desde o começo da série.
 */
import { createHash } from 'node:crypto';

export const GOLEADA = {
  goalTarget: 10, // gols seguidos que valem o gol do dia (regra da casa: 1 gol por minigame vencido)
  pointsPerGoal: 3, // XP por gol…
  maxPoints: 30, // …até este teto
  keeper: {
    amp: 0.26, // até onde ele se afasta do meio, para cada lado
    // O COMEÇO É UM MEIO-TERMO (dono, 18/09/2026: primeiro "o goleiro tá muito rápido até no nível inicial…
    // já começa muito difícil"; depois, com o passeio, "agora ficou lento demais, deixe no meio termo").
    // No primeiro segundo ele fecha ~24% da boca do gol: eram 31% no difícil e 18% no lento. O FIM não
    // mudou — aos 100 s ele volta a fechar 78%, o aperto de sempre. É o relógio que endurece, não os gols.
    periodFirst: 4100, // ms para ir e voltar no começo da série…
    periodLast: 1150, // …e quando o jogo já apertou
    reactFirst: 450, // ms até ele largar a ronda e mergulhar na bola…
    reactLast: 140, // …no fim
    speedFirst: 0.60, // larguras de gol por segundo no mergulho…
    speedLast: 2.70, // …no fim: calibrado para que, no máximo, ele FECHE o gol — toda série tem fim
    reach: 0.085, // meio corpo + luva
    highReach: 0.80, // bola no alto: alcança menos
    highFrom: 0.60,
  },
  ramp: 100_000, // em 100 s de jogo o goleiro chega ao máximo (é o relógio que aperta, não os gols)
  shot: { first: 820, last: 460, powerCut: 0.4 }, // voo da bola: encurta com o relógio e com a força do gesto
  spinEdge: 0.09, // o quanto o efeito engana o goleiro (ele lê a saída da bola, não a chegada)
  aim: { margin: 0.045, top: 0.05 }, // rente à trave ou por cima do travessão = fora
  gap: 360, // tempo mínimo entre um chute e o próximo (a bola precisa voltar para o pé)
  maxShots: 400,
};

/** Fase da ronda, sorteada por partida: duas séries nunca começam com o goleiro no mesmo pé. */
export function phaseOf(seed) {
  const h = createHash('sha256').update(String(seed)).digest();
  return (h.readUInt32LE(0) / 2 ** 32) * Math.PI * 2;
}

/** O quanto o jogo já apertou no instante t: 0 no começo, 1 da `ramp` em diante. */
export const hardness = (t) => Math.min(1, Math.max(0, Number(t) || 0) / GOLEADA.ramp);
const entre = (a, b, f) => a + (b - a) * f;

/** Ida e volta da ronda, reação, mergulho e voo da bola — todos no instante t. */
export const periodAt = (t) => entre(GOLEADA.keeper.periodFirst, GOLEADA.keeper.periodLast, hardness(t));
export const reactAt = (t) => entre(GOLEADA.keeper.reactFirst, GOLEADA.keeper.reactLast, hardness(t));
export const diveAt = (t) => entre(GOLEADA.keeper.speedFirst, GOLEADA.keeper.speedLast, hardness(t));
export const flightAt = (t) => Math.round(entre(GOLEADA.shot.first, GOLEADA.shot.last, hardness(t)));

/**
 * Ângulo da ronda no instante t. Como o período encurta com o tempo, o ângulo é a INTEGRAL de 2π/período —
 * assim o goleiro acelera sem dar solavanco na tela, e é uma conta fechada (a tela e o servidor batem).
 */
export function patrolAngle(t) {
  const { periodFirst: P0, periodLast: P1 } = GOLEADA.keeper;
  const R = GOLEADA.ramp;
  const ms = Math.max(0, Number(t) || 0);
  const b = (P1 - P0) / R; // quanto o período muda por ms
  if (ms <= R) return (2 * Math.PI * Math.log(1 + (b * ms) / P0)) / b;
  const ateRampa = (2 * Math.PI * Math.log(P1 / P0)) / b;
  return ateRampa + (2 * Math.PI * (ms - R)) / P1;
}

/** Onde o goleiro está no instante t (a ronda, antes de ele ver a bola). */
export const keeperAt = (seed, t) => 0.5 + GOLEADA.keeper.amp * Math.sin(patrolAngle(t) + phaseOf(seed));

/** Alcance dele naquela altura. */
export const reachAt = (y) => GOLEADA.keeper.reach * (y > GOLEADA.keeper.highFrom ? GOLEADA.keeper.highReach : 1);

/**
 * Um chute: `aim` = { x, y } na boca do gol e `t` = quando o jogador tocou (ms desde o começo da série).
 * Devolve { goal, why, T, from, kx }: `from` é onde o goleiro estava ao ver a bola e `kx` onde ele chegou —
 * é disso que a tela precisa para animar o mergulho.
 */
export function tempoDeVoo(power, t) {
  const p = Math.max(0, Math.min(1, Number(power) || 0));
  return Math.round(flightAt(t) * (1 + GOLEADA.shot.powerCut * (0.5 - p))); // puxão forte = bola mais rápida
}

export function shoot(seed, aim, t) {
  const x = Number(aim?.x), y = Number(aim?.y), quando = Number(t);
  const power = Number(aim?.power ?? 0.5), spin = Number(aim?.spin ?? 0) || 0;
  const T = tempoDeVoo(power, quando);
  if (![x, y, quando].every(Number.isFinite)) return { goal: false, why: 'invalido', T, from: 0.5, kx: 0.5 };
  const from = keeperAt(seed, quando + reactAt(quando)); // ele segue na ronda enquanto não reage
  if (x < GOLEADA.aim.margin || x > 1 - GOLEADA.aim.margin || y < 0 || y > 1 - GOLEADA.aim.top) {
    return { goal: false, why: 'fora', T, from: Number(from.toFixed(4)), kx: Number(from.toFixed(4)) };
  }
  // ele mergulha para onde a bola PARECE ir: com efeito, ela sai para um lado e fecha no outro
  const lido = x - Math.max(-1, Math.min(1, spin)) * GOLEADA.spinEdge;
  const sobra = Math.max(0, T - reactAt(quando)) / 1000; // tempo que sobra para o mergulho
  const anda = diveAt(quando) * sobra;
  const kx = from + Math.max(-anda, Math.min(anda, lido - from));
  const pegou = Math.abs(kx - x) <= reachAt(y);
  return { goal: !pegou, why: pegou ? 'defendeu' : 'gol', T, from: Number(from.toFixed(4)), kx: Number(kx.toFixed(4)) };
}

/**
 * Refaz a série inteira no servidor. `shots` é o que a tela mandou ([{ i, x, y, t }]) — a conta de quantos
 * gols saíram é daqui. Para no primeiro que não for gol e recusa chute fora de hora: o jogador não pode
 * voltar no tempo nem chutar de novo antes de a bola voltar para o pé.
 */
export function judge(seed, shots = []) {
  const lista = Array.isArray(shots) ? shots.slice(0, GOLEADA.maxShots) : [];
  const out = [];
  let goals = 0, stoppedAt = null, liberado = 0;
  for (let n = 0; n < lista.length; n++) {
    const s = lista[n];
    if (Number(s?.i) !== n + 1) break; // fora de ordem ou faltando
    const t = Number(s?.t);
    if (!Number.isFinite(t) || t < liberado - 50) break; // cedo demais: a bola nem tinha voltado
    const r = shoot(seed, s, t);
    out.push({ i: n + 1, goal: r.goal, why: r.why, t });
    if (!r.goal) { stoppedAt = n + 1; break; }
    goals += 1;
    liberado = t + r.T + GOLEADA.gap;
  }
  return { goals, stoppedAt, shots: out };
}
