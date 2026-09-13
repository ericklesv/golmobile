/**
 * Termo do dia — as respostas, na ordem do calendário: o dia #N é a palavra na
 * posição N − 1 (#1 = 12/09/2026). SÓ O SERVIDOR LÊ ISTO: a palavra só sai daqui
 * quando o jogo de quem pediu acabou.
 *
 * É a lista do Termo do Corujão (mesmo dono, 12/09/2026) começando 46 dias à
 * frente — os dois sites nunca têm a mesma palavra no mesmo dia (decisão do dono).
 *
 * **Palavra nova entra no fim**, e antes de a lista acabar (a última cai no dia
 * #93, 13/12/2026; depois o calendário dá a volta). Tirar, trocar de lugar ou
 * inserir no meio muda a palavra de todos os dias dali para a frente — inclusive
 * a de hoje, com gente jogando. Toda resposta precisa estar em `palavras.txt`.
 */
export const ANSWERS = [
  "VIRAR", "TAÇAS", "SPORT", "JOGOS", "PERDE", "PENTA", "LIGAS", "FAIXA",
  "BATER", "APITO", "PONTA", "GINGA", "PENAL", "SUADA", "LANÇA", "PUXÃO",
  "REDES", "GANHA", "VOLTA", "ÍDOLO", "GRUPO", "RUBRO", "MANTO", "TOQUE",
  "MISTO", "TRAVA", "SÉRIE", "CONES", "COBRA", "GRAMA", "TIMBA", "SÓCIO",
  "CRUZA", "MATAR", "BOMBA", "VENCE", "TIMES", "RIVAL", "CAMPO", "TURNO",
  "RACHA", "DUPLA", "MEIAS", "CLUBE", "HINOS", "QUICA", "ARENA", "ASTRO",
  "BOLAS", "TEMPO", "NOITE", "BANCO", "SALVA", "GARRA", "TORCE", "CAVAR",
  "PONTO", "FINAL", "LANCE", "TROCA", "CHUTE", "TÚNEL", "CANTO", "DUELO",
  "VAIAS", "PEITO", "TRAVE", "RECUO", "BOLÃO", "JOGAR", "COPAS", "SOBRA",
  "SAÍDA", "MEIÃO", "SALDO", "ROUBO", "ZEBRA", "MARCA", "GRITO", "PISÃO",
  "SANTA", "FALTA", "JUÍZA", "LINHA", "DÉRBI", "LÍDER", "TETRA", "PÓDIO",
  "FINTA", "ATACA", "LUVAS", "PASSE", "BAGRE",
];

/** A palavra do dia #N. Passou do fim da lista, recomeça do começo. */
export function wordOfDay(day) {
  const n = ANSWERS.length;
  return ANSWERS[(((day - 1) % n) + n) % n];
}
