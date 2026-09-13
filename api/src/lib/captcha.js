/**
 * Captcha simples dos chutes manuais (anti-bot, como o original tinha).
 * A cada 10 chutes manuais (pênalti + falta + trilha) o servidor sinaliza
 * `captchaRequired` no /api/me; o próximo chute precisa vir com {captchaId, answer}
 * de um desafio pedido em GET /api/play/captcha (conta fácil de somar ou subtrair — pedido do dono).
 * Tudo em memória (1 instância PM2; reiniciou, o cliente pede outra conta).
 *
 * Regras que evitam a conta "repetir" (bug de 13/09/2026):
 * - o jogador tem UMA conta aberta por vez: pedir de novo devolve a mesma (só `nova` troca);
 * - a conta vale 30 min (a recarga do chute é 10 min — antes vencia em 5 e o jogador que
 *   respondeu durante a recarga levava outra conta ao chutar);
 * - acertou, fica liberado até o chute sair: se o chute for recusado (recarga etc.), não pede de novo.
 */
import { randomBytes } from 'crypto';

export const CAPTCHA_EVERY = 10;
const TTL_MS = 30 * 60_000;
const store = new Map(); // id -> { userId, question, answer, expiresAt }
const open = new Map(); // userId -> id da conta aberta
const solved = new Map(); // userId -> nº de chutes em que acertou (libera o chute pendente)

/** Chutes manuais já feitos (pênalti + falta + trilha). */
export const manualKicks = (user) => (user.penaltyTries ?? 0) + (user.foulTries ?? 0) + (user.trailTries ?? 0);

/** O próximo chute manual exige captcha? (a cada CAPTCHA_EVERY chutes, se ainda não acertou a conta) */
export function captchaRequired(user) {
  const n = manualKicks(user);
  return n > 0 && n % CAPTCHA_EVERY === 0 && solved.get(user.id) !== n;
}

function sweep(now) {
  if (store.size < 500) return;
  for (const [id, c] of store) if (c.expiresAt <= now) { store.delete(id); if (open.get(c.userId) === id) open.delete(c.userId); }
}

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** A conta aberta do jogador (ou uma nova, se não houver ou se `fresh`). */
export function newCaptcha(userId, { fresh = false, now = Date.now() } = {}) {
  sweep(now);
  const cur = store.get(open.get(userId));
  if (cur && !fresh && cur.expiresAt > now) return { id: open.get(userId), question: cur.question, expiresAt: cur.expiresAt };
  if (cur) store.delete(open.get(userId));
  let question, answer;
  if (rnd(0, 1) === 0) { const a = rnd(1, 10), b = rnd(1, 10); question = `${a} + ${b}`; answer = a + b; }
  else { const a = rnd(2, 10), b = rnd(1, a - 1); question = `${a} - ${b}`; answer = a - b; }
  const id = randomBytes(8).toString('hex');
  store.set(id, { userId, question, answer, expiresAt: now + TTL_MS });
  open.set(userId, id);
  return { id, question, expiresAt: now + TTL_MS };
}

/** Confere a resposta: 'ok' (libera o chute pendente), 'wrong' (a conta é trocada) ou 'expired'. */
export function checkCaptcha(user, id, answer, now = Date.now()) {
  const c = store.get(String(id || ''));
  if (!c || c.userId !== user.id || c.expiresAt <= now) return 'expired';
  store.delete(String(id));
  if (open.get(user.id) === String(id)) open.delete(user.id);
  if (Number(String(answer ?? '').trim()) !== c.answer) return 'wrong';
  solved.set(user.id, manualKicks(user));
  return 'ok';
}
