/**
 * PAREDÃO — o minigame do goleiro. Porte do "Mini Cup" do Google (o dono mandou o vídeo em 17/09/2026:
 * "monte o mais próximo possível do mini cup sem perder a identidade do jogo").
 *
 * Como é lá e como é aqui: as bolas vêm uma a uma, cada vez mais rápidas, e o jogador ARRASTA o goleiro
 * pela linha do gol para pegar. Um contador marca a sequência de defesas e, quando ele passa o próprio
 * recorde, a faixa "NOVA MAIOR PONTUAÇÃO" atravessa a tela. Tomou gol, acabou. A identidade do JogaGol
 * entra no lugar do contador de países do Google: **cada defesa soma no placar do SEU TIME contra o
 * adversário da rodada** (services/paredao.js), e o uniforme do goleiro é o do seu clube.
 *
 * Este arquivo é só matemática — nada de banco, nada de tela:
 *  - `shot(seed, i)` devolve SEMPRE a mesma bola nº i para aquela semente (o servidor manda as bolas
 *    prontas e depois recalcula as mesmas para conferir o que o jogador disse ter defendido);
 *  - `judge(...)` refaz a partida a partir do rastro do dedo: é o SERVIDOR que decide quantas defesas
 *    houve, não o cliente (regra da casa: lógica de jogo é do servidor).
 *
 * Medidas: a largura do gol é 1 e a altura é 1 — assim a tela desenha no tamanho que quiser. `x` do
 * goleiro é o centro do corpo dele.
 */
import { createHash } from 'node:crypto';

export const PAREDAO = {
  goalTarget: 10, // defesas seguidas que valem o gol do dia (a regra da casa: 1 gol por minigame vencido)
  pointsPerSave: 3, // XP por defesa…
  maxPoints: 30, // …até este teto, como nos outros minigames
  keeper: {
    reach: 0.115, // meio corpo + luva, em larguras de gol
    highReach: 0.78, // bola no alto exige esticar: o alcance encolhe para 78%
    highFrom: 0.62, // altura a partir da qual a bola conta como alta
    speed: 1.45, // larguras de gol por segundo (o limite que o servidor aceita no rastro)
    start: 0.5, // ele começa no meio do gol
  },
  flight: { first: 1500, last: 650, ramp: 25, floor: 470, afterRamp: 6 }, // ms: 1,5 s na 1ª, 0,65 s na 25ª e
  // daí em diante mais 6 ms a menos por bola, até o piso de 0,47 s — assim até craque acaba levando gol
  gap: 450, // respiro entre uma bola e a próxima (ms)
  curveFrom: 9, // a partir da 9ª bola ela começa a desviar no fim do voo
  batch: 40, // quantas bolas o servidor manda por vez (a tela pede mais antes de acabar)
  tolerance: { early: 250, late: 1200 }, // folga no relógio do cliente (celular fraco atrasa)
};

/** PRNG pequeno e estável (mulberry32) semeado por sha256 — mesma receita do Memória. */
function rng(key) {
  let a = createHash('sha256').update(String(key)).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dificuldade da bola nº i: 0 na primeira, 1 da `ramp` em diante (e continua apertando depois). */
const hardness = (i) => Math.min(1, (i - 1) / PAREDAO.flight.ramp);
/** Quantas bolas passaram do fim da rampa (é o que mantém o jogo subindo para quem vai longe). */
const extra = (i) => Math.max(0, i - PAREDAO.flight.ramp);

/**
 * A bola nº i desta partida. Sempre a mesma para a mesma semente — é assim que o servidor confere
 * depois sem guardar nada. `from` é de onde ela sai (fundo do campo), `to` é onde cruza a linha do gol,
 * `T` é quanto tempo leva e `curve` é o desvio que ela ganha no fim.
 */
export function shot(seed, i) {
  const r = rng(`${seed}:${i}`);
  const d = hardness(i);
  const T = Math.max(PAREDAO.flight.floor,
    Math.round(PAREDAO.flight.first + (PAREDAO.flight.last - PAREDAO.flight.first) * d - extra(i) * PAREDAO.flight.afterRamp));
  // o alvo abre com a dificuldade: as primeiras vêm mais no meio, as últimas buscam os cantos
  const meio = 0.5, abertura = Math.min(0.46, 0.20 + 0.24 * d + extra(i) * 0.004);
  const to = { x: meio + (r() * 2 - 1) * abertura, y: 0.10 + r() * 0.72 };
  const from = { x: 0.3 + r() * 0.4, y: 1 };
  const curve = i >= PAREDAO.curveFrom ? (r() * 2 - 1) * (0.12 * d + Math.min(0.06, extra(i) * 0.002)) : 0;
  return { i, T, from, to, curve };
}

/** Quantas bolas de uma vez (da nº `from` em diante), já com a hora em que cada uma cruza o gol. */
export function shots(seed, from = 1, count = PAREDAO.batch) {
  const out = [];
  let t = tempoAte(seed, from); // relógio no instante em que a bola `from` é lançada
  for (let i = from; i < from + count; i++) {
    const s = shot(seed, i);
    out.push({ ...s, at: t + s.T }); // `at` = ms desde o começo da partida
    t += s.T + PAREDAO.gap;
  }
  return out;
}

/** Relógio (ms) no lançamento da bola nº i — a linha do tempo é fixa, então os dois lados batem. */
export function tempoAte(seed, i) {
  let t = 0;
  for (let j = 1; j < i; j++) t += shot(seed, j).T + PAREDAO.gap;
  return t;
}

/** Alcance do goleiro naquela altura: bola no alto é mais difícil. */
export const reachAt = (y) => PAREDAO.keeper.reach * (y > PAREDAO.keeper.highFrom ? PAREDAO.keeper.highReach : 1);

/** Onde o goleiro estava no instante `t`, lendo o rastro do dedo ([[t, x], …] em ordem). */
export function keeperAt(trace, t) {
  if (!trace.length) return PAREDAO.keeper.start;
  if (t <= trace[0][0]) return trace[0][1];
  for (let i = 1; i < trace.length; i++) {
    if (trace[i][0] >= t) {
      const [t0, x0] = trace[i - 1], [t1, x1] = trace[i];
      const f = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return x0 + (x1 - x0) * f;
    }
  }
  return trace.at(-1)[1];
}

/**
 * Confere se o rastro do dedo é de gente: em ordem, dentro do gol e sem teletransporte (o goleiro tem
 * velocidade máxima). Devolve o motivo da recusa ou null.
 */
export function traceProblem(trace) {
  if (!Array.isArray(trace) || trace.length < 2) return 'rastro vazio';
  if (trace.length > 6000) return 'rastro grande demais';
  const limite = PAREDAO.keeper.speed * 1.2; // 20% de folga para o arredondamento do celular
  for (let i = 0; i < trace.length; i++) {
    const p = trace[i];
    if (!Array.isArray(p) || p.length !== 2) return 'ponto inválido';
    const [t, x] = p;
    if (!Number.isFinite(t) || !Number.isFinite(x)) return 'ponto inválido';
    if (x < -0.05 || x > 1.05) return 'goleiro fora do gol';
    if (i === 0) continue;
    const [t0, x0] = trace[i - 1];
    if (t < t0) return 'tempo andando para trás';
    const dt = (t - t0) / 1000;
    if (dt > 0 && Math.abs(x - x0) / dt > limite) return 'goleiro rápido demais';
  }
  return null;
}

/**
 * Refaz a partida no servidor: para cada bola, vê onde o goleiro estava quando ela cruzou e decide.
 * `crossings` é o que a tela diz ([{ i, t }]), mas só para saber O RELÓGIO dela (celular fraco atrasa);
 * quem diz se foi defesa é esta função. Para a primeira bola que passar, a partida acabou.
 * Devolve { saves, goalAt, shots: [{ i, at, kx, save }] }.
 */
export function judge(seed, trace, crossings = []) {
  const quando = new Map(crossings.filter((c) => Number.isFinite(c?.i) && Number.isFinite(c?.t)).map((c) => [c.i, c.t]));
  // quantas bolas a tela diz que rolaram: é ela quem sabe onde a partida parou (o jogador pode ter fechado
  // o app). Quantas foram DEFENDIDAS é conta do servidor, logo abaixo.
  const total = Math.min(PAREDAO.batch * 25, Math.max(0, ...quando.keys()));
  const out = [];
  let saves = 0, goalAt = null, relogio = 0;
  for (let i = 1; i <= total; i++) {
    const s = shot(seed, i);
    const esperado = relogio + s.T;
    const dito = quando.get(i);
    // aceita o relógio da tela se ele for plausível; senão usa o nosso
    const at = Number.isFinite(dito) && dito >= esperado - PAREDAO.tolerance.early && dito <= esperado + PAREDAO.tolerance.late
      ? dito : esperado;
    const fim = trace.at(-1)[0];
    if (at > fim + PAREDAO.tolerance.late) break; // o rastro acabou antes desta bola: a partida parou aqui
    const kx = keeperAt(trace, at);
    const save = Math.abs(kx - s.to.x) <= reachAt(s.to.y);
    out.push({ i, at, kx: Number(kx.toFixed(4)), save });
    if (!save) { goalAt = i; break; }
    saves += 1;
    relogio = at + PAREDAO.gap;
  }
  return { saves, goalAt, shots: out };
}
