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
  const s = String(hourKey ?? ''); // à prova de chave errada (antes um número aqui derrubava a tela)
  const h = s.split('-')[3];
  return h ? `${h}:00` : s;
}

/** Tempo que falta: "29 d 3 h" / "27 h 12 min" / "8 min" / "vencido". */
export function timeLeft(ms: number): string {
  if (ms <= 0) return 'vencido';
  const m = Math.ceil(ms / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} d ${h % 24} h`;
  if (h >= 1) return `${h} h ${m % 60} min`;
  return `${m} min`;
}

/** Versão curta para o topo da tela: "29d 3h" / "5h 12m" / "8 min". */
export function timeLeftShort(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m % 60}m`;
  return `${m} min`;
}

/** "17/09 às 21:52" (hora de Brasília). */
export function untilLabel(ms: number): string {
  const d = new Date(ms);
  const tz = { timeZone: 'America/Sao_Paulo' } as const;
  return `${d.toLocaleDateString('pt-BR', { ...tz, day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' })}`;
}

export function pct(v: number) { return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`; }
