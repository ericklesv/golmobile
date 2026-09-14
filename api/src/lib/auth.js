import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { unauthorized, forbidden } from './errors.js';

export function signToken(user) {
  return jwt.sign({ uid: user.id, nick: user.nick }, config.jwtSecret, { expiresIn: '30d' });
}

/** Middleware: exige Bearer token válido e carrega req.user (registro completo). */
export async function requireAuth(req, res, next) {
  try {
    const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!m) throw unauthorized();
    let payload;
    try {
      payload = jwt.verify(m[1], config.jwtSecret);
    } catch {
      throw unauthorized('Sessão inválida. Entre novamente.');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user || user.deletedAt) throw unauthorized('Conta não encontrada.');
    if (user.bannedUntil && user.bannedUntil.getTime() > Date.now()) {
      throw forbidden(`Conta suspensa até ${user.bannedUntil.toLocaleString('pt-BR', { timeZone: config.tz })}.`);
    }
    req.user = user;
    next();
  } catch (e) {
    res.status(e.status || 401).json({ error: e.code || 'unauthenticated', message: e.message });
  }
}

/** Middleware do painel (/api/painel): login normal (JWT) + isAdmin no banco. */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'forbidden', message: 'Acesso restrito à administração.' });
    }
    next();
  });
}

export function requireAdminKey(req, res, next) {
  if (!config.adminKey || req.headers['x-admin-key'] !== config.adminKey) {
    return res.status(403).json({ error: 'forbidden', message: 'Acesso negado.' });
  }
  next();
}
