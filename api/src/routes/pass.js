import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { passState, passClaim } from '../services/pass.js';

/** Presença da Semana (login diário): GET /api/pass · POST /api/pass/claim */
export const pass = Router();
pass.use(requireAuth);
pass.get('/', handle((req) => passState(req.user.id)));
pass.post('/claim', handle((req) => passClaim(req.user.id)));
