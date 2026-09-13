/** Setas de chute (esquerda curva / cima / direita curva) em SVG cartoon, com brilho e contorno. */
type Dir = 'left' | 'up' | 'right';

const SHAFT: Record<Dir, string> = {
  left: 'M52 92 C52 66 38 54 26 38',
  up: 'M50 92 L50 36',
  right: 'M48 92 C48 66 62 54 74 38',
};
// cabeça da seta (triângulo) já orientada
const HEAD: Record<Dir, string> = {
  left: 'M6 30 L36 12 L38 46 Z',
  up: 'M28 40 L50 6 L72 40 Z',
  right: 'M94 30 L64 12 L62 46 Z',
};

export function KickArrow({ dir, color = '#3ddc4a', dark = '#0d5a1f', size = 88, className = '' }: { dir: Dir; color?: string; dark?: string; size?: number; className?: string }) {
  const id = `ka-${dir}-${color.replace('#', '')}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9ffb0" /><stop offset="0.35" stopColor={color} /><stop offset="1" stopColor="#1f9a30" /></linearGradient>
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="2" floodColor="#000" floodOpacity="0.45" /></filter>
      </defs>
      <g filter={`url(#${id}-sh)`}>
        {/* contorno */}
        <path d={SHAFT[dir]} stroke={dark} strokeWidth="30" strokeLinecap="round" fill="none" />
        <path d={HEAD[dir]} fill={dark} stroke={dark} strokeWidth="10" strokeLinejoin="round" />
        {/* corpo */}
        <path d={SHAFT[dir]} stroke={`url(#${id})`} strokeWidth="20" strokeLinecap="round" fill="none" />
        <path d={HEAD[dir]} fill={`url(#${id})`} stroke={`url(#${id})`} strokeWidth="2" strokeLinejoin="round" />
        {/* brilho */}
        <path d={SHAFT[dir]} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="6" strokeLinecap="round" fill="none" transform="translate(-3 -2)" />
      </g>
    </svg>
  );
}

export function KickArrowButton({ dir, onClick, disabled, label }: { dir: Dir; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="no-drag group flex flex-col items-center gap-0.5 transition active:scale-90 disabled:opacity-40 disabled:grayscale">
      <KickArrow dir={dir} className="drop-shadow-[0_0_10px_rgba(61,220,74,0.45)] group-active:brightness-110" />
      <span className="t-display t-out text-[11px] uppercase tracking-wide">{label}</span>
    </button>
  );
}
