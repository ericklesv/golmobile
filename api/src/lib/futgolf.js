/**
 * Futgolf (X1; aprovado pelo dono em 23/09/2026 a partir das telas de exemplo — "campo maior", "powerups na pista
 * como as setinhas de boost, coisas para bater e receber bump como uma mola", "mais shapes e nada tão óbvio").
 * Golfe de chute visto de cima: a bola ROLA pelo campo (física de chão, como minigolfe), e quem embocar com menos
 * chutes vence. Física pura e determinística — a mesma jogada dá sempre o mesmo resultado; o servidor calcula e
 * as telas só desenham os quadros.
 *
 * Coordenadas: campo de FG.W de largura e H (do buraco) de altura, y cresce para baixo. Ângulos das peças em
 * GRAUS com 0 = para cima e 90 = para a direita (como quem desenha o buraco pensa).
 *
 * Um buraco = um corredor (linha central com larguras, suavizada) fechado por placas + o que tem dentro:
 *  - ilhas: blocos sólidos (canteiro, ferradura, chafariz) — a bola bate e volta;
 *  - placas: paredes finas soltas no campo;
 *  - zonas: `agua` (lagoa: a bola volta de onde saiu — o chute foi perdido), `areia` (terrão: segura muito), `mato` (segura),
 *    `seco` (grama por cima da água: ilha e ponte);
 *  - molas: batem e DEVOLVEM com força extra (bumper de fliperama);
 *  - postes: obstáculos redondos (cone, jogador da barreira);
 *  - setas (boost): enquanto a bola passa por cima, ganha velocidade na direção da seta;
 *  - bueiros (túnel): a bola cai num e sai no outro, na direção marcada. Um bueiro pode ter DUAS saídas, sorteadas na
 *    hora (dono, 24/09/2026, no Bueiros: "um teleporte péssimo, jogando o usuário para trás, e o outro o atual"):
 *    `tunnelLuck` de chance de sair na boa; o sorteio vem de fora (`luck`), para a partida ser a mesma no replay;
 *  - RAMPAS (dono, 24/09/2026: "adicionar novas plataformas… como rampa"): a bola que sobe a rampa rápida e no sentido
 *    dela DECOLA — no ar passa por cima da lagoa, do terrão, do mato, dos cones, das molas, das setas e dos bueiros,
 *    sente mais o vento e não tem atrito de chão; bate nas placas; ao pousar perde um pouco e segue rolando.
 * E o VENTO (dono, 24/09/2026: "que o vento fosse um fator importante… atuando de fato como vento, apenas quando a bola
 * estiver em curso, jamais nela parada"): muda a cada rodada (windRoll/windShift) e empurra a bola que rola na direção
 * dele, mais forte com a bola rápida; a bola devagar quase não sente, então parada ela nunca anda.
 */

export const FG = { W: 400, ball: 7, cup: 11 };

export const FG_PHYS = {
  dt: 1 / 210, frameEvery: 7, maxSec: 12, // 210 passos por segundo, um quadro a cada 7 = 30 quadros por segundo
  vMin: 70, vMax: 900, vCap: 1300,       // chute (força 0..1) e o teto (o passo nunca passa do raio da bola)
  roll: 60, damp: 1.1,                   // atrito da grama: força cheia rola ~680
  surf: { mato: 2.4, areia: 5.5 },       // quanto cada chão segura a mais
  eWall: 0.62, wallTan: 0.94,            // placa: devolve 62% e rala um pouco
  ePost: 0.55,
  mola: { e: 0.9, kick: 330 },           // mola: devolve quase tudo e ainda empurra
  boost: { acc: 2100 },
  spin: { acc: 95, tau: 1.6 },           // efeito: curva a bola (some aos poucos)
  // embocar (dono, 24/09/2026: "está muito fácil embocar… batendo forte e está embocando… a tacada tem que ser mais
  // certeira em força"): passar pelo MEIO do buraco abaixo de cupV (antes 330: a bola que ainda rolaria ~200 caía;
  // agora ~105, uns 5 buracos); fora do meio, menos ainda — cupV × (1 − (d/raio)²)^¼, d = quanto passou do centro.
  // Rápida demais, a bola passa por cima: se pegou na borda, "tira tinta" — perde lipKeep e desvia até lipTurn rad.
  // O buraco só puxa a bola que chega devagar (pullV × cupV) bem na beirada.
  cupV: 200, cupPull: 90, pullV: 0.6, lipKeep: 0.85, lipTurn: 0.35,
  tunnelKeep: 0.95, tunnelMin: 190, tunnelR: 14,
  tunnelLuck: 0.5,                       // bueiro de duas saídas: chance de sair na BOA (a outra joga a bola para trás)
  stop: 5,
  // vento: força 0..max; acelera acc × força com a bola a vRef ou mais rápida, proporcional abaixo disso (a 50 de
  // velocidade, o vento máximo empurra menos do que o atrito segura: a bola sempre para). Vento 5 de lado desvia um
  // chute cheio em ~100; vento 2, ~40.
  wind: { acc: 28, vRef: 300, max: 5, airMult: 1.8 }, // no ar, o vento pega quase o dobro
  // rampa: decola se passar a mais de minV no sentido dela; fica no ar k × velocidade (até maxT s), sem atrito de chão
  // (só airDamp), e pousa com `land` da velocidade. `height` é só para a tela desenhar o salto.
  ramp: { minV: 220, k: 0.0014, maxT: 1.1, land: 0.82, airDamp: 0.25, height: 55 },
};

/** O vento da primeira rodada: força 0..5 e direção em graus (0 = para cima), de 15 em 15. */
export function windRoll(rnd = Math.random) {
  return { ang: Math.floor(rnd() * 24) * 15, str: Math.floor(rnd() * (FG_PHYS.wind.max + 1)) };
}
/** O vento da rodada seguinte: vira até 45° e muda até 1 de força (não salta de um lado para o outro). */
export function windShift(w, rnd = Math.random) {
  const ang = ((((w?.ang ?? 0) + Math.round((rnd() - 0.5) * 6) * 15) % 360) + 360) % 360;
  const str = Math.max(0, Math.min(FG_PHYS.wind.max, (w?.str ?? 0) + Math.round((rnd() - 0.5) * 2.6)));
  return { ang, str };
}

// ─── formas ─────────────────────────────────────────────────────────────────

const rad = (deg) => (deg * Math.PI) / 180;
/** Direção de um ângulo das peças (0 = para cima, 90 = para a direita). */
export const dirOf = (deg) => [Math.sin(rad(deg)), -Math.cos(rad(deg))];
const round1 = (v) => Math.round(v * 10) / 10;

export function circle(cx, cy, r, n = 26) {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
}
export function ellipse(cx, cy, rx, ry, rot = 0, n = 28) {
  const c = Math.cos(rad(rot)), s = Math.sin(rad(rot));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI, x = rx * Math.cos(t), y = ry * Math.sin(t);
    return [cx + x * c - y * s, cy + x * s + y * c];
  });
}
/** Retângulo girado (`ang` em graus, horário). */
export function rect(cx, cy, w, h, ang = 0) {
  const c = Math.cos(rad(ang)), s = Math.sin(rad(ang));
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
/** Ferradura: anel de `rIn` a `rOut` de `fromDeg` a `toDeg` (graus da tela: 0 = direita, 90 = baixo), a abertura é o resto. */
export function horseshoe(cx, cy, rOut, rIn, fromDeg, toDeg, n = 22) {
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = rad(fromDeg + ((toDeg - fromDeg) * i) / n);
    out.push([cx + rOut * Math.cos(t), cy + rOut * Math.sin(t)]);
    inn.push([cx + rIn * Math.cos(t), cy + rIn * Math.sin(t)]);
  }
  return [...out, ...inn.reverse()];
}
/** Mancha irregular (sempre a mesma para a mesma `seed`): lagoa, terrão, canteiro. */
export function blob(cx, cy, r, seed = 1, n = 20, wob = 0.22, sy = 1) {
  let h = seed * 9301 + 49297;
  const rnd = () => { h = (h * 9301 + 49297) % 233280; return h / 233280; };
  const k = [rnd(), rnd(), rnd()].map((v) => v * 2 * Math.PI);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    const rr = r * (1 + wob * (0.55 * Math.sin(2 * t + k[0]) + 0.3 * Math.sin(3 * t + k[1]) + 0.15 * Math.sin(5 * t + k[2])));
    return [cx + rr * Math.cos(t), cy + rr * sy * Math.sin(t)];
  });
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * O corredor do buraco: Catmull-Rom pela linha central ([x, y, largura] em cada ponto), as duas margens e as
 * pontas arredondadas. Devolve o contorno (polígono fechado).
 */
function corridor(path) {
  const P = path.map(([x, y, w]) => ({ x, y, w }));
  const at = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const pts = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const n = Math.max(4, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 9));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: cr(p0.x, p1.x, p2.x, p3.x, t), y: cr(p0.y, p1.y, p2.y, p3.y, t), w: p1.w + (p2.w - p1.w) * t });
    }
  }
  const last = P[P.length - 1];
  pts.push({ ...last });
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl, ny = tx / tl;
    left.push([pts[i].x + (nx * pts[i].w) / 2, pts[i].y + (ny * pts[i].w) / 2]);
    right.push([pts[i].x - (nx * pts[i].w) / 2, pts[i].y - (ny * pts[i].w) / 2]);
  }
  const cap = (c, from, to, clockwise) => { // meia-volta de `from` até `to` em volta de `c`
    const r = Math.hypot(from[0] - c.x, from[1] - c.y);
    const a0 = Math.atan2(from[1] - c.y, from[0] - c.x);
    let a1 = Math.atan2(to[1] - c.y, to[0] - c.x);
    if (clockwise && a1 < a0) a1 += 2 * Math.PI;
    if (!clockwise && a1 > a0) a1 -= 2 * Math.PI;
    const out = [];
    for (let k = 1; k < 10; k++) { const t = a0 + ((a1 - a0) * k) / 10; out.push([c.x + r * Math.cos(t), c.y + r * Math.sin(t)]); }
    return out;
  };
  const s = pts[0], e = pts[pts.length - 1];
  // left vai do começo ao fim; a ponta do fim vira de left para right por fora, e a do começo volta de right para left
  const endCap = cap(e, left[left.length - 1], right[right.length - 1], false);
  const startCap = cap(s, right[0], left[0], false);
  return cleanLoops([...left, ...endCap, ...right.reverse(), ...startCap]);
}

/** Tira os laços pequenos que a margem de dentro faz numa curva fechada (o contorno fica simples). */
function cleanLoops(poly) {
  const out = [...poly];
  for (let guard = 0; guard < 4; guard++) {
    let cut = false;
    for (let i = 0; i < out.length - 1 && !cut; i++) {
      for (let j = i + 2; j < Math.min(out.length - 1, i + 40) && !cut; j++) {
        const hit = segHit(out[i], out[i + 1], out[j], out[j + 1]);
        if (hit) { out.splice(i + 1, j - i, hit); cut = true; }
      }
    }
    if (!cut) break;
  }
  return out;
}
function segHit(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}

// ─── os buracos ─────────────────────────────────────────────────────────────
// Cada um tem um jeito de jogar (dono: "nada tão óbvio"). O servidor sorteia o buraco e se ele vem espelhado.
// `tb` = de onde sai o chute de desempate (mais perto do buraco vence).

export const HOLES = [
  {
    id: 'tabelinha', name: 'Tabelinha', par: 3, H: 960,
    path: [[200, 925, 160], [196, 720, 160], [276, 540, 180], [262, 390, 190], [140, 262, 184], [176, 112, 196]],
    tee: [200, 900], cup: [176, 122], tb: [262, 470],
    postes: [[208, 620, 9, 'jogador'], [228, 612, 9, 'jogador'], [248, 604, 9, 'jogador']],
    molas: [[330, 452, 15], [86, 300, 15]],
    boosts: [[196, 790, 0, 64], [238, 388, -40, 58]],
    zones: [{ t: 'areia', poly: blob(252, 168, 34, 3, 18, 0.25, 0.8) }, { t: 'mato', poly: blob(120, 560, 36, 7, 18, 0.3, 1.4) }],
  },
  {
    id: 'bifurcacao', name: 'Bifurcação', par: 3, H: 1040,
    path: [[200, 1000, 170], [200, 830, 220], [200, 640, 330], [200, 420, 330], [200, 262, 226], [200, 112, 196]],
    tee: [200, 975], cup: [206, 120], tb: [200, 790],
    islands: [[[200, 706], [252, 626], [264, 524], [252, 426], [200, 346], [148, 426], [136, 524], [148, 626]]],
    // dono, 24/09/2026: "só tem prejuízos no lado direito enquanto o lado esquerdo está numa boa… não faz sentido ir
    // pela direita". Agora: ESQUERDA = as setas (rápida), com a lagoa comprida colada nelas; DIREITA = uma rampa que
    // salta o terrão (sem lagoa: pede força certa). As duas saem perto do par (futgolf-balance.js, rotas).
    zones: [
      { t: 'agua', poly: ellipse(64, 528, 28, 104) },
      { t: 'areia', poly: blob(314, 470, 36, 5, 18, 0.18, 1.9) },
      { t: 'areia', poly: blob(128, 196, 30, 11, 16, 0.3, 0.8) },
    ],
    boosts: [[114, 640, 0, 70], [114, 470, 0, 70]],
    rampas: [[314, 640, 0, 46]],
    molas: [[340, 360, 12]],
  },
  {
    id: 'ilha', name: 'Ilha', par: 3, H: 1180,
    path: [[200, 1150, 170], [200, 930, 170], [200, 760, 210], [200, 610, 360], [200, 390, 360], [200, 230, 340], [200, 156, 280]],
    tee: [200, 1125], cup: [188, 208], tb: [200, 600],
    zones: [
      { t: 'seco', poly: circle(200, 214, 72) },
      { t: 'seco', poly: rect(200, 400, 80, 260) },
      { t: 'agua', poly: rect(200, 360, 400, 320) },
    ],
    postes: [[156, 532, 8, 'cone'], [244, 532, 8, 'cone']],
    boosts: [[200, 470, 0, 56]],
    rampas: [[96, 596, 16, 46]], // salto direto para a ilha: força certa pousa nela, fraca cai na lagoa, forte passa
    // a saída ficava em (344, 70), em cima da placa do fundo: a bola batia nela e escapava do campo (achado pelo
    // futgolf-balance.js, que agora confere toda saída de bueiro)
    tuneis: [[92, 730, 296, 96, -100]],
  },
  {
    id: 'fliperama', name: 'Fliperama', par: 4, H: 980,
    path: [[200, 945, 170], [200, 780, 220], [200, 580, 370], [200, 390, 370], [200, 230, 280], [200, 112, 214]],
    tee: [200, 920], cup: [200, 150], tb: [200, 470],
    islands: [horseshoe(200, 150, 62, 40, -45, 225)],
    molas: [[120, 610, 16], [280, 610, 16], [200, 530, 18], [110, 450, 15], [290, 450, 15], [200, 386, 14]],
    boosts: [[76, 330, 0, 62], [324, 330, 0, 62]],
    zones: [{ t: 'mato', poly: blob(200, 700, 34, 2, 16, 0.25, 0.7) }],
  },
  {
    id: 'ziguezague', name: 'Zigue-zague', par: 4, H: 1250,
    path: [[96, 1215, 160], [96, 980, 160], [150, 850, 170], [296, 720, 170], [304, 500, 170], [226, 370, 170], [104, 240, 176], [112, 118, 196]],
    tee: [96, 1190], cup: [112, 128], tb: [300, 560],
    molas: [[40, 880, 14], [352, 770, 14], [360, 420, 14], [48, 300, 14]],
    boosts: [[96, 1060, 0, 68], [300, 610, 0, 68], [168, 312, -48, 60]],
    zones: [{ t: 'areia', poly: blob(206, 780, 30, 4, 16, 0.25, 0.9) }, { t: 'areia', poly: blob(196, 250, 28, 9, 16, 0.25, 0.9) }, { t: 'agua', poly: blob(186, 470, 30, 13, 18, 0.25, 1.2) }],
  },
  {
    id: 'slalom', name: 'Slalom', par: 4, H: 1000,
    path: [[200, 965, 250], [200, 560, 250], [200, 138, 250]],
    tee: [200, 940], cup: [200, 150], tb: [200, 560],
    placas: [[76, 780, 196, 780], [204, 580, 324, 580], [76, 380, 196, 380]],
    molas: [[136, 680, 12], [264, 480, 12]],
    boosts: [[280, 850, 0, 60], [120, 660, 0, 60], [280, 460, 0, 60], [132, 290, 30, 56]],
    zones: [{ t: 'areia', poly: blob(136, 196, 28, 21, 16, 0.25, 0.8) }, { t: 'areia', poly: blob(266, 232, 26, 23, 16, 0.25, 0.8) }],
  },
  {
    id: 'rotatoria', name: 'Rotatória', par: 3, H: 1150,
    path: [[200, 1115, 170], [200, 920, 180], [200, 780, 380], [200, 520, 380], [200, 350, 300], [262, 190, 204], [270, 112, 190]],
    tee: [200, 1090], cup: [270, 124], tb: [110, 560],
    islands: [circle(200, 650, 86, 30)],
    boosts: [[58, 650, 0, 64], [200, 508, 90, 64], [342, 650, 180, 64], [200, 792, 270, 64]],
    molas: [[92, 520, 13], [308, 780, 13]],
    zones: [{ t: 'areia', poly: blob(186, 244, 30, 17, 16, 0.25, 0.9) }, { t: 'mato', poly: blob(330, 330, 30, 19, 16, 0.25, 1.3) }],
  },
  {
    id: 'bueiros', name: 'Bueiros', par: 3, H: 1000,
    path: [[200, 965, 180], [200, 780, 300], [122, 575, 300], [232, 385, 300], [200, 210, 222], [200, 112, 200]],
    tee: [200, 940], cup: [200, 124], tb: [150, 520],
    // o bueiro 3 (no meio dos cones) é a ASSINATURA do Bueiros: metade das vezes sai perto do buraco, metade volta lá
    // para trás, perto da saída (a 6ª posição é a saída do azar)
    tuneis: [[106, 720, 332, 290, 0], [292, 700, 92, 520, 30], [194, 612, 272, 200, -60, [128, 884, 180]]],
    postes: [[194, 590, 8, 'cone'], [175, 622, 8, 'cone'], [213, 622, 8, 'cone']],
    zones: [{ t: 'agua', poly: blob(70, 430, 30, 29, 18, 0.2, 1.5) }, { t: 'mato', poly: blob(336, 310, 36, 31, 16, 0.2, 1.4) }, { t: 'areia', poly: blob(268, 190, 26, 37, 16, 0.25, 0.9) }],
    molas: [[330, 520, 14]],
  },
];

/** Anel de cones em volta de (cx, cy), nos ângulos da tela (0 = direita, 90 = baixo). */
const coneRing = (cx, cy, r, degs) => degs.map((d) => [cx + r * Math.cos(rad(d)), cy + r * Math.sin(rad(d)), 8, 'cone']);

/**
 * Campo do DESEMPATE, do 2º desempate em diante (dono, 24/09/2026: "o segundo desempate precisa ser em um campo
 * diferente, novo, específico para desempates, com menor probabilidade de ser um hole-in-one"): o buraco no meio de uma
 * coroa de cones aberta só POR TRÁS, com terrão na frente — de frente a bola bate nos cones e fica perto; para embocar
 * de primeira é preciso contornar (efeito, vento ou tabela na placa do fundo). Vence quem deixar a bola mais perto.
 */
export const TIEBREAK_HOLE = {
  id: 'desempate', name: 'Desempate', par: 1, H: 700,
  path: [[200, 670, 220], [200, 540, 340], [200, 300, 360], [200, 150, 300]],
  tee: [200, 640], cup: [200, 250], tb: [200, 640],
  postes: coneRing(200, 250, 36, [0, 40, 80, 120, 160, 200, 340]),
  molas: [[92, 262, 13], [308, 262, 13]],
  zones: [{ t: 'areia', poly: blob(200, 336, 46, 41, 18, 0.15, 0.55) }],
};

/**
 * Monta o buraco do jogo (`mirror` = espelhado na horizontal). É o que vai para as telas: contorno, ilhas, zonas e
 * peças, tudo já em coordenadas do campo. A física guarda o que precisa à parte (physOf).
 */
export function buildCourse(spec, mirror = false) {
  const W = FG.W;
  const mx = (x) => round1(mirror ? W - x : x);
  const ma = (a) => (mirror ? -a : a);
  const mp = (poly) => poly.map(([x, y]) => [mx(x), round1(y)]);
  const boundary = mp(corridor(spec.path));
  // a altura vem do contorno de verdade: as pontas arredondadas passam da linha central (antes a grade das paredes
  // parava em spec.H e a bola escapava pela ponta de baixo — achado pelo futgolf-balance.js)
  const H = Math.ceil(Math.max(...boundary.map(([, y]) => y))) + 12;
  return {
    id: spec.id, name: spec.name, par: spec.par, W, H, mirror: !!mirror,
    tee: { x: mx(spec.tee[0]), y: spec.tee[1] }, cup: { x: mx(spec.cup[0]), y: spec.cup[1] }, tb: { x: mx(spec.tb[0]), y: spec.tb[1] },
    ball: FG.ball, cupR: FG.cup,
    boundary,
    islands: (spec.islands ?? []).map(mp),
    zones: (spec.zones ?? []).map((z) => ({ t: z.t, poly: mp(z.poly) })),
    placas: (spec.placas ?? []).map(([x1, y1, x2, y2]) => ({ x1: mx(x1), y1, x2: mx(x2), y2 })),
    molas: (spec.molas ?? []).map(([x, y, r]) => ({ x: mx(x), y, r })),
    postes: (spec.postes ?? []).map(([x, y, r, kind]) => ({ x: mx(x), y, r, kind: kind ?? 'cone' })),
    boosts: (spec.boosts ?? []).map(([x, y, ang, len]) => ({ x: mx(x), y, ang: ma(ang), len, wid: 34 })),
    rampas: (spec.rampas ?? []).map(([x, y, ang, len]) => ({ x: mx(x), y, ang: ma(ang), len: len ?? 46, wid: 40 })),
    tuneis: (spec.tuneis ?? []).map(([ax, ay, bx, by, out, alt]) => ({
      a: { x: mx(ax), y: ay }, b: { x: mx(bx), y: by }, out: ma(out),
      ...(alt ? { alt: { b: { x: mx(alt[0]), y: alt[1] }, out: ma(alt[2]) } } : {}), // 2ª saída (a do azar)
    })),
  };
}

const built = new Map();
/** O buraco montado (o mesmo objeto para o mesmo id/espelho: a física e o mapa dos bots ficam guardados nele). */
export function courseOf(id, mirror = false) {
  const key = `${id}:${mirror ? 1 : 0}`;
  if (!built.has(key)) built.set(key, buildCourse(id === TIEBREAK_HOLE.id ? TIEBREAK_HOLE : HOLES.find((h) => h.id === id) ?? HOLES[0], mirror));
  return built.get(key);
}

// ─── física ─────────────────────────────────────────────────────────────────

const PLACA = 4; // meia espessura das placas soltas
const CELL = 48;
const phys = new WeakMap();

/** O que a física precisa do buraco (segmentos de parede numa grade, para não testar todos a cada passo). */
function physOf(course) {
  let p = phys.get(course);
  if (p) return p;
  const segs = [];
  const loop = (poly, extra = 0) => poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length]; segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], extra }); });
  loop(course.boundary);
  course.islands.forEach((isl) => loop(isl));
  for (const w of course.placas) segs.push({ ax: w.x1, ay: w.y1, bx: w.x2, by: w.y2, extra: PLACA });
  const cols = Math.ceil((course.W + 2 * CELL) / CELL) + 2, rows = Math.ceil((course.H + 2 * CELL) / CELL) + 2; // folga de 1 célula em volta
  const grid = Array.from({ length: cols * rows }, () => []);
  const pad = FG.ball + PLACA + 2;
  segs.forEach((s, idx) => {
    const x0 = Math.floor((Math.min(s.ax, s.bx) - pad) / CELL) + 1, x1 = Math.floor((Math.max(s.ax, s.bx) + pad) / CELL) + 1;
    const y0 = Math.floor((Math.min(s.ay, s.by) - pad) / CELL) + 1, y1 = Math.floor((Math.max(s.ay, s.by) + pad) / CELL) + 1;
    for (let cx = Math.max(0, x0); cx <= Math.min(cols - 1, x1); cx++) for (let cy = Math.max(0, y0); cy <= Math.min(rows - 1, y1); cy++) grid[cy * cols + cx].push(idx);
  });
  const bbox = (poly) => poly.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const order = { seco: 0, agua: 1, areia: 2, mato: 3 };
  const zones = course.zones.map((z) => ({ ...z, box: bbox(z.poly) })).sort((a, b) => order[a.t] - order[b.t]);
  p = { segs, grid, cols, rows, zones };
  phys.set(course, p);
  return p;
}

/** O chão onde está o ponto: grama, mato, areia ou água (o `seco` ganha de tudo: ilha e ponte). */
export function surfaceAt(course, x, y) {
  for (const z of physOf(course).zones) {
    if (x < z.box[0] || x > z.box[2] || y < z.box[1] || y > z.box[3]) continue;
    if (pointInPoly(x, y, z.poly)) return z.t === 'seco' ? 'grama' : z.t;
  }
  return 'grama';
}

/** O ponto está no campo (dentro do contorno e fora das ilhas)? */
export function inPlay(course, x, y) {
  return pointInPoly(x, y, course.boundary) && !course.islands.some((isl) => pointInPoly(x, y, isl));
}

const r1 = (v) => Math.round(v * 2) / 2;

/**
 * Um chute: a bola sai de `from` na direção (dx, dy) com força 0..1 e efeito −1..1 (+1 curva para a direita de quem
 * chuta), com o vento `wind` ({ang, str}) da rodada. Simula até parar, embocar ou cair na água. Devolve os quadros
 * ([x, y] a cada 1/30 s; [x, y, z] com a bola no ar, z = altura para a tela), os eventos (com o quadro `f` em que
 * acontecem: `mola`, `seta`, `tunel`, `rampa`, `pouso`, `agua`, `buraco`, `beirada`, `bate`), onde a bola ficou (`end` — na água
 * ela volta para `from`) e se embocou. `luck` = sorteio dos bueiros de duas saídas (função que devolve 0..1 a cada
 * passagem; sem ela, sempre a saída boa); o `tunel` desses bueiros traz `azar` (true = saiu na ruim).
 */
export function simulateKick(course, from, dx, dy, power, spin = 0, wind = null, luck = null) {
  const P = FG_PHYS, C = physOf(course), R = FG.ball;
  const len = Math.hypot(dx, dy) || 1;
  const speed0 = P.vMin + Math.max(0, Math.min(1, power)) * (P.vMax - P.vMin);
  let x = from.x, y = from.y, vx = (dx / len) * speed0, vy = (dy / len) * speed0;
  let sp = Math.max(-1, Math.min(1, spin || 0));
  const [wux, wuy] = wind && wind.str > 0 ? dirOf(wind.ang) : [0, 0];
  const wStr = wind && wind.str > 0 ? Math.min(P.wind.max, wind.str) : 0;
  const frames = [[r1(x), r1(y)]], events = [];
  const onPad = new Set(), onRamp = new Set();
  let air = 0, airT = 0; // no ar: quanto falta e quanto dura este salto
  const frame = () => {
    if (air <= 0) return [r1(x), r1(y)];
    const t = 1 - air / airT, h = Math.min(P.ramp.height, airT * P.ramp.height);
    return [r1(x), r1(y), Math.round(4 * h * t * (1 - t) * 2) / 2];
  };
  let tunnelCool = 0, holed = false, water = false, lastBate = -1;
  let cupMin = Infinity; // passando por cima do buraco: o mais perto do centro que chegou (Infinity = fora dele)
  const stamp = new Int32Array(C.segs.length);
  let stampN = 0;
  const steps = Math.round(P.maxSec / P.dt);
  let i = 1;
  for (; i <= steps; i++) {
    const v = Math.hypot(vx, vy);
    // efeito: acelera de lado (perpendicular ao movimento) e vai sumindo
    if (sp !== 0 && v > 1) {
      const a = P.spin.acc * sp * Math.min(1, v / 400), nx = -vy / v, ny = vx / v;
      vx += nx * a * P.dt; vy += ny * a * P.dt;
      sp *= Math.exp(-P.dt / P.spin.tau);
      if (Math.abs(sp) < 0.01) sp = 0;
    }
    // vento: só com a bola rolando, e mais com ela rápida (devagar, o atrito ganha e ela para)
    if (wStr && (v > P.stop || air > 0)) {
      const a = P.wind.acc * wStr * Math.min(1, v / P.wind.vRef) * (air > 0 ? P.wind.airMult : 1);
      vx += wux * a * P.dt; vy += wuy * a * P.dt;
    }
    // rampas: subiu rápido e no sentido dela = decola (uma vez por passagem: tem de sair da rampa para decolar de novo)
    if (air <= 0 && course.rampas.length) course.rampas.forEach((rp, k) => {
      const [ux, uy] = dirOf(rp.ang);
      const rx = x - rp.x, ry = y - rp.y;
      const along = rx * ux + ry * uy, across = rx * -uy + ry * ux;
      if (Math.abs(along) > rp.len / 2 || Math.abs(across) > rp.wid / 2) { onRamp.delete(k); return; }
      const vv = Math.hypot(vx, vy);
      if (onRamp.has(k) || air > 0 || along < -rp.len * 0.2 || vv < P.ramp.minV || (vx * ux + vy * uy) < 0.6 * vv) return;
      onRamp.add(k);
      airT = Math.min(P.ramp.maxT, vv * P.ramp.k); air = airT;
      events.push({ t: 'rampa', i: k, f: frames.length });
    });
    // setas: empurram na direção delas enquanto a bola está em cima (no ar, passa por cima)
    if (air <= 0) course.boosts.forEach((b, k) => {
      const [ux, uy] = dirOf(b.ang);
      const rx = x - b.x, ry = y - b.y;
      const along = rx * ux + ry * uy, across = rx * -uy + ry * ux;
      if (Math.abs(along) <= b.len / 2 && Math.abs(across) <= b.wid / 2) {
        vx += ux * P.boost.acc * P.dt; vy += uy * P.boost.acc * P.dt;
        if (!onPad.has(k)) { onPad.add(k); events.push({ t: 'seta', i: k, f: frames.length }); }
      } else onPad.delete(k);
    });
    x += vx * P.dt; y += vy * P.dt;

    // placas (contorno, ilhas e placas soltas)
    const gx = Math.floor(x / CELL) + 1, gy = Math.floor(y / CELL) + 1;
    stampN++;
    if (gx >= 0 && gy >= 0 && gx < C.cols && gy < C.rows) {
      for (const idx of C.grid[gy * C.cols + gx]) {
        if (stamp[idx] === stampN) continue;
        stamp[idx] = stampN;
        const s = C.segs[idx];
        const ex = s.bx - s.ax, ey = s.by - s.ay, l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / l2));
        const qx = s.ax + ex * t, qy = s.ay + ey * t;
        const ddx = x - qx, ddy = y - qy, d = Math.hypot(ddx, ddy), rr = R + s.extra;
        if (d >= rr) continue;
        const nx = d > 1e-6 ? ddx / d : -ey / Math.sqrt(l2), ny = d > 1e-6 ? ddy / d : ex / Math.sqrt(l2);
        x = qx + nx * rr; y = qy + ny * rr;
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          const tx = vx - vn * nx, ty = vy - vn * ny;
          vx = tx * P.wallTan - vn * P.eWall * nx; vy = ty * P.wallTan - vn * P.eWall * ny;
          if (-vn > 160 && frames.length - lastBate > 3) { lastBate = frames.length; events.push({ t: 'bate', f: frames.length }); }
        }
      }
    }
    // postes e molas (redondos) — no ar, a bola passa por cima
    if (air <= 0) for (const [list, kind] of [[course.postes, 'poste'], [course.molas, 'mola']]) {
      for (let k = 0; k < list.length; k++) {
        const o = list[k];
        const ddx = x - o.x, ddy = y - o.y, d = Math.hypot(ddx, ddy), rr = R + o.r;
        if (d >= rr || d < 1e-6) continue;
        const nx = ddx / d, ny = ddy / d;
        x = o.x + nx * rr; y = o.y + ny * rr;
        const vn = vx * nx + vy * ny;
        if (vn >= 0) continue;
        if (kind === 'mola') {
          vx += -(1 + P.mola.e) * vn * nx + nx * P.mola.kick; vy += -(1 + P.mola.e) * vn * ny + ny * P.mola.kick;
          events.push({ t: 'mola', i: k, f: frames.length });
        } else { vx += -(1 + P.ePost) * vn * nx; vy += -(1 + P.ePost) * vn * ny; }
      }
    }
    // bueiros: cai num, sai no outro
    if (tunnelCool > 0) tunnelCool -= P.dt;
    else if (air <= 0) {
      for (let k = 0; k < course.tuneis.length; k++) {
        const tn = course.tuneis[k];
        if (Math.hypot(x - tn.a.x, y - tn.a.y) >= P.tunnelR) continue;
        const azar = tn.alt ? (luck ? luck() : 0) >= P.tunnelLuck : false;
        const sai = azar ? tn.alt : tn;
        const [ux, uy] = dirOf(sai.out);
        const out = Math.max(P.tunnelMin, Math.hypot(vx, vy) * P.tunnelKeep);
        frames.push([r1(tn.a.x), r1(tn.a.y)]);
        x = sai.b.x + ux * (P.tunnelR + R + 3); y = sai.b.y + uy * (P.tunnelR + R + 3);
        vx = ux * out; vy = uy * out;
        events.push({ t: 'tunel', i: k, f: frames.length, ...(tn.alt ? { azar } : {}) }); // o quadro seguinte já é na saída: não interpolar
        frames.push([r1(x), r1(y)]);
        tunnelCool = 0.35;
        break;
      }
    }
    // no ar: só o arrasto do ar; ao pousar, perde um pouco e volta a rolar (e aí vale o chão de onde caiu)
    if (air > 0) {
      air -= P.dt;
      const va = Math.hypot(vx, vy), na = Math.max(0, va - P.ramp.airDamp * va * P.dt);
      if (va > 0) { vx *= na / va; vy *= na / va; }
      if (air <= 0) { air = 0; vx *= P.ramp.land; vy *= P.ramp.land; events.push({ t: 'pouso', f: frames.length }); }
      if (i % P.frameEvery === 0) frames.push(frame());
      continue;
    }
    // chão
    const chao = surfaceAt(course, x, y);
    if (chao === 'agua') {
      water = true;
      frames.push([r1(x), r1(y)]);
      events.push({ t: 'agua', f: frames.length - 1 });
      break;
    }
    // buraco: passou devagar por cima = embocou (quanto mais fora do centro, mais devagar precisa); rápida demais,
    // passa — e se passou pela borda, tira tinta; bem na beirada e devagar, o buraco puxa
    let v2 = Math.hypot(vx, vy);
    const dcx = course.cup.x - x, dcy = course.cup.y - y, dc = Math.hypot(dcx, dcy);
    if (dc < FG.cup - 2 && v2 < P.cupV * Math.pow(1 - (dc / FG.cup) ** 2, 0.25)) {
      holed = true; x = course.cup.x; y = course.cup.y;
      frames.push([r1(x), r1(y)]);
      events.push({ t: 'buraco', f: frames.length - 1 });
      break;
    }
    if (dc < FG.cup) cupMin = Math.min(cupMin, dc);
    else if (cupMin < Infinity) { // saiu de cima do buraco sem cair
      if (cupMin > FG.cup * 0.35 && v2 > 0) {
        const ox = -dcx, oy = -dcy, side = vx * oy - vy * ox >= 0 ? 1 : -1; // para o lado em que passou do centro
        const t = Math.tan(P.lipTurn * (cupMin / FG.cup)), px = (-vy / v2) * side, py = (vx / v2) * side;
        const nx = vx / v2 + px * t, ny = vy / v2 + py * t, nn = Math.hypot(nx, ny), keep = v2 * P.lipKeep;
        vx = (nx / nn) * keep; vy = (ny / nn) * keep; v2 = keep;
        events.push({ t: 'beirada', f: frames.length });
      }
      cupMin = Infinity;
    }
    if (dc < FG.cup + 4 && dc > 0.5 && v2 < P.cupV * P.pullV) { vx += (dcx / dc) * P.cupPull * P.dt; vy += (dcy / dc) * P.cupPull * P.dt; }
    // atrito
    v2 = Math.hypot(vx, vy);
    if (v2 > P.vCap) { vx *= P.vCap / v2; vy *= P.vCap / v2; v2 = P.vCap; }
    const k = chao === 'grama' ? 1 : P.surf[chao];
    const nv = Math.max(0, v2 - (P.roll + P.damp * v2) * k * P.dt);
    let end = i === steps;
    if (nv < P.stop) { vx = 0; vy = 0; end = true; } else { vx *= nv / v2; vy *= nv / v2; }
    if (i % P.frameEvery === 0 || end) frames.push(frame());
    if (end) break;
  }
  const end = water ? { x: from.x, y: from.y } : { x: r1(x), y: r1(y) };
  return { frames, events, end, holed, water };
}

// ─── mapa de distância (para os bots) ───────────────────────────────────────

const FIELD_CELL = 10;
const fields = new WeakMap();

/**
 * Distância "andando pelo campo" de cada ponto até o buraco (Dijkstra numa grade de 10 unidades, contornando
 * placas, ilhas e água; os bueiros viram atalhos). É o que o bot usa para saber se uma bola parou perto de
 * verdade — em linha reta, atrás de uma ilha, ela parece perto e não está.
 */
export function distanceField(course) {
  let f = fields.get(course);
  if (f) return f;
  const cols = Math.ceil(course.W / FIELD_CELL), rows = Math.ceil(course.H / FIELD_CELL);
  const n = cols * rows;
  const open = new Uint8Array(n), dist = new Float64Array(n).fill(Infinity); // Float64: com Float32 o arredondamento fazia o nó parecer "velho" na fila e a busca parava
  const C = physOf(course);
  const nearWall = (x, y) => C.segs.some((s) => {
    const ex = s.bx - s.ax, ey = s.by - s.ay, l2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / l2));
    return Math.hypot(x - (s.ax + ex * t), y - (s.ay + ey * t)) < FG.ball + s.extra - 1;
  });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * FIELD_CELL, y = (r + 0.5) * FIELD_CELL;
    open[r * cols + c] = inPlay(course, x, y) && surfaceAt(course, x, y) !== 'agua' && !nearWall(x, y) ? 1 : 0;
  }
  const cellOf = (x, y) => Math.max(0, Math.min(rows - 1, Math.floor(y / FIELD_CELL))) * cols + Math.max(0, Math.min(cols - 1, Math.floor(x / FIELD_CELL)));
  // Dijkstra simples com fila de prioridade em vetor (a grade é pequena)
  const heap = [];
  const push = (i, d) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const start = cellOf(course.cup.x, course.cup.y);
  dist[start] = 0; push(start, 0);
  // bueiros ao contrário: chegar na SAÍDA vale o mesmo que chegar na entrada (o de duas saídas não é atalho garantido:
  // fica de fora — o bot pesa as duas saídas quando simula o chute, em futgolfAiKick)
  const tunnelFrom = new Map();
  for (const t of course.tuneis.filter((tn) => !tn.alt)) {
    const [ux, uy] = dirOf(t.out);
    const exit = cellOf(t.b.x + ux * 30, t.b.y + uy * 30), entry = cellOf(t.a.x, t.a.y);
    if (!tunnelFrom.has(exit)) tunnelFrom.set(exit, []);
    tunnelFrom.get(exit).push(entry);
  }
  const cost = (i) => { const x = (i % cols + 0.5) * FIELD_CELL, y = (Math.floor(i / cols) + 0.5) * FIELD_CELL; const s = surfaceAt(course, x, y); return s === 'areia' ? 3 : s === 'mato' ? 1.8 : 1; };
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const r = Math.floor(i / cols), c = i % cols;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc;
      if (!open[j]) continue;
      const nd = d + FIELD_CELL * (dr && dc ? 1.414 : 1) * cost(j);
      if (nd < dist[j]) { dist[j] = nd; push(j, nd); }
    }
    for (const j of tunnelFrom.get(i) ?? []) { const nd = d + 20; if (nd < dist[j]) { dist[j] = nd; push(j, nd); } }
  }
  f = { cols, rows, dist, at: (x, y) => { const v = dist[cellOf(x, y)]; return Number.isFinite(v) ? v : 5000; } };
  fields.set(course, f);
  return f;
}
