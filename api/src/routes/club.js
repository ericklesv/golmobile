import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import * as C from '../services/club.js';

/** Diretoria e contratações (services/club.js). Tudo com login; a diretoria pública vem em GET /api/teams/:slug. */
export const club = Router();
club.use(requireAuth);
club.get('/', handle((req) => C.clubState(req.user.id)));
club.get('/candidates', handle((req) => C.candidates(req.user.id)));
club.post('/claim', handle((req) => C.claimPresidency(req.user.id)));
club.post('/resign', handle((req) => C.resign(req.user.id)));
club.post('/directors', handle((req) => C.appointDirector(req.user.id, req.body?.nick)));
club.post('/directors/remove', handle((req) => C.removeDirector(req.user.id, req.body?.nick)));
club.post('/pass', handle((req) => C.passPresidency(req.user.id, req.body?.nick)));
club.post('/offers', handle((req) => C.makeOffer(req.user.id, req.body?.nick, req.body?.vip, req.body?.message)));
club.post('/offers/:id/accept', handle((req) => C.acceptOffer(req.user.id, req.params.id)));
club.post('/offers/:id/refuse', handle((req) => C.refuseOffer(req.user.id, req.params.id)));
club.post('/offers/:id/cancel', handle((req) => C.cancelOffer(req.user.id, req.params.id)));
club.post('/gift', handle((req) => C.giftVip(req.user.id, req.body?.nick, req.body?.days)));
