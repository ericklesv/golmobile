import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { dailyStatus, termoState, termoGuess, quizState, quizNext, quizAnswer, minigamesHub, memoriaState, memoriaFlip, qualtimeState, qualtimeNext, qualtimeAnswer, alvoState, alvoNext, alvoHit } from '../services/daily.js';
import { statsState, statsStart, statsPick } from '../services/stats.js';

/**
 * Minigames diários (1x por dia): GET /api/daily · Termo: GET /api/daily/termo,
 * POST /api/daily/termo/guess {word, day} · Quiz: GET /api/daily/quiz,
 * POST /api/daily/quiz/next {day}, POST /api/daily/quiz/answer {index, choice, day}.
 */
export const daily = Router();
daily.use(requireAuth);

daily.get('/', handle((req) => dailyStatus(req.user.id)));
daily.get('/hub', handle((req) => minigamesHub(req.user.id)));
daily.get('/memoria', handle((req) => memoriaState(req.user.id)));
daily.post('/memoria/flip', handle((req) => memoriaFlip(req.user.id, req.body?.index, req.body?.day)));
daily.get('/qualtime', handle((req) => qualtimeState(req.user.id)));
daily.post('/qualtime/next', handle((req) => qualtimeNext(req.user.id, req.body?.day)));
daily.get('/alvo', handle((req) => alvoState(req.user.id)));
daily.post('/alvo/next', handle((req) => alvoNext(req.user.id, req.body?.day)));
daily.post('/alvo/hit', handle((req) => alvoHit(req.user.id, Number(req.body?.index), req.body?.day)));
daily.post('/qualtime/answer', handle((req) => qualtimeAnswer(req.user.id, Number(req.body?.index), Number(req.body?.choice), req.body?.day)));
daily.get('/termo', handle((req) => termoState(req.user.id)));
daily.post('/termo/guess', handle((req) => termoGuess(req.user.id, req.body?.word, req.body?.day)));
daily.get('/quiz', handle((req) => quizState(req.user.id)));
daily.post('/quiz/next', handle((req) => quizNext(req.user.id, req.body?.day)));
daily.post('/quiz/answer', handle((req) => quizAnswer(req.user.id, Number(req.body?.index), Number(req.body?.choice), req.body?.day)));
// Estatísticas: GET /api/daily/stats, POST /api/daily/stats/start, POST /api/daily/stats/pick {side: 'a'|'b'}
daily.get('/stats', handle((req) => statsState(req.user.id)));
daily.post('/stats/start', handle((req) => statsStart(req.user.id)));
daily.post('/stats/pick', handle((req) => statsPick(req.user.id, req.body?.side)));
