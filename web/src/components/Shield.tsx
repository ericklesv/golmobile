import type { Team } from '../lib/types';

type T = Pick<Team, 'abbr' | 'colorPrimary' | 'colorSecondary'> & { name?: string };

/** Escudo gerado (sem marcas): brasão com faixa diagonal nas cores do clube + sigla. */
export function Shield({ team, size = 40, className = '' }: { team: T | null | undefined; size?: number; className?: string }) {
  const c1 = team?.colorPrimary ?? '#22405F';
  const c2 = team?.colorSecondary ?? '#0A1B2B';
  const abbr = team?.abbr ?? '???';
  const light = isLight(c1);
  const id = `g${abbr}${size}`.replace(/[^a-z0-9]/gi, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-label={team?.name ?? abbr}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
        <clipPath id={`${id}c`}><path d="M32 3 L57 11 V32 C57 47 45 57 32 61 C19 57 7 47 7 32 V11 Z" /></clipPath>
      </defs>
      <path d="M32 3 L57 11 V32 C57 47 45 57 32 61 C19 57 7 47 7 32 V11 Z" fill={c1} />
      <g clipPath={`url(#${id}c)`}>
        <path d="M-10 40 L74 6 L74 26 L-10 60 Z" fill={c2} />
        <rect x="0" y="0" width="64" height="64" fill={`url(#${id}s)`} />
      </g>
      <path d="M32 3 L57 11 V32 C57 47 45 57 32 61 C19 57 7 47 7 32 V11 Z" fill="none" stroke="#EDF4F3" strokeOpacity="0.85" strokeWidth="2.5" />
      <text x="32" y="38" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="17" fill={light ? '#0A1B2B' : '#FFFFFF'} stroke={light ? 'none' : '#000'} strokeOpacity="0.35" strokeWidth="0.6" letterSpacing="0.5">
        {abbr}
      </text>
    </svg>
  );
}

function isLight(hex: string) {
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170;
}
