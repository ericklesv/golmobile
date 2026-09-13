/**
 * Captcha simples dos chutes manuais (anti-bot, como o original tinha).
 * A cada 10 chutes manuais (pênalti + falta + trilha) o servidor sinaliza
 * `captchaRequired` no /api/me; o próximo chute precisa vir com {captchaId, answer}
 * de um desafio pedido em GET /api/play/captcha (conta de somar/subtrair/multiplicar).
 * Os desafios ficam em memória (1 instância PM2; reiniciou, o cliente pede outro).
 */
import { randomBytes } from 'crypto';

export const CAPTCHA_EVERY = 10;
const TTL_MS = 5 * 60_000;
const store = new Map(); // id -> { userId, answer, expiresAt }

/** Chutes manuais já feitos (pênalti + falta + trilha). */
export const manualKicks = (user) => (user.penaltyTries ?? 0) + (user.foulTries ?? 0) + (user.trailTries ?? 0);

/** O próximo chute manual exige captcha? (a cada CAPTCHA_EVERY chutes) */
export function captchaRequired(user) {
  const n = manualKicks(user);
  return n > 0 && n % CAPTCHA_EVERY === 0;
}

function sweep(now) {
  if (store.size < 500) return;
  for (const [id, c] of store) if (c.expiresAt <= now) store.delete(id);
}

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** Gera um desafio novo para o usuário (os anteriores dele continuam valendo até vencer). */
export function newCaptcha(userId, now = Date.now()) {
  sweep(now);
  const kind = rnd(0, 2);
  let a, b, question, answer;
  if (kind === 0) { a = rnd(2, 20); b = rnd(1, 20); question = `${a} + ${b}`; answer = a + b; }
  else if (kind === 1) { a = rnd(5, 30); b = rnd(1, a - 1); question = `${a} - ${b}`; answer = a - b; }
  else { a = rnd(2, 9); b = rnd(2, 9); question = `${a} × ${b}`; answer = a * b; }
  const id = randomBytes(8).toString('hex');
  store.set(id, { userId, answer, expiresAt: now + TTL_MS });
  return { id, question, expiresAt: now + TTL_MS };
}

/** Confere e consome o desafio. */
export function checkCaptcha(userId, id, answer, now = Date.now()) {
  const c = store.get(String(id || ''));
  if (!c) return false;
  store.delete(String(id));
  if (c.userId !== userId || c.expiresAt <= now) return false;
  return Number(String(answer ?? '').trim()) === c.answer;
}
