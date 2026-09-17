/**
 * Calibra o Paredão (lib/paredao.js) sem banco nenhum: simula jogadores de verdade defendendo e mostra
 * até onde cada um chega. Não decide nada — serve para escolher os números do PAREDAO.
 *
 * O jogador simulado: vê a bola sair, demora `reacao` ms para reagir, mira onde ela vai cruzar (com um
 * erro de leitura, maior quando a bola tem curva) e corre até lá no máximo da velocidade do goleiro.
 *
 * Uso (na pasta api/):  node scripts/paredao-balance.js
 */
import { PAREDAO, shot, reachAt } from '../src/lib/paredao.js';

const PERFIS = [
  { nome: 'craque', reacao: 190, erro: 0.03, velocidade: 1.00 },
  { nome: 'bom', reacao: 260, erro: 0.05, velocidade: 0.95 },
  { nome: 'mediano', reacao: 340, erro: 0.08, velocidade: 0.88 },
  { nome: 'iniciante', reacao: 450, erro: 0.12, velocidade: 0.80 },
];

/** Uma partida: devolve quantas defesas seguidas o perfil fez. */
function partida(perfil, seed) {
  let kx = PAREDAO.keeper.start;
  for (let i = 1; i <= 200; i++) {
    const s = shot(seed, i);
    // onde ele ACHA que a bola vai cruzar (a curva engana)
    const erro = (Math.random() * 2 - 1) * (perfil.erro + Math.abs(s.curve) * 1.6);
    const alvo = Math.max(0, Math.min(1, s.to.x + erro));
    // tempo útil para correr = voo − reação
    const util = Math.max(0, s.T - perfil.reacao) / 1000;
    const anda = PAREDAO.keeper.speed * perfil.velocidade * util;
    kx += Math.max(-anda, Math.min(anda, alvo - kx));
    if (Math.abs(kx - s.to.x) > reachAt(s.to.y)) return i - 1;
  }
  return 200;
}

const N = 4000;
console.log(`Paredão: ${N} partidas por perfil (alvo do dia: ${PAREDAO.goalTarget} defesas seguidas)\n`);
console.log('perfil      | média | mediana |  1 em 4 passa de | % que faz o gol do dia | melhor');
for (const p of PERFIS) {
  const runs = Array.from({ length: N }, (_, k) => partida(p, `bal:${p.nome}:${k}`)).sort((a, b) => a - b);
  const media = runs.reduce((s, x) => s + x, 0) / N;
  const mediana = runs[Math.floor(N / 2)];
  const q3 = runs[Math.floor(N * 0.75)];
  const bate = (runs.filter((x) => x >= PAREDAO.goalTarget).length / N) * 100;
  console.log(`${p.nome.padEnd(11)} | ${media.toFixed(1).padStart(5)} | ${String(mediana).padStart(7)} | ${String(q3).padStart(16)} | ${(bate.toFixed(0) + '%').padStart(22)} | ${runs.at(-1)}`);
}
console.log('\nbolas (tempo de voo e abertura do alvo):');
for (const i of [1, 5, 10, 15, 20, 25, 30, 40]) {
  const s = shot('amostra', i);
  console.log(`  bola ${String(i).padStart(2)}: ${s.T} ms${s.curve ? `, curva ${(s.curve * 100).toFixed(0)}%` : ''}`);
}
