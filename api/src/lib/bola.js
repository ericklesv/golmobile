/**
 * Chute de prata e de ouro (dono, 17/09/2026, resgatando o BRGOL — o GD lembrou: "tinha chance de vir bola de
 * prata que valia 2 e bola de ouro que valia 3").
 *
 * Como funciona: **a mesma recarga rende mais batidas**. Prata = bate 2 vezes, ouro = 3 — cada batida é um
 * chute inteiro, que pode entrar ou não (não é gol em dobro; é chance em dobro). Vale no pênalti, na falta e
 * na trilha; o chute direto fica de fora (decisão do dono).
 *
 * A bola é sorteada com ANTECEDÊNCIA: quando o jogador gasta uma recarga, o servidor já sorteia a bola da
 * PRÓXIMA (`User.ballNext`). Assim o card da tela inicial fica prateado/dourado enquanto a recarga corre e o
 * jogador vê o que vem pela frente — era o pedido do dono ("o pênalti fica dourado, cor de ouro").
 * `User.ballLeft` guarda a recarga em andamento: qual bola é e quantas batidas ainda faltam.
 *
 * As duas colunas são JSON por modo ({"PENALTY": …}) e são escritas com `jsonb_set`: dois chutes de modos
 * diferentes ao mesmo tempo não podem apagar um ao outro (cada um mexe só na sua chave).
 */
import { BALL } from './rules.js';

/** A bola já sorteada para a próxima recarga deste modo ('PRATA' | 'OURO' | null). */
export const ballNextOf = (user, kind) => (user?.ballNext ?? {})[kind] ?? null;
/** A recarga em andamento deste modo: { ball, left } ou null. `left` = batidas que ainda faltam. */
export function ballLeftOf(user, kind) {
  const v = (user?.ballLeft ?? {})[kind];
  return v && v.left > 0 ? { ball: v.ball ?? null, left: v.left } : null;
}
/** Quantas batidas a bola dá (normal = 1). */
export const kicksOf = (ball) => BALL.kicks[ball] ?? 1;

const SET_NEXT = 'UPDATE "User" SET "ballNext" = jsonb_set(COALESCE("ballNext", \'{}\'::jsonb), ARRAY[$2], $3::jsonb) WHERE id = $1';
const SET_LEFT = 'UPDATE "User" SET "ballLeft" = jsonb_set(COALESCE("ballLeft", \'{}\'::jsonb), ARRAY[$2], $3::jsonb) WHERE id = $1';

/** Grava a bola sorteada para a próxima recarga deste modo. */
export const saveNextBall = (tx, userId, kind, ball) =>
  tx.$executeRawUnsafe(SET_NEXT, userId, kind, JSON.stringify(ball ?? null));
/** Grava quantas batidas ainda faltam na recarga atual deste modo. */
export const saveBallLeft = (tx, userId, kind, ball, left) =>
  tx.$executeRawUnsafe(SET_LEFT, userId, kind, JSON.stringify(left > 0 ? { ball, left } : null));

/**
 * Como a tela mostra o modo: { ball, left, kicks } — `ball` null = chute normal, `left` = batidas que ainda
 * dá para bater agora (sem esperar recarga), `kicks` = quantas a bola dá no total.
 */
export function ballView(user, kind) {
  const andando = ballLeftOf(user, kind);
  // `free`: ainda sobra batida desta bola, então a próxima sai SEM esperar recarga (a recarga já correu na 1ª)
  if (andando) return { ball: andando.ball, left: andando.left, kicks: kicksOf(andando.ball), free: true };
  const prox = ballNextOf(user, kind);
  return prox
    ? { ball: prox, left: kicksOf(prox), kicks: kicksOf(prox), free: false }
    : { ball: null, left: 1, kicks: 1, free: false };
}
