import { useId } from 'react';
import { designOf, kitBands, type KitPaint } from '../lib/kit';

/**
 * Camisa cartoon (estilo do kit: contorno grosso azul-tinta, brilho na lateral) nas cores do time:
 * corpo na cor principal, mangas e gola na secundária, número na cor que tiver contraste. O DESENHO
 * (`design`, escolhido pelo presidente — lib/kit.ts) pinta o corpo: faixa no peito, liso, listras, faixas,
 * metades ou diagonal; a 3ª cor do time (`tertiary`) entra no meio das faixas.
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

const BODY = 'M34 8 L42 5 Q50 13 58 5 L66 8 L90 21 L81 41 L71 36 L71 90 Q50 95 29 90 L29 36 L19 41 L10 21 Z';

/** Formas do desenho dentro do corpo (retângulo do corpo: x 29..71, y 5..95). */
function Pattern({ k }: { k: KitPaint }) {
  const d = designOf(k.design);
  const bands = kitBands(k);
  const x0 = 10, x1 = 90, y0 = 5, y1 = 95; // cobre o corpo inteiro (as mangas são pintadas por cima)
  if (d === 'liso') return null;
  if (d === 'listras' || d === 'faixas') {
    const n = 7; // listras/faixas na largura do corpo (29..71 = 42 de largura; 6 de cada)
    const w = (x1 - x0) / (n + 4), h = (y1 - y0) / (n + 4);
    const out = [];
    for (let i = 0; i < n + 4; i++) {
      const col = bands[i % bands.length];
      out.push(d === 'listras'
        ? <rect key={i} x={x0 + i * w} y={y0} width={w + 0.3} height={y1 - y0} fill={col} />
        : <rect key={i} x={x0} y={y0 + i * h} width={x1 - x0} height={h + 0.3} fill={col} />);
    }
    return <>{out}</>;
  }
  if (d === 'metades') {
    if (bands.length === 3) return <><rect x={x0} y={y0} width={(x1 - x0) / 3} height={y1 - y0} fill={bands[0]} /><rect x={x0 + (x1 - x0) / 3} y={y0} width={(x1 - x0) / 3 + 0.3} height={y1 - y0} fill={bands[1]} /><rect x={x0 + (2 * (x1 - x0)) / 3} y={y0} width={(x1 - x0) / 3} height={y1 - y0} fill={bands[2]} /></>;
    return <rect x={50} y={y0} width={x1 - 50} height={y1 - y0} fill={k.secondary} />;
  }
  if (d === 'diagonal') {
    // faixa do ombro direito (do jogador) ao quadril esquerdo
    const sash = (w: number, col: string) => <path d={`M${71 + w} 5 L${29 - w} 95 L${29 + w} 95 L${71 + w + 2 * w} 5 Z`} fill={col} />;
    return bands.length === 3 ? <>{sash(9, bands[2])}{sash(4.5, bands[1])}</> : sash(7, k.secondary);
  }
  // clássico: faixa no peito (+ filete da 3ª cor)
  return (
    <>
      {bands.length === 3 && <rect x={x0} y={36} width={x1 - x0} height={16} fill={bands[1]} />}
      <rect x={x0} y={38.5} width={x1 - x0} height={11} fill={k.secondary} />
    </>
  );
}

export function Jersey({ number, primary, secondary, tertiary = null, design = 'classico', size = 72, className = '' }: { number?: number | string; primary: string; secondary: string; tertiary?: string | null; design?: string | null; size?: number; className?: string }) {
  const c = jerseyColors(primary, secondary);
  const clip = useId();
  const k: KitPaint = { primary, secondary, tertiary, design };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={number !== undefined ? `Camisa ${number}` : 'Camisa'}>
      <clipPath id={clip}><path d={BODY} /></clipPath>
      <path d={BODY} fill={c.body} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <g clipPath={`url(#${clip})`}><Pattern k={k} /></g>
      <path d={BODY} fill="none" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
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
