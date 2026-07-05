/**
 * GolMobile — API de jogo (Railway)
 *
 * Toda a lógica de jogo (sorteio de gol, cooldown, rankings) roda aqui no
 * servidor com firebase-admin. O cliente manda o ID token do Firebase Auth
 * e apenas anima o resultado. O Firestore é bloqueado para escrita direta
 * (ver firestore.rules na raiz do repo).
 *
 * Env vars (Railway):
 *   FIREBASE_SERVICE_ACCOUNT  JSON completo da service account do projeto
 *   PORT                      injetada pelo Railway
 */
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
admin.initializeApp({
  credential: svc
    ? admin.credential.cert(JSON.parse(svc))
    : admin.credential.applicationDefault(),
});
const db = admin.firestore();
const increment = admin.firestore.FieldValue.increment;

// ─── Regras do jogo (fonte da verdade) ──────────────────────────────────────
const ACTION_COOLDOWNS = {
  auto:    1  * 60 * 1000,
  penalti: 10 * 60 * 1000,
  falta:   5  * 60 * 1000,
  trilha:  3  * 60 * 1000,
};
const ACTION_FIELD = {
  auto:    'lastAutoTime',
  penalti: 'lastPenaltiTime',
  falta:   'lastFaltaTime',
  trilha:  'lastTrilhaTime',
};
const GOAL_CHANCE = { auto: 0.65, falta: 0.65 };
// Trilha: defesa 4 jogadores/1 mina, meio 3/1, ataque 3/2 (igual ao cliente)
const TRAIL_LINES = [
  { total: 4, mines: 1 },
  { total: 3, mines: 1 },
  { total: 3, mines: 2 },
];
const COOLDOWN_TOLERANCE_MS = 1500;

// ─── Erros de jogo → HTTP ───────────────────────────────────────────────────
class GameError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const cooldownError = (msg) => new GameError(429, 'cooldown', msg);

// ─── Chaves de janela (hora/rodada) no fuso de Brasília ────────────────────
const TZ = 'America/Sao_Paulo';
function tzParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') };
}
function currentHourKey() {
  const { y, m, d, h } = tzParts();
  return `${y}-${m}-${d}-${h}`;
}
function currentRoundKey() {
  const { y, m, d } = tzParts();
  return `${y}-${m}-${d}`;
}

// ─── Núcleo compartilhado: aplica o resultado de um chute na transação ─────
function applyKickResult(tx, userRef, user, { uid, type, goal, now }) {
  const hourKey = currentHourKey();
  const roundKey = currentRoundKey();

  const updates = {
    [ACTION_FIELD[type]]: now,
    totalKicks: increment(1),
  };
  if (type === 'trilha') updates.trailPosition = 0;

  if (goal) {
    updates.totalGoals = increment(1);
    // Contadores por janela: reinicia quando a chave muda
    updates.hourGoals = user.hourKey === hourKey ? increment(1) : 1;
    updates.hourKey = hourKey;
    updates.roundGoals = user.roundKey === roundKey ? increment(1) : 1;
    updates.roundKey = roundKey;

    const base = { uid, nick: user.nick, teamId: user.teamId, goals: increment(1) };
    tx.set(db.doc(`rankings/hour/entries/${uid}_${hourKey}`), { ...base, hourKey }, { merge: true });
    tx.set(db.doc(`rankings/round/entries/${uid}_${roundKey}`), { ...base, roundKey }, { merge: true });
    tx.set(db.doc(`rankings/season/entries/${uid}`), base, { merge: true });
  }

  tx.update(userRef, updates);
  tx.set(db.collection('activities').doc(), {
    uid, nick: user.nick, teamId: user.teamId, goal, kickType: type, ts: now,
  });
}

// ─── Lógica dos endpoints ──────────────────────────────────────────────────
async function doKick(uid, type, direction) {
  if (!['auto', 'falta', 'penalti'].includes(type)) {
    throw new GameError(400, 'invalid-argument', 'Tipo de chute inválido.');
  }
  if (type === 'penalti' && !['left', 'center', 'right'].includes(direction)) {
    throw new GameError(400, 'invalid-argument', 'Direção inválida.');
  }

  return db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new GameError(412, 'no-profile', 'Perfil não encontrado.');
    const user = snap.data();

    const now = Date.now();
    const last = user[ACTION_FIELD[type]] || 0;
    const cd = ACTION_COOLDOWNS[type];
    if (now - last < cd - COOLDOWN_TOLERANCE_MS) {
      throw cooldownError('Chute ainda em recarga.');
    }

    let goal;
    let keeperDir = null;
    if (type === 'penalti') {
      keeperDir = ['left', 'center', 'right'][Math.floor(Math.random() * 3)];
      goal = keeperDir !== direction;
    } else {
      goal = Math.random() < GOAL_CHANCE[type];
    }

    applyKickResult(tx, userRef, user, { uid, type, goal, now });
    return { goal, keeperDir, cooldownMs: cd, kickedAt: now };
  });
}

async function doTrailPick(uid, pickIndex) {
  return db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const trailRef = db.doc(`users/${uid}/private/trail`);
    const [userSnap, trailSnap] = await Promise.all([tx.get(userRef), tx.get(trailRef)]);
    if (!userSnap.exists) throw new GameError(412, 'no-profile', 'Perfil não encontrado.');
    const user = userSnap.data();

    const now = Date.now();
    let state = trailSnap.exists && trailSnap.data().active ? trailSnap.data() : null;

    // Sem corrida ativa → começa uma nova (aqui vale o cooldown)
    if (!state) {
      const last = user.lastTrilhaTime || 0;
      if (now - last < ACTION_COOLDOWNS.trilha - COOLDOWN_TOLERANCE_MS) {
        throw cooldownError('Trilha ainda em recarga.');
      }
      // Layout: mapa "linha" -> array de booleans (true = mina), embaralhado
      const layout = {};
      TRAIL_LINES.forEach((line, i) => {
        const arr = Array.from({ length: line.total }, (_, j) => j >= line.total - line.mines);
        for (let k = arr.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1));
          [arr[k], arr[r]] = [arr[r], arr[k]];
        }
        layout[String(i)] = arr;
      });
      state = { active: true, phase: 0, layout, startedAt: now };
    }

    const line = state.phase;
    const cfg = TRAIL_LINES[line];
    if (!cfg || !Number.isInteger(pickIndex) || pickIndex < 0 || pickIndex >= cfg.total) {
      throw new GameError(400, 'invalid-argument', 'Jogada inválida.');
    }

    const lineMines = state.layout[String(line)];
    const mine = lineMines[pickIndex] === true;

    let goal = false;
    let finished = false;
    let nextPhase = line;

    if (mine) {
      finished = true;
      applyKickResult(tx, userRef, user, { uid, type: 'trilha', goal: false, now });
    } else {
      nextPhase = line + 1;
      if (nextPhase >= TRAIL_LINES.length) {
        goal = true;
        finished = true;
        applyKickResult(tx, userRef, user, { uid, type: 'trilha', goal: true, now });
      } else {
        tx.update(userRef, { trailPosition: nextPhase });
      }
    }

    if (finished) {
      tx.set(trailRef, { active: false, endedAt: now });
    } else {
      tx.set(trailRef, { ...state, phase: nextPhase });
    }

    return {
      mine,
      goal,
      finished,
      phase: nextPhase,
      lineMines,
      cooldownMs: ACTION_COOLDOWNS.trilha,
      kickedAt: finished ? now : null,
    };
  });
}

// ─── HTTP ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

async function requireAuth(req, res, next) {
  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'unauthenticated', message: 'Faça login para jogar.' });
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: 'unauthenticated', message: 'Sessão inválida. Entre novamente.' });
  }
}

function handle(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      if (e instanceof GameError) {
        res.status(e.status).json({ error: e.code, message: e.message });
      } else {
        console.error(e);
        res.status(500).json({ error: 'internal', message: 'Erro interno. Tente novamente.' });
      }
    }
  };
}

app.get('/', (_req, res) => res.json({ ok: true, service: 'golmobile-server' }));
app.post('/kick', requireAuth, handle((req) => doKick(req.uid, req.body?.type, req.body?.direction)));
app.post('/trail-pick', requireAuth, handle((req) => doTrailPick(req.uid, req.body?.pickIndex)));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`golmobile-server na porta ${port}`));
