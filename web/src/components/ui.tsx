import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield } from './Shield';
import { Avatar } from './Avatar';
import type { TopRow } from '../lib/types';
import { nickProps } from '../lib/nick';
import { countdown } from '../lib/format';
import { useAuth } from '../store/auth';
import { NameBadges } from './Badges';

/** Painel branco com ribbon de título por cima. */
export function Panel({ title, ribbon = 'blue', right, children, className = '' }: { title?: string; ribbon?: 'blue' | 'orange' | 'green' | 'yellow'; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`relative ${title ? 'pt-7' : ''} ${className}`}>
      {title && (
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center">
          <div className={`ribbon ribbon-${ribbon} text-[16px]`}>{title}</div>
        </div>
      )}
      <div className={`panel ${title ? 'pt-7' : ''}`}>
        {right && <div className="absolute right-3 top-9 z-10">{right}</div>}
        {children}
      </div>
    </section>
  );
}

const medal = ['/ui/ico-medal_gold.png', '/ui/ico-medal_silver.png', '/ui/ico-medal_bronze.png'];

export function TopList({ rows, empty = 'Ninguém marcou ainda.', highlight }: { rows: TopRow[]; empty?: string; highlight?: string }) {
  if (!rows.length) return <p className="py-3 text-center text-xs font-bold text-muted">{empty}</p>;
  return (
    <ol className="flex flex-col gap-1">
      {rows.map((r) => (
        <li key={r.userId} className={`flex items-center gap-2 rounded-xl px-1.5 py-1 ${highlight === r.nick ? 'bg-gold/25' : r.position % 2 ? 'bg-sky/10' : ''}`}>
          <span className="flex w-7 shrink-0 items-center justify-center">
            {r.position <= 3 ? <img src={medal[r.position - 1]} className="ico h-7 w-7" alt="" /> : <span className="font-display text-base text-muted">{r.position}</span>}
          </span>
          <Link to={`/jogador/${encodeURIComponent(r.nick)}`} aria-label={r.nick}><Avatar url={r.avatarUrl} size={26} /></Link>
          {r.team?.slug ? <Link to={`/time/${r.team.slug}`} aria-label={r.team.name}><Shield team={r.team} size={22} /></Link> : <Shield team={r.team} size={22} />}
          <Link to={`/jogador/${encodeURIComponent(r.nick)}`} className={`min-w-0 flex-1 break-all text-[14px] font-extrabold leading-tight ${nickProps(r).className}`} style={nickProps(r).style}>
            {r.nick}{r.vip && <img src="/ui/ico-crown_silver.png" className="ico ml-1 h-4 w-4" alt="VIP" />}<NameBadges role={r.role} tops={r.tops} />
          </Link>
          <span className="font-display text-lg text-grass-deep">{r.goals}</span>
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
  return <span className={`font-display tabular-nums ${className}`}>{rem > 0 ? countdown(rem) : 'PRONTO'}</span>;
}

export function ProgressRing({ progress, size = 72, stroke = 6, color = '#4CD137', track = 'rgba(11,45,107,0.25)', children }: { progress: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))} style={{ transition: 'stroke-dashoffset 0.3s linear' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Bar({ value, max, label, yellow = false }: { value: number; max: number; label?: string; yellow?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 100;
  return (
    <div className="bar">
      <i className={yellow ? 'yellow' : ''} style={{ width: `calc(${pct}% + 6px)` }} />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <img src="/ui/ico-coin01_s.png" className={`h-8 w-8 animate-spin ${className}`} alt="" />;
}

export function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm font-bold text-muted">{text}</p>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-navy-deep/35 p-1">
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)} className={`whitespace-nowrap rounded-xl px-3 py-2 font-display text-[13px] uppercase tracking-wide transition ${value === it.id ? 'bg-white text-navy-ink shadow' : 'text-white/80'}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Icon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  return <img src={`/ui/${name}.png`} alt="" className={`ico ${className}`} style={{ width: size, height: size }} />;
}

/** Cabeçalho de página com botão voltar e ribbon. */
export function PageTitle({ title, ribbon = 'orange', right }: { title: string; ribbon?: 'blue' | 'orange' | 'green' | 'yellow'; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className={`ribbon ribbon-${ribbon}`}>{title}</div>
      {right}
    </div>
  );
}
