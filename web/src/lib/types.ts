import type { NickFade } from './nick';
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
  nickFade: NickFade; nickFadeKeys: string | null; // degradê do nick (VIP): cores para a tela + "azul>roxo" para o seletor
  /** Só em GET /api/me: o próximo chute manual exige captcha (a cada 10 chutes). */
  captchaRequired?: boolean;
  /** Diretoria: cargo no time e contrato de contratação (não troca de time até lá). */
  role: ClubRole | null; contractUntil: number | null;
  serverTime: number;
}

export interface TopRow { position: number; userId: number; nick: string; avatarUrl?: string | null; nickColor?: string | null; nickFade?: NickFade; goals: number; team: Pick<Team, 'slug' | 'name' | 'abbr' | 'colorPrimary' | 'colorSecondary'>; vip: boolean; role?: ClubRole | null; tops?: TopBadge[] }

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
  /** Chave pública do Turnstile (captcha invisível no cadastro); null = desligado no servidor. */
  turnstileSiteKey?: string | null;
  /** Paleta do nick em degradê (VIP), NICK_FADE_COLORS em lib/items.js. */
  nickFades?: { key: string; name: string; hex: string }[];
  /** Grupo do WhatsApp dos jogadores (COMMUNITY em rules.js). */
  community?: { whatsapp: string; everyHours: number };
  /** Diretoria e contratações (CLUB em rules.js). */
  club?: { directors: number; roleLossDays: number; offerMin: number; offerMax: number; offerHours: number; maxOpenOffers: number; messageMax: number };
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
  faltapro?: { kicks: number; goalAt: number; pointsPerGoal: number; maxPoints: number; targetMoney: number };
  futprego?: { bet: number; turnSec: number; maxTurns: number; inviteSec: number; botAfterSec: number; challengeMaxSec: number; maxGoalWinsPerDay: number; woMinTurns: number; reconnectSec: number };
  ganhaperde?: { start: number; drop: number; min: number; max: number; step: number; stepPrice: number; growth: number; pointsPerHit: number };
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
  id: number; nick: string; gender: string; bio: string | null; avatarUrl: string | null; createdAt: string; team: Team; vip: boolean; dexterity: number; nickColor?: string | null; nickFade?: NickFade;
  goalsTotal: number; goalsSeason: number; goalsRound: number; goalsHour: number;
  stats: Me['stats']; level: { lvl: number; name: string }; online: boolean;
  positions: { geral: number; penal: number; falta: number; trilha: number };
  recent: FeedItem[];
  role: ClubRole | null; contractUntil: number | null;
  /** top 3 de agora (hora/rodada/temporada) e quantas vezes ficou em 1º/2º/3º/top 10 */
  tops: TopBadge[]; history: Record<TopScope, TopTally>;
}

export interface TeamPage {
  team: Team; slogan: string | null; members: number; active: { nick: string; goalsTotal: number; avatarUrl: string | null; online: boolean }[]; totalGoals: number;
  standing: (Standing & { position: number }) | null;
  match: MatchView | null;
  tops: { hour: TopRow[]; round: TopRow[]; season: TopRow[] };
  titles: { season: number; competition: string; place: number }[];
  board: ClubBoard;
}

export interface ActivePlayer { nick: string; goalsTotal: number; goalsRound: number; avatarUrl: string | null; lastSeenAt: string; online: boolean; vip: boolean; nickColor?: string | null; nickFade?: NickFade; team: Team | null }

export type ChatRoom = 'geral' | 'time';
export interface ChatMention { nick: string; avatarUrl: string | null }
export interface ChatMessage { id: number; text: string; color: string | null; at: string; mentions: Record<string, ChatMention> | null; user: { id: number; nick: string; avatarUrl: string | null; level: number; levelName: string; vip: boolean; nickColor: string | null; nickFade?: NickFade; team: Team | null; role?: ClubRole | null; tops?: TopBadge[] } }
export interface ChatPage { room: string; messages: ChatMessage[]; online: number; colorLevel: number; colors: string[]; canColor: boolean }

export interface MinigameCard {
  id: string; name: string; desc: string; icon: string; route: string; rewardLabel: string; daily: boolean;
  unlockLevel: number; unlocked: boolean; soon: boolean;
  available: boolean; started: boolean; finished: boolean; won: boolean; nextAt: number | null;
  /** Cabeção: fila; FutPrego: desafios abertos (open). */
  live?: { queue?: number; open?: number; playing: number };
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

// ─── Ganha ou Perde (roleta) ──────────────────────────────────────────────
export interface GanhaPerdeState {
  day: number; nextAt: number; max: number; step: number; pointsPerHit: number;
  finished: boolean; started: boolean;
  wins: number; goals: number; points: number; spent: number; spins: number;
  /** Chance de GANHA (%) sem pagar nada agora (50, 45, 40… a cada acerto). */
  base: number;
  /** As chances que dá para escolher agora (da base até max) e o preço de cada uma. */
  options: { chance: number; price: number }[];
  /** A última girada: at = onde a seta parou, em % do círculo a partir do começo do GANHA. */
  last: { chance: number; at: number; win: boolean; price: number } | null;
}
export interface GanhaPerdeSpin {
  state: GanhaPerdeState; win: boolean; at: number; chance: number; price: number; levelPoints: number; money: number;
  goal: { text: string; match: { id: number; homeGoals: number; awayGoals: number } | null } | null;
}

// ─── Painel de admin (/api/painel — só usuários com isAdmin) ───────────────
export interface AdminGeo { country: string | null; region: string | null; city: string | null; isp: string | null }
export interface AdminUserRow {
  id: number; nick: string; email: string; avatarUrl: string | null; nickColor: string | null; nickFade?: NickFade;
  team: Team | null; level: { lvl: number; name: string }; levelPoints: number;
  goalsTotal: number; money: number; vip: boolean; vipDays: number;
  banned: boolean; bannedUntil: string | null; isAdmin: boolean; lastSeenAt: string; online: boolean;
  createdAt: string; invitedBy?: string | null;
}
export interface AdminUserDetail extends AdminUserRow {
  gender: string; bio: string | null; dexterity: number; levelBonus: number; vipUntil: string | null;
  /** Última conexão do jogador: IP + geolocalização (geo null = sem dados). */
  conn: { ip: string | null; at: string | null; geo: AdminGeo | null };
}
export interface AdminUsersPage { page: number; pages: number; total: number; users: AdminUserRow[] }
/** Campos editáveis; banHours > 0 bane a partir de agora, 0 desbane. */
export interface AdminPatch {
  nick?: string; email?: string; bio?: string | null; money?: number; vipDays?: number;
  dexterity?: number; nickColor?: string | null; teamSlug?: string; banHours?: number;
}
export interface AdminLogRow { id: number; admin: string; target: string | null; targetAvatar: string | null; action: string; payload: any; at: string }
export interface AdminLogPage { page: number; pages: number; total: number; rows: AdminLogRow[] }

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

// ─── Falta PRO (cobrança de falta 3D) ───────────────────────────────────────
/** Metros, sistema da cena 3D: gol em z = 0 (x = 0 no meio, y = altura), campo em +z. */
export interface FaltaProKick {
  i: number; ball: { x: number; z: number };
  wall: { z: number; x0: number; x1: number; n: number };
  keeperX: number; targets: { x: number; y: number }[];
}
export type FaltaProResult = 'goal' | 'saved' | 'wall' | 'wide' | 'over' | 'post' | 'bar' | 'short';
export interface FaltaProState {
  day: number; nextAt: number; kicks: number; goalAt: number; pointsPerGoal: number; maxPoints: number; targetMoney: number;
  playing: boolean; finished: boolean;
  /** Só no teste local (MINIGAMES_LIVRES=1): acabou, pode jogar de novo na hora. */
  freePlay?: boolean;
  i: number; goals: number; points: number; money: number;
  kick: FaltaProKick | null;
  results: { i: number; result: FaltaProResult; target: number | null }[];
}
export interface FaltaProFlight {
  /** Amostras [x, z, y] a 30/s (x lateral, z distância do gol, y altura). */
  T: number; samples: [number, number, number][]; cross: { x: number; y: number } | null;
  wall: { jump: boolean; hit: { x: number; y: number; t: number } | null };
  keeper: { react: number; speed: number; from: number; to: number; save: boolean } | null;
}
export interface FaltaProKickResponse {
  state: FaltaProState; result: FaltaProResult; target: number | null; levelPoints: number; money: number;
  flight: FaltaProFlight; kick: FaltaProKick;
  goal: { text: string; match: { id: number; homeGoals: number; awayGoals: number } | null } | null;
}

// Frangaço: o jogo é o cliente Unity (/tv/?mode=penalty) falando direto com /api/frangaco/* — sem tipos aqui.

// ─── VIP pago (PIX na Efí) ──────────────────────────────────────────────────
export interface VipPack { key: string; days: number; price: number; perDay: number; tag: string | null }
export interface VipPurchase {
  id: number; packKey: string; days: number; amount: number; status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
  /** PIX copia e cola e a imagem do QR (PNG em base64, sem o prefixo data:). */
  pixCode: string | null; qrImage: string | null; expiresAt: number; paidAt: number | null;
}
export interface VipState {
  /** enabled = a compra por PIX está ligada no servidor; test = Efí simulada (só no PC de teste). */
  enabled: boolean; test: boolean; packs: VipPack[];
  /** VIP chuta sozinho com o app fechado (VIP_OFFLINE_AUTO no servidor; desligado por ora). */
  offlineAuto: boolean;
  vip: { active: boolean; until: number | null; bank: number };
  pending: VipPurchase | null; history: VipPurchase[];
}

// ─── Diretoria e contratações ────────────────────────────────────────────────
export type ClubRole = 'PRESIDENTE' | 'DIRETOR';
export interface ClubSeat { id: number; nick: string; avatarUrl: string | null; gender: string; vip: boolean; online: boolean; since: number }
export interface ClubMove { id: number; nick: string; avatarUrl: string | null; vip: number; at: number; arrived: boolean; team: Team; fromTeam: Team | null }
export interface ClubBoard { president: ClubSeat | null; directors: (ClubSeat | null)[]; moves: ClubMove[] }
export interface OfferReceived {
  id: number; team: Team; vip: number; days: number; message: string | null;
  from: { nick: string; avatarUrl: string | null; role: ClubRole | null }; expiresAt: number; createdAt: number;
}
export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REFUSED' | 'CANCELED' | 'EXPIRED';
export interface OfferSent {
  id: number; vip: number; message: string | null; status: OfferStatus; expiresAt: number; decidedAt: number | null; createdAt: number;
  to: { nick: string; avatarUrl: string | null; team: Team };
}
export interface ClubState {
  team: Team; role: ClubRole | null; board: ClubBoard;
  claim: { ok: boolean; reason: string | null };
  contract: { until: number } | null;
  bank: number;
  rules: { offerMin: number; offerMax: number; offerHours: number; directors: number; roleLossDays: number; messageMax: number };
  received: OfferReceived[]; sent: OfferSent[];
  gifts: { id: number; nick: string; days: number; at: number }[];
}
export interface ClubCandidate { id: number; nick: string; avatarUrl: string | null; gender: string; vip: boolean; online: boolean; goalsTotal: number }

// ─── Presença da Semana (login diário) ────────────────────────────────────────
export interface PassReward {
  xp: number; baseXp: number; money: number; dexterity: number; vip: number;
  item: { key: string; level: number | null; name: string; icon: string; hours: number } | null;
  /** destreza já no máximo: o ponto virou dinheiro (valor em R$) */
  dexterityAsMoney?: number;
}
export interface PassDay extends PassReward { step: number; done: boolean }
export interface PassState {
  today: number; claimed: boolean; step: number; week: number; vip: boolean; broken: boolean;
  nextAt: number; vipXp: number; streakVip: number; days: PassDay[];
}

// ─── Distintivos: P/D do cargo e top 3 de agora; quadro de top 10 do perfil ───
export type TopScope = 'HOUR' | 'ROUND' | 'SEASON';
export interface TopBadge { scope: TopScope; pos: number }
export interface TopTally { gold: number; silver: number; bronze: number; top10: number }

// ─── Convites (link de afiliado) ──────────────────────────────────────────────
export interface RefMilestone { goals: number; vip: number }
export interface RefState {
  code: string; milestones: RefMilestone[]; perFriend: number; count: number; earned: number;
  invited: { nick: string; avatarUrl: string | null; team: Team; goals: number; since: number; earned: number; next: RefMilestone | null }[];
}
export interface RefInviter { nick: string; avatarUrl: string | null; team: Team; perFriend: number }

// ─── Página da partida (/partida/:id) ─────────────────────────────────────────
type KindTally = { AUTO: number; PENALTY: number; FOUL: number; TRAIL: number; MINI: number };
type MatchScorer = { userId: number; nick: string; avatarUrl: string | null; nickColor: string | null; nickFade?: NickFade; vip: boolean; goals: number; role?: ClubRole | null; tops?: TopBadge[] };
type MatchStanding = { position: number; of: number; points: number; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
export interface MatchPage {
  id: number; status: 'LIVE' | 'FINISHED'; serie: Serie;
  round: { number: number; season: number; startsAt: number; endsAt: number };
  home: Team; away: Team; homeGoals: number; awayGoals: number; pct: number;
  result: 'home' | 'away' | 'draw' | null;
  best: MatchScorer | null; tops: { home: MatchScorer[]; away: MatchScorer[] };
  scorersCount: { home: number; away: number };
  byKind: { home: KindTally; away: KindTally }; minigames: { kind: string; label: string; home: number; away: number }[];
  /** Gols tirados do placar porque alguém do time perdeu no FutPrego. */
  lost?: { home: number; away: number };
  timeline: { key: string; hour: number; home: number; away: number }[];
  standing: { home: MatchStanding | null; away: MatchStanding | null };
  online: { home: number; away: number } | null;
  seasonTop: { home: { nick: string; avatarUrl: string | null; goals: number } | null; away: { nick: string; avatarUrl: string | null; goals: number } | null };
  h2h: { matches: { id: number; season: number; round: number; homeGoals: number; awayGoals: number; winner: 'home' | 'away' | 'draw' }[]; home: number; draws: number; away: number };
  recent: { id: number; side: 'home' | 'away' | null; nick: string; avatarUrl: string | null; kind: string; label: string; at: number }[];
  serverTime: number;
}

// ─── Conta (exigências da Play Store): bloqueios, denúncias e exclusão ──────
export interface BlockedUser { id: number; nick: string; avatarUrl: string | null; at: string }
export type ReportReason = 'ofensa' | 'spam' | 'golpe' | 'nick' | 'foto' | 'outro';
export interface AdminReportRow {
  id: number; reason: ReportReason; details: string | null; messageId: number | null; messageText: string | null;
  status: 'OPEN' | 'RESOLVED'; resolution: 'ignorar' | 'apagar' | 'banir' | null; resolvedAt: string | null; at: string;
  reporter: { id: number; nick: string };
  target: { id: number; nick: string; avatarUrl: string | null; banned: boolean; deleted: boolean };
}
export interface AdminReportsPage { status: 'OPEN' | 'RESOLVED'; page: number; pages: number; total: number; open: number; rows: AdminReportRow[] }
