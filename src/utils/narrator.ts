/**
 * Narrador de futebol — microcopy com personalidade (item 2.12).
 * Sorteia bordões no tom de transmissão brasileira (Cartola FC / rádio).
 */

const GOAL = [
  'É GOOOOL!',
  'GOLAÇO!',
  'BALANÇOU A REDE!',
  'PRA DENTRO!',
  'NO ÂNGULO!',
  'ESTUFOU A REDE!',
];

// "Não foi gol" genérico (auto/falta): pode ser defesa ou pra fora
const MISS = [
  'PRA FORA!',
  'ISOLOU!',
  'PAROU NO GOLEIRO!',
  'NÃO FOI DESSA VEZ!',
  'POR CIMA!',
  'QUE ISSO!',
];

// Especificamente defesa do goleiro (pênalti)
const SAVE = [
  'DEFENDEU!',
  'PEGOU!',
  'NÃO PASSOU!',
  'MUROU O CHUTE!',
  'AGARROU!',
];

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

/** Resultado genérico de chute (auto/falta). */
export function cheer(goal: boolean): string {
  return goal ? pick(GOAL) : pick(MISS);
}

/** Resultado de pênalti — o "erro" é sempre defesa do goleiro. */
export function penaltyCheer(goal: boolean): string {
  return goal ? pick(GOAL) : pick(SAVE);
}
