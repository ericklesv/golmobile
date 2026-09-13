/**
 * Cabeção — simulação 2D (estilo head soccer) que roda NO SERVIDOR a 30 Hz.
 * Unidades lógicas: campo 800 × 400, y cresce para cima, chão em y = 0.
 * Jogador 0 defende o gol da esquerda (ataca para a direita); jogador 1 o contrário.
 * Puro (sem I/O): recebe entradas, avança `step(dt)`, devolve estado serializável.
 */
export const FIELD = {
  w: 800, h: 400,
  goalW: 112, goalH: 206, barH: 10,      // boca do gol (profundidade), altura, espessura do travessão — casam com a textura do gol
  playerR: 50, ballR: 17,                // jogador = círculo de raio R (cabeça grande) apoiado no chão
  speed: 290, jump: 560, gravity: 1400,  // jogador
  ballGravity: 1000, ballMax: 950, bounce: 0.78, groundFriction: 0.985,
  kickRange: 100, kickVx: 560, kickVy: 380, headBoost: 1.05,
  matchSec: 60, goldenSec: 20, goalPauseSec: 1.3, countdownSec: 3,
};

export function createSim() {
  const s = {
    tick: 0, phase: 'countdown', clock: FIELD.countdownSec, // countdown | play | goal | golden | over
    time: FIELD.matchSec, score: [0, 0], lastScorer: null, pause: 0, golden: false,
    p: [mkPlayer(0), mkPlayer(1)],
    b: mkBall(),
    input: [blankInput(), blankInput()],
    result: null, // { winner: 0|1|null, reason }
  };
  return s;
}

function mkPlayer(i) {
  return { x: i === 0 ? 230 : 570, y: 0, vx: 0, vy: 0, face: i === 0 ? 1 : -1, kick: 0, grounded: true };
}
function mkBall() { return { x: 400, y: 260, vx: 0, vy: 0 }; }
function blankInput() { return { l: 0, r: 0, j: 0, k: 0, jEdge: 0, kEdge: 0 }; }

/** Entrada do jogador i: {l, r, j, k} (0/1). Pulo e chute contam na borda de subida. */
export function setInput(s, i, inp) {
  const cur = s.input[i];
  const j = inp.j ? 1 : 0, k = inp.k ? 1 : 0;
  if (j && !cur.j) cur.jEdge = 1;
  if (k && !cur.k) cur.kEdge = 1;
  cur.l = inp.l ? 1 : 0; cur.r = inp.r ? 1 : 0; cur.j = j; cur.k = k;
}

function resetPositions(s) {
  s.p[0] = { ...mkPlayer(0) }; s.p[1] = { ...mkPlayer(1) }; s.b = mkBall();
  s.input = [blankInput(), blankInput()];
}

export function step(s, dt) {
  s.tick++;
  if (s.phase === 'countdown') {
    s.clock -= dt;
    if (s.clock <= 0) { s.phase = s.golden ? 'golden' : 'play'; }
    return;
  }
  if (s.phase === 'goal') {
    s.pause -= dt;
    if (s.pause <= 0) {
      if (s.result) { s.phase = 'over'; return; }
      resetPositions(s); s.phase = 'countdown'; s.clock = 1.2;
    }
    return;
  }
  if (s.phase === 'over') return;

  // relógio
  s.time -= dt;
  if (s.time <= 0) {
    if (s.phase === 'play' && s.score[0] === s.score[1]) { s.golden = true; s.time = FIELD.goldenSec; s.phase = 'countdown'; s.clock = 1.5; resetPositions(s); return; }
    s.result = { winner: s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1, reason: 'time' };
    s.phase = 'over'; return;
  }

  // jogadores
  for (let i = 0; i < 2; i++) {
    const p = s.p[i], inp = s.input[i];
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    p.vx = dir * FIELD.speed;
    if (dir) p.face = dir;
    if (inp.jEdge && p.grounded) { p.vy = FIELD.jump; p.grounded = false; }
    inp.jEdge = 0;
    p.vy -= FIELD.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }
    const minX = FIELD.goalW + FIELD.playerR, maxX = FIELD.w - FIELD.goalW - FIELD.playerR;
    if (p.x < minX) p.x = minX; if (p.x > maxX) p.x = maxX;
    if (p.kick > 0) p.kick -= dt;
    if (inp.kEdge) { inp.kEdge = 0; if (p.kick <= 0) { p.kick = 0.28; kickBall(s, i); } }
  }
  // jogadores não se atravessam
  {
    const a = s.p[0], b = s.p[1];
    const dx = b.x - a.x, dy = (b.y + FIELD.playerR) - (a.y + FIELD.playerR);
    const d = Math.hypot(dx, dy), min = FIELD.playerR * 2 - 4;
    if (d < min && d > 0.001) { const push = (min - d) / 2; const nx = dx / d; a.x -= nx * push; b.x += nx * push; }
  }

  // bola
  const b = s.b;
  b.vy -= FIELD.ballGravity * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  // chão / teto
  if (b.y - FIELD.ballR <= 0) { b.y = FIELD.ballR; b.vy = -b.vy * FIELD.bounce; b.vx *= FIELD.groundFriction; if (Math.abs(b.vy) < 40) b.vy = 0; }
  if (b.y + FIELD.ballR >= FIELD.h) { b.y = FIELD.h - FIELD.ballR; b.vy = -Math.abs(b.vy) * FIELD.bounce; }
  // paredes do fundo (dentro do gol)
  if (b.x - FIELD.ballR <= 0) { b.x = FIELD.ballR; b.vx = Math.abs(b.vx) * FIELD.bounce; }
  if (b.x + FIELD.ballR >= FIELD.w) { b.x = FIELD.w - FIELD.ballR; b.vx = -Math.abs(b.vx) * FIELD.bounce; }
  // travessões (retângulos): esquerda x∈[0,goalW], direita x∈[w-goalW,w], y∈[goalH, goalH+barH]
  collideRect(b, 0, FIELD.goalH, FIELD.goalW, FIELD.goalH + FIELD.barH);
  collideRect(b, FIELD.w - FIELD.goalW, FIELD.goalH, FIELD.w, FIELD.goalH + FIELD.barH);
  // cabeça dos jogadores
  for (let i = 0; i < 2; i++) {
    const p = s.p[i];
    const cx = p.x, cy = p.y + FIELD.playerR;
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy), min = FIELD.playerR + FIELD.ballR;
    if (d < min && d > 0.001) {
      const nx = dx / d, ny = dy / d;
      b.x = cx + nx * min; b.y = cy + ny * min;
      const rel = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
      if (rel < 0) { b.vx -= (1 + FIELD.bounce) * rel * nx; b.vy -= (1 + FIELD.bounce) * rel * ny; }
      b.vx += p.vx * 0.35; b.vy += Math.max(0, p.vy) * 0.5;
      b.vx *= FIELD.headBoost; b.vy *= FIELD.headBoost;
    }
  }
  // limite de velocidade
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > FIELD.ballMax) { b.vx *= FIELD.ballMax / sp; b.vy *= FIELD.ballMax / sp; }

  // gol: bola inteira atrás da linha, abaixo do travessão
  if (b.x + FIELD.ballR < FIELD.goalW && b.y + FIELD.ballR < FIELD.goalH) goal(s, 1);
  else if (b.x - FIELD.ballR > FIELD.w - FIELD.goalW && b.y + FIELD.ballR < FIELD.goalH) goal(s, 0);
}

function kickBall(s, i) {
  const p = s.p[i], b = s.b;
  const footX = p.x + p.face * 34, footY = p.y + 16;
  const d = Math.hypot(b.x - footX, b.y - footY);
  if (d > FIELD.kickRange) return;
  b.vx = p.face * FIELD.kickVx + p.vx * 0.3;
  b.vy = FIELD.kickVy + (b.y > footY + 20 ? 120 : 0);
}

function collideRect(b, x1, y1, x2, y2) {
  const cx = Math.max(x1, Math.min(b.x, x2)), cy = Math.max(y1, Math.min(b.y, y2));
  const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d >= FIELD.ballR || d < 0.001) return;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * FIELD.ballR; b.y = cy + ny * FIELD.ballR;
  const rel = b.vx * nx + b.vy * ny;
  if (rel < 0) { b.vx -= (1 + FIELD.bounce) * rel * nx; b.vy -= (1 + FIELD.bounce) * rel * ny; }
}

function goal(s, scorer) {
  s.score[scorer]++;
  s.lastScorer = scorer;
  s.phase = 'goal'; s.pause = FIELD.goalPauseSec;
  if (s.golden) s.result = { winner: scorer, reason: 'golden' };
}

/** Estado compacto para o cliente. */
export function snapshot(s) {
  return {
    t: 's', k: s.tick, ph: s.phase, cd: Math.max(0, s.clock), tm: Math.max(0, s.time), sc: s.score, g: s.golden, ls: s.lastScorer,
    p: s.p.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.face, p.kick > 0 ? 1 : 0]),
    b: [Math.round(s.b.x), Math.round(s.b.y), Math.round(s.b.vx), Math.round(s.b.vy)],
  };
}
