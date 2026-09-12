export const money = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
export const num = (v: number) => Math.round(v).toLocaleString('pt-BR');

export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function timeAgo(iso: string | number): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export function hourLabel(hourKey: string): string {
  const h = hourKey.split('-')[3];
  return h ? `${h}:00` : hourKey;
}

export function pct(v: number) { return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`; }
