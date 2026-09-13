import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { dailyStatus, termoState, termoGuess } from '../services/daily.js';

/** Minigames diários (1x por dia): GET /api/daily, GET /api/daily/termo, POST /api/daily/termo/guess {word, day}. */
export const daily = Router();
daily.use(requireAuth);

daily.get('/', handle((req) => dailyStatus(req.user.id)));
daily.get('/termo', handle((req) => termoState(req.user.id)));
daily.post('/termo/guess', handle((req) => termoGuess(req.user.id, req.body?.word, req.body?.day)));
