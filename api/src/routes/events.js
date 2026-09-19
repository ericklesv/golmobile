/**
 * Eventos de uso — POST /api/events (recomendação 8 do relatório de retenção; dono, 18/09/2026: "medir o funil
 * de verdade"). O site manda em lotes (web/src/lib/track.ts): telas abertas (`tela.home`, `tela.termo`…), app
 * aberto/fechado com os segundos (`app.abriu`/`app.saiu`), `recarga.vista`, `slider.visto`, `cadastro.ok`,
 * `erro.tela`… Funciona COM ou SEM login (a landing e o cadastro vêm antes da conta): o token pode vir no
 * cabeçalho ou no corpo (o sendBeacon do navegador não manda cabeçalho), e o código do aparelho (X-Device-Id ou
 * `device` no corpo) liga o antes ao depois. Nunca responde erro para o jogador: lote inválido é ignorado.
 * Limites: 25 eventos por lote, 40 lotes/min por IP, nome `[a-z][a-z0-9_.:-]{1,39}`, `data` até 400 caracteres.
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { handle } from '../lib/errors.js';
import { clientIp } from '../lib/ip.js';
import { deviceOf } from '../lib/device.js';

export const events = Router();

const NAME_RE = /^[a-z][a-z0-9_.:-]{1,39}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PER_MIN = 40;
const buckets = new Map(); // ip -> { until, n }

function allowed(ip, now) {
  const b = buckets.get(ip);
  if (!b || b.until <= now) { buckets.set(ip, { until: now + 60_000, n: 1 }); if (buckets.size > 5000) for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k); return true; }
  b.n += 1;
  return b.n <= PER_MIN;
}

events.post('/', handle(async (req) => {
  const now = Date.now();
  if (!allowed(clientIp(req), now)) return { ok: true, n: 0 };
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  let userId = null;
  const tok = (req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1] || (typeof body.token === 'string' ? body.token : null);
  if (tok) { try { userId = jwt.verify(tok, config.jwtSecret).uid ?? null; } catch { userId = null; } }
  if (userId) { const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isBot: true, deletedAt: true } }); if (!u || u.isBot || u.deletedAt) userId = null; } // token de conta que não existe mais: fica sem dono
  const deviceId = deviceOf(req).id || (typeof body.device === 'string' && DEVICE_RE.test(body.device) ? body.device : null);
  const list = Array.isArray(body.events) ? body.events.slice(0, 25) : [];
  const rows = [];
  for (const e of list) {
    if (!e || typeof e !== 'object' || !NAME_RE.test(String(e.name || ''))) continue;
    let data = e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? e.data : null;
    if (data && JSON.stringify(data).length > 400) data = null;
    const ago = Number.isFinite(e.ago) ? Math.min(Math.max(0, e.ago), 600_000) : 0; // quanto tempo atrás aconteceu (lote)
    rows.push({ userId, deviceId, name: e.name, data, createdAt: new Date(now - ago) });
  }
  if (rows.length) await prisma.event.createMany({ data: rows });
  return { ok: true, n: rows.length };
}));
