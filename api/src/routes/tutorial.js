import { Router } from 'express';
import { handle } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { tutorialState, tutorialStart, tutorialSkip, tutorialDone } from '../services/tutorial.js';

/** Tutorial de boas-vindas: GET /api/tutorial · POST /api/tutorial/start|skip|done/:step */
export const tutorial = Router();
tutorial.use(requireAuth);
tutorial.get('/', handle((req) => tutorialState(req.user.id)));
tutorial.post('/start', handle((req) => tutorialStart(req.user.id)));
tutorial.post('/skip', handle((req) => tutorialSkip(req.user.id)));
tutorial.post('/done/:step', handle((req) => tutorialDone(req.user.id, req.params.step)));
