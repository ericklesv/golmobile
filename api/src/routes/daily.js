import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { dailyStatus, termoState, termoGuess, quizState, quizNext, quizAnswer } from '../services/daily.js';

/**
 * Minigames diários (1x por dia): GET /api/daily · Termo: GET /api/daily/termo,
 * POST /api/daily/termo/guess {word, day} · Quiz: GET /api/daily/quiz,
 * POST /api/daily/quiz/next {day}, POST /api/daily/quiz/answer {index, choice, day}.
 */
export const daily = Router();
daily.use(requireAuth);

daily.get('/', handle((req) => dailyStatus(req.user.id)));
daily.get('/termo', handle((req) => termoState(req.user.id)));
daily.post('/termo/guess', handle((req) => termoGuess(req.user.id, req.body?.word, req.body?.day)));
daily.get('/quiz', handle((req) => quizState(req.user.id)));
daily.post('/quiz/next', handle((req) => quizNext(req.user.id, req.body?.day)));
daily.post('/quiz/answer', handle((req) => quizAnswer(req.user.id, Number(req.body?.index), Number(req.body?.choice), req.body?.day)));
