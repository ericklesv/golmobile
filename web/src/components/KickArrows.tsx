/** Setas de chute em SVG cartoon: uma seta reta com gradiente e contorno; esquerda/direita são a mesma seta inclinada. */
type Dir = 'left' | 'up' | 'right';
const ROT: Record<Dir, number> = { left: -38, up: 0, right: 38 };
// seta reta apontando para cima (cabeça larga + haste), centrada em (50,50)
const ARROW = 'M50 6 L88 44 L66 44 L66 94 L34 94 L34 44 L12 44 Z';

export function KickArrow({ dir, size = 88, className = '' }: { dir: Dir; size?: number; className?: string }) {
  const id = `ka-${dir}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8dff7a" /><stop offset="0.45" stopColor="#38d143" /><stop offset="1" stopColor="#1c9a2c" /></linearGradient>
        <filter id={`${id}-sh`} x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="2.5" floodColor="#04101b" floodOpacity="0.5" /></filter>
      </defs>
      <g transform={`rotate(${ROT[dir]} 50 50)`} filter={`url(#${id}-sh)`}>
        <path d={ARROW} fill={`url(#${id})`} stroke="#0d5a1f" strokeWidth="7" strokeLinejoin="round" />
        <path d={ARROW} fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" transform="translate(0 2) scale(0.94) translate(3 3)" />
      </g>
    </svg>
  );
}

export function KickArrowButton({ dir, onClick, disabled, label }: { dir: Dir; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="no-drag group flex flex-col items-center gap-1 transition active:scale-90 disabled:opacity-40 disabled:grayscale">
      <KickArrow dir={dir} className="drop-shadow-[0_0_12px_rgba(61,220,74,0.5)] group-active:brightness-110" />
      <span className="t-display t-out text-[11px] uppercase tracking-wide">{label}</span>
    </button>
  );
}
