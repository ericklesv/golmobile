/**
 * Termo do dia — as respostas, na ordem do calendário: o dia #N é a palavra na
 * posição N − 1 (#1 = 12/09/2026). SÓ O SERVIDOR LÊ ISTO: a palavra só sai daqui
 * quando o jogo de quem pediu acabou.
 *
 * Base: a lista do Termo do Corujão (mesmo dono, 12/09/2026) começando 46 dias à
 * frente — os dois sites nunca têm a mesma palavra no mesmo dia (decisão do dono).
 * 13/09/2026: +15 do dono (PORCO, MENGO, BAHIA, BRAGA, PEIXE, TIMÃO, VASCO, INTER,
 * CHAPE, GOIÁS, CEARÁ, PONTE, PAPÃO, NOTAS, VIBRA), intercaladas do dia #3 em diante —
 * o Termo ainda não tinha ido ao ar, então dava para intercalar sem mudar dia já
 * jogado — com parentes a 9+ dias, times a 5+ dias entre si e sem coincidir com o
 * Corujão no mesmo dia. Mais 6 do dono no mesmo dia (MILAN, KLOSE, BRUXO, PORTO,
 * LAZIO, LEEDS), do mesmo jeito, com times a 4+ dias (já são 21 nomes de time).
 *
 * **Depois que o Termo for ao ar, palavra nova entra no fim**, e antes de a lista acabar
 * (a última cai no dia #114, 03/01/2027; depois o calendário dá a volta). Tirar, trocar de lugar
 * ou inserir no meio muda a palavra de todos os dias dali para a frente — inclusive a
 * de hoje, com gente jogando. Toda resposta precisa estar em `palavras.txt`.
 */
export const ANSWERS = [
  "VIRAR", "TAÇAS", "SPORT", "JOGOS", "BRUXO", "PERDE", "PENTA", "LIGAS",
  "BAHIA", "NOTAS", "KLOSE", "FAIXA", "BATER", "APITO", "PONTA", "GINGA",
  "CHAPE", "PENAL", "SUADA", "LANÇA", "PUXÃO", "REDES", "CEARÁ", "GANHA",
  "VOLTA", "ÍDOLO", "VIBRA", "GRUPO", "RUBRO", "MANTO", "TOQUE", "MISTO",
  "LAZIO", "TRAVA", "SÉRIE", "CONES", "COBRA", "GRAMA", "PONTE", "TIMBA",
  "SÓCIO", "CRUZA", "MATAR", "BOMBA", "BRAGA", "VENCE", "TIMES", "RIVAL",
  "PORTO", "CAMPO", "TURNO", "RACHA", "PAPÃO", "DUPLA", "MEIAS", "CLUBE",
  "MILAN", "HINOS", "QUICA", "ARENA", "ASTRO", "MENGO", "BOLAS", "TEMPO",
  "NOITE", "LEEDS", "BANCO", "SALVA", "GARRA", "TORCE", "CAVAR", "PONTO",
  "INTER", "FINAL", "LANCE", "TROCA", "CHUTE", "TÚNEL", "CANTO", "DUELO",
  "PORCO", "VAIAS", "PEITO", "TRAVE", "RECUO", "BOLÃO", "JOGAR", "COPAS",
  "SOBRA", "GOIÁS", "SAÍDA", "MEIÃO", "SALDO", "ROUBO", "VASCO", "ZEBRA",
  "MARCA", "GRITO", "PISÃO", "SANTA", "FALTA", "JUÍZA", "LINHA", "DÉRBI",
  "PEIXE", "LÍDER", "TETRA", "PÓDIO", "FINTA", "ATACA", "LUVAS", "TIMÃO",
  "PASSE", "BAGRE",
];

/** A palavra do dia #N. Passou do fim da lista, recomeça do começo. */
export function wordOfDay(day) {
  const n = ANSWERS.length;
  return ANSWERS[(((day - 1) % n) + n) % n];
}
