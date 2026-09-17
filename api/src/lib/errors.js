import { tg } from './telegram.js';
export class GameError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (msg, code = 'bad-request') => new GameError(400, code, msg);
export const unauthorized = (msg = 'Faça login para jogar.') => new GameError(401, 'unauthenticated', msg);
/**
 * Número inteiro do corpo do pedido, entre `min` e `max` (sem valor = `min`). Texto, objeto ou NaN viram
 * 400 "valor inválido" em vez de quebrar a consulta lá na frente (17/09/2026: um jogador mandou `qtd` de
 * mentira em /api/me/vip-to-money e o Prisma devolveu erro 500 com a consulta inteira no aviso do Telegram).
 */
export function inteiro(valor, { min = 1, max = 1000, campo = 'valor' } = {}) {
  if (valor === undefined || valor === null || valor === '') return min;
  const n = Math.floor(Number(valor));
  if (!Number.isFinite(n)) throw badRequest(`O ${campo} precisa ser um número.`);
  return Math.max(min, Math.min(max, n));
}
export const forbidden = (msg = 'Acesso negado.') => new GameError(403, 'forbidden', msg);
export const notFound = (msg = 'Não encontrado.') => new GameError(404, 'not-found', msg);
export const cooldown = (remainingMs) =>
  new GameError(429, 'cooldown', 'Ainda em recarga.', { remainingMs });

/** Envolve um handler async e converte erros em JSON. */
export function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof GameError) {
        res.status(e.status).json({ error: e.code, message: e.message, ...e.extra });
      } else if (e?.name === 'ZodError') {
        res.status(400).json({ error: 'validation', message: e.issues?.[0]?.message || 'Dados inválidos.' });
      } else {
        console.error(e);
        tg.error(`Erro 500 em <code>${tg.esc(req.method)} ${tg.esc(req.originalUrl?.split('?')[0])}</code>${req.user ? ` (${tg.esc(req.user.nick)})` : ''}: ${tg.esc(String(e?.message || e).slice(0, 300))}`, { key: `500:${req.method} ${req.route?.path || req.path}`, every: 5 * 60_000 });
        res.status(500).json({ error: 'internal', message: 'Erro interno. Tente novamente.' });
      }
    }
  };
}
