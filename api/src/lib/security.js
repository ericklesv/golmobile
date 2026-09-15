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
import { tg } from './telegram.js';
import { isPrivateIp } from './ip.js';

// lista JSON (~120 mil domínios de e-mail temporário); require porque é JSON puro
const disposableDomains = createRequire(import.meta.url)('disposable-email-domains');

export const SECURITY = {
  maxOnline: 3, // contas ao mesmo tempo: no mesmo aparelho e, no PC, na mesma internet (dono, 15/09/2026) — a 4ª espera
  onlineMs: 10 * 60_000, // conta sem nenhum pedido há mais que isso solta a vaga
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
/** `website` é um campo escondido do formulário (humano não vê, robô preenche); `elapsedMs` = quanto tempo
 *  o formulário ficou aberto, medido NO APARELHO (abriu e enviou pelo mesmo relógio — só serve para pegar
 *  script que envia na hora). Fronts antigos ainda mandam `startedAt` (hora em que abriu, no relógio do
 *  aparelho); comparar isso com o relógio do servidor barrava gente com o PC adiantado ("rápido demais"
 *  depois de 1 min no formulário — caso real de 15/09/2026), então esse caminho só vale enquanto o front
 *  em cache não atualiza e NUNCA barra diferença negativa (relógio na frente = não é robô). */
export function checkRegisterForm(body) {
  if (typeof body?.website === 'string' && body.website.trim() !== '') throw badRequest('Cadastro inválido.');
  const slow = () => new GameError(429, 'slow-down', 'Calma, craque! Confira os dados e tente de novo.');
  const elapsed = Number(body?.elapsedMs);
  if (Number.isFinite(elapsed)) {
    if (elapsed >= 0 && elapsed < SECURITY.registerMinFormMs) throw slow();
    return;
  }
  const started = Number(body?.startedAt);
  if (Number.isFinite(started) && started > 0) {
    const diff = Date.now() - started;
    if (diff >= 0 && diff < SECURITY.registerMinFormMs) throw slow();
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
  if (f.count >= SECURITY.loginMaxFails) { f.lockedUntil = now + SECURITY.loginLockMs; f.count = 0; f.first = now; console.warn(`[login] conta trancada por ${SECURITY.loginLockMs / 60000} min: ${key}`); tg.warn(`🔒 Conta <code>${tg.esc(key)}</code> trancada por ${SECURITY.loginLockMs / 60000} min: ${SECURITY.loginMaxFails} senhas erradas`, { key: `lock:${key}`, every: 30 * 60_000 }); }
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

// ─── Contas AO MESMO TEMPO: por aparelho e, no PC, por internet (dono, 15/09/2026) ────────────────────────
// "Muitos usuários logando com o mesmo IP em várias contas — limitar para 3" e, depois, "vários celulares deve ser
// permitido, o mesmo PC tem que ser limitado". Duas vagas, as duas com `maxOnline` e soltando depois de
// `onlineMs` sem nenhum pedido com login (a tela aberta manda o heartbeat a cada 60 s):
//   - por APARELHO (lib/device.js: o código que o site grava no navegador): até 3 contas abertas no mesmo aparelho,
//     celular ou PC — outra aba/conta no mesmo navegador conta;
//   - por INTERNET, só para o que NÃO é celular (PC/notebook): até 3 contas de computador na mesma internet — outro
//     navegador ou janela anônima no mesmo PC continua na mesma internet. Celulares diferentes na mesma internet
//     (família, operadora com IP compartilhado/CGNAT) jogam à vontade.
// Quem já tem a vaga continua; a conta a mais recebe 403 `multiconta` (o site mostra components/MultiAccount.tsx).
// IP de verdade (clientIp: X-Real-IP do nginx). IP local/privado (PC de desenvolvimento) e admin: sem trava.
// Em memória (1 instância PM2): se a API reinicia, as vagas começam vazias e os primeiros a voltar pegam. Código do
// aparelho e "é celular" vêm do próprio aparelho (dá para falsificar): atrapalha a multiconta comum, não é à prova de tudo.
const slots = { ip: new Map(), device: new Map() }; // chave -> Map(userId -> último pedido em ms)
let lastSweep = 0;
function sweepSlots(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const map of Object.values(slots)) for (const [key, m] of map) {
    for (const [id, t] of m) if (now - t > SECURITY.onlineMs) m.delete(id);
    if (!m.size) map.delete(key);
  }
}
/** As vagas vivas de uma chave (as vencidas saem na hora). */
function liveSlots(map, key, now, create) {
  let m = map.get(key);
  if (!m) { if (!create) return new Map(); map.set(key, (m = new Map())); }
  for (const [id, t] of m) if (now - t > SECURITY.onlineMs) m.delete(id);
  return m;
}
const minutes = () => Math.round(SECURITY.onlineMs / 60_000);
const fullDevice = () => new GameError(403, 'multiconta',
  `Já tem ${SECURITY.maxOnline} contas abertas neste aparelho agora. Para entrar com esta, saia de uma delas e espere uns ${minutes()} minutos.`);
const fullPc = () => new GameError(403, 'multiconta',
  `Já tem ${SECURITY.maxOnline} contas jogando pelo computador nesta internet agora. Para entrar com esta, saia de uma delas e espere uns ${minutes()} minutos.`);

/** Qual vaga está cheia para `userId` (null = pode). */
function blocked({ ip, device }, userId, now, create) {
  const d = device?.id ? liveSlots(slots.device, device.id, now, create) : null;
  const p = device?.mobile ? null : liveSlots(slots.ip, ip, now, create);
  if (d && !d.has(userId) && d.size >= SECURITY.maxOnline) return { err: fullDevice(), where: `no aparelho ${device.label}`, key: `dev:${device.id}` };
  if (p && !p.has(userId) && p.size >= SECURITY.maxOnline) return { err: fullPc(), where: 'pelo computador na mesma internet', key: `ip:${ip}` };
  return { d, p };
}

/**
 * Ocupa (ou renova) as vagas de `userId`: a do aparelho e, se não for celular, a da internet. Lança 403 `multiconta`
 * se alguma está cheia (e avisa o dono no Telegram, no máximo 1 vez a cada 30 min por aparelho/internet).
 * `device` = deviceOf(req) (lib/device.js); `nick` só para o aviso.
 */
export function takeSlot({ ip, device }, userId, now = Date.now(), nick = null) {
  if (isPrivateIp(ip)) return;
  sweepSlots(now);
  const r = blocked({ ip, device }, userId, now, true);
  if (r.err) {
    tg.warn(`🧱 Mais de ${SECURITY.maxOnline} contas ao mesmo tempo ${r.where}: ${nick ? `<b>${tg.esc(nick)}</b>` : `conta #${userId}`} ficou de fora — IP <code>${tg.esc(ip)}</code>`, { key: `multi:${r.key}`, every: 30 * 60_000 });
    throw r.err;
  }
  r.d?.set(userId, now);
  r.p?.set(userId, now);
}

/** Cadastro: a conta ainda não existe — só confere se o aparelho ou (no PC) a internet já estão cheios. */
export function assertRoom({ ip, device }, now = Date.now()) {
  if (isPrivateIp(ip)) return;
  const r = blocked({ ip, device }, -1, now, false);
  if (r.err) throw r.err;
}

/** Para teste: esvazia as vagas. */
export function resetSlots() { slots.ip.clear(); slots.device.clear(); lastSweep = 0; }
