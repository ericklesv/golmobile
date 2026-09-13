export type Serie = 'A' | 'B' | 'C';
export type Kind = 'AUTO' | 'PENALTY' | 'FOUL' | 'TRAIL';

export interface Team {
  id: number; slug: string; name: string; abbr: string; state: string;
  colorPrimary: string; colorSecondary: string; stadium: string; serie: Serie;
}

export interface Cooldown { cooldownMs: number; remainingMs: number; readyAt: number; unlocked: boolean }

export interface Me {
  id: number; nick: string; email: string; gender: string; bio: string | null; isAdmin: boolean; createdAt: string;
  team: Team;
  money: number; vipDays: number; vipUntil: string | null; vip: boolean; dexterity: number;
  goalsTotal: number; goalsSeason: number; goalsRound: number; goalsHour: number;
  hourKey: string | null; roundId: number | null; seasonId: number | null;
  stats: {
    auto: { goals: number };
    penalty: { goals: number; tries: number };
    foul: { goals: number; tries: number };
    trail: { goals: number; tries: number };
    party: { wins: number; tries: number };
  };
  level: { lvl: number; name: string; goals: number; next: { lvl: number; name: string; goals: number; skill: string | null } | null };
  rebound: Record<'PENALTY' | 'FOUL' | 'TRAIL', number>;
  cooldowns: Record<Kind, Cooldown>;
  trail: { active: boolean; phase: number; revealed: { phase: number; index: number }[] };
  serverTime: number;
}

export interface TopRow { position: number; userId: number; nick: string; goals: number; team: Pick<Team, 'slug' | 'name' | 'abbr' | 'colorPrimary' | 'colorSecondary'>; vip: boolean }

export interface MatchView {
  id: number; serie: Serie; status: 'LIVE' | 'FINISHED';
  home: Team; away: Team; homeGoals: number; awayGoals: number; pct: number;
  round?: { id: number; number: number; endsAt: string };
}

export interface FeedItem { id: number; text: string; goal: boolean; kind: string; at: string; team: Team | null }

export interface Home {
  serverTime: number; hourKey: string;
  season: { id: number; number: number; totalRounds: number } | null;
  round: { id: number; number: number; startsAt: string; endsAt: string } | null;
  myMatch: MatchView | null;
  tops: { hour: TopRow[]; round: TopRow[]; season: TopRow[] };
  records: Partial<Record<'HOUR' | 'ROUND' | 'SEASON', { nick: string; goals: number; team: any; setAt: string }>>;
  lastHour: { hourKey: string; nick: string | null; goals: number; team: any } | null;
  feed: FeedItem[];
  online: number;
}

export interface KickResult {
  goal: boolean; rebound?: boolean; money: number; text: string; cooldownMs: number; kickedAt: number;
  match: { id: number; homeGoals: number; awayGoals: number } | null;
  keeperDir?: 'left' | 'center' | 'right'; direction?: string;
  outcome?: 'goal' | 'wall' | 'keeper' | 'out';
}

export interface TrailResult {
  mine: boolean; goal: boolean; finished: boolean; rebound: boolean; phase: number;
  lineMines: boolean[] | null; money: number; text: string | null; cooldownMs: number; kickedAt: number;
}

export interface PartyResult { win: boolean; segment: number; segments: string[]; money: number; prize: number; bet: number }

export interface Meta {
  cooldowns: Record<Kind, { normal: number; vip: number }>;
  trailMin: { normal: number; vip: number };
  money: Record<string, number>;
  dexterityMax: number; nerfMinLevel: number;
  levels: { lvl: number; name: string; goals: number; skill: string | null }[];
  prizes: any; trailLines: { name: string; total: number; mines: number }[];
  unlock: Record<Kind, number>;
  chances: { penalty: number; foul: number; perDexterity: number; rebound: number[] };
  partySegments: string[];
  teams: Team[];
}

export interface Standing { position: number; team: Team; points: number; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; diff: number }

export interface League {
  season: { id: number; number: number; totalRounds: number } | null;
  round: { id: number; number: number; endsAt: string } | null;
  standings: Record<Serie, Standing[]>;
  rounds: { id: number; number: number; status: string; startsAt: string; endsAt: string }[];
}

export interface PublicPlayer {
  id: number; nick: string; gender: string; bio: string | null; createdAt: string; team: Team; vip: boolean; dexterity: number;
  goalsTotal: number; goalsSeason: number; goalsRound: number; goalsHour: number;
  stats: Me['stats']; level: { lvl: number; name: string }; online: boolean;
  positions: { geral: number; penal: number; falta: number; trilha: number };
  recent: FeedItem[];
}

export interface TeamPage {
  team: Team; slogan: string | null; members: number; active: { nick: string; goalsTotal: number; online: boolean }[]; totalGoals: number;
  standing: (Standing & { position: number }) | null;
  match: MatchView | null;
  tops: { hour: TopRow[]; round: TopRow[]; season: TopRow[] };
  titles: { season: number; competition: string; place: number }[];
}
