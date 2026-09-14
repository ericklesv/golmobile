import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { handle } from '../lib/errors.js';
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

frangacoTv.get('/state', handle((req) => frangacoState(req.user.id)));
frangacoTv.post('/run', handle((req) => frangacoRun(req.user.id)));
frangacoTv.post('/incoming', handle((req) => frangacoIncoming(req.user.id)));
frangacoTv.post('/kick', handle((req) => frangacoKick(req.user.id, req.body)));
frangacoTv.post('/save', handle((req) => frangacoSave(req.user.id, req.body)));
