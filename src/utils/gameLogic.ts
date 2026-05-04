import { GOAL_CHANCE } from '../constants/teams';

export function rollKick(): boolean {
  return Math.random() < GOAL_CHANCE;
}

export function getTimeRemaining(lastKickTime: number, cooldownMs: number): number {
  const elapsed = Date.now() - lastKickTime;
  const remaining = cooldownMs - elapsed;
  return remaining > 0 ? remaining : 0;
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getCurrentHourKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}`;
}

export function getCurrentRoundKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
