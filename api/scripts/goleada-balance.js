/**
 * Calibra a Goleada (lib/goleada.js) sem banco: jogadores simulados chutando, para ver até onde cada um
 * chega. O simulado lê o lado em que o goleiro se jogou, mira no canto oposto com um erro de pontaria e
 * chuta com a força do perfil. Uso (na pasta api/):  node scripts/goleada-balance.js
 */
import { GOLEADA as C, shoot, keeperOf } from '../src/lib/goleada.js';

const PERFIS = [
  { nome: 'craque', erro: 0.025, forca: 0.95, lêOLance: 1 },
  { nome: 'bom', erro: 0.045, forca: 0.85, lêOLance: 0.9 },
  { nome: 'mediano', erro: 0.075, forca: 0.7, lêOLance: 0.6 },
  { nome: 'iniciante', erro: 0.12, forca: 0.5, lêOLance: 0.3 },
];

function serie(p, seed) {
  for (let i = 1; i <= 200; i++) {
    const k = keeperOf(seed, i);
    // mira no canto oposto ao lado em que o goleiro se jogou (quem lê melhor acerta mais o lado)
    const leu = Math.random() < p.lêOLance;
    const lado = k.lean !== 0 && leu ? -k.lean : Math.random() < 0.5 ? -1 : 1;
    // o jogador de verdade aprende a mirar NO MEIO do espaço que sobra: nem na trave, nem na mão do goleiro
    const forca = p.forca;
    const T = C.shot.slow + (C.shot.fast - C.shot.slow) * forca;
    const anda = k.speed * Math.max(0, T - k.react) / 1000;
    const partida = 0.5 + k.lean * C.keeper.leanHelp * 0.5;
    const borda = lado < 0 ? partida - anda - C.keeper.reach : partida + anda + C.keeper.reach;
    const trave = lado < 0 ? C.aim.margin : 1 - C.aim.margin;
    const alvo = Math.max(0, Math.min(1, (borda + trave) / 2)); // meio do vão
    const x = alvo + (Math.random() * 2 - 1) * p.erro;
    const y = 0.15 + Math.random() * 0.5;
    const r = shoot(seed, i, { x, y, power: p.forca + (Math.random() * 2 - 1) * 0.08 });
    if (!r.goal) return { gols: i - 1, motivo: r.why };
  }
  return { gols: 200, motivo: 'infinito' };
}

const N = 4000;
console.log(`Goleada: ${N} séries por perfil (alvo do dia: ${C.goalTarget} gols seguidos)\n`);
console.log('perfil      | média | mediana | % que faz o gol do dia | melhor | parou por');
for (const p of PERFIS) {
  const rs = Array.from({ length: N }, (_, k) => serie(p, `bal:${p.nome}:${k}`));
  const gols = rs.map((r) => r.gols).sort((a, b) => a - b);
  const media = gols.reduce((s, x) => s + x, 0) / N;
  const bate = (gols.filter((x) => x >= C.goalTarget).length / N) * 100;
  const fora = (rs.filter((r) => r.motivo === 'fora').length / N) * 100;
  console.log(`${p.nome.padEnd(11)} | ${media.toFixed(1).padStart(5)} | ${String(gols[Math.floor(N / 2)]).padStart(7)} | ${(bate.toFixed(0) + '%').padStart(22)} | ${String(gols.at(-1)).padStart(6)} | ${fora.toFixed(0)}% na trave/fora`);
}
console.log('\ncomo o goleiro cresce:');
for (const i of [1, 5, 10, 15, 20, 30]) {
  const k = keeperOf('amostra', i);
  console.log(`  bola ${String(i).padStart(2)}: reage em ${k.react} ms, corre ${k.speed.toFixed(2)} gol/s${k.lean ? `, jogou-se para a ${k.lean < 0 ? 'esquerda' : 'direita'}` : ''}`);
}
