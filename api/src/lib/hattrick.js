/**
 * Física do Hat Trick (chute de longe, visto de cima; metros). O gol fica em y = 0 (linha do gol), o campo
 * cresce para baixo (y > 0) e x = 0 é o meio do gol. Tudo aqui é puro (sem banco): o serviço
 * sorteia o lance, a tela manda a mira/força/batida e esta conta decide o resultado.
 *
 * Decisões do dono (13/09/2026):
 * - mira e força: toca na bola e puxa pra trás (estilingue); a força só muda a VELOCIDADE (bola lenta
 *   sofre mais com o vento e dá tempo pro goleiro chegar) — força nunca manda por cima;
 * - batida: toca EM CIMA da bola grande: lado esquerdo da bola → vai pra direita, lado direito →
 *   pra esquerda, centro → reto; tocar EMBAIXO da bola faz ela subir (muito embaixo = por cima do
 *   travessão); tocar fora da bola = furou;
 * - vento empurra a bola; goleiro pula para defender.
 */
export const HATTRICK = {
  lives: 3, pointsPerGoal: 5, maxPoints: 30,
  goalHalf: 3.66, barHeight: 2.44, ballR: 0.11,
  spot: { yMin: 20, yMax: 34, xMax: 14, slope: 0.55 },  // onde a bola aparece (fora da área)
  windMax: 5,                                          // m/s
  vMin: 13, vMax: 31,                                  // força 0 → 1
  deflectDeg: 5, curveAcc: 4,                          // batida no lado: desvio inicial + curva
  lift: 5.5,                                           // batida embaixo: altura na linha do gol (m) por unidade
  windK: 0.42, drag: 0.08, g: 9.8,
  keeper: { react: [0.3, 0.45], speed: [2.2, 2.9], reach: 0.8, readErr: 0.35, blunder: 0.04, cornerPenalty: 0.25 },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Vetor do vento (para onde ele sopra): 0° = em direção ao gol (cima da tela), 90° = direita. */
export function windVector({ speed, angle }) {
  const a = (angle * Math.PI) / 180;
  return [Math.sin(a) * speed, -Math.cos(a) * speed];
}

/** Sorteia um lance: posição da bola, vento e o goleiro daquele chute (o goleiro fica só no servidor). */
export function newShot(rand) {
  const s = HATTRICK.spot;
  let x, y;
  do { y = s.yMin + rand() * (s.yMax - s.yMin); x = (rand() * 2 - 1) * s.xMax; } while (Math.abs(x) > s.slope * y);
  const k = HATTRICK.keeper;
  const gauss = () => { const u = 1 - rand(), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return {
    ball: { x: round(x, 1), y: round(y, 1) },
    wind: { speed: round(rand() * HATTRICK.windMax, 1), angle: Math.floor(rand() * 360) },
    keeper: {
      react: round(k.react[0] + rand() * (k.react[1] - k.react[0]), 3),
      speed: round(k.speed[0] + rand() * (k.speed[1] - k.speed[0]), 2),
      readErr: round(gauss() * k.readErr, 2),
      blunder: rand() < k.blunder,
    },
  };
}

/**
 * Simula o chute. input: { dirX, dirY } (direção da mira; dirY < 0 = rumo ao gol), power 0..1 e
 * strike { sx, sy } (onde tocou na bola, −1..1; sx < 0 = lado esquerdo, sy > 0 = embaixo) ou null
 * (furou / não tocou). Devolve o resultado e o voo (amostras [x, y, z] a 30 por segundo).
 */
export function simulate(shot, { dirX, dirY, power, strike }) {
  const C = HATTRICK;
  if (!strike) return { result: 'whiff', T: 0, samples: [[shot.ball.x, shot.ball.y, 0]], cross: null, keeper: null };
  const sx = clamp(Number(strike.sx) || 0, -1, 1), sy = clamp(Number(strike.sy) || 0, -1, 1);
  const len = Math.hypot(dirX, dirY) || 1;
  let dx = dirX / len, dy = dirY / len;
  // lado da bola: esquerda (sx < 0) → gira para a direita (sentido horário na tela)
  const d = (-sx * C.deflectDeg * Math.PI) / 180;
  [dx, dy] = [dx * Math.cos(d) - dy * Math.sin(d), dx * Math.sin(d) + dy * Math.cos(d)];
  const speed = C.vMin + clamp(power, 0, 1) * (C.vMax - C.vMin);
  let vx = dx * speed, vy = dy * speed, x = shot.ball.x, y = shot.ball.y, t = 0;
  const curve = -sx * C.curveAcc; // + = para a direita de quem vê a bola ir
  const [wx, wy] = windVector(shot.wind);
  const dt = 1 / 60, pts = [[x, y]];
  let cross = null, step = 0;
  while (t < 7) {
    const sp = Math.hypot(vx, vy) || 1;
    const ax = (-vy / sp) * curve + wx * C.windK - vx * C.drag;
    const ay = (vx / sp) * curve + wy * C.windK - vy * C.drag;
    const px = x, py = y;
    vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt; t += dt; step++;
    if (y <= 0) { // cruzou a linha do gol: interpola o ponto exato
      const f = py / (py - y);
      cross = { x: px + (x - px) * f, t: t - dt + dt * f };
      pts.push([cross.x, 0]);
      break;
    }
    if (step % 2 === 0) pts.push([x, y]);
    if (vy > -1 || Math.abs(x) > 36 || y > shot.ball.y + 6) break; // parou de ir pro gol ou saiu do campo
  }
  const T = cross ? cross.t : t;
  // altura: batida embaixo levanta; chute de mais longe sobe mais com o mesmo toque
  const H = Math.max(0, sy) * C.lift * clamp(shot.ball.y / 25, 0.8, 1.6);
  // sobe desde o chute até a altura H na linha do gol (rasteira, H = 0, fica no chão)
  const samples = pts.map(([px, py], i) => {
    const u = T ? (i === pts.length - 1 ? 1 : Math.min(1, (i * 2) / 60 / T)) : 0;
    return [round(px), round(py), round(H * (2 * u - u * u))];
  });
  const base = { T: round(T, 3), samples, cross: cross ? { x: round(cross.x), z: round(H) } : null, keeper: null };
  if (!cross) return { ...base, result: 'wide' };
  const ax = Math.abs(cross.x), post = C.goalHalf, r = C.ballR;
  if (ax > post + r + 0.02) return { ...base, result: 'wide' };
  if (ax >= post - r) return { ...base, result: 'post' };
  if (H > C.barHeight + 0.13) return { ...base, result: 'over' };
  if (H > C.barHeight - r) return { ...base, result: 'bar' };
  // goleiro: lê o chute (com erro), sai depois do tempo de reação e se estica até onde der
  const k = shot.keeper;
  const target = clamp(cross.x + k.readErr, -post - 0.3, post + 0.3);
  const reach = C.keeper.reach - (ax > 2.5 && H > 1.8 ? C.keeper.cornerPenalty : 0); // no ângulo é mais difícil
  const moved = Math.sign(target) * Math.min(Math.abs(target), k.speed * Math.max(0, T - k.react));
  const save = Math.abs(cross.x - moved) <= reach && !k.blunder;
  return { ...base, result: save ? 'saved' : 'goal', keeper: { react: k.react, speed: k.speed, to: round(moved), save } };
}
