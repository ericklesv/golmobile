import { create } from 'zustand';
import { track, origem } from '../lib/track';
import { adsSignup } from '../lib/ads';
import { api, token, ApiError } from '../lib/api';
import type { Me, Meta } from '../lib/types';

interface AuthState {
  me: Me | null;
  meta: Meta | null;
  loading: boolean;
  online: number;
  active: number;
  offers: number; // propostas de contratação abertas para mim (heartbeat; selo na aba Time)
  unread: number; // mensagens não lidas (heartbeat e /api/me; selo no envelope do topo)
  updateReady: boolean; // há versão nova do app esperando (lib/pwa.ts) — banner "Atualizar" no Layout
  offset: number; // serverTime - Date.now()
  boot: () => Promise<void>;
  setMe: (me: Me) => void;
  refresh: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  register: (b: { nick: string; email: string; password: string; teamSlug: string; gender: string; ref?: string; elapsedMs?: number; turnstileToken?: string }) => Promise<void>;
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
  unread: 0,
  updateReady: false,
  offset: 0,
  now: () => Date.now() + get().offset,
  setMe: (me) => set({ me, unread: me.unread ?? get().unread, offset: me.serverTime ? me.serverTime - Date.now() : get().offset }),
  boot: async () => {
    const metaP = api.meta().catch(() => null);
    if (token.get()) {
      try {
        const me = await api.me();
        set({ me, unread: me.unread ?? get().unread, offset: me.serverTime - Date.now() });
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
      set({ me, unread: me.unread ?? get().unread, offset: me.serverTime - Date.now() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { token.set(null); set({ me: null }); }
    }
  },
  login: async (login, password) => {
    const r = await api.login({ login, password });
    token.set(r.token);
    set({ unread: (r as any)?.unread ?? get().unread, me: r.me, offset: r.me.serverTime - Date.now() });
  },
  register: async (b) => {
    const r = await api.register(b);
    token.set(r.token);
    set({ unread: (r as any)?.unread ?? get().unread, me: r.me, offset: r.me.serverTime - Date.now() });
    track('cadastro.ok', { time: b.teamSlug, convite: b.ref ? true : undefined, origem: origem() }); // funil dos novatos (lib/track.ts)
    adsSignup(); // conversão "Cadastro JogaGol" do Google Ads (lib/ads.ts)
  },
  logout: () => { token.set(null); set({ me: null }); },
}));
