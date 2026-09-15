/**
 * Retrospecto e provocação na tela do fim do FutPrego (pedido do dono, 15/09/2026). Depois de cada partida que
 * entra no retrospecto, cada lado recebe o confronto já com ela e uma frase de resenha que faz jus ao momento:
 * freguês, tabu, paternidade, virada no confronto, clássico. Puro (sem banco): o realtime passa as partidas
 * entre os dois e o nick/gênero de cada um (freguês/freguesa, o/a, ele/ela). Cenários e todas as frases, nos
 * dois gêneros: scripts/test-rivalidade.js.
 */
import { randomInt } from 'node:crypto';

/**
 * Retrospecto na perspectiva de `me`. `rows` = partidas que contam entre os dois, a mais recente primeiro
 * ({ winnerId, finishedAt }; winnerId null = empate). `last` = as últimas 5; `streak` = a sequência atual.
 */
export function h2hOf(rows, me) {
  const res = rows.map((r) => (r.winnerId === null ? 'E' : r.winnerId === me ? 'V' : 'D'));
  let n = 0;
  while (n < res.length && res[n] === res[0]) n++;
  const count = (k) => res.filter((x) => x === k).length;
  return {
    total: res.length, wins: count('V'), losses: count('D'), draws: count('E'),
    last: res.slice(0, 5), lastAt: rows[0]?.finishedAt ?? null, streak: res.length ? { kind: res[0], n } : null,
  };
}

// Frases por momento. {O}/{o} = artigo do adversário ("O ghn"), {do} = do/da, {ele}/{Ele}, {seu} {freguesOp} =
// o adversário freguês; {fregues} = quem lê; {pat}/{patOp} = paternidade/maternidade de quem manda no confronto.
// {W} a {L} = vitórias de quem lê a vitórias do adversário; {n} = a sequência. Frase nova: entra na lista do momento.
const LINES = {
  // ── venceu
  estreiaV: [
    'Primeiro duelo contra {o} {op} e você já saiu na frente. Agora {ele} vai querer revanche!',
    'Estreou ganhando {do} {op}. Começou bem esse confronto!',
  ],
  tabuQuebrado: [
    'Quebrou o tabu! Depois de {n} derrotas seguidas, enfim deu você contra {o} {op}.',
    'Acabou o jejum: foram {n} derrotas seguidas para {o} {op}, mas hoje deu você!',
  ],
  finalmente: [
    'Finalmente você venceu {o} {op}! Tava na hora...',
    'Até que enfim! Ainda é {L} a {W} para {o} {op}, mas a caça começou.',
  ],
  igualou: [
    'Igualou o confronto: {W} a {L}. O próximo desempata!',
    'Tudo igual contra {o} {op}: {W} a {L}. Desse jeito vai virar clássico!',
    'Esse confronto tá pegando fogo! {W} a {L} e ninguém larga o osso.',
  ],
  virou: [
    'Passou na frente! Agora é {W} a {L} e quem corre atrás é {o} {op}.',
    'A disputa tá acirrada, mas hoje deu você: {W} a {L} no confronto.',
  ],
  sequenciaV: [
    '{n} vitórias seguidas contra {o} {op}. {Ele} não te aguenta mais!',
    'Já são {n} seguidas. {O} {op} tá precisando treinar...',
  ],
  reacao: [
    '{n} vitórias seguidas! A reação começou: agora é {L} a {W} para {o} {op}.',
    'Embalou: {n} seguidas. {O} {op} ainda lidera por {L} a {W}, mas já tá sentindo.',
  ],
  paternidade: [
    'É {pat}! {W} a {L} contra {o} {op}.',
    '{O} {op} já é {seu} {freguesOp}: {W} a {L} no confronto.',
    'Já pode cobrar aluguel {do} {op}: {W} a {L}.',
  ],
  cacando: [
    'Diminuiu a diferença: agora é {L} a {W} para {o} {op}. A caça continua!',
    'Mais uma pra conta! Ainda é {L} a {W} para {o} {op}, mas a diferença tá caindo.',
  ],
  ampliou: [
    'Abriu vantagem: {W} a {L} contra {o} {op}.',
    'Mais uma pra conta: {W} a {L}. Tá virando costume ganhar {do} {op}.',
  ],
  // ── perdeu
  estreiaD: [
    'Primeiro duelo contra {o} {op} e {ele} levou a melhor. Vai deixar barato?',
    'Estreia com derrota para {o} {op}. Essa revanche tem que sair!',
  ],
  fimSequencia: [
    'Acabou a festa: {o} {op} quebrou sua sequência de {n} vitórias.',
    '{O} {op} cansou de perder e acabou com as suas {n} vitórias seguidas.',
  ],
  fregues: [
    'Você já virou {fregues} {do} {op}... Vai ficar por isso mesmo?',
    'Virou {patOp}: {L} a {W} para {o} {op}.',
    '{O} {op} já te conhece de outros carnavais: {L} a {W} no confronto.',
  ],
  empatouEle: [
    '{O} {op} empatou o confronto: {W} a {L}. Desempata na próxima!',
    'Tudo igual de novo: {W} a {L}. Esse confronto tá pegando fogo!',
  ],
  virouEle: [
    '{O} {op} passou na frente: {L} a {W}. Vai buscar?',
    'A disputa tá acirrada, mas hoje deu {o} {op}: {L} a {W} para {ele}.',
  ],
  reacaoEle: [
    '{O} {op} tá reagindo: {n} vitórias seguidas. Mas no geral ainda é {W} a {L} pra você.',
  ],
  tabu: [
    '{n} derrotas seguidas para {o} {op}. Isso já tá virando tabu!',
    'Mais uma para {o} {op}: {n} seguidas. Hora de mudar a tática.',
  ],
  tropecou: [
    'Tropeçou! Mas o confronto ainda é seu: {W} a {L}.',
    '{O} {op} deu o troco, mas no geral ainda dá você: {W} a {L}.',
  ],
  ficandoFeio: [
    '{O} {op} abriu {L} a {W}. Tá ficando feio...',
    '{L} a {W} para {o} {op}. Se bobear, vira freguesia.',
  ],
  // ── empatou
  estreiaE: [
    'Primeiro confronto contra {o} {op} e ninguém saiu na frente. Vai precisar de um desempate!',
  ],
  empateSeguido: [
    '{n} empates seguidos! Ninguém quer perder esse clássico.',
  ],
  acirrado: [
    'Ninguém cedeu! A disputa tá acirrada: {W} a {L} no confronto.',
    'Esse confronto tá pegando fogo! Desse jeito vai virar clássico.',
  ],
  peloMenos: [
    'Pelo menos não perdeu dessa vez... mas ainda é {L} a {W} para {o} {op}.',
  ],
  segurou: [
    '{O} {op} segurou o empate. Mas o confronto ainda é seu: {W} a {L}.',
  ],
};
export const RIVALRY_LINES = LINES; // para o teste passar por todas

/**
 * O momento do confronto depois desta partida, na ordem de prioridade (o mais marcante primeiro).
 * `before`/`after` = h2hOf() sem e com a partida que acabou de terminar.
 */
export function rivalryKind(before, after) {
  const r = after.last[0];
  const d = after.wins - after.losses, dB = before.wins - before.losses;
  const s = after.streak, sB = before.streak;
  if (r === 'V') {
    if (after.total === 1) return 'estreiaV';
    if (sB?.kind === 'D' && sB.n >= 3) return 'tabuQuebrado';
    if (before.last[0] === 'D' && dB <= -2) return 'finalmente';
    if (dB === -1) return 'igualou';
    if (dB === 0) return 'virou';
    if (s.n >= 3) return d < 0 ? 'reacao' : 'sequenciaV';
    if (d >= 3) return 'paternidade';
    return d < 0 ? 'cacando' : 'ampliou';
  }
  if (r === 'D') {
    if (after.total === 1) return 'estreiaD';
    if (sB?.kind === 'V' && sB.n >= 3) return 'fimSequencia';
    if (d <= -3) return 'fregues';
    if (dB === 1) return 'empatouEle';
    if (dB === 0) return 'virouEle';
    if (s.n >= 3) return d > 0 ? 'reacaoEle' : 'tabu';
    return d > 0 ? 'tropecou' : 'ficandoFeio';
  }
  if (after.total === 1) return 'estreiaE';
  if (s.n >= 2) return 'empateSeguido';
  if (Math.abs(d) <= 1) return 'acirrado';
  return d < 0 ? 'peloMenos' : 'segurou';
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * A frase do fim para quem lê: { kind, text }, ou null se a partida não entrou no retrospecto (`after` tem de ter
 * exatamente uma partida a mais que `before`). `me`/`opp` = { nick, gender }. `pick` escolhe entre as frases do
 * momento (sorteio; o teste passa uma fixa).
 */
export function rivalryLine({ before, after, me, opp }, pick = (list) => list[randomInt(list.length)]) {
  if (!before || !after || after.total !== before.total + 1) return null;
  const kind = rivalryKind(before, after);
  const F = opp.gender === 'F', meF = me.gender === 'F';
  const o = F ? 'a' : 'o', ele = F ? 'ela' : 'ele';
  const vars = {
    op: opp.nick, o, O: cap(o), do: F ? 'da' : 'do', ele, Ele: cap(ele), seu: F ? 'sua' : 'seu',
    freguesOp: F ? 'freguesa' : 'freguês', fregues: meF ? 'freguesa' : 'freguês',
    pat: meF ? 'maternidade' : 'paternidade', patOp: F ? 'maternidade' : 'paternidade',
    W: after.wins, L: after.losses,
    n: kind === 'tabuQuebrado' || kind === 'fimSequencia' ? before.streak.n : after.streak.n, // a sequência que caiu ou a atual
  };
  return { kind, text: pick(LINES[kind]).replace(/\{(\w+)\}/g, (_, k) => String(vars[k])) };
}
