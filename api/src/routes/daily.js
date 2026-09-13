import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { dailyStatus, termoState, termoGuess, quizState, quizNext, quizAnswer, minigamesHub, memoriaState, memoriaFlip, qualtimeState, qualtimeNext, qualtimeAnswer, alvoState, alvoShot } from '../services/daily.js';
import { statsState, statsStart, statsPick } from '../services/stats.js';
import { camisasState, camisasStart, camisasGuess } from '../services/camisas.js';
import { hattrickState, hattrickStart, hattrickShoot } from '../services/hattrick.js';
import { frangacoState, frangacoStart, frangacoKick, frangacoSave } from '../services/frangaco.js';

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
// Alvo no Gol (batalha naval): GET /api/daily/alvo, POST /api/daily/alvo/shot {index, day}
daily.post('/alvo/shot', handle((req) => alvoShot(req.user.id, Number(req.body?.index), req.body?.day)));
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
daily.get('/camisas', handle((req) => camisasState(req.user.id)));
daily.post('/camisas/start', handle((req) => camisasStart(req.user.id)));
daily.post('/camisas/guess', handle((req) => camisasGuess(req.user.id, req.body?.guess)));
daily.get('/hattrick', handle((req) => hattrickState(req.user.id)));
daily.post('/hattrick/start', handle((req) => hattrickStart(req.user.id)));
daily.post('/hattrick/shoot', handle((req) => hattrickShoot(req.user.id, req.body)));
// Frangaço (duelo de pênaltis): GET /api/daily/frangaco, POST /api/daily/frangaco/start,
// POST /api/daily/frangaco/kick {x, y, anunciado?}, POST /api/daily/frangaco/save {x, y, ms}
daily.get('/frangaco', handle((req) => frangacoState(req.user.id)));
daily.post('/frangaco/start', handle((req) => frangacoStart(req.user.id)));
daily.post('/frangaco/kick', handle((req) => frangacoKick(req.user.id, req.body)));
daily.post('/frangaco/save', handle((req) => frangacoSave(req.user.id, req.body)));
