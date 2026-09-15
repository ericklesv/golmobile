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
