/**
 * Calibra a Goleada (lib/goleada.js) sem banco: jogadores simulados tocando na tela para chutar, com o
 * goleiro em ronda de uma trave à outra. Serve para escolher os números do GOLEADA — não decide nada.
 *
 * O simulado: espera o goleiro estar longe do canto que ele quer, toca (com um erro de pontaria e um erro
 * de tempo) e repete. Quanto pior o perfil, mais ele erra a hora e o canto.
 *
 * Uso (na pasta api/):  node scripts/goleada-balance.js
 */
import { GOLEADA as C, shoot, keeperAt, flightAt, reactAt, diveAt, periodAt } from '../src/lib/goleada.js';

const PERFIS = [
  { nome: 'craque', erroX: 0.025, erroT: 60, paciencia: 1.0 },
  { nome: 'bom', erroX: 0.045, erroT: 110, paciencia: 0.85 },
  { nome: 'mediano', erroX: 0.075, erroT: 180, paciencia: 0.6 },
  { nome: 'iniciante', erroX: 0.12, erroT: 280, paciencia: 0.35 },
];

/** Uma série: devolve quantos gols seguidos o perfil fez e por que parou. */
function serie(p, seed) {
  let t = 300; // ele leva um tempinho para o primeiro toque
  for (let i = 1; i <= 200; i++) {
    // procura um instante em que o goleiro esteja do lado oposto ao canto que ele quer
    let melhor = t, nota = -1, lado = 1;
    const janela = Math.min(periodAt(t) * 0.9, 2000) * p.paciencia + 120;
    for (let d = 0; d <= janela; d += 40) {
      const gk = keeperAt(seed, t + d + reactAt(t + d));
      const dist = Math.abs(gk - 0.5);
      const n = dist - d / 6000; // esperar demais também custa (o jogo acelera)
      if (n > nota) { nota = n; melhor = t + d; lado = gk > 0.5 ? -1 : 1; }
    }
    const quando = melhor + (Math.random() * 2 - 1) * p.erroT;
    // mira no meio do vão do lado contrário ao goleiro
    const gk = keeperAt(seed, quando + reactAt(quando));
    const anda = diveAt(quando) * Math.max(0, flightAt(quando) - reactAt(quando)) / 1000;
    const borda = lado < 0 ? gk - anda - C.keeper.reach : gk + anda + C.keeper.reach;
    const trave = lado < 0 ? C.aim.margin : 1 - C.aim.margin;
    const x = (borda + trave) / 2 + (Math.random() * 2 - 1) * p.erroX;
    const y = 0.2 + Math.random() * 0.4;
    const r = shoot(seed, { x, y }, quando);
    if (!r.goal) return { gols: i - 1, motivo: r.why, tempo: quando };
    t = quando + r.T + C.gap;
  }
  return { gols: 200, motivo: 'infinito', tempo: t };
}

const N = 3000;
console.log(`Goleada: ${N} séries por perfil (alvo do dia: ${C.goalTarget} gols seguidos)\n`);
console.log('perfil      | média | mediana | % faz o gol do dia | melhor | durou | parou por');
for (const p of PERFIS) {
  const rs = Array.from({ length: N }, (_, k) => serie(p, `bal:${p.nome}:${k}`));
  const gols = rs.map((r) => r.gols).sort((a, b) => a - b);
  const media = gols.reduce((s, x) => s + x, 0) / N;
  const bate = (gols.filter((x) => x >= C.goalTarget).length / N) * 100;
  const fora = (rs.filter((r) => r.motivo === 'fora').length / N) * 100;
  const dur = rs.map((r) => r.tempo).sort((a, b) => a - b)[Math.floor(N / 2)] / 1000;
  console.log(`${p.nome.padEnd(11)} | ${media.toFixed(1).padStart(5)} | ${String(gols[Math.floor(N / 2)]).padStart(7)} | ${(bate.toFixed(0) + '%').padStart(18)} | ${String(gols.at(-1)).padStart(6)} | ${dur.toFixed(0).padStart(4)}s | ${fora.toFixed(0)}% fora, ${(100 - fora).toFixed(0)}% defesa`);
}
console.log('\ncomo o goleiro aperta com o relógio:');
for (const s of [0, 15, 30, 60, 100, 150]) {
  const t = s * 1000;
  console.log(`  ${String(s).padStart(3)}s: ronda de ${(periodAt(t) / 1000).toFixed(1)}s, reage em ${Math.round(reactAt(t))} ms, mergulha a ${diveAt(t).toFixed(2)} gol/s, bola leva ${flightAt(t)} ms`);
}
