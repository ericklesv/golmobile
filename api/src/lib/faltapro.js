/**
 * Física do Falta PRO (cobrança de falta em 3D, estilo Free Kick Classic; metros).
 * Sistema de coordenadas = o da cena 3D do pênalti/falta: gol em z = 0 (x = 0 no meio,
 * y = altura), campo crescendo para +z. Tudo aqui é puro (sem banco): o serviço sorteia
 * as 5 cobranças do dia, a tela resume o ARRASTO do jogador em { dirX, dirY, power, spin }
 * e esta conta decide o resultado. O cliente NUNCA decide gol.
 *
 * O gesto (decisões do design em docs/FALTA_PRO.md):
 * - dirX (−1..1): direção horizontal do vetor final do arrasto (+ = direita) = MIRA
 *   do ponto de chegada (o servidor compensa a deriva do efeito — ver spinComp);
 * - dirY (0..1): quanto o arrasto subiu = altura do chute (0 = rasteira);
 * - power (0..1): velocidade média do gesto = velocidade da bola;
 * - spin (−1..1): efeito Magnus lateral (+ = acelera pra direita). O cliente manda o
 *   NEGATIVO do arco desenhado: arco pra direita ⇒ a bola sai aberta pra direita e o
 *   Magnus (pra esquerda) traz de volta pra mira — a trajetória segue o arco do gesto.
 *
 * As amostras do voo saem como no Hat Trick: [x, z, y] a 30/s (x lateral, z distância
 * da linha do gol, y altura) — a tela só reproduz.
 */
export const FALTAPRO = {
  kicks: 5, goalAt: 3, pointsPerGoal: 4, maxPoints: 20, targetMoney: 50,
  goalHalf: 3.66, barHeight: 2.44, ballR: 0.11,
  spot: { zMin: 16, zMax: 24, xMax: 8, slope: 0.42 },        // onde a falta é marcada
  wall: { dist: 9.15, men: [3, 5], width: 0.4, height: 1.85, // barreira a 9,15 m da bola
    jumpBottom: 0.45, jumpTop: 2.3, jumpChance: 0.45 },      // pulou: abre embaixo, fecha em cima
  targets: { r: 0.5, inset: 0.65 },                          // alvos bônus nos cantos superiores
  vMin: 15, vMax: 29,                                        // power 0 → 1 (m/s)
  elevMax: 0.55, sideMax: 0.5,                               // dirY/dirX 1 → ângulo máximo (rad)
  spinAcc: 12,                                               // m/s² de curva com spin = 1 (banana bem visível)
  spinComp: 0.95, spinCompMax: 0.5,                          // compensação da saída (a bola abre e volta pra mira)
  g: 9.8, drag: 0.06,
  keeper: { react: [0.22, 0.4], speed: [2.7, 3.7], reach: 0.95, high: 2.2, readErr: 0.4, cornerPenalty: 0.35, blunder: 0.05 },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Sorteia uma cobrança: posição da bola, barreira (se pula fica em segredo até o chute),
 * goleiro (todo secreto) e os 2 alvos bônus. `publicKick` abaixo tira o que o cliente não pode ver.
 */
export function newKick(rand) {
  const C = FALTAPRO, s = C.spot;
  let x, z;
  do { z = s.zMin + rand() * (s.zMax - s.zMin); x = (rand() * 2 - 1) * s.xMax; } while (Math.abs(x) > s.slope * z);
  x = round(x, 1); z = round(z, 1);
  const side = x !== 0 ? Math.sign(x) : (rand() < 0.5 ? -1 : 1); // lado da bola → trave mais perto
  const dist = Math.hypot(x, z);
  // plano da barreira: a 9,15 m da bola, na reta bola → meio do gol
  const wz = round(z * (1 - C.wall.dist / dist), 2);
  const proj = (gx) => x + (gx - x) * ((z - wz) / z); // onde um x do gol aparece no plano da barreira
  const n = C.wall.men[0] + Math.floor(rand() * (C.wall.men[1] - C.wall.men[0] + 1));
  // a barreira cobre o canto do lado da bola (o lado longe fica pra curva ou por cima)
  const cover = side * C.goalHalf * (0.45 + rand() * 0.35);
  const half = (n * C.wall.width) / 2;
  const cx = proj(cover);
  const k = C.keeper;
  const gauss = () => { const u = 1 - rand(), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return {
    ball: { x, z },
    wall: { z: wz, x0: round(cx - half, 2), x1: round(cx + half, 2), n, jump: rand() < C.wall.jumpChance },
    keeper: {
      x: round(side * (0.4 + rand() * 0.9), 2), // sai um pouco pro canto da bola
      react: round(k.react[0] + rand() * (k.react[1] - k.react[0]), 3),
      speed: round(k.speed[0] + rand() * (k.speed[1] - k.speed[0]), 2),
      readErr: round(gauss() * k.readErr, 2),
      blunder: rand() < k.blunder,
    },
    targets: [
      { x: round(-(C.goalHalf - C.targets.inset), 2), y: round(C.barHeight - C.targets.inset, 2) },
      { x: round(C.goalHalf - C.targets.inset, 2), y: round(C.barHeight - C.targets.inset, 2) },
    ],
  };
}

/** O que o cliente pode ver ANTES do chute (sem goleiro secreto e sem saber se a barreira pula). */
export function publicKick(kick, i) {
  return kick ? { i, ball: kick.ball, wall: { z: kick.wall.z, x0: kick.wall.x0, x1: kick.wall.x1, n: kick.wall.n }, keeperX: kick.keeper.x, targets: kick.targets } : null;
}

/**
 * Simula o chute a partir do gesto. Devolve { result, T, samples, cross, keeper, wall, target }:
 * result = goal | saved | wall | wide | over | post | bar | short; target = 0|1 quando acertou um
 * alvo bônus (alvo acertado é gol certo: no ângulo, fora do alcance do goleiro).
 */
export function simulateKick(kick, { dirX, dirY, power, spin }) {
  const C = FALTAPRO;
  const dX = clamp(dirX, -1, 1), dY = clamp(dirY, 0, 1), pw = clamp(power, 0, 1), sp = clamp(spin, -1, 1);
  const b = kick.ball, distH = Math.hypot(b.x, b.z) || 1;
  const speed = C.vMin + pw * (C.vMax - C.vMin);
  const theta = dY * C.elevMax;
  // direção horizontal: da bola ao meio do gol, girada por dirX (φ > 0 = direita).
  // dirX MIRA o ponto de chegada; o efeito abre a saída pro lado do arco desenhado e o
  // Magnus traz a bola de volta pra mira (a trajetória segue o arco do gesto, como no
  // Free Kick Classic) — spinComp compensa a deriva prevista 0,5·a·T².
  const T0 = distH / Math.max(1, speed * Math.cos(theta));
  const comp = clamp(Math.atan2(0.5 * C.spinAcc * sp * C.spinComp * T0 * T0, distH), -C.spinCompMax, C.spinCompMax);
  const phi = dX * C.sideMax - comp;
  const h0x = -b.x / distH, h0z = -b.z / distH;
  const hx = h0x * Math.cos(phi) - h0z * Math.sin(phi);
  const hz = h0x * Math.sin(phi) + h0z * Math.cos(phi);
  let vx = speed * Math.cos(theta) * hx, vz = speed * Math.cos(theta) * hz, vy = speed * Math.sin(theta);
  let x = b.x, y = C.ballR, z = b.z, t = 0;
  const dt = 1 / 120, samples = [[x, z, y]];
  let step = 0, cross = null, result = null, wallHit = null, wallPass = null;
  const wallBand = kick.wall.jump ? [C.wall.jumpBottom, C.wall.jumpTop] : [0, C.wall.height];
  while (t < 4) {
    const sh = Math.hypot(vx, vz) || 1;
    // Magnus lateral (perpendicular horizontal da velocidade; spin > 0 curva pra direita) + arrasto
    const ax = sp * C.spinAcc * (-vz / sh) - vx * C.drag;
    const az = sp * C.spinAcc * (vx / sh) - vz * C.drag;
    const ay = -C.g - vy * C.drag;
    const px = x, py = y, pz = z;
    vx += ax * dt; vy += ay * dt; vz += az * dt;
    x += vx * dt; y += vy * dt; z += vz * dt; t += dt; step++;
    if (y < C.ballR && vy < 0) { // tocou no gramado (rasteira vale)
      y = C.ballR;
      if (vy < -1) { vy = -vy * 0.4; vx *= 0.9; vz *= 0.9; } // quicou
      else { vy = 0; const f = 1 - 0.35 * dt; vx *= f; vz *= f; } // rolando
      if (Math.hypot(vx, vz) < 3) { result = 'short'; break; } // morreu no caminho
    }
    if (pz > kick.wall.z && z <= kick.wall.z) { // atravessou o plano da barreira
      const f = (pz - kick.wall.z) / (pz - z || 1);
      const xi = px + (x - px) * f, yi = py + (y - py) * f;
      if (xi > kick.wall.x0 - C.ballR && xi < kick.wall.x1 + C.ballR && yi - C.ballR < wallBand[1] && yi + C.ballR > wallBand[0]) {
        result = 'wall'; wallHit = { x: round(xi), y: round(yi), t: round(t, 3) };
        break;
      }
      wallPass = { x: xi, vx, t }; // passou da barreira: é daqui que o goleiro lê o chute
    }
    if (z <= 0) { // cruzou a linha do gol: interpola o ponto exato
      const f = pz / (pz - z || 1);
      cross = { x: px + (x - px) * f, y: py + (y - py) * f, t: t - dt + dt * f };
      samples.push([round(cross.x), 0, round(cross.y)]);
      break;
    }
    if (step % 4 === 0) samples.push([round(x), round(z), round(y)]);
    if (vz > -0.5 || Math.abs(x) > 30) { result = 'short'; break; }
  }
  const T = cross ? cross.t : t;
  const base = { T: round(T, 3), samples, cross: cross ? { x: round(cross.x), y: round(cross.y) } : null, keeper: null, wall: { jump: kick.wall.jump, hit: wallHit }, target: null };
  if (result === 'wall' || result === 'short') return { ...base, result };
  if (!cross) return { ...base, result: 'short' };
  const axx = Math.abs(cross.x), r = C.ballR;
  if (axx > C.goalHalf + r + 0.02) return { ...base, result: 'wide' };
  if (axx >= C.goalHalf - r) return { ...base, result: 'post' };
  if (cross.y > C.barHeight + 0.13) return { ...base, result: 'over' };
  if (cross.y > C.barHeight - r) return { ...base, result: 'bar' };
  // alvo bônus: no aro é gol certo (canto inalcançável) + prêmio
  const ti = kick.targets.findIndex((tg) => Math.hypot(cross.x - tg.x, cross.y - tg.y) <= C.targets.r);
  if (ti >= 0) return { ...base, result: 'goal', target: ti };
  // goleiro: lê o canto (com erro), sai depois da reação e se estica até onde alcança.
  // Ele lê a bola em LINHA RETA a partir da barreira — curva de última hora engana o goleiro.
  const k = kick.keeper;
  const readX = wallPass ? wallPass.x + wallPass.vx * Math.max(0, T - wallPass.t) : cross.x;
  const aim = clamp(readX + k.readErr, -C.goalHalf - 0.3, C.goalHalf + 0.3);
  const need = aim - k.x;
  const moved = Math.sign(need) * Math.min(Math.abs(need), k.speed * Math.max(0, T - k.react));
  const handX = k.x + moved;
  const reach = C.keeper.reach - (axx > 2.6 && cross.y > 1.7 ? C.keeper.cornerPenalty : 0); // ângulo é mais difícil
  const save = Math.abs(cross.x - handX) <= reach && cross.y <= C.keeper.high && !k.blunder;
  return { ...base, result: save ? 'saved' : 'goal', keeper: { react: k.react, speed: k.speed, from: k.x, to: round(handX), save } };
}
