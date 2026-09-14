import { Router } from 'express';
import { handle, GameError } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { vipState, vipBuy, vipPurchaseStatus, vipWebhook, vipTestPay } from '../services/vip.js';

/** VIP pago (PIX na Efí): GET /api/vip · POST /api/vip/buy {pack} · GET /api/vip/purchases/:id */
export const vip = Router();
vip.use(requireAuth);
vip.get('/', handle((req) => vipState(req.user.id)));
vip.post('/buy', handle((req) => vipBuy(req.user.id, String(req.body?.pack ?? ''))));
vip.get('/purchases/:id', handle((req) => vipPurchaseStatus(req.user.id, req.params.id)));
vip.post('/purchases/:id/test-pay', handle((req) => vipTestPay(req.user.id, req.params.id))); // só com EFI_FAKE=1

/**
 * Aviso de PIX da Efí: POST /api/pay/efi/<EFI_WEBHOOK_SECRET> (a Efí acrescenta "/pix"). Sem login:
 * o segredo na URL tira o barulho, e a conferência na API da Efí é que garante — o aviso sozinho não credita.
 */
export const pay = Router();
const efiHook = handle(async (req) => {
  const secret = process.env.EFI_WEBHOOK_SECRET;
  if (!secret || req.params.secret !== secret) throw new GameError(404, 'not-found', 'Rota não encontrada.');
  return vipWebhook(req.body);
});
pay.post('/efi/:secret', efiHook);
pay.post('/efi/:secret/pix', efiHook);
