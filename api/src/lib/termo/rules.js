/**
 * Termo — regras puras (portadas do Termo do Corujão, `src/termo/nucleo/regras.ts`).
 * A palavra do dia mora em `answers.js`; aqui não há resposta nenhuma.
 */
import { readFile } from 'node:fs/promises';

/**
 * A palavra como se digita: sem acento, e Ç vale C ("Taças" → "tacas"). É assim que
 * chute e resposta se comparam — ninguém acha o Ç no teclado do celular.
 */
export function keyOf(word) {
  return String(word).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * As cores de um chute contra a resposta: 'correct' (letra no lugar), 'present'
 * (em outro lugar) ou 'absent'. Letra repetida: primeiro os lugares certos; depois,
 * da esquerda para a direita, cada letra fora do lugar só acende enquanto sobrar
 * daquela letra na resposta (ARARA contra CAMPO acende um A só).
 */
export function evaluate(guess, answer) {
  const g = [...keyOf(guess)];
  const a = [...keyOf(answer)];
  const colors = g.map(() => 'absent');
  const left = new Map();
  g.forEach((ch, i) => {
    if (ch === a[i]) colors[i] = 'correct';
    else left.set(a[i], (left.get(a[i]) ?? 0) + 1);
  });
  g.forEach((ch, i) => {
    if (colors[i] === 'correct') return;
    const n = left.get(ch) ?? 0;
    if (n > 0) { colors[i] = 'present'; left.set(ch, n - 1); }
  });
  return colors;
}

/** Dicionário de chutes: chave sem acento → forma com acento (digitou TACAS, aparece TAÇAS). */
export function parseDictionary(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const form = line.trim();
    if (!form || form.startsWith('#')) continue;
    map.set(keyOf(form), form);
  }
  return map;
}

let dictionary = null;
/** Lido uma vez por processo. */
export function loadDictionary() {
  dictionary ??= readFile(new URL('./palavras.txt', import.meta.url), 'utf8')
    .then(parseDictionary)
    .catch((e) => { dictionary = null; throw e; });
  return dictionary;
}
