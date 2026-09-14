import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { handle } from '../lib/errors.js';
import { prisma } from '../prisma.js';
import { isFreeTester } from '../lib/rules.js';
import { frangacoState, frangacoRun, frangacoIncoming, frangacoKick, frangacoSave } from '../services/frangaco.js';

/**
 * Frangaço — API no CONTRATO do cliente Unity WebGL do Managol
 * (ManagolPenalty.cs, servido em /tv/?mode=penalty&apiBase=<origem>):
 *   GET  /api/frangaco/state     → temporada, meu time/batedor/goleiro, títulos, ranking, run
 *   POST /api/frangaco/run       → inicia (ou retoma) o torneio do dia
 *   POST /api/frangaco/incoming  → prepara a cobrança da IA que EU vou defender
 *   POST /api/frangaco/kick {xAnunciado, xReal|null}
 *   POST /api/frangaco/save {ms, x?, y?}
 * Auth: Bearer JWT normal do JogaGol (o token chega ao Unity por postMessage).
 */
export const frangacoTv = Router();
frangacoTv.use(requireAuth);

// Conta de teste do dono (13/09/2026): sem limite diário — torneios TERMINADOS são
// apagados a cada chamada (um run em andamento não é tocado). Só nicks de isFreeTester.
frangacoTv.use(async (req, _res, next) => {
  if (isFreeTester(req.user)) {
    try { await prisma.dailyGame.deleteMany({ where: { userId: req.user.id, game: 'FRANGACO', finishedAt: { not: null } } }); } catch { /* nunca derruba o jogo */ }
  }
  next();
});

frangacoTv.get('/state', handle((req) => frangacoState(req.user.id)));
frangacoTv.post('/run', handle((req) => frangacoRun(req.user.id)));
frangacoTv.post('/incoming', handle((req) => frangacoIncoming(req.user.id)));
frangacoTv.post('/kick', handle((req) => frangacoKick(req.user.id, req.body)));
frangacoTv.post('/save', handle((req) => frangacoSave(req.user.id, req.body)));
