export type Serie = 'A' | 'B' | 'C';
export type Kind = 'AUTO' | 'PENALTY' | 'FOUL' | 'TRAIL';

export interface Team {
  id: number; slug: string; name: string; abbr: string; state: string;
  colorPrimary: string; colorSecondary: string; stadium: string; serie: Serie;
}

export interface Cooldown { cooldownMs: number; remainingMs: number; readyAt: number; unlocked: boolean }

export interface Me {
  id: number; nick: string; email: string; gender: string; bio: string | null; avatarUrl: string | null; isAdmin: boolean; createdAt: string;
  team: Team;
  money: number; vipDays: number; vipUntil: string | null; vip: boolean; dexterity: number;
  goalsTotal: number; goalsSeason: number; goalsRound: number; goalsHour: number;
  hourKey: string | null; roundId: number | null; seasonId: number | null;
  /** Pontos de nível = gols + levelBonus (minigames diários). A barra de nível usa estes. */
  levelBonus: number; levelPoints: number;
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
  /** Itens da loja ativos (ver ShopView) e cor do nick (chave da paleta). */
  items: UserItemView[]; nickColor: string | null;
  /** Só em GET /api/me: o próximo chute manual exige captcha (a cada 10 chutes). */
  captchaRequired?: boolean;
  serverTime: number;
}

export interface TopRow { position: number; userId: number; nick: string; avatarUrl?: string | null; nickColor?: string | null; goals: number; team: Pick<Team, 'slug' | 'name' | 'abbr' | 'colorPrimary' | 'colorSecondary'>; vip: boolean }

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
  active: number;
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
  termo: { letters: number; tries: number; levelPoints: number[] };
  quiz: { questions: number; seconds: number; pointsPerHit: number; goalAt: number };
  teams: Team[];
  items: ShopItemDef[];
}

// ─── Minigames diários ──────────────────────────────────────────────────────
export type DailyGameId = 'TERMO' | 'QUIZ';
export interface DailyStatus {
  day: number; nextAt: number;
  games: { id: DailyGameId; day: number; nextAt: number; available: boolean; started: boolean; finished: boolean; won: boolean }[];
  /** A única faixa que a Home mostra: o jogo disponível que vence primeiro. */
  featured: DailyGameId | null;
}

export interface QuizResult { q: string; options: string[]; choice: number; correctChoice: number; correct: boolean }
export interface QuizState {
  day: number; total: number; index: number;
  results: QuizResult[];
  /** A pergunta no ar (o relógio já está correndo). A certa só vem depois de responder. */
  current: { index: number; q: string; options: string[]; deadline: number } | null;
  finished: boolean; hits: number;
  reward: { goal: boolean; levelPoints: number; hits: number; total: number; text: string | null; match: { id: number; homeGoals: number; awayGoals: number } | null } | null;
  nextAt: number; serverTime: number;
}

export type TermoColor = 'correct' | 'present' | 'absent';
export interface TermoReward { goal: boolean; levelPoints: number; tries: number; text: string; match: { id: number; homeGoals: number; awayGoals: number } | null }
export interface TermoState {
  day: number;
  guesses: { word: string; colors: TermoColor[] }[];
  finished: boolean; won: boolean;
  /** A palavra do dia — só vem depois do fim. */
  answer: string | null;
  reward: TermoReward | null;
  nextAt: number;
}

export interface Standing { position: number; team: Team; points: number; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; diff: number }

export interface League {
  season: { id: number; number: number; totalRounds: number } | null;
  round: { id: number; number: number; endsAt: string } | null;
  standings: Record<Serie, Standing[]>;
  rounds: { id: number; number: number; status: string; startsAt: string; endsAt: string }[];
}

export interface PublicPlayer {
  id: number; nick: string; gender: string; bio: string | null; avatarUrl: string | null; createdAt: string; team: Team; vip: boolean; dexterity: number;
  goalsTotal: number; goalsSeason: number; goalsRound: number; goalsHour: number;
  stats: Me['stats']; level: { lvl: number; name: string }; online: boolean;
  positions: { geral: number; penal: number; falta: number; trilha: number };
  recent: FeedItem[];
}

export interface TeamPage {
  team: Team; slogan: string | null; members: number; active: { nick: string; goalsTotal: number; avatarUrl: string | null; online: boolean }[]; totalGoals: number;
  standing: (Standing & { position: number }) | null;
  match: MatchView | null;
  tops: { hour: TopRow[]; round: TopRow[]; season: TopRow[] };
  titles: { season: number; competition: string; place: number }[];
}

export interface ActivePlayer { nick: string; goalsTotal: number; goalsRound: number; avatarUrl: string | null; lastSeenAt: string; online: boolean; vip: boolean; team: Team | null }

export type ChatRoom = 'geral' | 'time';
export interface ChatMessage { id: number; text: string; color: string | null; at: string; user: { id: number; nick: string; avatarUrl: string | null; level: number; levelName: string; vip: boolean; nickColor: string | null; team: Team | null } }
export interface ChatPage { room: string; messages: ChatMessage[]; online: number; colorLevel: number; colors: string[]; canColor: boolean }

export interface MinigameCard {
  id: string; name: string; desc: string; icon: string; route: string; rewardLabel: string; daily: boolean;
  unlockLevel: number; unlocked: boolean; soon: boolean;
  available: boolean; started: boolean; finished: boolean; won: boolean; nextAt: number | null;
}
export interface MemoriaCard { i: number; team: Team | null; matched: boolean }
export interface MemoriaReward { goal: boolean; levelPoints: number; moves: number; text: string | null }
export interface MemoriaState {
  day: number; pairs: number; goalAtMoves: number; levelPoints: [number | null, number][];
  cards: MemoriaCard[]; open: number | null; moves: number; matchedPairs: number;
  finished: boolean; won: boolean; reward: MemoriaReward | null; nextAt: number;
}
export interface QualtimeResult { text: string; type: string; options: (Team | null)[]; choice: number; correctChoice: number; correct: boolean }
export interface QualtimeState {
  day: number; total: number; index: number; results: QualtimeResult[];
  current: { index: number; text: string; type: string; options: (Team | null)[]; deadline: number } | null;
  finished: boolean; hits: number; reward: { goal: boolean; levelPoints: number; hits: number; total: number; text: string | null } | null;
  seconds: number; pointsPerHit: number; goalAt: number; nextAt: number; serverTime: number;
}
// ─── Loja ───────────────────────────────────────────────────────────────────
export type ItemKind = 'boost' | 'boot' | 'service';
export interface ShopItemDef {
  key: string; kind: ItemKind; category: 'chutes' | 'chuteiras' | 'perfil'; name: string; icon: string; desc: string;
  price: number | null; priceVip: number | null; durationMs: number | null;
  levels: { level: number; price: number; effect: string }[] | null;
  bonus: number | null; minLevel: number | null; colors: { key: string; name: string; hex: string }[] | null; single: boolean;
}
/** Item ativo do jogador (também vem em `Me.items`). */
export interface UserItemView { id: number; key: string; level: number; equipped: boolean; expiresAt: number }
export interface ShopView {
  catalog: ShopItemDef[]; items: UserItemView[]; nickColor: string | null; energyLevel: number; level: number;
  history: { key: string; name: string; price: number; currency: 'money' | 'vip'; at: number }[];
  serverTime: number;
}

// ─── Captcha dos chutes manuais ─────────────────────────────────────────────
export interface CaptchaPayload { captchaId: string; answer: string }
