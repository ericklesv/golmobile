/**
 * VIP pago — pacotes de dias de VIP por PIX na Efí (decisões do dono, 13/09/2026).
 *
 * Regras de segurança (lições do Rifa Express, que já aprovou reserva sem pagamento):
 * - cada compra tem o seu txid, gravado ANTES de criar a cobrança; o QR pendente é reaproveitado,
 *   nunca regerado por cima (quem pagou o QR antigo não pode ficar sem nada);
 * - a compra só vira PAID quando a PRÓPRIA cobrança está CONCLUIDA na Efí — nunca por valor/horário;
 * - o endToEndId do PIX é único no banco: o mesmo PIX nunca credita duas vezes;
 * - o aviso da Efí (webhook) só dispara a conferência na API; ele sozinho não credita nada.
 * Confirmação por 3 caminhos: webhook, a tela perguntando (a cada 4 s) e a conferência do scheduler.
 */
import { prisma } from '../prisma.js';
import { GameError } from '../lib/errors.js';
import { VIP_PACKS, VIP_PIX, isVip } from '../lib/rules.js';
import { efiReady, efiFake, newTxid, createCharge, getCharge, fakePay } from '../lib/efi.js';

const round2 = (v) => Math.round(v * 100) / 100;
const packView = (p) => ({ key: p.key, days: p.days, price: p.price, perDay: round2(p.price / p.days), tag: p.tag ?? null });
const purchaseView = (p) => p && ({
  id: p.id, packKey: p.packKey, days: p.days, amount: p.amountCents / 100, status: p.status,
  pixCode: p.pixCode, qrImage: p.qrImage, expiresAt: p.expiresAt.getTime(), paidAt: p.paidAt ? p.paidAt.getTime() : null,
});

export async function vipState(userId) {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { vipDays: true, vipUntil: true } });
  const pending = await prisma.vipPurchase.findFirst({ where: { userId, status: 'PENDING', expiresAt: { gt: now } }, orderBy: { id: 'desc' } });
  const history = await prisma.vipPurchase.findMany({ where: { userId, status: 'PAID' }, orderBy: { id: 'desc' }, take: 10 });
  return {
    enabled: efiReady(), test: efiFake(),
    packs: VIP_PACKS.map(packView),
    vip: { active: isVip(user, now.getTime()), until: user.vipUntil ? user.vipUntil.getTime() : null, bank: user.vipDays },
    pending: purchaseView(pending),
    history: history.map(purchaseView),
  };
}

/** Gera (ou devolve o aberto do mesmo pacote) o PIX de um pacote. */
export async function vipBuy(userId, packKey) {
  const pack = VIP_PACKS.find((p) => p.key === packKey);
  if (!pack) throw new GameError(400, 'bad-pack', 'Pacote inválido.');
  if (!efiReady()) throw new GameError(503, 'pix-off', 'A compra de VIP por PIX ainda não está disponível.');
  const now = new Date();
  const open = await prisma.vipPurchase.findMany({ where: { userId, status: 'PENDING', expiresAt: { gt: now } }, orderBy: { id: 'desc' } });
  const same = open.find((p) => p.packKey === packKey && p.pixCode && p.expiresAt.getTime() - now.getTime() > 60_000);
  if (same) return { purchase: purchaseView(same) }; // reaproveita o QR aberto do mesmo pacote
  if (open.length >= VIP_PIX.maxOpen) throw new GameError(429, 'pix-many', 'Você já tem PIX em aberto. Pague um deles ou espere vencer (30 min).');
  const txid = newTxid();
  const row = await prisma.vipPurchase.create({
    data: { userId, packKey, days: pack.days, amountCents: Math.round(pack.price * 100), txid, expiresAt: new Date(now.getTime() + VIP_PIX.expiresSec * 1000) },
  });
  try {
    const ch = await createCharge({
      txid, amount: pack.price, description: `JogaGol - ${pack.days} dias de VIP`, expiresSec: VIP_PIX.expiresSec,
      info: [{ nome: 'jogo', valor: 'jogagol' }, { nome: 'compra', valor: String(row.id) }],
    });
    return { purchase: purchaseView(await prisma.vipPurchase.update({ where: { id: row.id }, data: { pixCode: ch.pixCode, qrImage: ch.qrImage } })) };
  } catch (e) {
    await prisma.vipPurchase.update({ where: { id: row.id }, data: { status: 'FAILED' } });
    console.error('[vip] cobrança Efí falhou:', e.message);
    throw new GameError(502, 'pix-error', 'Não deu para gerar o PIX agora. Tente de novo em instantes.');
  }
}

/** Credita UMA vez: só a compra ainda PENDING muda para PAID, na mesma transação que soma os dias. */
async function credit(purchase, e2eId) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.vipPurchase.updateMany({ where: { id: purchase.id, status: 'PENDING' }, data: { status: 'PAID', e2eId, paidAt: new Date() } });
    if (r.count === 1) {
      await tx.user.update({ where: { id: purchase.userId }, data: { vipDays: { increment: purchase.days } } });
      console.log(`[vip] compra ${purchase.id} paga: +${purchase.days} VIP para o jogador ${purchase.userId}`);
    }
    return tx.vipPurchase.findUnique({ where: { id: purchase.id } });
  });
}

/**
 * Confere a compra na Efí e credita se a cobrança dela está CONCLUIDA com um PIX de valor certo.
 * `force` pula o intervalo mínimo entre consultas (webhook e scheduler).
 */
export async function settlePurchase(purchase, { force = false } = {}) {
  if (!purchase || purchase.status !== 'PENDING') return purchase;
  if (!force && purchase.checkedAt && Date.now() - purchase.checkedAt.getTime() < 5000) return purchase;
  const cob = await getCharge(purchase.txid);
  await prisma.vipPurchase.update({ where: { id: purchase.id }, data: { checkedAt: new Date() } });
  if (cob.status === 'CONCLUIDA') {
    const pix = (cob.pix ?? []).find((p) => p.txid === purchase.txid) ?? (cob.pix ?? [])[0];
    const paidCents = Math.round(Number(pix?.valor ?? 0) * 100);
    if (!pix?.endToEndId || paidCents < purchase.amountCents) {
      console.error(`[vip] cobrança ${purchase.txid} concluída sem PIX válido — conferir na Efí`);
      return purchase;
    }
    return credit(purchase, pix.endToEndId);
  }
  // removida pela Efí/recebedor, ou vencida há mais de 10 min sem pagamento: encerra
  const stale = purchase.expiresAt.getTime() < Date.now() - 10 * 60_000;
  if (String(cob.status).startsWith('REMOVIDA') || (stale && cob.status === 'ATIVA')) {
    return prisma.vipPurchase.update({ where: { id: purchase.id }, data: { status: 'EXPIRED' } });
  }
  return prisma.vipPurchase.findUnique({ where: { id: purchase.id } });
}

/** A tela pergunta: "já pagou?" (só compras do próprio jogador). */
export async function vipPurchaseStatus(userId, id, force = false) {
  const p = await prisma.vipPurchase.findFirst({ where: { id: Number(id), userId } });
  if (!p) throw new GameError(404, 'not-found', 'Compra não encontrada.');
  let settled = p;
  try { settled = await settlePurchase(p, { force }); } catch (e) { console.error('[vip] consulta Efí falhou:', e.message); }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { vipDays: true } });
  return { purchase: purchaseView(settled), bank: user.vipDays };
}

/** Aviso da Efí: { pix: [{ endToEndId, txid, valor, horario }] }. Só dispara a conferência. */
export async function vipWebhook(body) {
  for (const p of Array.isArray(body?.pix) ? body.pix : []) {
    if (!p?.txid) continue;
    const purchase = await prisma.vipPurchase.findUnique({ where: { txid: String(p.txid) } });
    if (purchase) await settlePurchase(purchase, { force: true }).catch((e) => console.error('[vip] webhook:', e.message));
  }
  return { ok: true };
}

/** Conferência periódica (scheduler): compras pendentes das últimas 48 h. */
export async function vipReconcile() {
  const since = new Date(Date.now() - 48 * 3600_000);
  // os menos conferidos primeiro: com muitos PIX abertos, cada volta pega outros 25
  const pend = await prisma.vipPurchase.findMany({ where: { status: 'PENDING', createdAt: { gt: since }, pixCode: { not: null } }, orderBy: [{ checkedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }], take: 25 });
  let paid = 0;
  for (const p of pend) {
    try { if ((await settlePurchase(p, { force: true }))?.status === 'PAID') paid++; } catch (e) { console.error('[vip] reconcile:', e.message); }
  }
  // PIX que nem chegou a ter QR (falha na Efí) ou muito antigo: encerra
  await prisma.vipPurchase.updateMany({ where: { status: 'PENDING', createdAt: { lte: since } }, data: { status: 'EXPIRED' } });
  return paid;
}

/** Só no modo de teste (EFI_FAKE=1, fora de produção): simula o PIX caindo. */
export async function vipTestPay(userId, id) {
  if (!efiFake()) throw new GameError(404, 'not-found', 'Rota não encontrada.');
  const p = await prisma.vipPurchase.findFirst({ where: { id: Number(id), userId } });
  if (!p || !fakePay(p.txid)) throw new GameError(404, 'not-found', 'Compra de teste não encontrada.');
  return vipPurchaseStatus(userId, id, true);
}
