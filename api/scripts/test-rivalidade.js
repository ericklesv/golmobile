/**
 * Frases de provocação do fim do FutPrego (lib/rivalidade.js), sem banco: cada momento do confronto cai na frase
 * certa, todas as frases montam sem sobrar {marcador} nos dois gêneros, e partida que não entrou no retrospecto
 * (W.O. cedo) não tem frase. No fim, imprime todas as frases de exemplo.
 *
 * Uso (na pasta api/):  node scripts/test-rivalidade.js   → "TUDO OK".
 */
import { h2hOf, rivalryKind, rivalryLine, RIVALRY_LINES } from '../src/lib/rivalidade.js';

const ME = 1, OPP = 2;
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };

/** Histórico em ordem de acontecimento, do ponto de vista de ME ('DDV' = perdeu, perdeu, venceu agora). */
function scene(history) {
  const rows = [...history].reverse().map((r, i) => ({ id: 100 - i, winnerId: r === 'V' ? ME : r === 'D' ? OPP : null, finishedAt: new Date() }));
  return { before: h2hOf(rows.slice(1), ME), after: h2hOf(rows, ME) };
}

// ── o retrospecto
{
  const { before, after } = scene('DDVVDDDDD');
  check(before.total === 8 && before.wins === 2 && before.losses === 6 && before.last.join('') === 'DDDDV'
    && after.total === 9 && after.losses === 7 && after.draws === 0, `retrospecto: antes ${before.wins}V ${before.draws}E ${before.losses}D (últimas ${before.last.join('')}), depois ${after.wins}V ${after.losses}D`);
  const s = scene('DVEDD').after;
  check(s.last.join('') === 'DDEVD' && s.streak.kind === 'D' && s.streak.n === 2, `últimas 5 (a mais recente primeiro) = ${s.last.join('')}, sequência ${s.streak.n}${s.streak.kind}`);
  check(h2hOf([], ME).total === 0 && h2hOf([], ME).streak === null, 'sem partidas: tudo zero, sem sequência');
}

// ── cada momento
const CASES = [
  ['V', 'estreiaV', 'primeiro confronto, venceu'],
  ['D', 'estreiaD', 'primeiro confronto, perdeu'],
  ['E', 'estreiaE', 'primeiro confronto, empatou'],
  ['DDDV', 'tabuQuebrado', 'venceu depois de 3 derrotas seguidas'],
  ['DDVVDDDDV', 'tabuQuebrado', 'o caso do print (2V 6D, 4 derrotas seguidas) e venceu'],
  ['DDV', 'finalmente', 'estava 0 a 2 e venceu (pedido do dono: "Finalmente você venceu…")'],
  ['DVDDV', 'finalmente', 'estava 1 a 3, vinha de derrota, venceu'],
  ['DV', 'igualou', 'estava 0 a 1 e igualou'],
  ['VDV', 'virou', 'estava 1 a 1 e passou na frente'],
  ['VVV', 'sequenciaV', '3 vitórias seguidas'],
  ['DDDDDDVVV', 'reacao', '3 seguidas, mas ainda atrás no geral'],
  ['VVVVDV', 'paternidade', 'já manda no confronto (5 a 1)'],
  ['DDDVEV', 'cacando', 'venceu e diminuiu, ainda atrás'],
  ['VDVV', 'ampliou', 'venceu e abriu 3 a 1'],
  ['VVVD', 'fimSequencia', 'perdeu e acabou a sequência de 3 vitórias'],
  ['DDD', 'fregues', 'perdeu e está 0 a 3 (pedido do dono: "virou freguês")'],
  ['DDVVDDDDD', 'fregues', 'o caso do print (2V 6D) e perdeu de novo'],
  ['VD', 'empatouEle', 'estava 1 a 0 e o outro empatou o confronto'],
  ['VDD', 'virouEle', 'estava 1 a 1 e o outro passou na frente'],
  ['VVVVVVDDD', 'reacaoEle', 'o outro venceu 3 seguidas, mas ainda está 6 a 3'],
  ['VDDD', 'tabu', '3 derrotas seguidas, 1 a 3'],
  ['VVD', 'tropecou', 'perdeu, mas o confronto ainda é 2 a 1'],
  ['DVDD', 'ficandoFeio', 'perdeu e está 1 a 3'],
  ['VEE', 'empateSeguido', '2 empates seguidos'],
  ['VDE', 'acirrado', 'empate com o confronto 1 a 1 (pedido do dono: "pegando fogo")'],
  ['DDE', 'peloMenos', 'empate, ainda 0 a 2'],
  ['VVE', 'segurou', 'empate, ainda 2 a 0'],
];
for (const [h, want, label] of CASES) {
  const { before, after } = scene(h);
  const got = rivalryKind(before, after);
  check(got === want, `${h.padEnd(12)} → ${want}${got === want ? '' : ` (veio ${got})`}: ${label}`);
}
check(Object.keys(RIVALRY_LINES).every((k) => CASES.some((c) => c[1] === k)), 'todo momento com frase tem um cenário no teste');

// ── as frases montam direito
const people = [
  [{ nick: 'eu', gender: 'M' }, { nick: 'ghn', gender: 'M' }],
  [{ nick: 'eu', gender: 'F' }, { nick: 'ana', gender: 'F' }],
];
let rendered = 0, broken = [];
for (const [h, kind] of CASES) {
  const { before, after } = scene(h);
  for (const [me, opp] of people) {
    for (let i = 0; i < RIVALRY_LINES[kind].length; i++) {
      const out = rivalryLine({ before, after, me, opp }, (list) => list[i]);
      rendered++;
      if (!out || out.kind !== kind || /[{}]|undefined|NaN/.test(out.text)) broken.push(`${kind}#${i}: ${out?.text}`);
    }
  }
}
check(broken.length === 0, `${rendered} frases montadas nos dois gêneros, nenhuma com marcador sobrando${broken.length ? `: ${broken.join(' | ')}` : ''}`);
{
  const { before, after } = scene('DDD');
  const him = rivalryLine({ before, after, me: { nick: 'eu', gender: 'M' }, opp: { nick: 'ghn', gender: 'M' } }, (l) => l[0]).text;
  const her = rivalryLine({ before, after, me: { nick: 'eu', gender: 'F' }, opp: { nick: 'ana', gender: 'F' } }, (l) => l[0]).text;
  check(him === 'Você já virou freguês do ghn... Vai ficar por isso mesmo?' && her === 'Você já virou freguesa da ana... Vai ficar por isso mesmo?', `gênero: "${him}" / "${her}"`);
  const tabu = scene('DDVVDDDDV');
  const t = rivalryLine({ ...tabu, me: { nick: 'eu', gender: 'M' }, opp: { nick: 'ghn', gender: 'M' } }, (l) => l[0]).text;
  check(t.includes('4 derrotas seguidas'), `a sequência que caiu entra no número: "${t}"`);
}

// ── partida que não entrou no retrospecto (W.O. cedo): sem frase
{
  const { after } = scene('VD');
  check(rivalryLine({ before: after, after, me: { nick: 'eu' }, opp: { nick: 'ghn' } }) === null, 'W.O. cedo (retrospecto igual antes e depois): sem frase');
  check(rivalryLine({ before: null, after, me: { nick: 'eu' }, opp: { nick: 'ghn' } }) === null, 'sem retrospecto: sem frase');
}

console.log('\nFrases (adversário "ghn"):');
for (const kind of Object.keys(RIVALRY_LINES)) {
  const { before, after } = scene(CASES.find((c) => c[1] === kind)[0]);
  RIVALRY_LINES[kind].forEach((_, i) => console.log(`  [${kind}] ${rivalryLine({ before, after, me: { nick: 'eu', gender: 'M' }, opp: { nick: 'ghn', gender: 'M' } }, (l) => l[i]).text}`));
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
