import { auth } from '../config/firebase';

// URL da API no Railway. Em dev, aponte para o servidor local com:
//   EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 npx expo start
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://golmobile-server.up.railway.app';

export type KickType = 'auto' | 'falta' | 'penalti';
export type PenaltyDirection = 'left' | 'center' | 'right';

export interface KickResult {
  goal: boolean;
  keeperDir: PenaltyDirection | null;
  cooldownMs: number;
  kickedAt: number;
}

export interface TrailPickResult {
  mine: boolean;
  goal: boolean;
  finished: boolean;
  phase: number;
  lineMines: boolean[];
  cooldownMs: number;
  kickedAt: number | null;
}

async function call<T>(path: string, body: object): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Object.assign(new Error('Não autenticado'), { code: 'unauthenticated' });
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.message ?? 'Falha na requisição'), { code: data.error });
  }
  return data as T;
}

export function kickAction(type: KickType, direction?: PenaltyDirection): Promise<KickResult> {
  return call<KickResult>('/kick', { type, direction });
}

export function trailPickAction(pickIndex: number): Promise<TrailPickResult> {
  return call<TrailPickResult>('/trail-pick', { pickIndex });
}

export function isCooldownError(e: unknown): boolean {
  return (e as any)?.code === 'cooldown';
}
