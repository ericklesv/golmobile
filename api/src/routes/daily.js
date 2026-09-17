import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { prisma } from '../prisma.js';
import { freeMode } from '../lib/rules.js';
import { dailyStatus, termoState, termoGuess, quizState, quizNext, quizAnswer, minigamesHub, memoriaState, memoriaFlip, qualtimeState, qualtimeNext, qualtimeAnswer, alvoState, alvoShot } from '../services/daily.js';
import { statsState, statsStart, statsPick } from '../services/stats.js';
import { camisasState, camisasStart, camisasGuess } from '../services/camisas.js';
import { hattrickState, hattrickStart, hattrickShoot } from '../services/hattrick.js';
import { faltaproState, faltaproStart, faltaproKick } from '../services/faltapro.js';
import { frangacoHub } from '../services/frangaco.js';
import { ganhaPerdeState, ganhaPerdeSpin } from '../services/ganhaperde.js';
import { goleadaState, goleadaStart, goleadaMore, goleadaEnd } from '../services/goleada.js';

/**
 * Minigames diários (1x por dia): GET /api/daily · Termo: GET /api/daily/termo,
 * POST /api/daily/termo/guess {word, day} · Quiz: GET /api/daily/quiz,
 * POST /api/daily/quiz/next {day}, POST /api/daily/quiz/answer {index, choice, day}.
 */
export const daily = Router();
daily.use(requireAuth);

// Modo livre (SÓ no PC, MODO_LIVRE=1): as partidas TERMINADAS do jogador são apagadas a cada chamada —
// todo minigame volta a ficar disponível na hora (vídeo de propaganda / testes). Nunca vale em produção.
daily.use(async (req, _res, next) => {
  if (freeMode()) {
    try { await prisma.dailyGame.deleteMany({ where: { userId: req.user.id, finishedAt: { not: null } } }); } catch { /* nunca derruba o jogo */ }
  }
  next();
});

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
// Falta PRO (cobrança de falta 3D): GET /api/daily/faltapro, POST start, POST kick {i, dirX, dirY, power, spin}
daily.get('/faltapro', handle((req) => faltaproState(req.user.id)));
daily.post('/faltapro/start', handle((req) => faltaproStart(req.user.id)));
daily.post('/faltapro/kick', handle((req) => faltaproKick(req.user.id, req.body)));
// Frangaço: o jogo é o cliente Unity (/tv/?mode=penalty) falando com /api/frangaco/*;
// aqui só o estado simples do slider da Home (available/started/finished/won)
daily.get('/frangaco', handle((req) => frangacoHub(req.user.id)));
// Goleada (batedor): GET estado, POST start (manda os goleiros), POST more (mais goleiros) e POST end (os chutes)
daily.get('/goleada', handle((req) => goleadaState(req.user.id)));
daily.post('/goleada/start', handle((req) => goleadaStart(req.user.id)));
daily.post('/goleada/more', handle((req) => goleadaMore(req.user.id, req.body?.from)));
daily.post('/goleada/end', handle((req) => goleadaEnd(req.user.id, req.body)));

// Ganha ou Perde (roleta): GET /api/daily/ganhaperde, POST /api/daily/ganhaperde/spin {chance, spins}
daily.get('/ganhaperde', handle((req) => ganhaPerdeState(req.user.id)));
daily.post('/ganhaperde/spin', handle((req) => ganhaPerdeSpin(req.user.id, req.body?.chance, req.body?.spins)));
