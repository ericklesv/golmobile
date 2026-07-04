import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

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

const kickFn = httpsCallable(functions, 'kick');
const trailPickFn = httpsCallable(functions, 'trailPick');

export async function kickAction(type: KickType, direction?: PenaltyDirection): Promise<KickResult> {
  const res = await kickFn({ type, direction });
  return res.data as KickResult;
}

export async function trailPickAction(pickIndex: number): Promise<TrailPickResult> {
  const res = await trailPickFn({ pickIndex });
  return res.data as TrailPickResult;
}

export function isCooldownError(e: unknown): boolean {
  return (e as any)?.code === 'functions/failed-precondition';
}
