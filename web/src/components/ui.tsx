import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { Shield } from './Shield';
import type { TopRow } from '../lib/types';
import { countdown } from '../lib/format';
import { useAuth } from '../store/auth';

export function Section({ title, right, children, className = '' }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-3 ${className}`}>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="font-poster text-base uppercase tracking-wide text-chalk">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

export function TopList({ rows, empty = 'Nenhum gol ainda.', highlight }: { rows: TopRow[]; empty?: string; highlight?: string }) {
  if (!rows.length) return <p className="py-3 text-center text-xs text-hazedim">{empty}</p>;
  return (
    <ol className="divide-y divide-line/60">
      {rows.map((r) => (
        <li key={r.userId} className={`flex items-center gap-2 py-1.5 ${highlight === r.nick ? 'rounded-lg bg-turf/10 px-1' : ''}`}>
          <span className={`w-5 text-center font-score text-sm font-bold ${r.position === 1 ? 'text-flood' : r.position <= 3 ? 'text-chalk' : 'text-haze'}`}>{r.position}</span>
          <Shield team={r.team} size={22} />
          <Link to={`/jogador/${encodeURIComponent(r.nick)}`} className={`min-w-0 flex-1 truncate text-sm font-semibold ${r.vip ? 'text-sky-300' : 'text-chalk'}`}>
            {r.nick}{r.vip && <Crown className="ml-1 inline h-3 w-3 text-flood" />}
          </Link>
          <span className="font-score text-base font-bold text-turf">{r.goals}</span>
        </li>
      ))}
    </ol>
  );
}

/** Contagem regressiva sincronizada com o relógio do servidor. */
export function useCountdown(readyAt: number | null | undefined) {
  const now = useAuth((s) => s.now);
  const [rem, setRem] = useState(() => (readyAt ? Math.max(0, readyAt - now()) : 0));
  useEffect(() => {
    if (!readyAt) { setRem(0); return; }
    const tick = () => setRem(Math.max(0, readyAt - now()));
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [readyAt]);
  return rem;
}

export function Countdown({ readyAt, className = '' }: { readyAt: number; className?: string }) {
  const rem = useCountdown(readyAt);
  return <span className={`font-score tabular-nums ${className}`}>{rem > 0 ? countdown(rem) : 'PRONTO'}</span>;
}

export function ProgressRing({ progress, size = 72, stroke = 5, color = '#22E58A', children }: { progress: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#22405F" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))} style={{ transition: 'stroke-dashoffset 0.3s linear' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <div className={`h-6 w-6 animate-spin rounded-full border-2 border-line border-t-turf ${className}`} />;
}

export function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-hazedim">{text}</p>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-night-1 p-1">
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-score text-sm font-bold uppercase tracking-wide transition ${value === it.id ? 'bg-turf text-night-0' : 'text-haze'}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
