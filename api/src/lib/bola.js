/**
 * Chute de prata e de ouro (dono, 17/09/2026, resgatando o BRGOL — o GD lembrou: "tinha chance de vir bola de
 * prata que valia 2 e bola de ouro que valia 3").
 *
 * Como funciona: **uma batida só, que VALE mais** (dono, 18/09/2026: "ao invés de você chutar 2x 3x, você
 * chuta 1, se acertar conta as 2x ou 3x"). A bola de prata faz o gol valer 2 e a de ouro, 3 — no placar da
 * partida, na artilharia, no nível e no dinheiro. Errou, acabou. Vale no pênalti, na falta e na trilha; o
 * chute direto fica de fora (decisão do dono).
 *
 * A bola é sorteada com ANTECEDÊNCIA: quando o jogador gasta uma recarga, o servidor já sorteia a bola da
 * PRÓXIMA (`User.ballNext`). Assim o card da tela inicial fica prateado/dourado enquanto a recarga corre e o
 * jogador vê o que vem pela frente — era o pedido do dono ("o pênalti fica dourado, cor de ouro").
 *
 * `ballNext` é um JSON por modo ({"PENALTY": "OURO"}) escrito com `jsonb_set`: dois chutes de modos
 * diferentes ao mesmo tempo não podem apagar um ao outro (cada um mexe só na sua chave).
 *
 * (A coluna `User.ballLeft` era das batidas que sobravam da mesma recarga; com a batida única ela não é mais
 * lida nem escrita. Ficou no banco para não precisar de migração.)
 */
import { BALL } from './rules.js';

/** A bola já sorteada para a próxima recarga deste modo ('PRATA' | 'OURO' | null). */
export const ballNextOf = (user, kind) => (user?.ballNext ?? {})[kind] ?? null;

/** Quantos gols vale um gol feito com esta bola (normal = 1). */
export const goalsOf = (ball) => BALL.goals[ball] ?? 1;

const SET_NEXT = 'UPDATE "User" SET "ballNext" = jsonb_set(COALESCE("ballNext", \'{}\'::jsonb), ARRAY[$2], $3::jsonb) WHERE id = $1';

/** Grava a bola sorteada para a próxima recarga deste modo. */
export const saveNextBall = (tx, userId, kind, ball) =>
  tx.$executeRawUnsafe(SET_NEXT, userId, kind, JSON.stringify(ball ?? null));

/**
 * Como a tela mostra o modo: { ball, goals } — `ball` null = chute normal (vale 1), 'PRATA' = o gol vale 2,
 * 'OURO' = vale 3. É o que deixa o card prateado/dourado enquanto a recarga corre.
 */
export function ballView(user, kind) {
  const ball = ballNextOf(user, kind);
  return { ball, goals: goalsOf(ball) };
}
