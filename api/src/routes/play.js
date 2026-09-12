import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { autoKick, penalty, foul, trailPick, partySpin } from '../services/play.js';

export const play = Router();
play.use(requireAuth);

play.post('/auto', handle((req) => autoKick(req.user.id)));
play.post('/penalty', handle((req) => penalty(req.user.id, req.body?.direction)));
play.post('/foul', handle((req) => foul(req.user.id, req.body?.direction)));
play.post('/trail', handle((req) => trailPick(req.user.id, Number(req.body?.index))));
play.post('/party', handle((req) => partySpin(req.user.id)));
