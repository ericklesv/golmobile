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

// Chaves de janela no fuso de Brasília — DEVEM espelhar functions/index.js
const TZ = 'America/Sao_Paulo';

function tzParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') };
}

export function getCurrentHourKey(): string {
  const { y, m, d, h } = tzParts();
  return `${y}-${m}-${d}-${h}`;
}

export function getCurrentRoundKey(): string {
  const { y, m, d } = tzParts();
  return `${y}-${m}-${d}`;
}
