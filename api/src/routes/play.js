import { Router } from 'express';
import { handle, GameError } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { autoKick, penalty, foul, trailPick, partySpin } from '../services/play.js';
import { captchaRequired, newCaptcha, checkCaptcha } from '../lib/captcha.js';

export const play = Router();
play.use(requireAuth);

/** Captcha dos chutes manuais: exigido quando /api/me sinaliza captchaRequired (a cada 10 chutes). */
function guardCaptcha(req) {
  if (!captchaRequired(req.user)) return;
  if (!checkCaptcha(req.user.id, req.body?.captchaId, req.body?.answer)) {
    throw new GameError(428, 'captcha', 'Responda a conta anti-robô para chutar.');
  }
}

play.get('/captcha', handle((req) => newCaptcha(req.user.id)));
play.post('/auto', handle((req) => autoKick(req.user.id)));
play.post('/penalty', handle((req) => { guardCaptcha(req); return penalty(req.user.id, req.body?.direction); }));
play.post('/foul', handle((req) => { guardCaptcha(req); return foul(req.user.id, req.body?.direction); }));
// Trilha: o captcha vale para começar uma trilha nova (as jogadas seguintes da mesma trilha não pedem)
play.post('/trail', handle((req) => { if (!req.user.trailState?.active) guardCaptcha(req); return trailPick(req.user.id, Number(req.body?.index)); }));
play.post('/party', handle((req) => partySpin(req.user.id)));
