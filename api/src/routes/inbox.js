/** Caixa de mensagens do jogador (services/inbox.js). Tudo com login. */
import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { inboxList, markRead, markAllRead } from '../services/inbox.js';

export const inbox = Router();
inbox.use(requireAuth);

inbox.get('/', handle((req) => inboxList(req.user.id, req.query.page)));
inbox.post('/read-all', handle((req) => markAllRead(req.user.id)));
inbox.post('/:id/read', handle((req) => markRead(req.user.id, req.params.id)));
