import { discBands } from '../lib/kit';
import { forwardRef, type ReactNode } from 'react';

/**
 * A tábua do FutPrego (futebol de prego): madeira em volta, campo pintado, pregos com a cabeça pintada na
 * cor de cada time, traves e redes. Desenha em coordenadas do servidor (lib/futprego.js na API); `flip`
 * gira 180° para quem joga do lado de cima ver o próprio gol embaixo. A bola é desenhada por fora
 * (`ball`), para a animação mexer só nela.
 */

export interface PregoBoardData {
  /** Desenho sorteado para a partida (Clássico, Peteleco…). */
  id?: string; name?: string;
  W: number; H: number; mouth: number; goalX: [number, number]; ball: number; nail: number; post: number;
  nails: { x: number; y: number; side: 0 | 1 }[]; posts: { x: number; y: number }[];
}
/** Cores do time nas peças + o desenho do uniforme escolhido pelo presidente (lib/kit.ts: `discBands`):
 *  listras = faixas verticais, faixas = horizontais, metades, diagonal; clássico/liso = peça lisa — salvo time
 *  tricolor (`tertiary`, ex.: Santa Cruz), que fica listrado na horizontal primária · terciária · secundária
 *  (pedido da torcida, 15/09/2026: "sem o preto tocar no vermelho"). Vale no prego e no botão. */
export interface TeamPaint { primary: string; secondary: string; tertiary?: string | null; design?: string | null }

/** Faixas de uma peça redonda (cx, cy, r) na direção do desenho, já recortadas no círculo `clip`. */
export function DiscBands({ cx, cy, r, bands, dir, clip }: { cx: number; cy: number; r: number; bands: string[]; dir: 'h' | 'v' | 'd'; clip: string }) {
  const n = bands.length, h = (2 * r) / n;
  const rot = dir === 'd' ? `rotate(-45 ${cx} ${cy})` : dir === 'v' ? `rotate(90 ${cx} ${cy})` : undefined;
  return (
    <>
      <clipPath id={clip}><circle cx={cx} cy={cy} r={r} /></clipPath>
      <g clipPath={`url(#${clip})`} transform={rot}>
        {bands.map((col, k) => <rect key={k} x={cx - r * 1.5} y={cy - r + k * h} width={3 * r} height={h + 0.3} fill={col} />)}
      </g>
    </>
  );
}

const FRAME = 16, NET = 20;

export const PregoBoard = forwardRef<SVGSVGElement, {
  board: PregoBoardData; flip?: boolean; paint: [TeamPaint, TeamPaint]; ball?: ReactNode; overlay?: ReactNode;
  className?: string; onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void; onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void; glowGoal?: 'top' | 'bottom' | null;
}>(function PregoBoard({ board: B, flip = false, paint, ball, overlay, className = '', glowGoal = null, ...handlers }, ref) {
  const vb = `${-FRAME} ${-FRAME - NET} ${B.W + FRAME * 2} ${B.H + (FRAME + NET) * 2}`;
  const [g0, g1] = B.goalX;
  const lines = 'rgba(247,244,232,0.85)';
  const stripes = Array.from({ length: 10 }, (_, i) => i);
  return (
    <svg ref={ref} viewBox={vb} className={`block touch-none select-none ${className}`} {...handlers} role="img" aria-label="Tábua do futebol de prego">
      <defs>
        <linearGradient id="fp-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D69A58" /><stop offset="0.5" stopColor="#BD7E40" /><stop offset="1" stopColor="#A5672F" />
        </linearGradient>
        <radialGradient id="fp-metal" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" /><stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.15" /><stop offset="1" stopColor="#000000" stopOpacity="0.25" />
        </radialGradient>
        <radialGradient id="fp-ball" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" /><stop offset="0.7" stopColor="#E9EDF2" /><stop offset="1" stopColor="#B9C2CD" />
        </radialGradient>
        <pattern id="fp-net" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 0 L6 6 M6 0 L0 6" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
        </pattern>
      </defs>

      {/* madeira: moldura com veios e o fundo das redes */}
      <rect x={-FRAME} y={-FRAME - NET} width={B.W + FRAME * 2} height={B.H + (FRAME + NET) * 2} rx="14" fill="url(#fp-wood)" />
      {[0.12, 0.31, 0.55, 0.78, 0.93].map((k, i) => (
        <path key={i} d={`M${-FRAME} ${-NET + (B.H + NET * 2) * k} q ${B.W * 0.3} ${i % 2 ? 9 : -9} ${B.W * 0.6} 0 t ${B.W * 0.6} 0`} fill="none" stroke="#7A4A1E" strokeOpacity="0.18" strokeWidth="1.6" />
      ))}
      <rect x={-FRAME + 3} y={-FRAME - NET + 3} width={B.W + FRAME * 2 - 6} height={B.H + (FRAME + NET) * 2 - 6} rx="11" fill="none" stroke="#6E3F16" strokeOpacity="0.35" strokeWidth="2" />

      <g transform={flip ? `rotate(180 ${B.W / 2} ${B.H / 2})` : undefined}>
        {/* redes (fora do campo, entre as traves) */}
        <rect x={g0} y={-NET} width={g1 - g0} height={NET} fill="#2F5E2C" />
        <rect x={g0} y={-NET} width={g1 - g0} height={NET} fill="url(#fp-net)" />
        <rect x={g0} y={B.H} width={g1 - g0} height={NET} fill="#2F5E2C" />
        <rect x={g0} y={B.H} width={g1 - g0} height={NET} fill="url(#fp-net)" />
        {glowGoal && <rect x={g0} y={glowGoal === 'top' ? -NET : B.H} width={g1 - g0} height={NET} fill="#FFD54A" opacity="0.55" />}

        {/* campo pintado na madeira */}
        <rect x="0" y="0" width={B.W} height={B.H} fill="#3E9B3A" />
        {stripes.map((i) => <rect key={i} x="0" y={(B.H / 10) * i} width={B.W} height={B.H / 20} fill="#46A541" opacity="0.55" />)}
        <g fill="none" stroke={lines} strokeWidth="2">
          <rect x="1" y="1" width={B.W - 2} height={B.H - 2} />
          <line x1="0" y1={B.H / 2} x2={B.W} y2={B.H / 2} />
          <circle cx={B.W / 2} cy={B.H / 2} r="38" />
          <rect x={B.W / 2 - 78} y="1" width="156" height="62" />
          <rect x={B.W / 2 - 78} y={B.H - 63} width="156" height="62" />
          <rect x={B.W / 2 - 44} y="1" width="88" height="24" />
          <rect x={B.W / 2 - 44} y={B.H - 25} width="88" height="24" />
        </g>
        <circle cx={B.W / 2} cy={B.H / 2} r="2.6" fill={lines} />

        {/* traves e pregos: sombra, cabeça pintada na cor do time e brilho do metal */}
        {B.posts.map((p, i) => (
          <g key={`p${i}`}>
            <circle cx={p.x + 1.4} cy={p.y + 1.8} r={B.post + 1.4} fill="#000" opacity="0.3" />
            <circle cx={p.x} cy={p.y} r={B.post + 1} fill="#F4F6F8" stroke="#8C96A3" strokeWidth="1" />
          </g>
        ))}
        {B.nails.map((n, i) => {
          const c = paint[n.side];
          const r = B.nail + 1;
          const db = discBands(c);
          if (db) {
            const clip = `fp-nail-${B.id ?? 'b'}-${n.side}-${i}`;
            return (
              <g key={i}>
                <circle cx={n.x + 1.5} cy={n.y + 2} r={B.nail + 1.2} fill="#000" opacity="0.32" />
                <DiscBands cx={n.x} cy={n.y} r={r} bands={db.bands} dir={db.dir} clip={clip} />
                <circle cx={n.x} cy={n.y} r={r} fill="none" stroke={c.tertiary ?? c.secondary} strokeWidth="1.6" />
                <circle cx={n.x} cy={n.y} r={r} fill="url(#fp-metal)" />
              </g>
            );
          }
          return (
            <g key={i}>
              <circle cx={n.x + 1.5} cy={n.y + 2} r={B.nail + 1.2} fill="#000" opacity="0.32" />
              <circle cx={n.x} cy={n.y} r={r} fill={c.primary} stroke={c.secondary} strokeWidth="1.6" />
              <circle cx={n.x} cy={n.y} r={r} fill="url(#fp-metal)" />
            </g>
          );
        })}
        {overlay}
        {ball}
      </g>
    </svg>
  );
});

/** A bola (bolinha branca com sombra), desenhada no centro (0,0): quem usa põe transform translate. */
export function PregoBall({ r }: { r: number }) {
  return (
    <>
      <ellipse cx={1.6} cy={2.4} rx={r} ry={r * 0.85} fill="#000" opacity="0.3" />
      <circle r={r} fill="url(#fp-ball)" stroke="#8D97A3" strokeWidth="0.8" />
    </>
  );
}
