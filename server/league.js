/**
 * GolMobile — Liga (Brasileirão do jogo)
 *
 * Modelo no Firestore (tudo escrito só pelo servidor; cliente só lê):
 *   config/season                      temporada + rodada atual + calendário
 *   matches/{s{id}r{round}m{i}}         partidas (placar ao vivo, 24h)
 *   standings/{seasonId}_{teamId}       classificação
 *   teamMatch/{teamId}                  ponteiro p/ a partida viva do time
 *   seasonHistory/{seasonId}            campeões das temporadas passadas
 *
 * Cada gol de torcedor soma no placar do time na partida da rodada atual.
 * A cada ROUND_DURATION a rodada é encerrada (regra de empate de 5%) e a
 * próxima é criada. Ao fim das rodadas, coroa o campeão e abre nova temporada.
 */
const admin = require('firebase-admin');
const increment = admin.firestore.FieldValue.increment;
const db = () => admin.firestore();

// IDs dos 15 times — manter em sincronia com src/constants/teams.ts
const TEAM_IDS = [
  'flamengo', 'corinthians', 'palmeiras', 'sao_paulo', 'santos',
  'gremio', 'fluminense', 'atletico_mg', 'internacional', 'botafogo',
  'vasco', 'cruzeiro', 'sport', 'bahia', 'fortaleza',
];

const ROUND_DURATION_MS = Number(process.env.ROUND_DURATION_MS) || 24 * 60 * 60 * 1000;
const DRAW_MARGIN = 0.05; // diferença < 5% do líder = empate

// ─── Geração do calendário (round-robin, método do círculo) ─────────────────
function generateRoundRobin(teamIds) {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push('__BYE__');
  const n = teams.length;
  const arr = [...teams];
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== '__BYE__' && b !== '__BYE__') {
        // alterna mando por paridade da rodada
        pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    rounds.push(pairs);
    // rotaciona mantendo o primeiro fixo
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(1, arr.length - 1, ...rest);
  }
  return rounds;
}

const matchId = (seasonId, round, i) => `s${seasonId}r${round}m${i}`;
const standingId = (seasonId, teamId) => `${seasonId}_${teamId}`;

// ─── Cria as partidas de uma rodada + ponteiros dos times ───────────────────
function createRoundMatches(tx, seasonId, round, schedule, now) {
  const endsAt = now + ROUND_DURATION_MS;
  const pairs = schedule[round - 1];
  pairs.forEach(([home, away], i) => {
    const id = matchId(seasonId, round, i);
    tx.set(db().doc(`matches/${id}`), {
      seasonId, round, homeTeam: home, awayTeam: away,
      homeGoals: 0, awayGoals: 0, endsAt, status: 'live',
    });
    tx.set(db().doc(`teamMatch/${home}`), { matchId: id, side: 'home', opponent: away, endsAt, round, seasonId });
    tx.set(db().doc(`teamMatch/${away}`), { matchId: id, side: 'away', opponent: home, endsAt, round, seasonId });
  });
  return endsAt;
}

function freshStanding(seasonId, teamId) {
  return { seasonId, teamId, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
}

// ─── Regra do empate (5%) ───────────────────────────────────────────────────
function computeResult(h, a) {
  const leader = Math.max(h, a);
  if (leader === 0) return 'draw';
  if (Math.abs(h - a) / leader < DRAW_MARGIN) return 'draw';
  return h > a ? 'home' : 'away';
}

// ─── Cria uma temporada nova (schedule + rodada 1 + classificação zerada) ───
function startSeason(tx, seasonId, now) {
  const schedule = generateRoundRobin(TEAM_IDS);
  for (const teamId of TEAM_IDS) {
    tx.set(db().doc(`standings/${standingId(seasonId, teamId)}`), freshStanding(seasonId, teamId));
  }
  const roundEndsAt = createRoundMatches(tx, seasonId, 1, schedule, now);
  tx.set(db().doc('config/season'), {
    seasonId, round: 1, totalRounds: schedule.length,
    roundStartedAt: now, roundEndsAt, status: 'active', schedule,
  });
}

// ─── Garante que existe uma temporada ativa (chamado no boot) ───────────────
async function ensureSeason() {
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(db().doc('config/season'));
    if (snap.exists) return;
    startSeason(tx, 1, Date.now());
  });
}

// ─── Encerra a rodada atual e avança (rodada seguinte ou nova temporada) ────
async function settleAndAdvance() {
  return db().runTransaction(async (tx) => {
    const seasonRef = db().doc('config/season');
    const seasonSnap = await tx.get(seasonRef);
    if (!seasonSnap.exists) return { advanced: false };
    const season = seasonSnap.data();
    const now = Date.now();
    if (season.status !== 'active' || now < season.roundEndsAt) return { advanced: false };

    const { seasonId, round, totalRounds, schedule } = season;
    const pairs = schedule[round - 1];

    // Lê as partidas da rodada e as classificações dos times envolvidos
    const matchRefs = pairs.map((_, i) => db().doc(`matches/${matchId(seasonId, round, i)}`));
    const matchSnaps = await Promise.all(matchRefs.map((r) => tx.get(r)));
    const teamIds = new Set();
    pairs.forEach(([h, a]) => { teamIds.add(h); teamIds.add(a); });
    const standRefs = {};
    for (const t of teamIds) standRefs[t] = db().doc(`standings/${standingId(seasonId, t)}`);
    const standSnaps = {};
    await Promise.all([...teamIds].map(async (t) => { standSnaps[t] = await tx.get(standRefs[t]); }));

    // (leituras terminaram — a partir daqui só escritas)
    matchSnaps.forEach((ms, i) => {
      const m = ms.data();
      const h = m.homeGoals || 0;
      const a = m.awayGoals || 0;
      const result = computeResult(h, a);
      tx.update(matchRefs[i], { status: 'finished', result });

      const sh = standSnaps[m.homeTeam].data() || freshStanding(seasonId, m.homeTeam);
      const sa = standSnaps[m.awayTeam].data() || freshStanding(seasonId, m.awayTeam);
      const upd = (base, gf, ga, outcome) => ({
        points: base.points + (outcome === 'win' ? 3 : outcome === 'draw' ? 1 : 0),
        played: base.played + 1,
        wins: base.wins + (outcome === 'win' ? 1 : 0),
        draws: base.draws + (outcome === 'draw' ? 1 : 0),
        losses: base.losses + (outcome === 'loss' ? 1 : 0),
        goalsFor: base.goalsFor + gf,
        goalsAgainst: base.goalsAgainst + ga,
      });
      const homeOutcome = result === 'home' ? 'win' : result === 'away' ? 'loss' : 'draw';
      const awayOutcome = result === 'away' ? 'win' : result === 'home' ? 'loss' : 'draw';
      tx.set(standRefs[m.homeTeam], { ...sh, ...upd(sh, h, a, homeOutcome) }, { merge: true });
      tx.set(standRefs[m.awayTeam], { ...sa, ...upd(sa, a, h, awayOutcome) }, { merge: true });
    });

    if (round < totalRounds) {
      const roundEndsAt = createRoundMatches(tx, seasonId, round + 1, schedule, now);
      tx.update(seasonRef, { round: round + 1, roundStartedAt: now, roundEndsAt });
      return { advanced: true, season: seasonId, round: round + 1 };
    }

    // Fim da temporada: coroa o campeão e abre a próxima
    const finalStandings = await db()
      .collection('standings').where('seasonId', '==', seasonId).get();
    const champion = finalStandings.docs
      .map((d) => d.data())
      .sort((x, y) => y.points - x.points
        || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst)
        || y.goalsFor - x.goalsFor)[0];
    tx.set(db().doc(`seasonHistory/${seasonId}`), {
      seasonId, championTeamId: champion?.teamId ?? null, finishedAt: now,
    });
    startSeason(tx, seasonId + 1, now);
    return { advanced: true, newSeason: seasonId + 1, champion: champion?.teamId };
  });
}

// ─── Roteia um gol para o placar da partida do time (usado no chute) ────────
function incrementTeamMatch(tx, pointer, now) {
  if (!pointer || now > pointer.endsAt) return;
  tx.set(
    db().doc(`matches/${pointer.matchId}`),
    { [`${pointer.side}Goals`]: increment(1) },
    { merge: true }
  );
}

// ─── Agendador simples (Railway roda 1 instância) ───────────────────────────
function startScheduler() {
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const r = await settleAndAdvance();
      if (r.advanced) console.log('[liga] rodada avançada:', JSON.stringify(r));
    } catch (e) {
      console.error('[liga] erro no tick:', e);
    } finally {
      ticking = false;
    }
  };
  tick();
  setInterval(tick, 60 * 1000);
}

module.exports = { ensureSeason, settleAndAdvance, incrementTeamMatch, startScheduler };
