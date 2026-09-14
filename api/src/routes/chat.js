/**
 * Chat — salas "geral" (todo mundo) e "time" (só a torcida do time do jogador).
 * Polling: GET devolve as últimas 60 (ou só as novas com ?after=<id>).
 * "Mensagem com cores" é a habilidade do nível 8 (Titular) — abaixo disso a cor é ignorada.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { handle, badRequest, GameError } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { levelOf, isVip } from '../lib/rules.js';
import { teamView } from '../services/view.js';
import { badgeLookup } from '../services/badges.js';

export const chat = Router();
chat.use(requireAuth);

export const CHAT_COLORS = ['#FF5470', '#FF8A2A', '#FFC63D', '#4CD137', '#2EA8FF', '#B388FF', '#FF6FD8'];
export const CHAT_COLOR_LEVEL = 8;
const MAX_LEN = 200;
const MIN_INTERVAL_MS = 3000;
const lastSent = new Map(); // userId -> timestamp (rate limit simples por instância)

function roomFor(user, name) {
  if (name === 'geral') return 'geral';
  if (name === 'time') return `time:${user.team?.slug ?? user.teamId}`;
  throw badRequest('Sala inválida.');
}

function view(m, mentions) {
  const lvl = levelOf(m.user);
  return {
    id: m.id, text: m.text, color: m.color, at: m.createdAt, mentions: mentionsOf(m.text, mentions),
    user: { id: m.user.id, nick: m.user.nick, avatarUrl: m.user.avatarUrl ?? null, level: lvl.lvl, levelName: lvl.name, vip: isVip(m.user), nickColor: m.user.nickColor ?? null, team: teamView(m.user.team) },
  };
}

// Menções: @nick vira link no cliente. Resolvidas aqui a cada leitura (mensagens antigas
// também funcionam). Nick permite ponto/hífen no fim, então "@fulano." testa as duas formas.
const MENTION_RE = /@([a-zA-Z0-9_.\-]{3,14})/g;

function mentionTokens(text) {
  const out = new Set();
  for (const m of text.matchAll(MENTION_RE)) {
    const t = m[1].toLowerCase();
    out.add(t);
    const stripped = t.replace(/[._\-]+$/, '');
    if (stripped.length >= 3) out.add(stripped);
  }
  return out;
}

/** Mapa nickLower -> { nick, avatarUrl } com só os usuários citados nestas mensagens. */
async function resolveMentions(texts) {
  const tokens = new Set();
  for (const t of texts) for (const tok of mentionTokens(t)) tokens.add(tok);
  if (!tokens.size) return {};
  const users = await prisma.user.findMany({
    where: { nickLower: { in: [...tokens] } },
    select: { nick: true, nickLower: true, avatarUrl: true },
  });
  return Object.fromEntries(users.map((u) => [u.nickLower, { nick: u.nick, avatarUrl: u.avatarUrl ?? null }]));
}

/** Só as menções desta mensagem (subconjunto do mapa geral), ou null se não tem nenhuma. */
function mentionsOf(text, all) {
  if (!all) return null;
  const own = {};
  for (const tok of mentionTokens(text)) if (all[tok]) own[tok] = all[tok];
  return Object.keys(own).length ? own : null;
}

const userSel = { include: { team: true } };

chat.get('/:room', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { team: true } });
  const room = roomFor(user, req.params.room);
  const after = Number(req.query.after || 0);
  // Bloqueios (UserBlock): as mensagens de quem eu bloqueei não chegam à minha tela
  const blocked = (await prisma.userBlock.findMany({ where: { userId: user.id }, select: { blockedId: true } })).map((b) => b.blockedId);
  const rows = await prisma.chatMessage.findMany({
    where: { room, ...(after ? { id: { gt: after } } : {}), ...(blocked.length ? { userId: { notIn: blocked } } : {}) },
    orderBy: { id: 'desc' }, take: 60, include: { user: userSel },
  });
  const [online, mentions] = await Promise.all([
    prisma.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 2 * 60_000) }, ...(room !== 'geral' ? { teamId: user.teamId } : {}) } }),
    resolveMentions(rows.map((r) => r.text)),
  ]);
  const look = await badgeLookup(); // P/D e top 3 de agora ao lado do nick
  return { room, messages: rows.reverse().map((m) => { const v = view(m, mentions); Object.assign(v.user, look(v.user.id)); return v; }), online, colorLevel: CHAT_COLOR_LEVEL, colors: CHAT_COLORS, canColor: levelOf(user).lvl >= CHAT_COLOR_LEVEL };
}));

const schema = z.object({ text: z.string().trim().min(1, 'Escreva algo.').max(MAX_LEN, `Máximo de ${MAX_LEN} caracteres.`), color: z.string().optional() });

chat.post('/:room', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { team: true } });
  const room = roomFor(user, req.params.room);
  const body = schema.parse(req.body);
  const now = Date.now();
  if (now - (lastSent.get(user.id) ?? 0) < MIN_INTERVAL_MS) throw new GameError(429, 'slow-down', 'Calma, craque! Espere 3 segundos entre mensagens.');
  const text = body.text.replace(/\s+/g, ' ');
  if (/(https?:\/\/|www\.)/i.test(text)) throw badRequest('Links não são permitidos no chat.');
  let color = null;
  if (body.color) {
    if (levelOf(user).lvl < CHAT_COLOR_LEVEL) throw new GameError(403, 'locked', `Mensagem com cores libera no nível ${CHAT_COLOR_LEVEL} (Titular).`);
    if (!CHAT_COLORS.includes(body.color)) throw badRequest('Cor inválida.');
    color = body.color;
  }
  lastSent.set(user.id, now);
  const m = await prisma.chatMessage.create({ data: { room, userId: user.id, text, color }, include: { user: userSel } });
  const v = view(m, await resolveMentions([m.text]));
  Object.assign(v.user, (await badgeLookup())(v.user.id));
  return v;
}));
