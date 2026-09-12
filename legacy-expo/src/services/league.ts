import {
  doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface Season {
  seasonId: number;
  round: number;
  totalRounds: number;
  roundStartedAt: number;
  roundEndsAt: number;
  status: 'active' | 'finished';
  championTeamId?: string | null;
  schedule?: Record<string, { home: string; away: string }[]>;
}

export interface Fixture {
  round: number;
  opponent: string;
  side: 'home' | 'away';
  isPast: boolean;
  isCurrent: boolean;
}

export interface Scorer {
  uid: string;
  nick: string;
  teamId: string;
  goals: number;
}

export interface Standing {
  seasonId: number;
  teamId: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface Match {
  id: string;
  seasonId: number;
  round: number;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  endsAt: number;
  status: 'live' | 'finished';
  result?: 'home' | 'away' | 'draw';
}

export interface TeamMatchLive {
  matchId: string;
  myGoals: number;
  oppGoals: number;
  opponent: string;
  side: 'home' | 'away';
  round: number;
  endsAt: number;
  status: 'live' | 'finished';
}

export async function fetchSeason(): Promise<Season | null> {
  const snap = await getDoc(doc(db, 'config', 'season'));
  return snap.exists() ? (snap.data() as Season) : null;
}

export function subscribeStandings(seasonId: number, cb: (rows: Standing[]) => void) {
  const q = query(
    collection(db, 'standings'),
    where('seasonId', '==', seasonId),
    orderBy('points', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => d.data() as Standing);
    // desempate local: saldo de gols, depois gols pró
    rows.sort((a, b) =>
      b.points - a.points ||
      (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor
    );
    cb(rows);
  });
}

export async function fetchRoundMatches(seasonId: number, round: number): Promise<Match[]> {
  const q = query(
    collection(db, 'matches'),
    where('seasonId', '==', seasonId),
    where('round', '==', round)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match));
}

// Assina a partida viva do time (ponteiro teamMatch → doc da partida)
export function subscribeTeamMatch(teamId: string, cb: (live: TeamMatchLive | null) => void) {
  let matchUnsub: (() => void) | null = null;
  const ptrUnsub = onSnapshot(doc(db, 'teamMatch', teamId), (ptrSnap) => {
    if (matchUnsub) { matchUnsub(); matchUnsub = null; }
    if (!ptrSnap.exists()) { cb(null); return; }
    const ptr = ptrSnap.data() as { matchId: string; side: 'home' | 'away'; opponent: string; round: number; endsAt: number };
    matchUnsub = onSnapshot(doc(db, 'matches', ptr.matchId), (mSnap) => {
      if (!mSnap.exists()) { cb(null); return; }
      const m = mSnap.data() as Match;
      cb({
        matchId: ptr.matchId,
        side: ptr.side,
        opponent: ptr.opponent,
        round: ptr.round,
        myGoals: ptr.side === 'home' ? m.homeGoals : m.awayGoals,
        oppGoals: ptr.side === 'home' ? m.awayGoals : m.homeGoals,
        endsAt: m.endsAt,
        status: m.status,
      });
    });
  });
  return () => { if (matchUnsub) matchUnsub(); ptrUnsub(); };
}

export async function fetchStandingsSorted(seasonId: number): Promise<Standing[]> {
  const q = query(collection(db, 'standings'), where('seasonId', '==', seasonId), orderBy('points', 'desc'));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => d.data() as Standing);
  rows.sort((a, b) =>
    b.points - a.points ||
    (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor
  );
  return rows;
}

export async function fetchStanding(seasonId: number, teamId: string): Promise<Standing | null> {
  const snap = await getDoc(doc(db, 'standings', `${seasonId}_${teamId}`));
  return snap.exists() ? (snap.data() as Standing) : null;
}

// Artilheiros de um time (entradas da temporada filtradas pelo time)
export async function fetchTeamScorers(teamId: string): Promise<Scorer[]> {
  const q = query(
    collection(db, 'rankings', 'season', 'entries'),
    where('teamId', '==', teamId),
    orderBy('goals', 'desc'),
    limit(15)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Scorer);
}

// Confrontos de um time em toda a temporada, a partir do calendário
export function teamFixtures(season: Season, teamId: string): Fixture[] {
  if (!season.schedule) return [];
  const out: Fixture[] = [];
  for (let r = 1; r <= season.totalRounds; r++) {
    const pairs = season.schedule[String(r)] ?? [];
    for (const p of pairs) {
      if (p.home === teamId || p.away === teamId) {
        out.push({
          round: r,
          opponent: p.home === teamId ? p.away : p.home,
          side: p.home === teamId ? 'home' : 'away',
          isPast: r < season.round,
          isCurrent: r === season.round,
        });
      }
    }
  }
  return out;
}

export function formatMatchTimeLeft(endsAt: number): string {
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'encerrando…';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `termina em ${h}h${String(m).padStart(2, '0')}` : `termina em ${m}min`;
}
