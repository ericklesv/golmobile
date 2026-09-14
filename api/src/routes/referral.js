import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { myReferral, refLookup } from '../services/referral.js';

/** Convites: GET /api/ref/me (meu link e meus convidados) · GET /api/ref/:code (quem convidou — público) */
export const referral = Router();
referral.get('/me', requireAuth, handle((req) => myReferral(req.user.id)));
referral.get('/:code', handle((req) => refLookup(req.params.code)));
