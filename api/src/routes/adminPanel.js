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
import { teamView, nickFadeOf } from '../services/view.js';
import { applyResult, loadUser } from '../services/play.js';
import { liveMatchForTeam } from '../services/league.js';
import { geoForIp } from '../lib/ip.js';
import { leaveClub } from '../services/club.js';
import { tg } from '../lib/telegram.js';

export const adminPanel = Router();
adminPanel.use(requireAdmin);

const PAGE = 50;

function rowView(u, now = Date.now()) {
  const level = levelOf(u);
  return {
    id: u.id, nick: u.nick, email: u.email, avatarUrl: u.avatarUrl ?? null, nickColor: u.nickColor ?? null, nickFade: nickFadeOf(u, now),
    team: teamView(u.team), level: { lvl: level.lvl, name: level.name }, levelPoints: levelPoints(u),
    goalsTotal: u.goalsTotal, money: u.money, vip: isVip(u, now), vipDays: u.vipDays,
    banned: !!(u.bannedUntil && new Date(u.bannedUntil).getTime() > now), bannedUntil: u.bannedUntil,
    isAdmin: u.isAdmin, lastSeenAt: u.lastSeenAt, createdAt: u.createdAt,
    invitedBy: u.referredBy?.nick ?? null, // entrou pelo link de convite de alguém (services/referral.js)
    createdIp: u.createdIp ?? null, // IP do cadastro (segurança: contas em massa)
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
async function audit(adminId, targetId, action, payload) {
  const row = await prisma.adminAction.create({ data: { adminId, targetId, action, payload }, include: { admin: { select: { nick: true } }, target: { select: { nick: true } } } });
  tg.info(`🛡️ Painel: <b>${tg.esc(row.admin.nick)}</b> → ${tg.esc(action)} ${row.target ? `<b>${tg.esc(row.target.nick)}</b>` : ''} <code>${tg.esc(JSON.stringify(payload ?? {}).slice(0, 200))}</code>`);
  return row;
}

// ─── Lista/busca paginada (50 por página) ───────────────────────────────────
// order=criadas: contas mais novas primeiro (aba "Contas criadas"); padrão: quem entrou por último.
adminPanel.get('/users', handle(async (req) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const orderBy = req.query.order === 'criadas' ? [{ createdAt: 'desc' }, { id: 'desc' }] : { lastSeenAt: 'desc' };
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const where = q ? { OR: [{ nickLower: { contains: q } }, { email: { contains: q } }] } : {};
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, include: { team: true, referredBy: { select: { nick: true } } }, orderBy, skip: (page - 1) * PAGE, take: PAGE }),
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
      data.teamId = team.id; data.goalsRound = 0; data.roundId = null; data.contractUntil = null; // admin passa por cima do contrato
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
  if (data.teamId) await prisma.$transaction((tx) => leaveClub(tx, id)); // mudou de time: sai da diretoria
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

// ─── FutPrego: histórico dos confrontos (pedido do dono, 15/09/2026) ────────
// GET /api/painel/futprego?page= — toda partida de verdade (contra bot não grava), a mais recente
// primeiro, com data/hora, os dois jogadores e times, vencedor, motivo, jogadas, aposta, se o gol contou
// e de qual time saiu 1 gol. `sameIp` = os dois na mesma internet (conta falsa jogando contra si mesma).
adminPanel.get('/futprego', handle(async (req) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const [total, rows] = await Promise.all([
    prisma.futPregoMatch.count(),
    prisma.futPregoMatch.findMany({ orderBy: { id: 'desc' }, skip: (page - 1) * PAGE, take: PAGE }),
  ]);
  // FutPregoMatch guarda só ids (sem relação no schema): busca jogadores e times de uma vez
  const userIds = [...new Set(rows.flatMap((m) => [m.aId, m.bId, m.winnerId].filter(Boolean)))];
  const teamIds = [...new Set(rows.flatMap((m) => [m.aTeamId, m.bTeamId, m.lostTeamId].filter(Boolean)))];
  const [users, teams] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nick: true, avatarUrl: true, nickColor: true, deletedAt: true } }) : [],
    teamIds.length ? prisma.team.findMany({ where: { id: { in: teamIds } } }) : [],
  ]);
  const U = new Map(users.map((u) => [u.id, u])), T = new Map(teams.map((t) => [t.id, t]));
  const player = (id, teamId) => { const u = U.get(id); return { id, nick: u?.nick ?? `#${id}`, avatarUrl: u?.avatarUrl ?? null, nickColor: u?.nickColor ?? null, deleted: !!u?.deletedAt, team: teamView(T.get(teamId)) }; };
  return {
    page, pages: Math.max(1, Math.ceil(total / PAGE)), total,
    rows: rows.map((m) => ({
      id: m.id, at: m.createdAt, finishedAt: m.finishedAt, status: m.status, reason: m.reason, turns: m.turns, bet: m.bet,
      a: player(m.aId, m.aTeamId), b: player(m.bId, m.bTeamId),
      winnerId: m.winnerId, goalAwarded: m.goalAwarded, lostTeam: teamView(T.get(m.lostTeamId)), sameIp: !!m.aIp && m.aIp === m.bIp,
    })),
  };
}));

// ─── Denúncias (política de conteúdo gerado por usuário da Play Store) ──────
// GET /api/painel/denuncias?status=OPEN|RESOLVED&page= · POST /api/painel/denuncias/:id/resolver
// {acao: 'ignorar'|'apagar'|'banir', horas?} — apagar = remove a mensagem denunciada; banir = suspende
// o denunciado por `horas` (padrão 24 h) e apaga a mensagem também. Tudo entra no log (AdminAction).
const reportView = (r) => ({
  id: r.id, reason: r.reason, details: r.details ?? null, messageId: r.messageId ?? null, messageText: r.messageText ?? null,
  status: r.status, resolution: r.resolution ?? null, resolvedAt: r.resolvedAt ?? null, at: r.createdAt,
  reporter: { id: r.reporter.id, nick: r.reporter.nick },
  target: { id: r.target.id, nick: r.target.nick, avatarUrl: r.target.avatarUrl ?? null, banned: !!(r.target.bannedUntil && r.target.bannedUntil.getTime() > Date.now()), deleted: !!r.target.deletedAt },
});

adminPanel.get('/denuncias', handle(async (req) => {
  const status = req.query.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN';
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const sel = { reporter: { select: { id: true, nick: true } }, target: { select: { id: true, nick: true, avatarUrl: true, bannedUntil: true, deletedAt: true } } };
  const [total, open, rows] = await Promise.all([
    prisma.report.count({ where: { status } }),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.report.findMany({ where: { status }, orderBy: { id: 'desc' }, skip: (page - 1) * PAGE, take: PAGE, include: sel }),
  ]);
  return { status, page, pages: Math.max(1, Math.ceil(total / PAGE)), total, open, rows: rows.map(reportView) };
}));

adminPanel.post('/denuncias/:id/resolver', handle(async (req) => {
  const id = Number(req.params.id);
  const acao = String(req.body?.acao || '');
  if (!['ignorar', 'apagar', 'banir'].includes(acao)) throw badRequest('Ação inválida.');
  const horas = Math.max(1, Math.min(24 * 365, Math.floor(Number(req.body?.horas) || 24)));
  const r = await prisma.report.findUnique({ where: { id }, include: { target: true } });
  if (!r) throw notFound('Denúncia não encontrada.');
  if (r.status !== 'OPEN') throw badRequest('Essa denúncia já foi resolvida.');
  await prisma.$transaction(async (tx) => {
    if (acao !== 'ignorar' && r.messageId) await tx.chatMessage.deleteMany({ where: { id: r.messageId } });
    if (acao === 'banir') await tx.user.update({ where: { id: r.targetId }, data: { bannedUntil: new Date(Date.now() + horas * 3600_000) } });
    // as outras denúncias abertas contra a mesma pessoa/mensagem fecham junto
    await tx.report.updateMany({
      where: { status: 'OPEN', OR: [{ id }, ...(r.messageId ? [{ messageId: r.messageId }] : []), ...(acao === 'banir' ? [{ targetId: r.targetId }] : [])] },
      data: { status: 'RESOLVED', resolution: acao, resolvedById: req.user.id, resolvedAt: new Date() },
    });
  });
  await audit(req.user.id, r.targetId, 'denuncia', { id, acao, ...(acao === 'banir' ? { horas } : {}), ...(r.messageId ? { messageId: r.messageId } : {}) });
  return { ok: true };
}));
