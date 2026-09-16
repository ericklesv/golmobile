/**
 * DEATH MATCH do Futebol de Botão (lib/botaoMatch.js), puro — sem banco e sem servidor.
 * Confere o que o dono pediu em 16/09/2026: acabaram as 9 rodadas empatado, entra o death match com os
 * botões onde estão e os DOIS GOLEIROS fora; 1 peteleco por vez, sempre na força máxima; o botão que jogou
 * sai do campo até sobrar 1x1 (o último nunca sai); perder o tempo também custa um botão (o mais longe da
 * bola); bola parada dentro da área volta para o meio; 5 rodadas de 1x1 sem gol = empate.
 *
 * Uso (na pasta api/):  node scripts/test-deathmatch.js   → tem de terminar em "TUDO OK".
 */
import { BOTAO } from '../src/lib/rules.js';
import { BOTAO_FIELD } from '../src/lib/botao.js';
import { newBotaoMatch, botaoView, applySnap, skipSnap, movablePieces } from '../src/lib/botaoMatch.js';

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const rnd = (() => { let x = 7; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
const vivos = (s) => [s.pieces.filter((p) => p.side === 0).length, s.pieces.filter((p) => p.side === 1).length];
const naArea = (b) => BOTAO_FIELD.boxes.some((x) => b.x >= x.x0 && b.x <= x.x1 && b.y >= x.y0 && b.y <= x.y1);

/** Leva a partida ao fim do tempo normal sem gol: cada um só empurra o próprio botão para trás. */
function ateOFimDoTempo() {
  const s = newBotaoMatch(0);
  let voltas = 0;
  while (s.phase === 'play' && !s.over && voltas < 200) {
    const side = s.turn;
    const idx = movablePieces(s, side).at(-1); // o mais atrás, longe da bola
    const para = side === 0 ? 1 : -1; // empurra na direção do próprio gol
    applySnap(s, side, idx, 0, para, 0.2, rnd);
    voltas++;
  }
  return s;
}

const s = ateOFimDoTempo();
check(s.phase === 'death' && !s.over, `9 rodadas sem gol: entrou no death match (placar ${s.score.join('x')})`);
check(s.pieces.every((p) => !p.gk), 'os dois goleiros saíram na hora (são os primeiros)');
check(vivos(s).join('x') === '6x6', `sobraram 6 botões de cada lado (${vivos(s).join('x')})`);
check(s.snapsLeft === BOTAO.death.snapsPerTurn && BOTAO.death.snapsPerTurn === 1, '1 peteleco por vez no death match');
check(botaoView(s).death?.left.join('x') === '6x6', 'a tela recebe quantos botões cada um ainda tem');

// ── o botão que jogou sai; força máxima mesmo pedindo fraco
let antes = vivos(s).slice();
const side1 = s.turn;
const idx1 = movablePieces(s, side1)[0];
const r1 = applySnap(s, side1, idx1, 0, side1 === 0 ? -1 : 1, 0.05, rnd); // pede força 0,05
const saiu = r1.events.find((e) => e.t === 'out');
check(!!saiu, 'o botão que jogou saiu do campo');
// o 'out' traz onde o botão parou: tem de bater com a posição final do botão jogado (sim.pieces[idx1])
const parou = r1.sim.pieces[idx1];
check(!!saiu && saiu.side === side1 && Math.hypot(saiu.x - parou.x, saiu.y - parou.y) < 0.6, 'o botão que saiu foi exatamente o que o jogador usou');
check(vivos(s)[side1] === antes[side1] - 1, `quem jogou ficou com ${vivos(s)[side1]} botões`);
// força máxima: o botão jogado percorre o que a velocidade máxima (vMax) permite, não a força pedida
const p0 = r1.sim.frames[0][idx1 + 1], p1 = r1.sim.frames.at(-1)[idx1 + 1];
const andou = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
check(andou > 120, `pediu força 0,05 e o botão andou ${Math.round(andou)} — saiu na força máxima`);

// ── perder o tempo também custa botão
antes = vivos(s).slice();
const side2 = s.turn;
const ev = skipSnap(s);
check(ev.some((e) => e.t === 'out') && vivos(s)[side2] === antes[side2] - 1, 'perdeu o tempo: saiu o botão mais longe da bola');

// ── até o 1x1, e aí o último não sai mais
let voltas = 0;
while (vivos(s).some((n) => n > 1) && !s.over && voltas < 40) {
  const side = s.turn;
  const idx = movablePieces(s, side)[0];
  applySnap(s, side, idx, (rnd() - 0.5) * 0.2, side === 0 ? -1 : 1, 1, rnd);
  voltas++;
}
check(vivos(s).join('x') === '1x1' || s.over, `chegou no 1x1 (${vivos(s).join('x')})`);
if (!s.over) {
  const antes1v1 = vivos(s).slice();
  const side = s.turn;
  applySnap(s, side, movablePieces(s, side)[0], 0, side === 0 ? 1 : -1, 1, rnd);
  check(vivos(s).join('x') === antes1v1.join('x') || s.over, 'no 1x1 o último botão NÃO sai');
}

// ── bola parada na área volta para o meio
const t = newBotaoMatch(0);
t.phase = 'death'; t.dm = { rounds1v1: 0 }; t.pieces = t.pieces.filter((p) => !p.gk); t.snapsLeft = 1;
const box = BOTAO_FIELD.boxes[1];
t.ball = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
check(naArea(t.ball), 'bola posta dentro da área para o teste');
const lado = t.turn, iAtras = movablePieces(t, lado).at(-1);
const r2 = applySnap(t, lado, iAtras, 0, lado === 0 ? 1 : -1, 1, rnd); // joga longe da bola, ela não se mexe
check(!naArea(t.ball) && !!r2.events.find((e) => e.t === 'ball-reset'), `a bola voltou para o meio (${Math.round(t.ball.x)}, ${Math.round(t.ball.y)})`);

// ── 5 rodadas de 1x1 sem gol = empate
const d = newBotaoMatch(0);
d.phase = 'death'; d.dm = { rounds1v1: 0 }; d.snapsLeft = 1;
d.pieces = [{ side: 0, gk: false, x: 40, y: 400 }, { side: 1, gk: false, x: 260, y: 60 }];
d.ball = { ...BOTAO_FIELD.center };
let vezes = 0;
while (!d.over && vezes < 40) { skipSnap(d); vezes++; } // ninguém joga: só passa a vez
check(d.over?.winner === null && d.over?.reason === 'empate', `empate depois de ${BOTAO.death.drawAfter1v1} rodadas de 1x1 (${vezes} vezes)`);

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
