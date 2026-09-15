import { create } from 'zustand';
import { api, token, ApiError } from '../lib/api';
import type { Me, Meta } from '../lib/types';

interface AuthState {
  me: Me | null;
  meta: Meta | null;
  loading: boolean;
  online: number;
  active: number;
  offers: number; // propostas de contratação abertas para mim (heartbeat; selo na aba Time)
  offset: number; // serverTime - Date.now()
  boot: () => Promise<void>;
  setMe: (me: Me) => void;
  refresh: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  register: (b: { nick: string; email: string; password: string; teamSlug: string; gender: string; ref?: string; website?: string; startedAt?: number; turnstileToken?: string }) => Promise<void>;
  logout: () => void;
  now: () => number;
}

export const useAuth = create<AuthState>((set, get) => ({
  me: null,
  meta: null,
  loading: true,
  online: 0,
  active: 0,
  offers: 0,
  offset: 0,
  now: () => Date.now() + get().offset,
  setMe: (me) => set({ me, offset: me.serverTime ? me.serverTime - Date.now() : get().offset }),
  boot: async () => {
    const metaP = api.meta().catch(() => null);
    if (token.get()) {
      try {
        const me = await api.me();
        set({ me, offset: me.serverTime - Date.now() });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) token.set(null);
      }
    }
    const meta = await metaP;
    set({ meta, loading: false });
  },
  refresh: async () => {
    if (!token.get()) return;
    try {
      const me = await api.me();
      set({ me, offset: me.serverTime - Date.now() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { token.set(null); set({ me: null }); }
    }
  },
  login: async (login, password) => {
    const r = await api.login({ login, password });
    token.set(r.token);
    set({ me: r.me, offset: r.me.serverTime - Date.now() });
  },
  register: async (b) => {
    const r = await api.register(b);
    token.set(r.token);
    set({ me: r.me, offset: r.me.serverTime - Date.now() });
  },
  logout: () => { token.set(null); set({ me: null }); },
}));
