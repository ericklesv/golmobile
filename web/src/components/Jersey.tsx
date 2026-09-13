/**
 * Camisa cartoon (estilo do kit: contorno grosso azul-tinta, brilho na lateral) nas cores do time:
 * corpo na cor principal, mangas e gola na secundária, número na cor que tiver contraste.
 */
const INK = '#14335F';

function lum(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0.5;
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export function jerseyColors(primary: string, secondary: string) {
  const number = contrast(secondary, primary) >= 2.5 ? secondary : lum(primary) > 0.4 ? INK : '#FFFFFF';
  return { body: primary, trim: secondary, number, numberStroke: lum(number) < 0.2 ? 'rgba(255,255,255,0.9)' : INK };
}

export function Jersey({ number, primary, secondary, size = 72, className = '' }: { number?: number | string; primary: string; secondary: string; size?: number; className?: string }) {
  const c = jerseyColors(primary, secondary);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={number !== undefined ? `Camisa ${number}` : 'Camisa'}>
      <path d="M34 8 L42 5 Q50 13 58 5 L66 8 L90 21 L81 41 L71 36 L71 90 Q50 95 29 90 L29 36 L19 41 L10 21 Z" fill={c.body} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <path d="M34 8 L10 21 L19 41 L29 36 Q31 20 34 8 Z" fill={c.trim} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M66 8 L90 21 L81 41 L71 36 Q69 20 66 8 Z" fill={c.trim} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M42 5 Q50 13 58 5" fill="none" stroke={c.trim} strokeWidth="5" strokeLinecap="round" />
      <path d="M42 5 Q50 13 58 5" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" transform="translate(0 3)" />
      <path d="M35 18 Q39 50 35 84" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="6" strokeLinecap="round" />
      {number !== undefined && (
        <text x="50" y="72" textAnchor="middle" fontFamily='"Lilita One", Impact, sans-serif' fontSize={String(number).length > 1 ? 34 : 40}
          fill={c.number} stroke={c.numberStroke} strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">{number}</text>
      )}
    </svg>
  );
}
