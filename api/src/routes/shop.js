import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { shopView, buy, equip, changeNick, changeNickColor, changeTeam } from '../services/shop.js';
import { buySkill } from '../services/skills.js';

/**
 * Loja: GET /api/shop (catálogo + meus itens + histórico) ·
 * POST /api/shop/buy {key, currency:'money'|'vip'} · POST /api/shop/equip {key} (chuteira) ·
 * POST /api/shop/nick {nick} · POST /api/shop/nick-color {color|null} · POST /api/shop/team {teamSlug, currency}
 * POST /api/shop/skill {key:'AIM'|'SHOT', currency:'point'|'money'|'vip'} (habilidades — services/skills.js)
 */
export const shop = Router();
shop.use(requireAuth);

shop.get('/', handle((req) => shopView(req.user.id)));
shop.post('/buy', handle((req) => buy(req.user.id, req.body?.key, req.body?.currency || 'money')));
shop.post('/equip', handle((req) => equip(req.user.id, req.body?.key)));
shop.post('/nick', handle((req) => changeNick(req.user.id, req.body?.nick)));
shop.post('/nick-color', handle((req) => changeNickColor(req.user.id, req.body?.color ?? null)));
shop.post('/team', handle((req) => changeTeam(req.user.id, req.body?.teamSlug, req.body?.currency || 'money')));
shop.post('/skill', handle((req) => buySkill(req.user.id, req.body?.key, req.body?.currency || 'point')));
