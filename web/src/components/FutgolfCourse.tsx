import { forwardRef, useId, useMemo, type ReactNode } from 'react';
import { courseBox, dirOf, polyPath, scenery, type FgCourse } from '../lib/futgolf';

/**
 * O campo do Futgolf (X1), visto de cima, em coordenadas do servidor (api/src/lib/futgolf.js). Desenha: o mato e as
 * árvores em volta, o gramado listrado, a lagoa, a ilha/ponte (`seco`), o terrão, o mato alto, as placas de
 * publicidade (contorno, ilhas e placas soltas), as setas de velocidade (piscando no sentido), as rampas (tábua de
 * madeira que sobe no sentido da seta, com a sombra na ponta alta), os bueiros (a entrada e a saída com a mesma cor e
 * número; o de duas saídas tem "?" e as duas saídas), as molas (fliperama), cones e jogadores de barreira, a saída e
 * o buraco com a bandeira de escanteio. As bolas e a mira entram por fora (`children`).
 *
 * `view` = a janela da câmera (viewBox); sem ela, o campo inteiro. A tela do X1 mexe no viewBox direto no DOM
 * enquanto a bola anda (sem re-render a cada quadro) e só passa `view` nova quando a câmera para.
 * `bumps` = molas que acabaram de ser batidas (índice → quando), para dar o "pulo" delas.
 */
export const TUNNEL_COLORS = ['#FFD54A', '#5EE0FF', '#FF7AD9', '#9BFF6B'];

type Props = {
  course: FgCourse; view?: { x: number; y: number; w: number; h: number } | null; children?: ReactNode; className?: string;
  bumps?: Record<number, number>; tiebreak?: boolean; still?: boolean; wind?: { ang: number; str: number } | null;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void; onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void; onPointerCancel?: (e: React.PointerEvent<SVGSVGElement>) => void;
};

export const FutgolfCourse = forwardRef<SVGSVGElement, Props>(function FutgolfCourse({ course: c, view, children, className = '', bumps, tiebreak = false, still = false, wind = null, ...handlers }, ref) {
  const uid = useId().replace(/:/g, '');
  const box = courseBox(c);
  const vb = view ?? box;
  const trees = useMemo(() => scenery(c), [c]);
  const clip = `fg-clip-${uid}`;
  const border = polyPath(c.boundary);
  const now = Date.now();
  return (
    <svg ref={ref} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className={`block touch-none select-none ${className}`} {...handlers} role="img" aria-label={`Futgolf: buraco ${c.name}, par ${c.par}`}>
      <defs>
        <clipPath id={clip}><path d={border} /></clipPath>
        <pattern id={`fg-sand-${uid}`} width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r="0.9" fill="#B98A4A" opacity="0.55" /><circle cx="6.5" cy="7" r="0.8" fill="#B98A4A" opacity="0.45" />
        </pattern>
        <pattern id={`fg-rough-${uid}`} width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M2 9 l1.5 -4 l1.5 4 M7 5 l1.2 -3.5 l1.2 3.5" stroke="#8BD66E" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.75" />
        </pattern>
        <pattern id={`fg-wave-${uid}`} width="26" height="18" patternUnits="userSpaceOnUse">
          <path d="M3 9 q3 -3 6 0 t6 0" stroke="#FFFFFF" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.45" />
        </pattern>
        <radialGradient id={`fg-hedge-${uid}`} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#3E9A3B" /><stop offset="1" stopColor="#1F6123" />
        </radialGradient>
        {/* rampa: mais escura embaixo (onde a bola entra), clara na ponta alta */}
        <linearGradient id={`fg-ramp-${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#8A5A2E" /><stop offset="1" stopColor="#E8B874" />
        </linearGradient>
        <linearGradient id={`fg-rampsh-${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.34" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* fora do campo: mato baixo e árvores */}
      <rect x={box.x - 400} y={box.y - 400} width={box.w + 800} height={box.h + 800} fill="#2A7230" />
      {trees.map((t, i) => (
        <g key={i}>
          <circle cx={t.x + 3} cy={t.y + 4} r={t.r} fill="#000" opacity="0.18" />
          <circle cx={t.x} cy={t.y} r={t.r} fill={t.tone > 0.5 ? '#1D5E27' : '#23692B'} />
          <circle cx={t.x - t.r * 0.25} cy={t.y - t.r * 0.25} r={t.r * 0.62} fill={t.tone > 0.5 ? '#2C7F34' : '#338C3A'} />
          <circle cx={t.x - t.r * 0.38} cy={t.y - t.r * 0.4} r={t.r * 0.28} fill="#46A444" opacity="0.8" />
        </g>
      ))}

      {/* gramado com listras de corte */}
      <path d={border} fill="#49AB44" />
      <g clipPath={`url(#${clip})`}>
        {Array.from({ length: Math.ceil((c.H + 80) / 44) }, (_, i) => <rect key={i} x={-40} y={i * 44 - 30} width={c.W + 80} height={22} fill="#55B94F" />)}
      </g>

      {/* chão: lagoa, terra firme por cima dela (ilha/ponte), terrão e mato alto */}
      {c.zones.filter((z) => z.t === 'agua').map((z, i) => (
        <g key={`a${i}`} clipPath={`url(#${clip})`}>
          <path d={polyPath(z.poly)} fill="#2E8FD6" stroke="#BFE6FF" strokeWidth="4" />
          <path d={polyPath(z.poly)} fill={`url(#fg-wave-${uid})`} />
        </g>
      ))}
      {/* (tudo recortado pelo contorno: uma mancha perto da placa não vaza para cima das árvores) */}
      <g clipPath={`url(#${clip})`}>
      {c.zones.filter((z) => z.t === 'seco').map((z, i) => <path key={`s${i}`} d={polyPath(z.poly)} fill="#4FB24A" stroke="#E2D2A1" strokeWidth="3" />)}
      {c.zones.filter((z) => z.t === 'areia').map((z, i) => (
        <g key={`r${i}`}>
          <path d={polyPath(z.poly)} fill="#E2B66A" stroke="#C99550" strokeWidth="2.5" />
          <path d={polyPath(z.poly)} fill={`url(#fg-sand-${uid})`} />
        </g>
      ))}
      {c.zones.filter((z) => z.t === 'mato').map((z, i) => (
        <g key={`m${i}`}>
          <path d={polyPath(z.poly)} fill="#2F7F2B" stroke="#276E24" strokeWidth="2" strokeDasharray="5 4" />
          <path d={polyPath(z.poly)} fill={`url(#fg-rough-${uid})`} />
        </g>
      ))}
      </g>

      {/* saída */}
      <g transform={`translate(${c.tee.x} ${c.tee.y})`}>
        <rect x="-24" y="-10" width="48" height="20" rx="5" fill="#FFFFFF" opacity="0.28" />
        <circle cx="-17" cy="0" r="3" fill="#FFFFFF" /><circle cx="17" cy="0" r="3" fill="#FFFFFF" />
      </g>
      {tiebreak && (
        <g transform={`translate(${c.tb.x} ${c.tb.y})`} opacity="0.9">
          <circle r="15" fill="none" stroke="#FFD54A" strokeWidth="2.5" strokeDasharray="4 4" />
          <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="#FFD54A" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {/* setas de velocidade: acendem em sequência, no sentido do empurrão */}
      {c.boosts.map((b, i) => (
        <g key={`b${i}`} transform={`translate(${b.x} ${b.y}) rotate(${b.ang})`}>
          <rect x={-b.wid / 2} y={-b.len / 2} width={b.wid} height={b.len} rx="9" fill="#FFD54A" opacity="0.2" />
          <rect x={-b.wid / 2} y={-b.len / 2} width={b.wid} height={b.len} rx="9" fill="none" stroke="#FFD54A" strokeWidth="2" strokeDasharray="5 4" />
          {[1, 0, -1].map((k, j) => (
            <path key={k} d={`M-10 ${k * b.len * 0.28 + 5} L0 ${k * b.len * 0.28 - 5} L10 ${k * b.len * 0.28 + 5}`} fill="none" stroke="#FFD54A" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 0 rgba(11,45,107,0.8))' }}>
              {!still && <animate attributeName="opacity" values="0.25;1;0.25" dur="0.9s" begin={`${j * 0.3}s`} repeatCount="indefinite" />}
            </path>
          ))}
        </g>
      ))}

      {/* rampas: tábua que sobe no sentido da seta (a ponta alta é a de cima, no desenho sem girar) */}
      {(c.rampas ?? []).map((r, i) => (
        <g key={`r${i}`} transform={`translate(${r.x} ${r.y}) rotate(${r.ang})`}>
          <path d={`M${-r.wid / 2} ${-r.len / 2} L${r.wid / 2} ${-r.len / 2} L${r.wid / 2 - 4} ${-r.len / 2 - 15} L${-r.wid / 2 + 4} ${-r.len / 2 - 15} Z`} fill={`url(#fg-rampsh-${uid})`} />
          <rect x={-r.wid / 2} y={-r.len / 2} width={r.wid} height={r.len} rx="3" fill={`url(#fg-ramp-${uid})`} stroke="#5A3616" strokeWidth="2" />
          {Array.from({ length: Math.floor(r.len / 8) }, (_, k) => <line key={k} x1={-r.wid / 2 + 3} x2={r.wid / 2 - 3} y1={r.len / 2 - 8 * (k + 1)} y2={r.len / 2 - 8 * (k + 1)} stroke="#6B4320" strokeWidth="1" opacity="0.55" />)}
          <rect x={-r.wid / 2} y={-r.len / 2} width="4" height={r.len} fill="#5A3616" opacity="0.7" />
          <rect x={r.wid / 2 - 4} y={-r.len / 2} width="4" height={r.len} fill="#5A3616" opacity="0.7" />
          <line x1={-r.wid / 2} x2={r.wid / 2} y1={-r.len / 2 + 1} y2={-r.len / 2 + 1} stroke="#FFF3D6" strokeWidth="2.5" />
          <path d={`M-8 ${r.len * 0.12} L0 ${-r.len * 0.12} L8 ${r.len * 0.12}`} fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        </g>
      ))}

      {/* bueiros: entrada (grade) e saída (seta), com a mesma cor e número; o de duas saídas leva "?" */}
      {c.tuneis.map((t, i) => {
        const col = TUNNEL_COLORS[i % TUNNEL_COLORS.length];
        const label = t.alt ? `${i + 1}?` : `${i + 1}`;
        const exit = (b: { x: number; y: number }, out: number, key: string) => {
          const [ux, uy] = dirOf(out);
          return (
            <g key={key} transform={`translate(${b.x} ${b.y})`}>
              <circle r="15" fill="none" stroke={col} strokeWidth="3" strokeDasharray="4 3" />
              <circle r="11" fill="#34393F" stroke="#9AA3AB" strokeWidth="2" />
              <path d={`M${-ux * 5 - uy * 5} ${-uy * 5 + ux * 5} L${ux * 6} ${uy * 6} L${-ux * 5 + uy * 5} ${-uy * 5 - ux * 5}`} fill="none" stroke={col} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              <text y="-17" textAnchor="middle" fontFamily="'Lilita One', Impact, sans-serif" fontSize="11" fill={col} stroke="#0B2D6B" strokeWidth="2.5" paintOrder="stroke">{label}</text>
            </g>
          );
        };
        return (
          <g key={`t${i}`}>
            <g transform={`translate(${t.a.x} ${t.a.y})`}>
              <circle r="17" fill="none" stroke={col} strokeWidth="3" opacity="0.9" />
              <circle r="13.5" fill="#34393F" stroke="#9AA3AB" strokeWidth="2" />
              {[-6, -2, 2, 6].map((y) => <rect key={y} x="-8" y={y - 0.9} width="16" height="1.8" rx="0.9" fill="#15181B" />)}
              <text y="-19" textAnchor="middle" fontFamily="'Lilita One', Impact, sans-serif" fontSize="11" fill={col} stroke="#0B2D6B" strokeWidth="2.5" paintOrder="stroke">{label}</text>
            </g>
            {exit(t.b, t.out, 'b')}
            {t.alt && exit(t.alt.b, t.alt.out, 'alt')}
          </g>
        );
      })}

      {/* ilhas (canteiros de arbusto) com placas em volta */}
      {c.islands.map((isl, i) => (
        <g key={`i${i}`}>
          <path d={polyPath(isl)} fill="#000" opacity="0.2" transform="translate(2 4)" />
          <path d={polyPath(isl)} fill={`url(#fg-hedge-${uid})`} />
          <Boards d={polyPath(isl)} />
        </g>
      ))}
      {/* contorno: placas de publicidade */}
      <Boards d={border} />
      {/* placas soltas */}
      {c.placas.map((p, i) => <Boards key={`p${i}`} d={`M${p.x1} ${p.y1}L${p.x2} ${p.y2}`} wide />)}

      {/* cones e jogadores da barreira */}
      {c.postes.map((p, i) => p.kind === 'jogador' ? (
        <g key={`o${i}`} transform={`translate(${p.x} ${p.y})`}>
          <ellipse cx="2" cy="3" rx={p.r} ry={p.r * 0.7} fill="#000" opacity="0.22" />
          <ellipse rx={p.r} ry={p.r * 0.66} fill="#FF8A2A" stroke="#B85A12" strokeWidth="1.5" />
          <circle r={p.r * 0.45} fill="#8D5524" /><path d={`M${-p.r * 0.45} -1 a${p.r * 0.45} ${p.r * 0.45} 0 0 1 ${p.r * 0.9} 0 z`} fill="#1B1B1B" />
        </g>
      ) : (
        <g key={`o${i}`} transform={`translate(${p.x} ${p.y})`}>
          <circle cx="2" cy="3" r={p.r} fill="#000" opacity="0.22" />
          <circle r={p.r} fill="#FF7A1A" stroke="#FFFFFF" strokeWidth="1.5" />
          <circle r={p.r * 0.55} fill="none" stroke="#FFFFFF" strokeWidth="2" />
          <circle r={p.r * 0.2} fill="#FFFFFF" />
        </g>
      ))}

      {/* molas (fliperama): dão um pulo quando a bola bate */}
      {c.molas.map((m, i) => {
        const hit = bumps && bumps[i] && now - bumps[i] < 400;
        return (
          <g key={`k${i}`} transform={`translate(${m.x} ${m.y})`}>
            <circle cx="2" cy="4" r={m.r + 2} fill="#000" opacity="0.22" />
            <g className={hit ? 'fg-bump' : undefined}>
              <circle r={m.r + 2} fill="#FFFFFF" />
              <circle r={m.r} fill="#F0413E" />
              <circle r={m.r * 0.62} fill="#FFFFFF" />
              <circle r={m.r * 0.36} fill="#F0413E" />
              <path d={`M${-m.r * 0.5} ${-m.r * 0.62} a${m.r * 0.8} ${m.r * 0.8} 0 0 1 ${m.r * 0.9} -${m.r * 0.1}`} fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
            </g>
          </g>
        );
      })}

      {/* buraco com a bandeira de escanteio */}
      <g transform={`translate(${c.cup.x} ${c.cup.y})`}>
        <circle r={c.cupR + 5} fill="#7FD378" opacity="0.55" />
        <circle r={c.cupR} fill="#141414" stroke="#FFFFFF" strokeWidth="2.2" />
        <circle r={c.cupR - 3} fill="#050505" />
        <path d="M1 0 L16 14" stroke="#000" strokeWidth="2.5" opacity="0.22" strokeLinecap="round" />
        <path d="M0 0 L3 -44" stroke="#F4F6F8" strokeWidth="2.6" strokeLinecap="round" />
        {/* a bandeira aponta para onde o vento sopra (sem vento, cai para a direita) */}
        <g transform={wind && wind.str > 0 ? `rotate(${wind.ang - 90} 3 -38)` : undefined}>
          <path d="M3 -44 L25 -38 L3 -31 Z" fill="#FFD54A" stroke="#0B2D6B" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M3 -44 L14 -41 L14 -34.5 L3 -31 Z" fill="#E53935" />
        </g>
      </g>

      {children}
    </svg>
  );
});

/** Placas de publicidade: faixa branca com blocos laranja e azul, e a sombra. */
function Boards({ d, wide = false }: { d: string; wide?: boolean }) {
  const w = wide ? 9 : 8;
  return (
    <g fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} stroke="#000" strokeOpacity="0.28" strokeWidth={w + 3} transform="translate(0 3)" />
      <path d={d} stroke="#0B2D6B" strokeWidth={w + 3} />
      <path d={d} stroke="#FFFFFF" strokeWidth={w} />
      <path d={d} stroke="#FF8A2A" strokeWidth={w} strokeDasharray="26 52" strokeLinecap="butt" />
      <path d={d} stroke="#2EA8FF" strokeWidth={w} strokeDasharray="26 52" strokeDashoffset="-39" strokeLinecap="butt" />
    </g>
  );
}
