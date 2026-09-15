/**
 * Caixa de mensagens do jogador (pedido do dono, 15/09/2026): avisos dos admins e do jogo — compra de VIP
 * aprovada, VIP/saldo dados pelo admin, presentes (convite, doação de colega, prêmio do Ranking X1) e
 * avisos gerais de atualização (um para cada jogador). Tabela `Message`; `unread` vai no /api/me e no
 * heartbeat (selo no envelope do topo). Enviar de dentro de uma transação: passe `tx`.
 */
import { prisma } from '../prisma.js';
import { badRequest, notFound } from '../lib/errors.js';

export const MESSAGE_KINDS = ['ADMIN', 'AVISO', 'COMPRA', 'PRESENTE', 'PREMIO'];
const PAGE = 30;

/** Uma mensagem para um jogador. `kind`: ADMIN (recado do admin) · AVISO (atualização geral) · COMPRA · PRESENTE · PREMIO. */
export async function sendMessage(userId, { kind = 'ADMIN', title, text, fromId = null }, db = prisma) {
  if (!MESSAGE_KINDS.includes(kind)) throw badRequest('Tipo de mensagem inválido.');
  const t = String(title ?? '').trim().slice(0, 80), body = String(text ?? '').trim().slice(0, 2000);
  if (!t || !body) throw badRequest('Título e texto são obrigatórios.');
  return db.message.create({ data: { userId, kind, title: t, text: body, fromId } });
}

/** Aviso para TODOS os jogadores vivos (uma linha por jogador, em lotes). Devolve quantos receberam. */
export async function broadcast({ title, text, fromId = null, kind = 'AVISO' }) {
  const t = String(title ?? '').trim().slice(0, 80), body = String(text ?? '').trim().slice(0, 2000);
  if (!t || !body) throw badRequest('Título e texto são obrigatórios.');
  let total = 0, cursor = 0;
  for (;;) {
    const users = await prisma.user.findMany({ where: { deletedAt: null, id: { gt: cursor } }, select: { id: true }, orderBy: { id: 'asc' }, take: 500 });
    if (!users.length) break;
    await prisma.message.createMany({ data: users.map((u) => ({ userId: u.id, kind, title: t, text: body, fromId })) });
    total += users.length;
    cursor = users[users.length - 1].id;
  }
  return total;
}

export const unreadCount = (userId, db = prisma) => db.message.count({ where: { userId, readAt: null } });

const view = (m) => ({ id: m.id, kind: m.kind, title: m.title, text: m.text, read: !!m.readAt, at: m.createdAt.getTime(), from: m.from?.nick ?? null });

export async function inboxList(userId, page = 1) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const [total, unread, rows] = await Promise.all([
    prisma.message.count({ where: { userId } }),
    unreadCount(userId),
    prisma.message.findMany({ where: { userId }, orderBy: { id: 'desc' }, skip: (p - 1) * PAGE, take: PAGE, include: { from: { select: { nick: true } } } }),
  ]);
  return { page: p, pages: Math.max(1, Math.ceil(total / PAGE)), total, unread, messages: rows.map(view) };
}

export async function markRead(userId, id) {
  const r = await prisma.message.updateMany({ where: { id: Number(id), userId, readAt: null }, data: { readAt: new Date() } });
  if (!r.count && !(await prisma.message.findFirst({ where: { id: Number(id), userId } }))) throw notFound('Mensagem não encontrada.');
  return { ok: true, unread: await unreadCount(userId) };
}

export async function markAllRead(userId) {
  await prisma.message.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { ok: true, unread: 0 };
}

/** Atalhos com o texto padrão (PT-BR). Falha aqui nunca derruba a ação principal: quem chama envolve em catch. */
export const notify = {
  purchase: (userId, { days, money, purchaseId }, db) => sendMessage(userId, { kind: 'COMPRA', title: 'Compra aprovada!', text: `Seu PIX foi confirmado: +${days} VIP guardados${money > 0 ? ` e +R$ ${money.toLocaleString('pt-BR')} de saldo` : ''} na sua conta. Obrigado por apoiar o JogaGol! (compra #${purchaseId})` }, db),
  adminVip: (userId, qtd, fromId, db) => sendMessage(userId, { kind: qtd > 0 ? 'PRESENTE' : 'ADMIN', title: qtd > 0 ? `Você recebeu ${qtd} VIP` : `${-qtd} VIP retirados`, text: qtd > 0 ? `A administração colocou ${qtd} VIP no seu banco de dias. Ative quando quiser na Loja.` : `A administração retirou ${-qtd} VIP do seu banco de dias.`, fromId }, db),
  adminMoney: (userId, qtd, fromId, db) => sendMessage(userId, { kind: qtd > 0 ? 'PRESENTE' : 'ADMIN', title: qtd > 0 ? `Você recebeu R$ ${qtd.toLocaleString('pt-BR')}` : `R$ ${(-qtd).toLocaleString('pt-BR')} retirados`, text: qtd > 0 ? `A administração adicionou R$ ${qtd.toLocaleString('pt-BR')} ao seu saldo.` : `A administração retirou R$ ${(-qtd).toLocaleString('pt-BR')} do seu saldo.`, fromId }, db),
  referralInviter: (userId, { friend, goals, vip }, db) => sendMessage(userId, { kind: 'PRESENTE', title: `+${vip} VIP pelo convite`, text: `${friend} chegou a ${goals} gols na carreira e você ganhou ${vip} VIP no banco de dias. Convide mais amigos no Perfil!` }, db),
  referralInvitee: (userId, { inviter, goals, vip }, db) => sendMessage(userId, { kind: 'PRESENTE', title: `+${vip} VIP: ${goals} gols!`, text: `Você entrou pelo convite de ${inviter} e chegou a ${goals} gols na carreira: ${vip} VIP no seu banco de dias. Continue marcando — tem mais nos próximos marcos.` }, db),
  gift: (userId, { from, days }, db) => sendMessage(userId, { kind: 'PRESENTE', title: `${from} mandou ${days} VIP`, text: `${from}, seu colega de time, doou ${days} VIP para você. Já está no seu banco de dias.` }, db),
  x1Prize: (userId, { label, pos, money, vip }, db) => sendMessage(userId, { kind: 'PREMIO', title: `${pos}º do Ranking X1 da ${label}`, text: `Você ficou em ${pos}º no Ranking X1 da ${label} e ganhou ${[money > 0 ? `R$ ${money.toLocaleString('pt-BR')}` : null, vip > 0 ? `${vip} VIP` : null].filter(Boolean).join(' + ')}. Parabéns!` }, db),
};
