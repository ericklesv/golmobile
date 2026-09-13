// Quiz do dia — banco e calendário. As perguntas moram nos arquivos q-*.js; a ORDEM abaixo é o
// calendário: o dia #N do Quiz usa as perguntas ORDER[(N-1)*5 … (N-1)*5+4] (volta ao começo no fim).
// Pergunta nova: entra no arquivo do tema E o id entra no FIM de ORDER — inserir no meio muda as
// perguntas dos dias seguintes (inclusive de hoje, com gente jogando).
import { MUNDO } from "./q-mundo.js";
import { BRASIL } from "./q-brasil.js";
import { SELECAO } from "./q-selecao.js";

export const BANK = new Map([...MUNDO, ...BRASIL, ...SELECAO].map((x) => [x.id, x]));

export const ORDER = [
  "b01", "m01", "s01", "b02", "m02", "s02", "b03", "m03", "b04", "m04",
  "s03", "b05", "m05", "b06", "s04", "m06", "b07", "s05", "b08", "m07",
  "b09", "m08", "s06", "b10", "m09", "b11", "s07", "m10", "b12", "m11",
  "b13", "s08", "m12", "b14", "s09", "b15", "m13", "b16", "m14", "s10",
  "b17", "m15", "b18", "s11", "m16", "b19", "s12", "m17", "b20", "m18",
  "b21", "s13", "b22", "m19", "s14", "b23", "m20", "b24", "m21", "s15",
  "b25", "m22", "b26", "s16", "m23", "b27", "m24", "b28", "s17", "b29",
  "m25", "s18", "b30", "m26", "b31", "s19", "m27", "b32", "m28", "b33",
  "s20", "m29", "b34", "s21", "m30", "b35", "b36", "m31", "s22", "b37",
  "m32", "s23", "b38", "m33", "b39", "m34", "s24", "b40", "m35", "b41",
  "s25", "m36", "b42", "s26", "b43", "m37", "b44", "m38", "s27", "b45",
  "m39", "b46", "s28", "m40", "b47", "m41", "b48", "s29", "m42", "b49",
  "s30", "b50", "m43", "b51", "m44", "s31", "b52", "m45", "b53", "s32",
  "m46", "b54", "s33", "m47", "b55", "m48", "b56", "s34", "b57", "m49",
  "s35", "b58", "m50", "b59", "m51", "s36", "b60", "m52", "b61", "s37",
  "m53", "b62", "m54", "b63", "s38", "b64", "m55", "s39", "b65", "m56",
  "b66", "s40", "m57", "b67", "m58", "b68", "s41", "m59", "b69", "s42",
  "m60", "b70",
];

/** As perguntas do dia #N do Quiz. */
export function questionsOfDay(day, count) {
  const n = ORDER.length;
  return Array.from({ length: count }, (_, k) => BANK.get(ORDER[((((day - 1) * count + k) % n) + n) % n]));
}
