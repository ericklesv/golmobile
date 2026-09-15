/**
 * Bola "Trionda" para tabuleiros 2D (Futprego) — uma esfera de mentira que ROLA de verdade (pedido do
 * dono, 15/09/2026: "menos branco sólido, mostrando as faces, não um 2D estático").
 *
 * Como funciona: a bola tem gomos coloridos (cores da Trionda do pênalti 3D: verde, vermelho, azul, mais
 * gomos brancos com risco) presos em pontos da esfera. Guardamos a orientação da bola numa matriz 3×3;
 * a cada deslocamento (dx, dy) no tabuleiro a bola gira em torno do eixo perpendicular ao movimento
 * (rolamento: ângulo = distância / raio). Cada gomo é projetado (ortográfico, visto de cima) e vira uma
 * elipse achatada pela curvatura — perto da borda fica fininho, atrás some. Tudo por atributo SVG via
 * ref (30 quadros/s sem passar pelo React, igual ao CartoonBall da Trilha).
 *
 * Uso: <TriondaBall ref={api} r={7} />  →  api.current.roll(dx, dy)  a cada quadro que a bola andou.
 * `idle` = gira sozinha devagar (prévia do lobby).
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

export type TriondaApi = { roll: (dx: number, dy: number) => void };

type V3 = [number, number, number];
type M3 = [V3, V3, V3];

const NAVY = '#0B2D6B';
// gomos: direção na esfera (normalizada abaixo), raio angular (rad) e cor. Um arranjo em tetraedro
// com 4 gomos grandes coloridos + 4 gomos brancos "de costura" nos buracos, para ler como bola de verdade.
const T = 0.5773;
const PATCHES: { n: V3; a: number; fill: string }[] = [
  // 4 gomos grandes em tetraedro (verde/vermelho/azul/verde), com branco sobrando entre eles
  { n: [T, T, T], a: 0.6, fill: '#2BA83A' },
  { n: [-T, -T, T], a: 0.6, fill: '#E5322D' },
  { n: [-T, T, -T], a: 0.6, fill: '#2EA8FF' },
  { n: [T, -T, -T], a: 0.6, fill: '#E5322D' },
  // 6 pintas pequenas nos "buracos" (octaedro) — as marcas pretas da Trionda
  { n: [1, 0, 0], a: 0.2, fill: NAVY },
  { n: [-1, 0, 0], a: 0.2, fill: NAVY },
  { n: [0, 1, 0], a: 0.2, fill: NAVY },
  { n: [0, -1, 0], a: 0.2, fill: NAVY },
  { n: [0, 0, 1], a: 0.2, fill: NAVY },
  { n: [0, 0, -1], a: 0.2, fill: NAVY },
];

const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const mulMV = (m: M3, v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const mulMM = (a: M3, b: M3): M3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]) as V3) as M3;
/** Rodrigues: matriz de rotação de `ang` rad em torno do eixo unitário `k`. */
function rot(k: V3, ang: number): M3 {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, [x, y, z] = k;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}
const I3: M3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

export const TriondaBall = forwardRef<TriondaApi, { r: number; idle?: boolean }>(function TriondaBall({ r, idle = false }, ref) {
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const clip = `trionda-clip-${uid}`, shade = `trionda-shade-${uid}`;
  const els = useRef<(SVGEllipseElement | null)[]>([]);
  const R = useRef<M3>(I3);
  const base = useMemo(() => PATCHES.map((p) => ({ ...p, n: norm(p.n) })), []);

  const paint = () => {
    base.forEach((p, i) => {
      const el = els.current[i];
      if (!el) return;
      const [nx, ny, nz] = mulMV(R.current, p.n);
      const sinA = Math.sin(p.a), cosA = Math.cos(p.a);
      if (nz < -sinA * 0.6) { el.setAttribute('visibility', 'hidden'); return; } // virado para trás
      el.setAttribute('visibility', 'visible');
      const cx = nx * cosA * r, cy = ny * cosA * r;
      const rx = sinA * r, ry = Math.max(0.15, Math.abs(nz)) * sinA * r; // achatado pela curvatura
      const ang = (Math.atan2(ny, nx) * 180) / Math.PI;
      el.setAttribute('cx', cx.toFixed(2)); el.setAttribute('cy', cy.toFixed(2));
      el.setAttribute('rx', rx.toFixed(2)); el.setAttribute('ry', ry.toFixed(2));
      el.setAttribute('transform', `rotate(${ang.toFixed(1)} ${cx.toFixed(2)} ${cy.toFixed(2)})`);
      el.setAttribute('opacity', nz > 0 ? '1' : String(Math.max(0, 1 + nz / sinA)));
    });
  };

  const roll = (dx: number, dy: number) => {
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    // rolando por cima do tabuleiro (visto de cima): eixo perpendicular ao movimento, no plano da mesa
    const axis: V3 = [-dy / d, dx / d, 0];
    R.current = mulMM(rot(axis, d / r), R.current);
    paint();
  };
  useImperativeHandle(ref, () => ({ roll }), [r]);

  useEffect(() => {
    paint();
    if (!idle) return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => { const dt = Math.min(50, t - last); last = t; roll(dt * 0.012, dt * 0.004); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, idle]);

  return (
    <g>
      <defs>
        <clipPath id={clip}><circle r={r - 0.3} /></clipPath>
        <radialGradient id={shade} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.38" />
        </radialGradient>
      </defs>
      <ellipse cx={r * 0.22} cy={r * 0.34} rx={r} ry={r * 0.85} fill="#000" opacity="0.3" />
      <circle r={r} fill="#FFFFFF" />
      <g clipPath={`url(#${clip})`}>
        {base.map((p, i) => <ellipse key={i} ref={(el) => { els.current[i] = el; }} fill={p.fill} stroke={NAVY} strokeWidth={r * 0.04} />)}
        <circle r={r} fill={`url(#${shade})`} />
      </g>
      <ellipse cx={-r * 0.36} cy={-r * 0.42} rx={r * 0.22} ry={r * 0.12} transform={`rotate(-38 ${-r * 0.36} ${-r * 0.42})`} fill="#fff" opacity="0.9" />
      <circle r={r} fill="none" stroke={NAVY} strokeWidth={r * 0.14} />
    </g>
  );
});
