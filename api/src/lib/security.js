/**
 * Segurança da API (pedido do dono, 15/09/2026 — o concorrente sofre com DDoS e cadastro em massa):
 *   - cadastro: teto de contas por IP em 24 h, e-mail descartável barrado, honeypot + tempo mínimo no
 *     formulário, Turnstile (captcha invisível da Cloudflare) quando TURNSTILE_SECRET estiver no .env;
 *   - login: trava POR CONTA depois de N senhas erradas (o limite por IP não segura botnet);
 *   - cache curto em memória para as rotas públicas pesadas (rankings, liga, home…): numa rajada o
 *     banco responde uma vez a cada poucos segundos, não a cada pedido.
 * Tudo em memória: a API roda numa instância só do PM2 (scheduler.js também depende disso).
 * O DDoS de verdade é segurado na borda (Cloudflare + nginx/ufw) — ver docs/SEGURANCA.md.
 */
import { createRequire } from 'node:module';
import { GameError, badRequest } from './errors.js';

// lista JSON (~120 mil domínios de e-mail temporário); require porque é JSON puro
const disposableDomains = createRequire(import.meta.url)('disposable-email-domains');

export const SECURITY = {
  registerPerIpPerDay: 3, // contas novas por IP em 24 h
  registerMinFormMs: 3000, // formulário preenchido em menos que isso = robô
  loginMaxFails: 10, // senhas erradas seguidas por conta…
  loginLockMs: 15 * 60_000, // …trancam a conta por este tempo
  loginFailWindowMs: 15 * 60_000,
};

// ─── E-mail descartável ─────────────────────────────────────────────────────
const DISPOSABLE = new Set(disposableDomains);
export function isDisposableEmail(email) {
  const domain = String(email).split('@')[1]?.toLowerCase();
  if (!domain) return false;
  if (DISPOSABLE.has(domain)) return true;
  // subdomínio de um descartável (x.mailinator.com)
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) if (DISPOSABLE.has(parts.slice(i).join('.'))) return true;
  return false;
}

// ─── Cadastro: honeypot + tempo mínimo ──────────────────────────────────────
/** `website` é um campo escondido do formulário (humano não vê, robô preenche); `startedAt` = quando o
 *  formulário abriu (relógio do cliente, só serve para pegar script que envia na hora). */
export function checkRegisterForm(body) {
  if (typeof body?.website === 'string' && body.website.trim() !== '') throw badRequest('Cadastro inválido.');
  const started = Number(body?.startedAt);
  if (Number.isFinite(started) && started > 0 && Date.now() - started < SECURITY.registerMinFormMs) {
    throw new GameError(429, 'slow-down', 'Calma, craque! Confira os dados e tente de novo.');
  }
}

// ─── Turnstile (Cloudflare) — só quando configurado ─────────────────────────
export const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
export const turnstileEnabled = () => !!(TURNSTILE_SITE_KEY && TURNSTILE_SECRET);

export async function verifyTurnstile(token, ip) {
  if (!turnstileEnabled()) return; // desligado = não exige
  if (!token) throw new GameError(400, 'captcha', 'Confirme que você não é um robô.');
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token, remoteip: ip || undefined }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (!data.success) throw new GameError(400, 'captcha', 'A verificação anti-robô falhou. Tente de novo.');
  } catch (e) {
    if (e instanceof GameError) throw e;
    // Cloudflare fora do ar não pode derrubar o cadastro: registra e deixa passar
    console.error('[turnstile] verificação indisponível:', e.message);
  }
}

// ─── Login: trava por conta ─────────────────────────────────────────────────
const fails = new Map(); // nickLower/email -> { count, first, lockedUntil }
function sweepFails(now) {
  if (fails.size < 5000) return;
  for (const [k, v] of fails) if ((v.lockedUntil || 0) < now && now - v.first > SECURITY.loginFailWindowMs) fails.delete(k);
}
/** Lança 429 se a conta está trancada. */
export function assertNotLocked(key, now = Date.now()) {
  const f = fails.get(key);
  if (f?.lockedUntil && f.lockedUntil > now) {
    const min = Math.ceil((f.lockedUntil - now) / 60_000);
    throw new GameError(429, 'locked', `Muitas tentativas nesta conta. Tente de novo em ${min} min.`);
  }
}
export function noteLoginFail(key, now = Date.now()) {
  sweepFails(now);
  const f = fails.get(key);
  if (!f || now - f.first > SECURITY.loginFailWindowMs) { fails.set(key, { count: 1, first: now, lockedUntil: 0 }); return; }
  f.count += 1;
  if (f.count >= SECURITY.loginMaxFails) { f.lockedUntil = now + SECURITY.loginLockMs; f.count = 0; f.first = now; console.warn(`[login] conta trancada por ${SECURITY.loginLockMs / 60000} min: ${key}`); }
}
export function noteLoginOk(key) { fails.delete(key); }

// ─── Cache curto de respostas públicas ──────────────────────────────────────
const cache = new Map(); // url -> { until, status, body }
/** Middleware: guarda a resposta JSON (só 200) por `ttlMs`, por URL completa. Só para rotas SEM dado do usuário logado. */
export function cached(ttlMs) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = req.originalUrl;
    const hit = cache.get(key);
    const now = Date.now();
    if (hit && hit.until > now) { res.set('x-cache', 'hit'); return res.status(hit.status).json(hit.body); }
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) { cache.set(key, { until: now + ttlMs, status: 200, body }); if (cache.size > 2000) cache.clear(); }
      res.set('x-cache', 'miss');
      return json(body);
    };
    next();
  };
}
export function cacheClear() { cache.clear(); }
