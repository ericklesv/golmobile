/**
 * Filtro "isso é código, não é conversa" (lib/codigo.js), puro — sem banco e sem servidor.
 * De um lado, tudo que o jogador ivictor mandou no chat em 17/09/2026 (XSS e injeção de SQL): tem de barrar.
 * Do outro, conversa de futebol de verdade, com aspas, ponto e vírgula, placar e a palavra "união": tem de passar.
 *
 * Uso (na pasta api/):  node scripts/test-codigo-no-chat.js   → tem de terminar em "TUDO OK".
 */
import { pareceCodigo } from '../src/lib/codigo.js';

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };

// ── o que ELE mandou (e variações do mesmo ataque): tem de barrar
const barrar = [
  '<script>alert(1)</script>',
  "' OR '1'='1",
  "' AND '1'='2",
  "' UNION SELECT NULL--",
  "' UNION SELECT NULL,NULL,NULL,NULL,NULL--",
  "' UNION SELECT @@version--",
  "' UNION SELECT current_user--",
  "' UNION SELECT current_database()--",
  '<img src=x onerror=alert(1)>',
  '<IMG SRC=x ONERROR=alert(1)>',
  '<iframe src="javascript:alert(1)">',
  "'; DROP TABLE User;--",
  'admin\'--',
  'SELECT nick FROM User',
  "1' AND SLEEP(5)--",
  '{{7*7}}',
  '${process.env}',
  '../../etc/passwd',
  '<a href="javascript:alert(1)">clique</a>',
];
for (const t of barrar) {
  const motivo = pareceCodigo(t);
  check(!!motivo, `barra "${t.slice(0, 42)}" (${motivo ?? 'PASSOU — não deveria'})`);
}

// ── conversa de verdade: NÃO pode barrar
const passar = [
  'boa noite galera',
  'o Flamengo tá 3 x 0, tá rindo à toa',
  'alguém quer jogar x1? eu tô on',
  'que gol foi esse do hitou!!!',
  'nao consegui fazer gol hoje ;(',
  'vamo subir pra Série A, união faz a força',
  'to no nivel 12 e você?',
  'esse goleiro é um frango; pegou nada',
  '5 > 3, óbvio',
  "o 'craque' aí do Náutico sumiu",
  'select?? nem sei o que é isso kkkk',
  'update aí o app que saiu coisa nova',
  'jogo é bom demais -- viciei',
  'alguém do meu time on? preciso de diretor',
  'FALTA PRO é o melhor minigame, mudem minha mente',
  'e aí, 1 x 1 no futprego?',
];
for (const t of passar) {
  const motivo = pareceCodigo(t);
  check(!motivo, `deixa passar "${t.slice(0, 42)}"${motivo ? ` — BARROU como "${motivo}"` : ''}`);
}

check(pareceCodigo('') === null && pareceCodigo(null) === null && pareceCodigo(undefined) === null, 'texto vazio não quebra o filtro');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
