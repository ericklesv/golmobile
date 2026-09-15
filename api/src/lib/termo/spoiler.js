/**
 * Chat sem spoiler do Termo (pedido do dono, 15/09/2026: "proibir mandar a palavra do dia do Termo no chat; quando
 * enviar, ficar com ****"). Troca a palavra de HOJE por asteriscos: maiúscula ou minúscula, com ou sem acento (TAÇAS
 * = tacas, como no próprio Termo), com as letras separadas ("s a n t o", "s.a.n.t.o"), esticadas ("santooo") ou
 * trocadas por número ("s4nt0"). Só a palavra INTEIRA: "santos" e "está rindo" (com ESTAR) ficam como estão.
 * Usado na LEITURA do chat (routes/chat.js): a mensagem fica gravada como foi escrita (a denúncia vê o texto real) e,
 * quando a palavra muda à meia-noite, a de ontem volta a aparecer — já não é segredo.
 */
import { wordOfDay } from './answers.js';
import { keyOf } from './rules.js';
import { dayNumber } from '../time.js';

// letra da palavra (já sem acento) → o que conta como ela no texto
const LOOKS = { a: 'aáàâãä4@', c: 'cç', e: 'eéèêë3', i: 'iíìîï1', o: 'oóòôõö0', u: 'uúùûü', s: 's5$', t: 't7', g: 'g9', b: 'b8' };
const letter = (ch) => `[${(LOOKS[ch] ?? ch).replace(/[\]\\^-]/g, '\\$&')}]+`;
const SEP = '[\\s._\\-*,/|+~]{0,3}'; // entre as letras: "s a n t o", "s.a.n.t.o", "s-a-n-t-o"

/** A regra (RegExp global) que acha `answer` num texto. */
export function spoilerRe(answer) {
  const body = [...keyOf(answer)].map(letter).join(SEP);
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
}

/** O texto com `answer` trocada por asteriscos (um por letra da palavra). */
export function maskWord(text, answer) {
  return String(text).normalize('NFC').replace(spoilerRe(answer), '*'.repeat(keyOf(answer).length));
}

let cache = { day: 0, re: null, stars: '' };
/** O texto com a palavra do Termo de HOJE escondida (a regra é montada uma vez por dia). */
export function maskTermo(text, now = new Date()) {
  const day = dayNumber(now);
  if (cache.day !== day) {
    const answer = wordOfDay(day);
    cache = { day, re: spoilerRe(answer), stars: '*'.repeat(keyOf(answer).length) };
  }
  return String(text).normalize('NFC').replace(cache.re, cache.stars);
}
