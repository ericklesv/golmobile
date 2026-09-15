/**
 * FutPrego — a tábua do futebol de prego e a física da bola (pura e determinística: a mesma jogada dá
 * sempre o mesmo caminho). O servidor calcula; as telas só desenham os quadros que ele manda.
 *
 * Coordenadas do servidor: tábua de W x H, gol de CIMA em y = 0 e gol de BAIXO em y = H. O lado 0 fica
 * embaixo (defende o gol de baixo, ataca o de cima); o lado 1 fica em cima. Cada tela vira a tábua para
 * o jogador sempre atacar para cima. Todos os pregos (dos dois times) desviam a bola.
 */

export const BOARD = (() => {
  const W = 300, H = 460;
  const mouth = 70; // largura da boca do gol (afinado em scripts/futprego-balance.js: ~7 jogadas por partida)
  const ball = 7, nail = 4.2;
  // 12 pregos por time: goleiro de 2 pregos colados (a bola não passa entre eles), 4 na defesa, 4 no meio
  // e 2 no ataque; y contado a partir do próprio gol
  const shape = [
    [141, 30], [159, 30],
    [58, 92], [118, 100], [182, 100], [242, 92],
    [40, 160], [112, 170], [188, 170], [260, 160],
    [104, 208], [196, 208],
  ];
  const nails = [];
  for (const [x, y] of shape) nails.push({ x, y: H - y, side: 0 }); // time de baixo
  for (const [x, y] of shape) nails.push({ x: W - x, y, side: 1 }); // time de cima (espelhado)
  const g0 = (W - mouth) / 2, g1 = (W + mouth) / 2;
  // traves: pregos das pontas da boca do gol (a bola bate e volta)
  const posts = [{ x: g0, y: 0 }, { x: g1, y: 0 }, { x: g0, y: H }, { x: g1, y: H }];
  return { W, H, mouth, goalX: [g0, g1], ball, nail, post: 3.5, nails, posts, center: { x: W / 2, y: H / 2 } };
})();

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
 */
export function simulateFlick(start, dx, dy, power) {
  const B = BOARD, P = PHYS;
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
    const inMouth = x > B.goalX[0] && x < B.goalX[1];
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
export const targetOf = (side) => ({ x: BOARD.W / 2, y: side === 0 ? -10 : BOARD.H + 10 });
