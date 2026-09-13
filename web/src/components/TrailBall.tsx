/**
 * Bola cartoon da Trilha — arte em SVG no traço do kit "BRGOL Casual" (contorno navy grosso,
 * sombreado chapado, brilho) e o motor que a leva pelos espaços que o jogador acerta,
 * pintando o rastro por onde passa.
 *
 * Anima com requestAnimationFrame direto nos atributos do SVG: o `animate={{ x, y }}` do
 * framer-motion não se aplica dentro do <svg> da Trilha (a bola antiga ficava presa no canto).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';

export type Pt = { x: number; y: number };

export interface BallLeg {
  to: Pt;
  ms: number;
  hop?: number;                  // altura do quique (unidades do campo)
  ease?: 'out' | 'in' | 'inOut';
  shake?: boolean;               // treme ao chegar (bola roubada)
  scale?: number;                // escala ao fim do trecho (bola entrando na rede)
}

export interface BallPose {
  x: number; y: number;
  lift: number;    // altura acima do gramado
  spin: number;    // giro dos gomos (graus)
  stretch: number; // esticada na direção do movimento
  angle: number;   // direção do movimento (graus)
  squash: number;  // achatada ao quicar
  dx: number;      // tremida
  scale: number;
}

const NAVY = '#0B2D6B';
const INK = '#14335F';
const SETTLE_MS = 170;
const SHAKE_MS = 380;
const EASE = {
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

const rest = (p: Pt, scale = 1): BallPose => ({ x: p.x, y: p.y, lift: 0, spin: 0, stretch: 0, angle: 0, squash: 0, dx: 0, scale });
const settleOf = (leg: BallLeg) => (leg.shake ? SHAKE_MS : leg.hop ? SETTLE_MS : 0);
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Estado da bola: `trail` (pontos já percorridos) + `pose` (onde ela está agora).
 * `push` enfileira trechos e devolve em quantos ms a bola chega ao fim do último deles.
 */
export function useTrailBall(initial: Pt[], r: number) {
  const [trail, setTrail] = useState<Pt[]>(initial);
  const [pose, setPose] = useState<BallPose>(() => rest(initial[initial.length - 1]));
  const cur = useRef(pose);
  const planned = useRef<Pt[]>(initial);
  const queue = useRef<BallLeg[]>([]);
  const running = useRef(false);
  const queueEnd = useRef(0);
  const raf = useRef(0);

  const apply = (p: BallPose) => { cur.current = p; setPose(p); };

  const next = useCallback(() => {
    const leg = queue.current.shift();
    if (!leg) { running.current = false; return; }
    running.current = true;
    const from = cur.current;
    const dist = Math.hypot(leg.to.x - from.x, leg.to.y - from.y);
    const angle = dist > 0.5 ? (Math.atan2(leg.to.y - from.y, leg.to.x - from.x) * 180) / Math.PI : from.angle;
    const turn = ((leg.to.x >= from.x ? 1 : -1) * dist * 0.55 * 180) / (Math.PI * r);
    const ease = EASE[leg.ease ?? 'inOut'];
    const hop = leg.hop ?? 0;
    const scale1 = leg.scale ?? from.scale;
    const settle = settleOf(leg);
    const speed = dist / Math.max(leg.ms, 1);
    const t0 = performance.now();

    const step = (now: number) => {
      const el = now - t0;
      if (el < leg.ms) {
        const t = el / leg.ms, e = ease(t), s = Math.sin(Math.PI * t);
        apply({
          x: from.x + (leg.to.x - from.x) * e,
          y: from.y + (leg.to.y - from.y) * e,
          lift: hop * s,
          spin: from.spin + turn * e,
          stretch: Math.min(0.16, speed * 0.28) * s,
          angle, squash: 0, dx: 0,
          scale: from.scale + (scale1 - from.scale) * e,
        });
        raf.current = requestAnimationFrame(step);
        return;
      }
      const u = settle ? Math.min(1, (el - leg.ms) / settle) : 1;
      const landed = { ...rest(leg.to, scale1), spin: from.spin + turn, angle };
      if (u < 1) {
        apply({
          ...landed,
          squash: hop ? 0.18 * Math.sin(Math.PI * u) * (1 - u * 0.6) : 0,
          dx: leg.shake ? Math.sin(u * Math.PI * 7) * 2.8 * (1 - u) : 0,
        });
        raf.current = requestAnimationFrame(step);
        return;
      }
      apply(landed);
      setTrail((tr) => [...tr, leg.to]);
      next();
    };
    raf.current = requestAnimationFrame(step);
  }, [r]);

  const push = useCallback((legs: BallLeg[]) => {
    if (!legs.length) return 0;
    planned.current = [...planned.current, ...legs.map((l) => l.to)];
    const now = performance.now();
    if (reducedMotion()) {
      const last = legs[legs.length - 1];
      apply({ ...rest(last.to, last.scale ?? cur.current.scale), spin: cur.current.spin });
      setTrail((tr) => [...tr, ...legs.map((l) => l.to)]);
      return 0;
    }
    let t = Math.max(now, queueEnd.current), arrive = t;
    for (const l of legs) { arrive = t + l.ms; t = arrive + settleOf(l); }
    queueEnd.current = t;
    queue.current.push(...legs);
    if (!running.current) next();
    return arrive - now;
  }, [next]);

  /** Volta a bola instantaneamente para um caminho (ex.: a jogada falhou na rede). */
  const reset = useCallback((points: Pt[]) => {
    cancelAnimationFrame(raf.current);
    queue.current = [];
    running.current = false;
    queueEnd.current = 0;
    planned.current = points;
    setTrail(points);
    apply(rest(points[points.length - 1]));
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { trail, pose, push, reset, planned: () => planned.current };
}

function pentagon(cx: number, cy: number, R: number, rotDeg: number) {
  return Array.from({ length: 5 }, (_, k) => {
    const a = ((rotDeg + k * 72) * Math.PI) / 180;
    return `${(cx + R * Math.cos(a)).toFixed(2)},${(cy + R * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

const DIRS = [0, 1, 2, 3, 4].map((k) => -90 + k * 72);

/** A bola em si, centrada na origem. `spin` gira os gomos (a silhueta não gira). */
export function CartoonBall({ r, spin = 0 }: { r: number; spin?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clip = `ball-clip-${uid}`, shade = `ball-shade-${uid}`;
  // Projeção de uma bola real vista de frente: gomo central + 5 gomos na borda, achatados
  // pela curvatura (viram entalhes colados no contorno) — a bola lê branca, não azul.
  const core = r * 0.34, rim = r * 0.9, patch = r * 0.34;
  return (
    <g>
      <defs>
        <clipPath id={clip}><circle r={r - 1} /></clipPath>
        <mask id={shade} maskUnits="userSpaceOnUse" x={-r} y={-r} width={r * 2} height={r * 2}>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} fill="#fff" />
          <circle cx={-r * 0.3} cy={-r * 0.32} r={r * 0.96} fill="#000" />
        </mask>
      </defs>
      <circle r={r} fill="#fff" />
      <g clipPath={`url(#${clip})`}>
        <g transform={`rotate(${spin.toFixed(1)})`}>
          <polygon points={pentagon(0, 0, core, -90)} fill={INK} />
          {DIRS.map((d) => {
            const c = Math.cos((d * Math.PI) / 180), s = Math.sin((d * Math.PI) / 180);
            const seamEnd = rim - patch * 0.5;
            return (
              <g key={d}>
                <line x1={c * core} y1={s * core} x2={c * seamEnd} y2={s * seamEnd} stroke={INK} strokeWidth={r * 0.08} strokeLinecap="round" />
                <polygon points={pentagon(0, 0, patch, 180)} transform={`rotate(${d}) translate(${rim} 0) scale(0.5 1)`} fill={INK} />
              </g>
            );
          })}
        </g>
        {/* sombreado chapado (cel shading) embaixo à direita */}
        <circle r={r} fill={NAVY} opacity={0.22} mask={`url(#${shade})`} />
      </g>
      {/* brilho */}
      <ellipse cx={-r * 0.36} cy={-r * 0.44} rx={r * 0.25} ry={r * 0.14} transform={`rotate(-38 ${-r * 0.36} ${-r * 0.44})`} fill="#fff" opacity={0.95} />
      <circle r={r} fill="none" stroke={NAVY} strokeWidth={r * 0.2} />
    </g>
  );
}

/** Bola posicionada no campo + sombra no gramado (a sombra fica no chão quando ela quica). */
export function TrailBall({ pose, r }: { pose: BallPose; r: number }) {
  const k = pose.scale * (1 + pose.lift / 55);
  const shadow = Math.max(0.55, 1 - pose.lift / 32) * pose.scale;
  const { stretch: st, squash: sq } = pose;
  return (
    <g pointerEvents="none">
      <ellipse cx={pose.x + 1.5} cy={pose.y + r * 0.62} rx={r * 0.95 * shadow} ry={r * 0.42 * shadow} fill="#04341A" opacity={0.28 + 0.14 * shadow} />
      <g transform={`translate(${(pose.x + pose.dx).toFixed(2)} ${(pose.y - pose.lift).toFixed(2)}) rotate(${pose.angle.toFixed(1)}) scale(${(1 + st).toFixed(3)} ${(1 - st * 0.6).toFixed(3)}) rotate(${(-pose.angle).toFixed(1)}) scale(${(k * (1 + sq)).toFixed(3)} ${(k * (1 - sq)).toFixed(3)})`}>
        <CartoonBall r={r} spin={pose.spin} />
      </g>
    </g>
  );
}
