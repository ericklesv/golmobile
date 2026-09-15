/**
 * FutPrego — as tábuas do futebol de prego e a física da bola (pura e determinística: a mesma jogada dá
 * sempre o mesmo caminho). O servidor calcula; as telas só desenham os quadros que ele manda.
 *
 * Coordenadas do servidor: tábua de W x H, gol de CIMA em y = 0 e gol de BAIXO em y = H. O lado 0 fica
 * embaixo (defende o gol de baixo, ataca o de cima); o lado 1 fica em cima. Cada tela vira a tábua para
 * o jogador sempre atacar para cima. Todos os pregos (dos dois times) desviam a bola.
 *
 * Vários desenhos de tábua (pedido do dono, 14/09/2026 — para ninguém decorar uma jogada): cada partida
 * sorteia um de BOARDS (os de LAYOUTS e os espelhos deles). Todos têm o prego central perto do meio de
 * campo, como nas tábuas de verdade, e foram ajustados em scripts/futprego-balance.js para a saída do meio
 * quase nunca achar caminho até o gol; o que sobra, a garantia da saída (closedGoals) segura.
 */

const W = 300, H = 460;
const MOUTH = 70; // largura da boca do gol
const BALL = 7, NAIL = 4.2, POST = 3.5;

// Pregos de UM time (o de baixo), com y contado a partir do próprio gol; o time de cima é o mesmo girado
// 180°. O 1º prego é o central, na linha do meio. Inspirados nas fotos de tábuas que o dono mandou.
export const LAYOUTS = [
  { id: 'classico', name: 'Clássico', shape: [[150,186], [135,29], [151,29], [60,80], [123,93], [161,78], [254,99], [27,174], [104,157], [180,187], [255,168], [98,202], [198,186]] },
  { id: 'peteleco', name: 'Peteleco', shape: [[150,204], [139,21], [155,21], [82,72], [210,50], [143,70], [113,134], [185,102], [33,145], [136,124], [260,136], [89,165], [213,165]] },
  { id: 'diagrama', name: 'Diagrama', shape: [[150,202], [123,28], [139,28], [63,54], [146,43], [222,52], [100,100], [195,121], [18,119], [74,129], [217,152], [288,133]] },
  // desenho do dono (15/09/2026, imagem da tábua medida prego a prego e convertida para 300 x 460): 1 no gol, 2 abertos,
  // 1 central, linha de 4, 1 central e 2 abertos perto do meio. Simétrico: o "espelho" dele é a mesma tábua (fica
  // mesmo assim na lista para o sorteio dar a mesma chance a cada desenho).
  { id: 'losango', name: 'Losango', shape: [[150,167], [150,18], [87,61], [213,61], [150,80], [29,117], [118,117], [182,117], [271,117], [73,202], [227,202]] },
];

export function makeBoard(shape, id = 'custom', name = id) {
  const nails = [];
  for (const [x, y] of shape) nails.push({ x, y: H - y, side: 0 }); // time de baixo
  for (const [x, y] of shape) nails.push({ x: W - x, y, side: 1 }); // time de cima (girado 180°)
  const g0 = (W - MOUTH) / 2, g1 = (W + MOUTH) / 2;
  // traves: pregos das pontas da boca do gol (a bola bate e volta)
  const posts = [{ x: g0, y: 0 }, { x: g1, y: 0 }, { x: g0, y: H }, { x: g1, y: H }];
  return { id, name, W, H, mouth: MOUTH, goalX: [g0, g1], ball: BALL, nail: NAIL, post: POST, nails, posts, center: { x: W / 2, y: H / 2 } };
}

/** Todas as tábuas do sorteio: cada desenho e o espelho dele (esquerda ↔ direita — joga igual, parece outro). */
export const BOARDS = LAYOUTS.flatMap(({ id, name, shape }) => [
  makeBoard(shape, id, name),
  makeBoard(shape.map(([x, y]) => [W - x, y]), `${id}-espelho`, `${name} (espelhado)`),
]);
/** A tábua padrão (tela do começo e testes antigos). */
export const BOARD = BOARDS[0];

export const PHYS = {
  dt: 1 / 240,       // passo da simulação (bola a 950/s anda 4 por passo: não atravessa prego)
  frameEvery: 8,     // 1 quadro a cada 8 passos = 30 quadros por segundo na tela
  vMin: 140, vMax: 950,
  damping: 1.15,     // atrito proporcional à velocidade (por segundo)
  roll: 70,          // atrito fixo (desaceleração por segundo)
  eNail: 0.78, eWall: 0.72,
  stopSpeed: 9, maxSec: 9,
};

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Um peteleco: a bola sai de `start` na direção (dx, dy) com força 0..1. Devolve os quadros do caminho
 * ([x, y] a cada 1/30 s), onde parou e se entrou em algum gol ('top' = gol de cima, 'bottom' = de baixo).
 * `opts.closedGoals` = garantia da saída do meio: a boca do gol vira linha de fundo (a bola bate e volta),
 * então a 1ª jogada da partida nunca é gol, mesmo num caminho raríssimo que os pregos não pegaram.
 */
export function simulateFlick(start, dx, dy, power, board = BOARD, opts = {}) {
  const B = board, P = PHYS;
  const closed = !!opts.closedGoals;
  const len = Math.hypot(dx, dy) || 1;
  const speed = P.vMin + Math.max(0, Math.min(1, power)) * (P.vMax - P.vMin);
  let x = start.x, y = start.y, vx = (dx / len) * speed, vy = (dy / len) * speed;
  const r = B.ball;
  const frames = [[round1(x), round1(y)]];
  const obstacles = [...B.nails.map((n) => ({ x: n.x, y: n.y, rr: r + B.nail })), ...B.posts.map((p) => ({ x: p.x, y: p.y, rr: r + B.post }))];
  let goal = null, hits = 0;
  const steps = Math.round(P.maxSec / P.dt);
  for (let i = 1; i <= steps; i++) {
    x += vx * P.dt; y += vy * P.dt;
    // pregos e traves
    for (const o of obstacles) {
      const ox = x - o.x, oy = y - o.y, d2 = ox * ox + oy * oy;
      if (d2 >= o.rr * o.rr) continue;
      const d = Math.sqrt(d2) || 0.0001, nx = ox / d, ny = oy / d;
      x = o.x + nx * o.rr; y = o.y + ny * o.rr; // empurra para fora
      const vn = vx * nx + vy * ny;
      if (vn < 0) { vx -= (1 + P.eNail) * vn * nx; vy -= (1 + P.eNail) * vn * ny; hits++; }
    }
    // laterais
    if (x < r) { x = r; if (vx < 0) vx = -vx * P.eWall; }
    else if (x > B.W - r) { x = B.W - r; if (vx > 0) vx = -vx * P.eWall; }
    // fundos: na boca do gol a bola passa (gol quando o centro cruza a linha); fora dela, volta
    const inMouth = !closed && x > B.goalX[0] && x < B.goalX[1];
    if (y < r && !inMouth) { y = r; if (vy < 0) vy = -vy * P.eWall; }
    else if (y > B.H - r && !inMouth) { y = B.H - r; if (vy > 0) vy = -vy * P.eWall; }
    if (inMouth && y < 0) goal = 'top';
    else if (inMouth && y > B.H) goal = 'bottom';
    // atrito
    const sp = Math.hypot(vx, vy);
    const nsp = Math.max(0, sp - (P.roll + P.damping * sp) * P.dt);
    if (sp > 0) { vx *= nsp / sp; vy *= nsp / sp; }
    const end = goal || nsp < P.stopSpeed || i === steps;
    if (i % P.frameEvery === 0 || end) frames.push([round1(x), round1(y)]);
    if (end) break;
  }
  if (goal) { // a bola "entra" um pouco no gol para a tela mostrar a rede balançando
    y = goal === 'top' ? -r - 4 : B.H + r + 4;
    frames.push([round1(x), round1(y)]);
  }
  return { frames, end: { x: round1(x), y: round1(y) }, goal, hits };
}

/** Quem marcou com um gol no alto/embaixo: o lado 0 ataca o gol de cima; o lado 1, o de baixo. */
export const scorerOf = (goal) => (goal === 'top' ? 0 : goal === 'bottom' ? 1 : null);

/** O gol que `side` ataca, em coordenadas do servidor (para o bot mirar). */
export const targetOf = (side) => ({ x: W / 2, y: side === 0 ? -10 : H + 10 });
