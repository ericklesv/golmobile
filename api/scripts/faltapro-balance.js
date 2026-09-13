// Calibragem do Falta PRO (lib/faltapro.js): 3 perfis de jogador x 20 mil cobranças cada.
// Mostra % de gol por cobrança, o resultado de cada tipo, % de alvo bônus e a chance de VENCER
// o dia (3+ gols em 5 cobranças, binomial). Uso (pasta api/): node scripts/faltapro-balance.js [n].
// Calibrado em 13/09/2026: bom ~36% (vence 26% dos dias), médio ~21%, iniciante ~13%.

const L = await import('../src/lib/faltapro.js');
const C = L.FALTAPRO;
let seed = 424242;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// θ (rad) para chegar na altura yt a d metros com velocidade v (parábola sem arrasto; raiz baixa)
function elevFor(v, d, yt) {
  const g = C.g, disc = v ** 4 - g * (g * d * d + 2 * yt * v * v);
  if (disc < 0) return 0.35;
  return Math.atan((v * v - Math.sqrt(disc)) / (g * d));
}

// Perfil = como o jogador "arrasta": alvo no canto, compensação da curva, e os erros dele.
const PROFILES = {
  bom: { corner: 2.85, yAim: 1.5, spin: 0.4, comp: 0.85, aimDeg: 2.2, yErr: 0.3, powerN: 0.07, spinN: 0.12, overWall: 0.3 },
  medio: { corner: 2.4, yAim: 1.4, spin: 0.3, comp: 0.5, aimDeg: 4.5, yErr: 0.55, powerN: 0.13, spinN: 0.25, overWall: 0.35 },
  iniciante: { corner: 1.6, yAim: 1.2, spin: 0.15, comp: 0, aimDeg: 8, yErr: 0.9, powerN: 0.2, spinN: 0.45, overWall: 0.5 },
};
const N = Number(process.argv[2] || 20000);
const binom35 = (p) => { // P(3+ gols em 5)
  const q = 1 - p; const c = (n, k) => [1, 5, 10, 10, 5, 1][k];
  return [3, 4, 5].reduce((s, k) => s + c(5, k) * p ** k * q ** (5 - k), 0);
};

for (const [name, P] of Object.entries(PROFILES)) {
  const count = {}; let targets = 0;
  for (let i = 0; i < N; i++) {
    const kick = L.newKick(rnd);
    const b = kick.ball, side = b.x !== 0 ? Math.sign(b.x) : 1, dist = Math.hypot(b.x, b.z);
    const over = rnd() < P.overWall; // por cima da barreira (canto perto) ou de curva (canto longe)
    const tx = over ? side * P.corner : -side * P.corner;
    const power = Math.min(1, Math.max(0.3, 0.72 + gauss() * P.powerN));
    const v = C.vMin + power * (C.vMax - C.vMin);
    const yAim = Math.max(0.4, P.yAim + (over ? 0.6 : 0) + gauss() * P.yErr);
    const theta = Math.min(C.elevMax, elevFor(v, dist, yAim) + gauss() * 0.03);
    const spin = Math.max(-1, Math.min(1, (over ? 0 : -side * P.spin) + gauss() * P.spinN));
    // compensa a curva: desloca a mira contra o efeito (quanto o perfil sabe compensar)
    const T = dist / (v * Math.cos(theta));
    const drift = 0.5 * C.spinAcc * spin * T * T * P.comp;
    const aimX = tx - drift;
    // φ = ângulo entre bola→meio do gol e bola→ponto de mira (positivo = direita)
    const a0 = Math.atan2(-b.x, b.z), a1 = Math.atan2(aimX - b.x, b.z);
    const phi = a1 - a0 + (gauss() * P.aimDeg * Math.PI) / 180;
    const r = L.simulateKick(kick, { dirX: phi / C.sideMax, dirY: theta / C.elevMax, power, spin });
    count[r.result] = (count[r.result] || 0) + 1;
    if (r.target !== null && r.target !== undefined && r.target >= 0) targets++;
  }
  const p = (count.goal || 0) / N;
  const parts = Object.entries(count).sort((a, b2) => b2[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / N).toFixed(1)}%`).join(' · ');
  console.log(`${name.padEnd(9)} gol ${(100 * p).toFixed(1)}%  vence o dia (3+/5) ${(100 * binom35(p)).toFixed(1)}%  alvo ${(100 * targets / N).toFixed(1)}%   [${parts}]`);
}
