import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { handle, GameError } from '../lib/errors.js';
import { frangacoState, frangacoRun, frangacoIncoming, frangacoKick, frangacoSave, frangacoResultado, frangacoReset } from '../services/frangaco.js';

/**
 * Frangaço — API no CONTRATO do cliente Unity WebGL do Managol
 * (ManagolPenalty.cs, servido em /tv/?mode=penalty&apiBase=<origem>):
 *   GET  /api/frangaco/state     → temporada, meu time/batedor/goleiro, títulos, ranking, run
 *   POST /api/frangaco/run       → inicia (ou retoma) o torneio do dia
 *   POST /api/frangaco/incoming  → prepara a cobrança da IA que EU vou defender
 *   POST /api/frangaco/kick {xAnunciado, xReal|null}
 *   POST /api/frangaco/save {ms, x?, y?}
 * Fora do contrato do Unity (só o wrapper Frangaco.tsx usa):
 *   GET  /api/frangaco/resultado → fim do torneio + `lobby` (o Unity já voltou ao lobby)
 *   POST /api/frangaco/reset     → modo teste: apaga o torneio terminado para jogar de novo
 * Auth: Bearer JWT normal do JogaGol (o token chega ao Unity por postMessage).
 */
export const frangacoTv = Router();
frangacoTv.use(requireAuth);

const FREE_ENV = process.env.NODE_ENV !== 'production' && process.env.MINIGAMES_LIVRES === '1';
// Repetir o torneio do dia só no modo de teste local (MINIGAMES_LIVRES=1, nunca em produção).
const podeRepetir = () => FREE_ENV;

frangacoTv.get('/state', handle((req) => frangacoState(req.user.id)));
frangacoTv.post('/run', handle((req) => frangacoRun(req.user.id)));
frangacoTv.post('/incoming', handle((req) => frangacoIncoming(req.user.id)));
frangacoTv.post('/kick', handle((req) => frangacoKick(req.user.id, req.body)));
frangacoTv.post('/save', handle((req) => frangacoSave(req.user.id, req.body)));
frangacoTv.get('/resultado', handle((req) => frangacoResultado(req.user.id, podeRepetir(req.user))));
frangacoTv.post('/reset', handle((req) => {
  if (!podeRepetir(req.user)) throw new GameError(403, 'forbidden', 'O Frangaço renova às 20h.');
  return frangacoReset(req.user.id);
}));
