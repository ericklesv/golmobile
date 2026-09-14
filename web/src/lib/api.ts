import type { AdminLogPage, AdminPatch, AdminUserDetail, AdminUserRow, AdminUsersPage, AlvoPiece, AlvoState, ActivePlayer, CamisasGuess, CamisasState, FaltaProKickResponse, FaltaProState, HattrickShootResponse, HattrickState, VipPurchase, VipState, ClubCandidate, ClubState, CaptchaPayload, ChatMessage, ChatPage, ChatRoom, DailyStatus, Home, KickResult, League, Me, MemoriaCard, MemoriaReward, MemoriaState, Meta, MinigameCard, PartyResult, PublicPlayer, QualtimeState, QuizState, ShopView, StatsPair, StatsState, TeamPage, TermoReward, TermoState, TopRow, TrailResult, UserItemView } from './types';

const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'brgol.token';

export class ApiError extends Error {
  code: string; status: number; extra: any;
  constructor(status: number, code: string, message: string, extra: any = {}) {
    super(message); this.status = status; this.code = code; this.extra = extra;
  }
}

export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} },
};

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão. Verifique sua internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, message, ...extra } = data as any;
    throw new ApiError(res.status, error || 'error', message || 'Falha na requisição.', extra);
  }
  return data as T;
}

export const api = {
  // auth
  register: (b: { nick: string; email: string; password: string; teamSlug: string; gender: string }) => req<{ token: string; me: Me }>('POST', '/api/auth/register', b),
  login: (b: { login: string; password: string }) => req<{ token: string; me: Me }>('POST', '/api/auth/login', b),
  // me
  me: () => req<Me>('GET', '/api/me'),
  heartbeat: () => req<{ ok: boolean; online: number; active: number; offers: number; serverTime: number }>('POST', '/api/me/heartbeat'),
  opponent: () => req<{ opponent: import('./types').Team | null }>('GET', '/api/me/opponent'),
  setBio: (bio: string) => req<Me>('PUT', '/api/me/bio', { bio }),
  buyDexterity: (qty = 1) => req<Me>('POST', '/api/me/buy-dexterity', { qty }),
  nerf: (nick: string) => req<{ ok: boolean; me: Me }>('POST', `/api/me/nerf/${encodeURIComponent(nick)}`),
  activateVip: (days: number) => req<Me>('POST', '/api/me/activate-vip', { days }),
  changeTeam: (teamSlug: string) => req<Me>('POST', '/api/me/change-team', { teamSlug }),
  // play
  autoKick: () => req<KickResult>('POST', '/api/play/auto'),
  penalty: (direction: 'left' | 'center' | 'right', captcha?: CaptchaPayload | null) => req<KickResult>('POST', '/api/play/penalty', { direction, ...(captcha ?? {}) }),
  foul: (direction: 'left' | 'over' | 'right', captcha?: CaptchaPayload | null) => req<KickResult>('POST', '/api/play/foul', { direction, ...(captcha ?? {}) }),
  trail: (index: number, captcha?: CaptchaPayload | null) => req<TrailResult>('POST', '/api/play/trail', { index, ...(captcha ?? {}) }),
  captcha: (fresh = false) => req<{ id: string; question: string; expiresAt: number }>('GET', `/api/play/captcha${fresh ? '?nova=1' : ''}`),
  captchaSolve: (captchaId: string, answer: string) => req<{ ok: boolean; reason?: string; message?: string; captcha?: { id: string; question: string; expiresAt: number } }>('POST', '/api/play/captcha', { captchaId, answer }),
  party: () => req<PartyResult>('POST', '/api/play/party'),
  // minigames diários
  daily: () => req<DailyStatus>('GET', '/api/daily'),
  minigames: () => req<{ level: number; games: MinigameCard[] }>('GET', '/api/daily/hub'),
  memoria: () => req<MemoriaState>('GET', '/api/daily/memoria'),
  alvo: () => req<{ state: AlvoState }>('GET', '/api/daily/alvo'),
  alvoShot: (index: number, day: number) => req<{ state: AlvoState; hit: boolean; sunk: AlvoPiece | null }>('POST', '/api/daily/alvo/shot', { index, day }),
  qualtime: () => req<{ state: QualtimeState }>('GET', '/api/daily/qualtime'),
  qualtimeNext: (day: number) => req<{ state: QualtimeState }>('POST', '/api/daily/qualtime/next', { day }),
  qualtimeAnswer: (index: number, choice: number, day: number) => req<{ state: QualtimeState; correct: boolean; timeout: boolean; correctChoice: number; type: string }>('POST', '/api/daily/qualtime/answer', { index, choice, day }),
  memoriaFlip: (index: number, day: number) => req<{ state: MemoriaState; revealed: MemoriaCard[]; match: boolean | null; reward: MemoriaReward | null }>('POST', '/api/daily/memoria/flip', { index, day }),
  termo: () => req<TermoState>('GET', '/api/daily/termo'),
  termoGuess: (word: string, day: number) => req<{ state: TermoState; reward: TermoReward | null }>('POST', '/api/daily/termo/guess', { word, day }),
  quiz: () => req<{ state: QuizState }>('GET', '/api/daily/quiz'),
  quizNext: (day: number) => req<{ state: QuizState }>('POST', '/api/daily/quiz/next', { day }),
  quizAnswer: (index: number, choice: number, day: number) => req<{ state: QuizState; correct: boolean; timeout: boolean; correctChoice: number }>('POST', '/api/daily/quiz/answer', { index, choice, day }),
  stats: () => req<{ state: StatsState }>('GET', '/api/daily/stats'),
  statsStart: () => req<{ state: StatsState }>('POST', '/api/daily/stats/start'),
  statsPick: (side: 'a' | 'b') => req<{ state: StatsState; correct: boolean; picked: 'a' | 'b'; revealed: StatsPair }>('POST', '/api/daily/stats/pick', { side }),
  camisas: () => req<{ state: CamisasState }>('GET', '/api/daily/camisas'),
  camisasStart: () => req<{ state: CamisasState }>('POST', '/api/daily/camisas/start'),
  camisasGuess: (guess: 'maior' | 'menor') => req<CamisasGuess>('POST', '/api/daily/camisas/guess', { guess }),
  hattrick: () => req<{ state: HattrickState }>('GET', '/api/daily/hattrick'),
  hattrickStart: () => req<{ state: HattrickState }>('POST', '/api/daily/hattrick/start'),
  hattrickShoot: (b: { i: number; dirX: number; dirY: number; power: number; strike: { sx: number; sy: number } | null }) => req<HattrickShootResponse>('POST', '/api/daily/hattrick/shoot', b),
  faltapro: () => req<{ state: FaltaProState }>('GET', '/api/daily/faltapro'),
  faltaproStart: () => req<{ state: FaltaProState }>('POST', '/api/daily/faltapro/start'),
  faltaproKick: (b: { i: number; dirX: number; dirY: number; power: number; spin: number }) => req<FaltaProKickResponse>('POST', '/api/daily/faltapro/kick', b),
  // Frangaço: o cliente Unity (/tv/?mode=penalty) fala direto com /api/frangaco/* — nada aqui.
  // leitura
  meta: () => req<Meta>('GET', '/api/meta'),
  home: (team?: string) => req<Home>('GET', `/api/home${team ? `?team=${encodeURIComponent(team)}` : ''}`),
  rankings: (scope: string, limit = 50) => req<{ scope: string; key: any; rows: TopRow[] }>('GET', `/api/rankings/${scope}?limit=${limit}`),
  league: () => req<League>('GET', '/api/league'),
  round: (n: number) => req<{ round: any; matches: any[] }>('GET', `/api/league/rounds/${n}`),
  titles: () => req<any[]>('GET', '/api/league/titles'),
  team: (slug: string) => req<TeamPage>('GET', `/api/teams/${slug}`),
  player: (nick: string) => req<PublicPlayer>('GET', `/api/players/${encodeURIComponent(nick)}`),
  chat: (room: ChatRoom, after = 0) => req<ChatPage>('GET', `/api/chat/${room}${after ? `?after=${after}` : ''}`),
  chatSend: (room: ChatRoom, text: string, color?: string) => req<ChatMessage>('POST', `/api/chat/${room}`, { text, color }),
  activePlayers: () => req<ActivePlayer[]>('GET', '/api/players/active'),
  uploadAvatar: async (file: File) => {
    const fd = new FormData(); fd.append('avatar', file);
    const headers: Record<string, string> = {}; const t = token.get(); if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`${BASE}/api/uploads/avatar`, { method: 'POST', headers, body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as any).error || 'upload', (data as any).message || 'Falha no envio.');
    return data as Me;
  },
  removeAvatar: () => req<Me>('DELETE', '/api/uploads/avatar'),
  search: (q: string) => req<{ nick: string; goalsTotal: number; avatarUrl: string | null; team: any }[]>('GET', `/api/players/search?q=${encodeURIComponent(q)}`),
  feed: (team?: string) => req<any[]>('GET', `/api/feed${team ? `?team=${team}` : ''}`),
  // VIP pago (PIX)
  vip: () => req<VipState>('GET', '/api/vip'),
  vipBuy: (pack: string) => req<{ purchase: VipPurchase }>('POST', '/api/vip/buy', { pack }),
  vipPurchase: (id: number) => req<{ purchase: VipPurchase; bank: number }>('GET', `/api/vip/purchases/${id}`),
  // diretoria e contratações
  club: () => req<ClubState>('GET', '/api/club'),
  clubCandidates: () => req<ClubCandidate[]>('GET', '/api/club/candidates'),
  clubClaim: () => req<ClubState>('POST', '/api/club/claim'),
  clubResign: () => req<ClubState>('POST', '/api/club/resign'),
  clubAppoint: (nick: string) => req<ClubState>('POST', '/api/club/directors', { nick }),
  clubRemoveDirector: (nick: string) => req<ClubState>('POST', '/api/club/directors/remove', { nick }),
  clubPass: (nick: string) => req<ClubState>('POST', '/api/club/pass', { nick }),
  offerSend: (nick: string, vip: number, message: string) => req<ClubState>('POST', '/api/club/offers', { nick, vip, message }),
  offerAccept: (id: number) => req<ClubState>('POST', `/api/club/offers/${id}/accept`),
  offerRefuse: (id: number) => req<ClubState>('POST', `/api/club/offers/${id}/refuse`),
  offerCancel: (id: number) => req<ClubState>('POST', `/api/club/offers/${id}/cancel`),
  giftVip: (nick: string, days: number) => req<{ ok: boolean; to: string; days: number }>('POST', '/api/club/gift', { nick, days }),
  vipTestPay: (id: number) => req<{ purchase: VipPurchase; bank: number }>('POST', `/api/vip/purchases/${id}/test-pay`),
  // loja
  shop: () => req<ShopView>('GET', '/api/shop'),
  shopBuy: (key: string, currency: 'money' | 'vip' = 'money') => req<{ me: Me; item: UserItemView }>('POST', '/api/shop/buy', { key, currency }),
  shopEquip: (key: string) => req<Me>('POST', '/api/shop/equip', { key }),
  shopNick: (nick: string) => req<Me>('POST', '/api/shop/nick', { nick }),
  shopNickColor: (color: string | null) => req<Me>('POST', '/api/shop/nick-color', { color }),
  // painel de admin (só usuários com isAdmin; o servidor nega os demais)
  adminUsers: (q = '', page = 1) => req<AdminUsersPage>('GET', `/api/painel/users?q=${encodeURIComponent(q)}&page=${page}`),
  adminUser: (id: number) => req<AdminUserDetail>('GET', `/api/painel/users/${id}`),
  adminPatch: (id: number, body: AdminPatch) => req<AdminUserDetail>('PATCH', `/api/painel/users/${id}`, body),
  adminGols: (id: number, qtd: number) => req<{ ok: boolean; qtd: number; user: AdminUserRow; text: string | null }>('POST', `/api/painel/users/${id}/gols`, { qtd }),
  adminExp: (id: number, qtd: number) => req<{ ok: boolean; qtd: number; user: AdminUserRow }>('POST', `/api/painel/users/${id}/exp`, { qtd }),
  adminLog: (page = 1) => req<AdminLogPage>('GET', `/api/painel/log?page=${page}`),
  // recuperação de senha
  forgotPassword: (email: string) => req<{ ok: boolean; message: string }>('POST', '/api/auth/forgot', { email }),
  resetPassword: (token: string, password: string) => req<{ ok: boolean; nick: string; message: string }>('POST', '/api/auth/reset', { token, password }),
};
