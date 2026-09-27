/**
 * Confere a tábua ABERTA da demonstração da tela de entrada (`src/routes/demo.js`, TABUA_ABERTA).
 *
 * O dono pediu (27/09/2026) "um mapa mais aberto e que o usuário consiga até fazer gol de primeira se acertar bem":
 * quem chega pelo anúncio tem poucos segundos de paciência, e tábua fechada só frustra. Este script varre mira e
 * força a partir do centro e responde as três perguntas que importam:
 *   1. o tiro RETO no gol entra? (se não, a pessoa mira no gol, bate num prego e não entende)
 *   2. que fatia das combinações dá gol de primeira?
 *   3. existe uma faixa de mira contígua larga o bastante para alguém acertar sem sorte?
 *
 * Uso (pasta api/, sem banco):  node scripts/demo-tabua-balance.js
 * Números de 27/09/2026 com a tábua escolhida: tiro reto ENTRA, 10,6% e faixa de 15°.
 */
import { makeBoard, simulateFlick } from '../src/lib/futprego.js';

const TABUA_ABERTA = [[118, 190], [96, 86], [204, 86], [46, 160], [254, 160]];
const board = makeBoard(TABUA_ABERTA, 'aberta', 'Aberta');
const centro = { x: board.W / 2, y: board.H / 2 };

let gols = 0, total = 0;
const angsOk = new Set();
for (let a = -80; a <= 80; a += 1) {
  for (let p = 0.30; p <= 1.0; p += 0.02) {
    const rad = (a * Math.PI) / 180;
    if (simulateFlick(centro, Math.sin(rad), -Math.cos(rad), p, board).goal === 'top') { gols++; angsOk.add(a); }
    total++;
  }
}
const reto = [0.6, 0.75, 0.9, 1.0].filter((p) => simulateFlick(centro, 0, -1, p, board).goal === 'top');
const angs = [...angsOk].sort((x, y) => x - y);
const faixas = [];
let ini = null, ant = null;
for (const a of angs) { if (ini === null) ini = a; else if (a !== ant + 1) { faixas.push([ini, ant]); ini = a; } ant = a; }
if (ini !== null) faixas.push([ini, ant]);
const maior = faixas.reduce((m, f) => Math.max(m, f[1] - f[0] + 1), 0);

console.log(`gol de primeira: ${gols} de ${total} = ${(100 * gols / total).toFixed(1)}%`);
console.log(`tiro reto no gol: ${reto.length ? `ENTRA (força ${reto.join(', ')})` : 'BATE NUM PREGO'}`);
console.log(`maior faixa de mira contígua: ${maior}°`);
console.log(`faixas: ${faixas.map(([i, f]) => `${i}°..${f}°`).join(' | ')}`);

const ok = reto.length > 0 && gols / total >= 0.05 && maior >= 8;
console.log(ok ? '\nTUDO OK — dá para fazer gol de primeira acertando bem.' : '\nFALHOU — a tábua ficou fechada demais para a tela de entrada.');
process.exit(ok ? 0 : 1);
