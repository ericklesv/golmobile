import type { Home, KickResult, League, Me, Meta, PartyResult, PublicPlayer, TeamPage, TopRow, TrailResult } from './types';

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
  heartbeat: () => req<{ ok: boolean; online: number; active: number; serverTime: number }>('POST', '/api/me/heartbeat'),
  setBio: (bio: string) => req<Me>('PUT', '/api/me/bio', { bio }),
  buyDexterity: (qty = 1) => req<Me>('POST', '/api/me/buy-dexterity', { qty }),
  nerf: (nick: string) => req<{ ok: boolean; me: Me }>('POST', `/api/me/nerf/${encodeURIComponent(nick)}`),
  activateVip: (days: number) => req<Me>('POST', '/api/me/activate-vip', { days }),
  changeTeam: (teamSlug: string) => req<Me>('POST', '/api/me/change-team', { teamSlug }),
  // play
  autoKick: () => req<KickResult>('POST', '/api/play/auto'),
  penalty: (direction: 'left' | 'center' | 'right') => req<KickResult>('POST', '/api/play/penalty', { direction }),
  foul: (direction: 'left' | 'over' | 'right') => req<KickResult>('POST', '/api/play/foul', { direction }),
  trail: (index: number) => req<TrailResult>('POST', '/api/play/trail', { index }),
  party: () => req<PartyResult>('POST', '/api/play/party'),
  // leitura
  meta: () => req<Meta>('GET', '/api/meta'),
  home: (team?: string) => req<Home>('GET', `/api/home${team ? `?team=${encodeURIComponent(team)}` : ''}`),
  rankings: (scope: string, limit = 50) => req<{ scope: string; key: any; rows: TopRow[] }>('GET', `/api/rankings/${scope}?limit=${limit}`),
  league: () => req<League>('GET', '/api/league'),
  round: (n: number) => req<{ round: any; matches: any[] }>('GET', `/api/league/rounds/${n}`),
  titles: () => req<any[]>('GET', '/api/league/titles'),
  team: (slug: string) => req<TeamPage>('GET', `/api/teams/${slug}`),
  player: (nick: string) => req<PublicPlayer>('GET', `/api/players/${encodeURIComponent(nick)}`),
  search: (q: string) => req<{ nick: string; goalsTotal: number; team: any }[]>('GET', `/api/players/search?q=${encodeURIComponent(q)}`),
  feed: (team?: string) => req<any[]>('GET', `/api/feed${team ? `?team=${team}` : ''}`),
};
