/**
 * Painel de admin (/api/painel) — SÓ usuários com isAdmin no banco (ericklesv e
 * MVGIC, marcados pela migração 0015). Diferente de /api/admin (x-admin-key,
 * uso via curl), aqui é o painel visual do jogo: listar/buscar/editar
 * jogadores, dar gols e exp de verdade, ver IP + geolocalização e banir.
 * TODA ação fica registrada na tabela AdminAction (GET /api/painel/log).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { handle, badRequest, notFound, GameError } from '../lib/errors.js';
import { requireAdmin } from '../lib/auth.js';
import { levelOf, levelPoints, isVip, MONEY, DEXTERITY_MAX } from '../lib/rules.js';
import { NICK_RULE, NICK_COLORS } from '../lib/items.js';
import { teamView } from '../services/view.js';
import { applyResult, loadUser } from '../services/play.js';
import { liveMatchForTeam } from '../services/league.js';
import { geoForIp } from '../lib/ip.js';

export const adminPanel = Router();
adminPanel.use(requireAdmin);

const PAGE = 50;

function rowView(u, now = Date.now()) {
  const level = levelOf(u);
  return {
    id: u.id, nick: u.nick, email: u.email, avatarUrl: u.avatarUrl ?? null, nickColor: u.nickColor ?? null,
    team: teamView(u.team), level: { lvl: level.lvl, name: level.name }, levelPoints: levelPoints(u),
    goalsTotal: u.goalsTotal, money: u.money, vip: isVip(u, now), vipDays: u.vipDays,
    banned: !!(u.bannedUntil && new Date(u.bannedUntil).getTime() > now), bannedUntil: u.bannedUntil,
    isAdmin: u.isAdmin, lastSeenAt: u.lastSeenAt,
    online: new Date(u.lastSeenAt).getTime() > now - 2 * 60_000,
  };
}

function detailView(u, geo, now = Date.now()) {
  return {
    ...rowView(u, now),
    gender: u.gender, bio: u.bio ?? null, createdAt: u.createdAt,
    dexterity: u.dexterity, levelBonus: u.levelBonus ?? 0, vipUntil: u.vipUntil,
    conn: { ip: u.lastIp ?? null, at: u.lastIpAt ?? null, geo }, // geo null = sem dados
  };
}

async function fullUser(id) {
  if (!Number.isInteger(id) || id < 1) throw badRequest('Id inválido.');
  const u = await prisma.user.findUnique({ where: { id }, include: { team: true } });
  if (!u) throw notFound('Jogador não encontrado.');
  return u;
}

/** Auditoria: toda ação do painel entra em AdminAction. */
function audit(adminId, targetId, action, payload) {
  return prisma.adminAction.create({ data: { adminId, targetId, action, payload } });
}

// ─── Lista/busca paginada (50 por página) ───────────────────────────────────
adminPanel.get('/users', handle(async (req) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const where = q ? { OR: [{ nickLower: { contains: q } }, { email: { contains: q } }] } : {};
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, include: { team: true }, orderBy: { lastSeenAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE }),
  ]);
  return { page, pages: Math.max(1, Math.ceil(total / PAGE)), total, users: users.map((u) => rowView(u)) };
}));

// ─── Detalhe completo + IP + geolocalização ─────────────────────────────────
adminPanel.get('/users/:id', handle(async (req) => {
  const u = await fullUser(Number(req.params.id));
  const geo = await geoForIp(u.lastIp);
  return detailView(u, geo);
}));

// ─── Editar perfil ──────────────────────────────────────────────────────────
const patchSchema = z.object({
  nick: z.string().trim().regex(NICK_RULE, 'Nick: 3 a 14 caracteres (letras, números, _ . -).').optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').optional(),
  bio: z.string().max(400, 'Texto pessoal: máximo de 400 caracteres.').nullable().optional(),
  money: z.number().int().min(0).max(1_000_000_000).optional(),
  vipDays: z.number().int().min(0).max(100_000).optional(),
  dexterity: z.number().int().min(0).max(DEXTERITY_MAX).optional(),
  nickColor: z.string().nullable().optional(),
  teamSlug: z.string().min(1).optional(),
  /** Horas de banimento: > 0 bane a partir de agora; 0 desbane. */
  banHours: z.number().min(0).max(24 * 365).optional(),
});

adminPanel.patch('/users/:id', handle(async (req) => {
  const id = Number(req.params.id);
  const u = await fullUser(id);
  const body = patchSchema.parse(req.body ?? {});
  const data = {};
  const changed = {};

  if (body.nick !== undefined && body.nick !== u.nick) {
    const nickLower = body.nick.toLowerCase();
    const clash = await prisma.user.findUnique({ where: { nickLower } });
    if (clash && clash.id !== id) throw new GameError(409, 'taken', 'Esse nick já está em uso.');
    data.nick = body.nick; data.nickLower = nickLower; changed.nick = { de: u.nick, para: body.nick };
  }
  if (body.email !== undefined && body.email !== u.email) {
    const clash = await prisma.user.findUnique({ where: { email: body.email } });
    if (clash && clash.id !== id) throw new GameError(409, 'taken', 'Esse e-mail já está cadastrado.');
    data.email = body.email; changed.email = { de: u.email, para: body.email };
  }
  if (body.bio !== undefined && (body.bio ?? null) !== (u.bio ?? null)) { data.bio = body.bio; changed.bio = true; }
  if (body.money !== undefined && body.money !== u.money) { data.money = body.money; changed.money = { de: u.money, para: body.money }; }
  if (body.vipDays !== undefined && body.vipDays !== u.vipDays) { data.vipDays = body.vipDays; changed.vipDays = { de: u.vipDays, para: body.vipDays }; }
  if (body.dexterity !== undefined && body.dexterity !== u.dexterity) { data.dexterity = body.dexterity; changed.dexterity = { de: u.dexterity, para: body.dexterity }; }
  if (body.nickColor !== undefined && (body.nickColor ?? null) !== (u.nickColor ?? null)) {
    if (body.nickColor !== null && !NICK_COLORS.some((c) => c.key === body.nickColor)) throw badRequest('Cor de nick inválida.');
    data.nickColor = body.nickColor; changed.nickColor = { de: u.nickColor ?? null, para: body.nickColor };
  }
  if (body.teamSlug !== undefined) {
    const team = await prisma.team.findUnique({ where: { slug: body.teamSlug } });
    if (!team) throw badRequest('Time inválido.');
    if (team.id !== u.teamId) {
      // igual ao /api/me/change-team: zera contadores de rodada (gols feitos ficam com o time antigo)
      data.teamId = team.id; data.goalsRound = 0; data.roundId = null;
      changed.time = { de: u.team?.slug ?? null, para: team.slug };
    }
  }
  if (body.banHours !== undefined) {
    if (body.banHours > 0) {
      data.bannedUntil = new Date(Date.now() + body.banHours * 3600_000);
      changed.banir = { horas: body.banHours, ate: data.bannedUntil };
    } else if (u.bannedUntil) {
      data.bannedUntil = null;
      changed.desbanir = true;
    }
  }

  if (Object.keys(data).length === 0) throw badRequest('Nada para alterar.');
  const updated = await prisma.user.update({ where: { id }, data, include: { team: true } });
  await audit(req.user.id, id, changed.banir ? 'banir' : changed.desbanir ? 'desbanir' : 'editar', changed);
  return detailView(updated, await geoForIp(updated.lastIp));
}));

// ─── Gols de verdade (placar da partida/rodada + artilharias, kind AUTO) ────
const GOL_PHRASES = ['mandou de primeira', 'bateu cruzado e marcou', 'chute direto certeiro'];

adminPanel.post('/users/:id/gols', handle(async (req) => {
  const id = Number(req.params.id);
  const qtd = Math.floor(Number(req.body?.qtd));
  if (!Number.isFinite(qtd) || qtd < 1 || qtd > 100) throw badRequest('Quantidade de gols: 1 a 100 por chamada.');
  await fullUser(id); // 404 antes de abrir a transação
  const result = await prisma.$transaction(async (tx) => {
    let match = null;
    let text = null;
    for (let i = 0; i < qtd; i++) {
      // recarrega a cada gol: applyResult usa goalsTotal/hourKey/roundId atuais do jogador
      const user = await loadUser(tx, id);
      if (!match) match = await liveMatchForTeam(user.teamId, tx);
      const phrase = GOL_PHRASES[Math.floor(Math.random() * GOL_PHRASES.length)];
      ({ text, match } = await applyResult(tx, user, { kind: 'AUTO', goal: true, now: new Date(), match, phrase, money: MONEY.AUTO }));
    }
    const u = await tx.user.findUnique({ where: { id }, include: { team: true } });
    return { user: u, text };
  }, { timeout: 60_000 });
  await audit(req.user.id, id, 'gols', { qtd });
  return { ok: true, qtd, user: rowView(result.user), text: result.text };
}));

// ─── Exp (pontos de nível): soma levelBonus — nível = goalsTotal + levelBonus ─
adminPanel.post('/users/:id/exp', handle(async (req) => {
  const id = Number(req.params.id);
  const qtd = Math.floor(Number(req.body?.qtd));
  if (!Number.isFinite(qtd) || qtd < 1 || qtd > 100_000) throw badRequest('Quantidade de exp: 1 a 100.000 por chamada.');
  await fullUser(id);
  const u = await prisma.user.update({ where: { id }, data: { levelBonus: { increment: qtd } }, include: { team: true } });
  await audit(req.user.id, id, 'exp', { qtd });
  return { ok: true, qtd, user: rowView(u) };
}));

// ─── Log de auditoria ───────────────────────────────────────────────────────
adminPanel.get('/log', handle(async (req) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const [total, rows] = await Promise.all([
    prisma.adminAction.count(),
    prisma.adminAction.findMany({
      orderBy: { id: 'desc' }, skip: (page - 1) * PAGE, take: PAGE,
      include: { admin: { select: { nick: true } }, target: { select: { nick: true, avatarUrl: true } } },
    }),
  ]);
  return {
    page, pages: Math.max(1, Math.ceil(total / PAGE)), total,
    rows: rows.map((r) => ({
      id: r.id, admin: r.admin.nick, target: r.target?.nick ?? null, targetAvatar: r.target?.avatarUrl ?? null,
      action: r.action, payload: r.payload ?? null, at: r.createdAt,
    })),
  };
}));
