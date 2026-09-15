/**
 * Futebol de Botão (X1, pedido do dono, 15/09/2026: como o SnapFC, mas sem poderes — só no peteleco).
 * Física pura e determinística: a mesma jogada dá sempre o mesmo resultado. O servidor calcula; as telas
 * só desenham os quadros.
 *
 * Coordenadas do servidor iguais às do FutPrego: campo W x H, gol de CIMA em y = 0 (o lado 0 ataca para
 * cima) e gol de BAIXO em y = H. Cada time tem 7 botões: goleiro (preso na própria área) e 6 na linha
 * (não entram em nenhuma das duas áreas). O jogador dá o peteleco num botão seu; o botão bate na bola.
 */

export const BOTAO_FIELD = (() => {
  const W = 300, H = 460;
  const mouth = 84;             // boca do gol
  const box = { w: 140, d: 50 }; // área do goleiro (largura x profundidade)
  const g0 = (W - mouth) / 2, g1 = (W + mouth) / 2;
  const b0 = (W - box.w) / 2, b1 = (W + box.w) / 2;
  return {
    W, H, mouth, goalX: [g0, g1],
    // áreas: a de cima é do lado 1 (que defende o gol de cima); a de baixo é do lado 0
    boxes: [{ x0: b0, x1: b1, y0: H - box.d, y1: H }, { x0: b0, x1: b1, y0: 0, y1: box.d }],
    piece: 13, ball: 7.5, penaltySpot: 72,
    center: { x: W / 2, y: H / 2 },
  };
})();

export const BOTAO_PHYS = {
  dt: 1 / 240, frameEvery: 8, maxSec: 8,
  vMin: 90, vMax: 880,          // velocidade do botão no peteleco (força 0..1)
  mPiece: 2.4, mBall: 1,
  pieceDamp: 2.4, pieceRoll: 150, // botão escorrega pouco (para logo)
  ballDamp: 0.95, ballRoll: 55,   // bola rola mais
  eBallPiece: 0.88, ePiecePiece: 0.55, eWallBall: 0.72, eWallPiece: 0.5,
  stop: 7,
};

// Formação clássica 2-3-1 + goleiro, do lado 0 (de baixo), com y contado a partir do próprio gol.
const FORMATION = [[150, 25], [96, 112], [204, 112], [58, 168], [150, 158], [242, 168], [150, 194]];

/** Botões na formação de saída (lado 1 é o lado 0 girado 180°) e a bola no meio. */
export function kickoffLayout() {
  const F = BOTAO_FIELD;
  const pieces = [];
  for (const [x, y] of FORMATION) pieces.push({ side: 0, gk: pieces.length === 0, x, y: F.H - y });
  FORMATION.forEach(([x, y], i) => pieces.push({ side: 1, gk: i === 0, x: F.W - x, y }));
  return { pieces, ball: { ...F.center } };
}

/** Posições de um pênalti: só o cobrador, o goleiro do outro lado e a bola na marca. */
export function penaltyLayout(kickerSide, goalieOffset = 0) {
  const F = BOTAO_FIELD;
  const toward = kickerSide === 0 ? -1 : 1; // o lado 0 ataca o gol de cima (y = 0)
  const goalY = kickerSide === 0 ? 0 : F.H;
  const ball = { x: F.W / 2, y: goalY - toward * F.penaltySpot };
  const kicker = { side: kickerSide, gk: false, x: F.W / 2, y: ball.y - toward * (F.ball + F.piece + 18) };
  const goalie = { side: 1 - kickerSide, gk: true, x: F.W / 2 + goalieOffset, y: goalY - toward * (F.piece + 3) };
  return { pieces: [kicker, goalie], ball };
}

const r1 = (v) => Math.round(v * 2) / 2;

/**
 * Um peteleco: o botão `idx` sai na direção (dx, dy) com força 0..1. Simula tudo até parar (ou gol).
 * Devolve os quadros ([[bx, by], [x, y] de cada botão…] a cada 1/30 s), as posições finais e o gol
 * ('top' = gol de cima, 'bottom' = gol de baixo, null = nada).
 */
export function simulateSnap(state, idx, dx, dy, power) {
  const F = BOTAO_FIELD, P = BOTAO_PHYS;
  const len = Math.hypot(dx, dy) || 1;
  const speed = P.vMin + Math.max(0, Math.min(1, power)) * (P.vMax - P.vMin);
  const bodies = [
    { x: state.ball.x, y: state.ball.y, vx: 0, vy: 0, r: F.ball, m: P.mBall, ball: true },
    ...state.pieces.map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0, r: F.piece, m: P.mPiece, side: p.side, gk: p.gk })),
  ];
  const shooter = bodies[idx + 1];
  shooter.vx = (dx / len) * speed; shooter.vy = (dy / len) * speed;
  const frame = () => bodies.map((b) => [r1(b.x), r1(b.y)]);
  const frames = [frame()];
  let goal = null;
  const steps = Math.round(P.maxSec / P.dt);
  for (let i = 1; i <= steps; i++) {
    for (const b of bodies) { b.x += b.vx * P.dt; b.y += b.vy * P.dt; }
    // colisões entre todos (bola e botões)
    for (let a = 0; a < bodies.length; a++) for (let c = a + 1; c < bodies.length; c++) {
      const A = bodies[a], C = bodies[c];
      const dxAB = C.x - A.x, dyAB = C.y - A.y, rr = A.r + C.r, d2 = dxAB * dxAB + dyAB * dyAB;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.0001, nx = dxAB / d, ny = dyAB / d;
      // separa proporcional à massa
      const overlap = rr - d, tot = A.m + C.m;
      A.x -= nx * overlap * (C.m / tot); A.y -= ny * overlap * (C.m / tot);
      C.x += nx * overlap * (A.m / tot); C.y += ny * overlap * (A.m / tot);
      const rel = (C.vx - A.vx) * nx + (C.vy - A.vy) * ny;
      if (rel >= 0) continue;
      const e = A.ball || C.ball ? P.eBallPiece : P.ePiecePiece;
      const j = (-(1 + e) * rel) / (1 / A.m + 1 / C.m);
      A.vx -= (j / A.m) * nx; A.vy -= (j / A.m) * ny;
      C.vx += (j / C.m) * nx; C.vy += (j / C.m) * ny;
    }
    for (const b of bodies) {
      const eW = b.ball ? P.eWallBall : P.eWallPiece;
      // laterais
      if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * eW; }
      else if (b.x > F.W - b.r) { b.x = F.W - b.r; if (b.vx > 0) b.vx = -b.vx * eW; }
      // fundos: só a bola passa pela boca do gol
      const inMouth = b.ball && b.x > F.goalX[0] + 2 && b.x < F.goalX[1] - 2;
      if (b.y < b.r && !inMouth) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * eW; }
      else if (b.y > F.H - b.r && !inMouth) { b.y = F.H - b.r; if (b.vy > 0) b.vy = -b.vy * eW; }
      if (b.ball) {
        if (inMouth && b.y < 0) goal = 'top';
        else if (inMouth && b.y > F.H) goal = 'bottom';
        continue;
      }
      if (b.gk) confineGoalie(b, F.boxes[b.side], eW);
      else for (const box of F.boxes) keepOutOfBox(b, box, eW);
    }
    // atrito
    let moving = false;
    for (const b of bodies) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp === 0) continue;
      const damp = b.ball ? P.ballDamp : P.pieceDamp, roll = b.ball ? P.ballRoll : P.pieceRoll;
      const nsp = Math.max(0, sp - (roll + damp * sp) * P.dt);
      if (nsp < P.stop) { b.vx = 0; b.vy = 0; } else { b.vx *= nsp / sp; b.vy *= nsp / sp; moving = true; }
    }
    const end = goal || !moving || i === steps;
    if (i % P.frameEvery === 0 || end) frames.push(frame());
    if (end) break;
  }
  if (goal) { // a bola entra um pouco (rede)
    bodies[0].y = goal === 'top' ? -F.ball - 5 : F.H + F.ball + 5;
    frames.push(frame());
  }
  const [ball, ...pieces] = bodies;
  return {
    frames, goal,
    ball: { x: r1(ball.x), y: r1(ball.y) },
    pieces: pieces.map((b, i) => ({ side: state.pieces[i].side, gk: state.pieces[i].gk, x: r1(b.x), y: r1(b.y) })),
  };
}

/** O goleiro não sai da própria área (as bordas da área viram parede para ele). */
function confineGoalie(b, box, e) {
  const x0 = box.x0 + b.r, x1 = box.x1 - b.r;
  const y0 = Math.max(box.y0 + b.r, b.r), y1 = Math.min(box.y1 - b.r, BOTAO_FIELD.H - b.r);
  if (b.x < x0) { b.x = x0; if (b.vx < 0) b.vx = -b.vx * e; } else if (b.x > x1) { b.x = x1; if (b.vx > 0) b.vx = -b.vx * e; }
  if (b.y < y0) { b.y = y0; if (b.vy < 0) b.vy = -b.vy * e; } else if (b.y > y1) { b.y = y1; if (b.vy > 0) b.vy = -b.vy * e; }
}

/** Botão de linha não entra na área: a área é um bloco sólido para ele. */
function keepOutOfBox(b, box, e) {
  const cx = Math.max(box.x0, Math.min(box.x1, b.x)), cy = Math.max(box.y0, Math.min(box.y1, b.y));
  const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= b.r * b.r) return;
  let nx, ny, d = Math.sqrt(d2);
  if (d < 1e-6) { // centro dentro da área: empurra para fora pelo lado do campo
    nx = 0; ny = box.y0 === 0 ? 1 : -1; d = 0;
    b.y = box.y0 === 0 ? box.y1 + b.r : box.y0 - b.r;
  } else {
    nx = dx / d; ny = dy / d;
    b.x = cx + nx * b.r; b.y = cy + ny * b.r;
  }
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
}

/** Quem marcou: o lado 0 ataca o gol de cima; o lado 1, o de baixo. */
export const botaoScorer = (goal) => (goal === 'top' ? 0 : goal === 'bottom' ? 1 : null);
