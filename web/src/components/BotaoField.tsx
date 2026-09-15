import { forwardRef, useId, type ReactNode } from 'react';
import type { TeamPaint } from './PregoBoard';

/**
 * Campo do Futebol de Botão (X1): a mesma moldura de madeira da tábua do FutPrego, campo pintado, as duas
 * áreas (mais escuras: botão de linha não entra) e os gols. Desenha em coordenadas do servidor
 * (lib/botao.js na API); `flip` gira 180° para quem joga do lado de cima ver o próprio gol embaixo. Os
 * botões e a bola vêm por fora (`children`), para a animação mexer só neles.
 */
export interface BotaoFieldData {
  W: number; H: number; mouth: number; goalX: [number, number];
  boxes: { x0: number; x1: number; y0: number; y1: number }[]; piece: number; ball: number; penaltySpot: number;
}
export interface BotaoPiece { side: 0 | 1; gk: boolean; x: number; y: number }

const FRAME = 16, NET = 22;

export const BotaoField = forwardRef<SVGSVGElement, {
  field: BotaoFieldData; flip?: boolean; children?: ReactNode; className?: string; glowGoal?: 'top' | 'bottom' | null;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void; onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
}>(function BotaoField({ field: F, flip = false, children, className = '', glowGoal = null, ...handlers }, ref) {
  const vb = `${-FRAME} ${-FRAME - NET} ${F.W + FRAME * 2} ${F.H + (FRAME + NET) * 2}`;
  const [g0, g1] = F.goalX;
  const lines = 'rgba(247,244,232,0.85)';
  return (
    <svg ref={ref} viewBox={vb} className={`block touch-none select-none ${className}`} {...handlers} role="img" aria-label="Campo do futebol de botão">
      <defs>
        <linearGradient id="bt-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D69A58" /><stop offset="0.5" stopColor="#BD7E40" /><stop offset="1" stopColor="#A5672F" />
        </linearGradient>
        <pattern id="bt-net" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 0 L6 6 M6 0 L0 6" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
        </pattern>
        <radialGradient id="bt-disc" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" /><stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.05" /><stop offset="1" stopColor="#000000" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <rect x={-FRAME} y={-FRAME - NET} width={F.W + FRAME * 2} height={F.H + (FRAME + NET) * 2} rx="14" fill="url(#bt-wood)" />
      {[0.14, 0.36, 0.6, 0.83].map((k, i) => (
        <path key={i} d={`M${-FRAME} ${-NET + (F.H + NET * 2) * k} q ${F.W * 0.3} ${i % 2 ? 9 : -9} ${F.W * 0.6} 0 t ${F.W * 0.6} 0`} fill="none" stroke="#7A4A1E" strokeOpacity="0.18" strokeWidth="1.6" />
      ))}
      <rect x={-FRAME + 3} y={-FRAME - NET + 3} width={F.W + FRAME * 2 - 6} height={F.H + (FRAME + NET) * 2 - 6} rx="11" fill="none" stroke="#6E3F16" strokeOpacity="0.35" strokeWidth="2" />

      <g transform={flip ? `rotate(180 ${F.W / 2} ${F.H / 2})` : undefined}>
        {/* redes */}
        {[-NET, F.H].map((y) => (
          <g key={y}>
            <rect x={g0} y={y} width={g1 - g0} height={NET} fill="#2F5E2C" />
            <rect x={g0} y={y} width={g1 - g0} height={NET} fill="url(#bt-net)" />
          </g>
        ))}
        {glowGoal && <rect x={g0} y={glowGoal === 'top' ? -NET : F.H} width={g1 - g0} height={NET} fill="#FFD54A" opacity="0.55" />}
        {/* campo */}
        <rect x="0" y="0" width={F.W} height={F.H} fill="#3E9B3A" />
        {Array.from({ length: 10 }, (_, i) => <rect key={i} x="0" y={(F.H / 10) * i} width={F.W} height={F.H / 20} fill="#46A541" opacity="0.55" />)}
        {/* áreas: botão de linha não entra (sombreadas) */}
        {F.boxes.map((b, i) => <rect key={i} x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="#1F5E1C" opacity="0.28" />)}
        <g fill="none" stroke={lines} strokeWidth="2">
          <rect x="1" y="1" width={F.W - 2} height={F.H - 2} />
          <line x1="0" y1={F.H / 2} x2={F.W} y2={F.H / 2} />
          <circle cx={F.W / 2} cy={F.H / 2} r="38" />
          {F.boxes.map((b, i) => <rect key={i} x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} />)}
        </g>
        <circle cx={F.W / 2} cy={F.H / 2} r="2.6" fill={lines} />
        <circle cx={F.W / 2} cy={F.penaltySpot} r="2.4" fill={lines} />
        <circle cx={F.W / 2} cy={F.H - F.penaltySpot} r="2.4" fill={lines} />
        {/* traves */}
        {[[g0, 0], [g1, 0], [g0, F.H], [g1, F.H]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" fill="#F4F6F8" stroke="#8C96A3" strokeWidth="1" />)}
        {children}
      </g>
    </svg>
  );
});

/**
 * Um botão (disco com borda): cor do time no disco e a outra na borda; o goleiro com as cores trocadas e uma
 * faixa. `active` = dá para tocar nele agora; `selected` = o escolhido (pulsa); `powerRing` = cor da força
 * enquanto puxa.
 */
export function BotaoDisc({ p, r, paint, selected = false, active = false, powerRing = null }: {
  p: BotaoPiece; r: number; paint: TeamPaint; selected?: boolean; active?: boolean; powerRing?: string | null;
}) {
  const face = p.gk ? paint.secondary : paint.primary;
  // tricolor (ex.: Santa Cruz): aro na 3ª cor e miolo listrado na horizontal — a 3ª cor separa as outras duas
  const rim = paint.tertiary ?? (p.gk ? paint.primary : paint.secondary);
  const bands = paint.tertiary ? (p.gk ? [paint.secondary, paint.tertiary, paint.primary] : [paint.primary, paint.tertiary, paint.secondary]) : null;
  const clip = useId();
  const ri = r * 0.72, bh = (2 * ri) / 3;
  return (
    <>
      <ellipse cx={1.8} cy={2.6} rx={r} ry={r * 0.9} fill="#000" opacity="0.3" />
      <circle r={r} fill={rim} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
      {bands ? (
        <>
          <clipPath id={clip}><circle r={ri} /></clipPath>
          <g clipPath={`url(#${clip})`}>{bands.map((col, k) => <rect key={k} x={-ri} y={-ri + k * bh} width={2 * ri} height={bh + 0.3} fill={col} />)}</g>
        </>
      ) : <circle r={ri} fill={face} />}
      <circle r={r} fill="url(#bt-disc)" />
      {p.gk && <rect x={-r * 0.42} y={-r * 0.14} width={r * 0.84} height={r * 0.28} rx={r * 0.12} fill={rim} opacity="0.9" />}
      {active && !selected && <circle r={r + 3} fill="none" stroke="#FFD54A" strokeOpacity="0.5" strokeWidth="1.6" strokeDasharray="3 3" />}
      {selected && !powerRing && (
        <circle r={r + 4} fill="none" stroke="#FFD54A" strokeWidth="3">
          <animate attributeName="r" values={`${r + 3};${r + 7};${r + 3}`} dur="1.1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.35;1" dur="1.1s" repeatCount="indefinite" />
        </circle>
      )}
      {powerRing && <circle r={r + 4} fill="none" stroke={powerRing} strokeWidth="3" />}
    </>
  );
}
