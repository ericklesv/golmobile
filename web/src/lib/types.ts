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

export interface PartyResult { win: boolean; goal: boolean; text: string; segment: number; segments: string[]; money: number; prize: number; bet: number }

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
  stats: { pointsPerHit: number; maxPoints: number; goalAt: number; season: string };
  camisas?: { shirts: number; min: number; max: number; pointsPerHit: number; maxPoints: number };
  /** Hora (Brasília) em que cada minigame diário renova. */
  resetHour?: Record<string, number>;
  hattrick?: { lives: number; pointsPerGoal: number; maxPoints: number };
  /** Minigames jogáveis e o nível que libera cada um. */
  minigames?: { id: string; name: string; unlock: number; route: string; icon: string }[];
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
export interface ChatMention { nick: string; avatarUrl: string | null }
export interface ChatMessage { id: number; text: string; color: string | null; at: string; mentions: Record<string, ChatMention> | null; user: { id: number; nick: string; avatarUrl: string | null; level: number; levelName: string; vip: boolean; nickColor: string | null; team: Team | null } }
export interface ChatPage { room: string; messages: ChatMessage[]; online: number; colorLevel: number; colors: string[]; canColor: boolean }

export interface MinigameCard {
  id: string; name: string; desc: string; icon: string; route: string; rewardLabel: string; daily: boolean;
  unlockLevel: number; unlocked: boolean; soon: boolean;
  available: boolean; started: boolean; finished: boolean; won: boolean; nextAt: number | null;
  live?: { queue: number; playing: number };
}
export interface MemoriaCard { i: number; team: Team | null; matched: boolean }
export interface MemoriaReward { goal: boolean; levelPoints: number; moves: number; text: string | null }
export interface MemoriaState {
  day: number; pairs: number; goalAtMoves: number; levelPoints: [number | null, number][];
  cards: MemoriaCard[]; open: number | null; moves: number; matchedPairs: number;
  finished: boolean; won: boolean; reward: MemoriaReward | null; nextAt: number;
}
/** Escudo sem estádio/estado/série (que entregariam a resposta). */
export type QualtimeTeam = Pick<Team, 'id' | 'slug' | 'name' | 'abbr' | 'colorPrimary' | 'colorSecondary'>;
export type QualtimeMode = 'crest' | 'name';
/** Uma opção: escudo (modo `crest`) ou pista em texto (modo `name`). */
export interface QualtimeOption { team: QualtimeTeam | null; text: string | null }
export interface QualtimeQuestion { index: number; mode: QualtimeMode; text: string; team: QualtimeTeam | null; options: QualtimeOption[] }
export interface QualtimeResult extends Omit<QualtimeQuestion, 'index'> { type: string; choice: number; correctChoice: number; correct: boolean }
export interface QualtimeState {
  day: number; total: number; index: number; results: QualtimeResult[];
  current: (QualtimeQuestion & { seconds: number; deadline: number }) | null;
  finished: boolean; hits: number; streak: number; reward: { goal: boolean; levelPoints: number; hits: number; total: number; text: string | null } | null;
  seconds: number; minSeconds: number; streakStep: number; pointsPerHit: number; goalAt: number; nextAt: number; serverTime: number;
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
// ─── Alvo no Gol (batalha naval no gol) ─────────────────────────────────────
export type AlvoKind = 'goleiro' | 'zagueiro' | 'cone';
/** `cells` só vem quando a peça caiu (ou no fim, para revelar o gol). */
export interface AlvoPiece { id: number; kind: AlvoKind; name: string; size: number; sunk: boolean; cells: number[] | null }
export interface AlvoShot { index: number; hit: boolean; piece: number | null }
export interface AlvoReward { goal: boolean; levelPoints: number; hits: number; occupied: number; sunkCount: number; allSunk: boolean; text: string | null }
export interface AlvoState {
  day: number; cols: number; rows: number; maxShots: number; shotsLeft: number;
  shots: AlvoShot[]; pieces: AlvoPiece[];
  hits: number; occupied: number; sunkCount: number; finished: boolean; reward: AlvoReward | null;
  pointsPerHit: number; sinkAllPoints: number; goalAt: number; nextAt: number; serverTime: number;
}

// ─── Estatísticas ("quem tem mais?") ───────────────────────────────────────
export interface StatsPlayer {
  id: number | string; name: string; position: string; subtitle: string; photo: string | null;
  team: { slug: string | null; name: string; abbr: string; colorPrimary: string; colorSecondary: string };
  /** Só depois de escolher: o número e como mostrar ("2º (1967)", "43 anos e 6 meses"…). */
  value?: number; show?: string;
}
/** `category: 'curated'` = duelo do dono (história do Brasileirão). `winner` só vem na revelação. */
export interface StatsPair { category: string; label: string; question: string; note?: string; a: StatsPlayer; b: StatsPlayer; winner?: 'a' | 'b' }
export interface StatsState {
  day: number; nextAt: number; season: string;
  daily: { finished: boolean; score: number | null; reward: { goal: boolean; levelPoints: number; streak: number; text: string | null } | null };
  run: { mode: 'daily'; streak: number; over: boolean; pair: StatsPair | null } | null;
  best: number;
}

// ─── Camisas (maior ou menor) ───────────────────────────────────────────────
export interface CamisasState {
  day: number; nextAt: number; shirts: number; min: number; max: number; pointsPerHit: number; maxPoints: number;
  playing: boolean; finished: boolean;
  /** Camisas já viradas da sequência aberta (a última é a do palpite). As escondidas ficam no servidor. */
  shown: number[];
  goals: number; hits: number; points: number;
  /** A última sequência fechada: a do gol ou, no fim do dia, a do erro. */
  last: { seq: number[]; miss: boolean } | null;
}
export interface CamisasGuess {
  state: CamisasState; correct: boolean; number: number; levelPoints: number;
  goal: { text: string; seq: number[]; match: { id: number; homeGoals: number; awayGoals: number } | null } | null;
}

// ─── Hat Trick (chute de longe) ─────────────────────────────────────────────
/** Posições em metros: gol em y = 0 (x = 0 no meio), campo crescendo para baixo. */
export interface HattrickShot { i: number; ball: { x: number; y: number }; wind: { speed: number; angle: number } }
export type HattrickResult = 'goal' | 'saved' | 'wide' | 'post' | 'bar' | 'over' | 'whiff';
export interface HattrickState {
  day: number; nextAt: number; maxLives: number; pointsPerGoal: number; maxPoints: number;
  playing: boolean; finished: boolean; lives: number; goals: number; points: number;
  /** Só no teste local (MINIGAMES_LIVRES=1): acabou, pode jogar de novo na hora. */
  freePlay?: boolean;
  shot: HattrickShot | null;
  last: { i: number; result: HattrickResult; ball: { x: number; y: number }; wind: { speed: number; angle: number }; cross: { x: number; z: number } | null } | null;
}
export interface HattrickFlight {
  T: number; samples: [number, number, number][]; cross: { x: number; z: number } | null;
  keeper: { react: number; speed: number; to: number; save: boolean } | null;
}
export interface HattrickShootResponse {
  state: HattrickState; result: HattrickResult; levelPoints: number; flight: HattrickFlight; shot: HattrickShot;
  goal: { text: string; hatTrick: boolean; match: { id: number; homeGoals: number; awayGoals: number } | null } | null;
}
