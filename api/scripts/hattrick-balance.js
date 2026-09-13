// Calibragem do Hat Trick (lib/hattrick.js): 3 perfis de jogador x 20 mil chutes cada. Mostra % de gol e o
// resultado de cada tipo, e quantos gols por dia sai em média com 3 vidas (E = 3p/(1-p)).
// Uso (pasta api/): node scripts/hattrick-balance.js [chutes]. Calibrado em 13/09/2026: bom ~34%, médio ~15%, iniciante ~7%.

const L = await import('../src/lib/hattrick.js');
let seed = 12345;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const PROFILES = {
  bom: { target: 2.8, windComp: 0.6, power: [0.85, 0.1], aimDeg: 1.6, strike: 0.2, lowBias: -0.05 },
  medio: { target: 2.2, windComp: 0.25, power: [0.7, 0.18], aimDeg: 3, strike: 0.35, lowBias: 0 },
  iniciante: { target: 1.2, windComp: 0, power: [0.55, 0.25], aimDeg: 5, strike: 0.55, lowBias: 0.05 },
};
const N = Number(process.argv[2] || 20000);
for (const [name, P] of Object.entries(PROFILES)) {
  const count = {};
  for (let i = 0; i < N; i++) {
    const shot = L.newShot(rnd);
    const side = rnd() < 0.5 ? -1 : 1;
    const power = Math.min(1, Math.max(0.15, P.power[0] + gauss() * P.power[1]));
    const speed = L.HATTRICK.vMin + power * (L.HATTRICK.vMax - L.HATTRICK.vMin);
    const T = shot.ball.y / speed;
    const [wx] = L.windVector(shot.wind);
    const drift = 0.5 * L.HATTRICK.windK * wx * T * T * P.windComp * (1 + gauss() * 0.4);
    const tx = side * P.target - drift;
    const ang = Math.atan2(tx - shot.ball.x, shot.ball.y) + (gauss() * P.aimDeg * Math.PI) / 180;
    let sx = gauss() * P.strike, sy = gauss() * P.strike + P.lowBias;
    const strike = sx * sx + sy * sy <= 1 ? { sx, sy } : null;
    const r = L.simulate(shot, { dirX: Math.sin(ang), dirY: -Math.cos(ang), power, strike });
    count[r.result] = (count[r.result] || 0) + 1;
  }
  const p = (count.goal || 0) / N;
  const parts = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / N).toFixed(1)}%`).join(' · ');
  console.log(`${name.padEnd(9)} gol ${(100 * p).toFixed(1)}%  → ${(3 * p / (1 - p)).toFixed(2)} gols/dia em média   [${parts}]`);
}
