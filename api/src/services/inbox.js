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
/** Ícones que uma mensagem pode ter na lista (os mesmos tokens de [vip], [coin]… do texto — MsgText.tsx no front). */
export const MESSAGE_ICONS = {
  vip: '/ui/ico-crown_silver.png', coin: '/ui/ico-coin01_s.png', dinheiro: '/ui/ico-goldpouch.png', gol: '/ui/ico-ball.png',
  trofeu: '/ui/ico-trophy_gold.png', medalha: '/ui/ico-medal_gold.png', estrela: '/ui/ico-star_gold.png', presente: '/ui/ico-gift_purple.png',
  caveira: '/ui/ico-skull_gold.png', energia: '/ui/ico-energy.png', alvo: '/ui/ico-target.png', aviso: '/ui/pi-bell.png',
  whatsapp: '/ui/ico-whatsapp.png',
};
const iconOf = (icon) => (icon ? (MESSAGE_ICONS[icon] ?? (String(icon).startsWith('/ui/') ? icon : null)) : null);

export async function sendMessage(userId, { kind = 'ADMIN', title, text, fromId = null, icon = null }, db = prisma) {
  if (!MESSAGE_KINDS.includes(kind)) throw badRequest('Tipo de mensagem inválido.');
  const t = String(title ?? '').trim().slice(0, 80), body = String(text ?? '').trim().slice(0, 4000);
  if (!t || !body) throw badRequest('Título e texto são obrigatórios.');
  return db.message.create({ data: { userId, kind, title: t, text: body, fromId, icon: iconOf(icon) } });
}

/** Aviso para TODOS os jogadores vivos (uma linha por jogador, em lotes). Devolve quantos receberam. */
export async function broadcast({ title, text, fromId = null, kind = 'AVISO', icon = null }) {
  const t = String(title ?? '').trim().slice(0, 80), body = String(text ?? '').trim().slice(0, 4000);
  if (!t || !body) throw badRequest('Título e texto são obrigatórios.');
  const ic = iconOf(icon);
  let total = 0, cursor = 0;
  for (;;) {
    const users = await prisma.user.findMany({ where: { deletedAt: null, id: { gt: cursor } }, select: { id: true }, orderBy: { id: 'asc' }, take: 500 });
    if (!users.length) break;
    await prisma.message.createMany({ data: users.map((u) => ({ userId: u.id, kind, title: t, text: body, fromId, icon: ic })) });
    total += users.length;
    cursor = users[users.length - 1].id;
  }
  return total;
}

export const unreadCount = (userId, db = prisma) => db.message.count({ where: { userId, readAt: null } });

const view = (m) => ({ id: m.id, kind: m.kind, icon: m.icon ?? null, title: m.title, text: m.text, read: !!m.readAt, at: m.createdAt.getTime(), from: m.from?.nick ?? null });

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
  purchase: (userId, { days, money, purchaseId }, db) => sendMessage(userId, { kind: 'COMPRA', icon: 'vip', title: 'Compra aprovada!', text: `Seu PIX foi confirmado: [vip] +${days} VIP guardados${money > 0 ? ` e [coin] +R$ ${money.toLocaleString('pt-BR')} de saldo` : ''} na sua conta. Obrigado por apoiar o JogaGol! (compra #${purchaseId})` }, db),
  adminVip: (userId, qtd, fromId, db) => sendMessage(userId, { kind: qtd > 0 ? 'PRESENTE' : 'ADMIN', icon: 'vip', title: qtd > 0 ? `Você recebeu ${qtd} VIP` : `${-qtd} VIP retirados`, text: qtd > 0 ? `A administração colocou [vip] ${qtd} VIP no seu banco de dias. Ative quando quiser na Loja.` : `A administração retirou [vip] ${-qtd} VIP do seu banco de dias.`, fromId }, db),
  adminMoney: (userId, qtd, fromId, db) => sendMessage(userId, { kind: qtd > 0 ? 'PRESENTE' : 'ADMIN', icon: 'coin', title: qtd > 0 ? `Você recebeu R$ ${qtd.toLocaleString('pt-BR')}` : `R$ ${(-qtd).toLocaleString('pt-BR')} retirados`, text: qtd > 0 ? `A administração adicionou [coin] R$ ${qtd.toLocaleString('pt-BR')} ao seu saldo.` : `A administração retirou [coin] R$ ${(-qtd).toLocaleString('pt-BR')} do seu saldo.`, fromId }, db),
  referralInviter: (userId, { friend, goals, vip }, db) => sendMessage(userId, { kind: 'PRESENTE', icon: 'presente', title: `+${vip} VIP pelo convite`, text: `${friend} chegou a [gol] ${goals} gols na carreira e você ganhou [vip] ${vip} VIP no banco de dias. Convide mais amigos no Perfil!` }, db),
  referralInvitee: (userId, { inviter, goals, vip }, db) => sendMessage(userId, { kind: 'PRESENTE', icon: 'presente', title: `+${vip} VIP: ${goals} gols!`, text: `Você entrou pelo convite de ${inviter} e chegou a [gol] ${goals} gols na carreira: [vip] ${vip} VIP no seu banco de dias. Continue marcando — tem mais nos próximos marcos.` }, db),
  // VIP de doação chega JÁ ATIVO (club.js activateVip) — `until` = até quando o VIP vai agora
  gift: (userId, { from, days, until }, db) => sendMessage(userId, { kind: 'PRESENTE', icon: 'vip', title: `${from} mandou ${days} VIP`, text: `${from}, seu colega de time, doou [vip] ${days} VIP para você, e ele já começou a contar${until ? `: seu VIP agora vai até ${new Date(until).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })} às ${new Date(until).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}` : ''}. Aproveite no time!` }, db),
  x1Prize: (userId, { label, pos, money, vip }, db) => sendMessage(userId, { kind: 'PREMIO', icon: 'caveira', title: `${pos}º do Ranking X1 da ${label}`, text: `[caveira] Você ficou em ${pos}º no Ranking X1 da ${label} e ganhou ${[money > 0 ? `[coin] R$ ${money.toLocaleString('pt-BR')}` : null, vip > 0 ? `[vip] ${vip} VIP` : null].filter(Boolean).join(' + ')}. Parabéns!` }, db),
};
