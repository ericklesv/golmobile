/**
 * Conta do jogador — exigências da Play Store (14/09/2026):
 *   DELETE /api/account {password}        → exclui a conta (anonimiza; ver deleteAccount)
 *   GET    /api/account/blocks            → quem eu bloqueei [{id, nick}]
 *   POST   /api/account/blocks/:nick      → bloquear (as mensagens dele somem do MEU chat)
 *   DELETE /api/account/blocks/:nick      → desbloquear
 *   POST   /api/account/reports {nick, messageId?, reason, details?} → denunciar jogador/mensagem
 * A página pública que explica a exclusão é /excluir-conta (web); a política, /privacidade.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { handle, badRequest, notFound, GameError } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { leaveClub, closeOffer } from '../services/club.js';
import { removeOld } from './uploads.js';
import { tg } from '../lib/telegram.js';

export const account = Router();
account.use(requireAuth);

export const REPORT_REASONS = ['ofensa', 'spam', 'golpe', 'nick', 'foto', 'outro'];
const REPORTS_PER_DAY = 20;

async function findByNick(nick) {
  const u = await prisma.user.findUnique({ where: { nickLower: String(nick || '').toLowerCase() } });
  if (!u || u.deletedAt) throw notFound('Jogador não encontrado.');
  return u;
}

/**
 * Exclusão de conta. O jogador some do jogo, mas os GOLS que ele fez ficam no placar dos times e nos
 * fechamentos já feitos (são resultado de partida, não dado pessoal). A linha em User é ANONIMIZADA:
 * nick "excluido-<id>", e-mail/senha inutilizados, foto (arquivo também), bio, cor, IP apagados;
 * mensagens do chat e denúncias feitas por ele apagadas; lances do feed sem o nick; cargo, propostas
 * e bloqueios encerrados (VIP das propostas volta a quem propôs). Compras de VIP (VipPurchase) ficam
 * por obrigação fiscal — sem dado pessoal, só o id. Não dá para desfazer.
 */
export async function deleteAccount(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || u.deletedAt) throw notFound('Conta não encontrada.');
  const anon = `excluido-${u.id}`;
  await prisma.$transaction(async (tx) => {
    await leaveClub(tx, u.id); // cargo + propostas que ELE fez
    const got = await tx.transferOffer.findMany({ where: { toUserId: u.id, status: 'PENDING' } });
    for (const o of got) await closeOffer(tx, o, 'CANCELED'); // propostas RECEBIDAS: o VIP volta ao presidente/diretor
    await tx.chatMessage.deleteMany({ where: { userId: u.id } });
    await tx.report.deleteMany({ where: { reporterId: u.id } });
    await tx.userBlock.deleteMany({ where: { OR: [{ userId: u.id }, { blockedId: u.id }] } });
    await tx.passwordReset.deleteMany({ where: { userId: u.id } });
    await tx.userItem.deleteMany({ where: { userId: u.id } });
    await tx.$executeRaw`UPDATE "Activity" SET "text" = replace("text", ${u.nick}, 'Jogador excluído') WHERE "userId" = ${u.id}`;
    await tx.user.update({
      where: { id: u.id },
      data: {
        nick: anon, nickLower: anon, email: `${anon}@excluido.jogagol.com.br`, passwordHash: '!', // "!" nunca bate no bcrypt
        bio: null, avatarUrl: null, nickColor: null, lastIp: null, lastIpAt: null, refCode: null, trailState: null,
        money: 0, dexterity: 0, vipDays: 0, vipUntil: null, contractUntil: null, // economia some junto
        skillAim: 0, skillShot: 0, skillCd: 0, skillLuck: 0, skillPoints: 0, ballNext: null, ballLeft: null, // habilidades e bolas especiais
        avisosVistos: null,
        lastSeenAt: new Date(0), // some de "online"/"ativos" sem mexer nas consultas
        deletedAt: new Date(),
      },
    });
  }, { timeout: 30_000 });
  removeOld(u.avatarUrl);
  console.log(`[conta] ${u.nick} (#${u.id}) excluiu a conta`);
  tg.info(`🗑️ Conta excluída pelo jogador: <b>${tg.esc(u.nick)}</b> (#${u.id})`);
  return { ok: true };
}

account.delete('/', handle(async (req) => {
  const password = String(req.body?.password ?? '');
  if (!password) throw badRequest('Digite sua senha para confirmar.');
  if (!(await bcrypt.compare(password, req.user.passwordHash))) throw new GameError(401, 'bad-credentials', 'Senha incorreta.');
  return deleteAccount(req.user.id);
}));

// ─── Bloqueios ───────────────────────────────────────────────────────────────
account.get('/blocks', handle(async (req) => {
  const rows = await prisma.userBlock.findMany({ where: { userId: req.user.id }, include: { blocked: { select: { id: true, nick: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' } });
  return rows.map((r) => ({ id: r.blocked.id, nick: r.blocked.nick, avatarUrl: r.blocked.avatarUrl ?? null, at: r.createdAt }));
}));

account.post('/blocks/:nick', handle(async (req) => {
  const target = await findByNick(req.params.nick);
  if (target.id === req.user.id) throw badRequest('Você não pode bloquear a si mesmo.');
  await prisma.userBlock.upsert({ where: { userId_blockedId: { userId: req.user.id, blockedId: target.id } }, create: { userId: req.user.id, blockedId: target.id }, update: {} });
  return { ok: true, blocked: true, nick: target.nick };
}));

account.delete('/blocks/:nick', handle(async (req) => {
  const target = await findByNick(req.params.nick);
  await prisma.userBlock.deleteMany({ where: { userId: req.user.id, blockedId: target.id } });
  return { ok: true, blocked: false, nick: target.nick };
}));

// ─── Denúncias ───────────────────────────────────────────────────────────────
const reportSchema = z.object({
  nick: z.string().trim().min(1, 'Informe o jogador.'),
  messageId: z.number().int().positive().optional(),
  reason: z.enum(REPORT_REASONS, { message: 'Motivo inválido.' }),
  details: z.string().trim().max(300, 'Máximo de 300 caracteres.').optional(),
});

account.post('/reports', handle(async (req) => {
  const body = reportSchema.parse(req.body);
  const target = await findByNick(body.nick);
  if (target.id === req.user.id) throw badRequest('Você não pode denunciar a si mesmo.');
  const today = await prisma.report.count({ where: { reporterId: req.user.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
  if (today >= REPORTS_PER_DAY) throw new GameError(429, 'slow-down', 'Você já fez muitas denúncias hoje. Tente amanhã.');
  let messageText = null;
  if (body.messageId) {
    const m = await prisma.chatMessage.findUnique({ where: { id: body.messageId } });
    if (!m || m.userId !== target.id) throw badRequest('Mensagem não encontrada.');
    messageText = m.text;
  }
  const dup = await prisma.report.findFirst({ where: { reporterId: req.user.id, targetId: target.id, status: 'OPEN', ...(body.messageId ? { messageId: body.messageId } : {}) } });
  if (dup) return { ok: true, id: dup.id, repeated: true };
  const r = await prisma.report.create({ data: { reporterId: req.user.id, targetId: target.id, messageId: body.messageId ?? null, messageText, reason: body.reason, details: body.details || null } });
  console.log(`[denuncia] #${r.id} ${req.user.nick} → ${target.nick} (${body.reason}${body.messageId ? `, msg ${body.messageId}` : ''})`);
  tg.warn(`🚩 Denúncia #${r.id}: <b>${tg.esc(req.user.nick)}</b> denunciou <b>${tg.esc(target.nick)}</b> (${tg.esc(body.reason)})${messageText ? `: “${tg.esc(messageText.slice(0, 120))}”` : ''}${body.details ? ` — ${tg.esc(body.details.slice(0, 120))}` : ''} · painel → Denúncias`);
  return { ok: true, id: r.id, repeated: false };
}));
