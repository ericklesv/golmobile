import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { HattrickFlight, HattrickResult } from '../lib/types';
import { CartoonBall } from './TrailBall';
import { sound } from '../lib/sound';

/**
 * A VISTA do Hat Trick: o campo visto de cima em metros, o goleiro, a bola, a seta da mira, o HUD e a tela da
 * batida — mais as contas que dizem onde a bola e o goleiro estão em cada instante do voo.
 *
 * Mora aqui desde 27/09/2026 porque DUAS telas desenham o mesmo jogo: o Hat Trick de verdade
 * (`screens/Hattrick.tsx`) e a demonstração da página inicial (`components/DemoHatTrick.tsx`, o chute que dá para
 * dar sem conta). O dono pediu na página inicial "algo mais interativo como o Hat Trick" — então não existe uma
 * segunda versão parecida: mexeu aqui, muda nos dois lugares.
 *
 * Quem decide o resultado continua sendo o SERVIDOR, com a mesma `api/src/lib/hattrick.js` nos dois casos (a tela
 * de verdade por `/api/daily/hattrick`, a demonstração por `/api/demo/hattrick`). Isto aqui só desenha.
 */

export const VB = { x: -18, y: -3.5, w: 36, h: 39.5 }; // 36 m de largura: gol e goleiro grandes o bastante
const BALL_R = 0.75;          // raio desenhado da bola no campo (m) — maior que o real, para enxergar
export const TOUCH_R = 3.6;          // toque até essa distância da bola pega a bola
export const MAX_DRAG = 10;          // puxar 10 m (no desenho) = força máxima
const STRIKE_MS = 2100;       // tempo da bola atravessar a tela da batida
const INK = '#14335F';

export const RESULT_TEXT: Record<HattrickResult, string> = {
  goal: 'GOL!', saved: 'DEFENDEU!', wide: 'PRA FORA!', post: 'NA TRAVE!', bar: 'NO TRAVESSÃO!', over: 'POR CIMA!', whiff: 'FUROU!',
};

export type Aim = { dirX: number; dirY: number; power: number; valid: boolean; drag: { x: number; y: number } };

// ─── voo: posição da bola e do goleiro no tempo t (s) ──────────────────────────
/** Onde a bola esta no instante t. Recebe so o que usa, para a demonstracao poder passar a resposta dela. */
export function ballAt(res: { flight: HattrickFlight; result: HattrickResult }, t: number) {
  const S = res.flight.samples, T = res.flight.T, n = S.length;
  const time = (i: number) => (i === n - 1 ? T : Math.min(T, i / 30));
  if (t <= T || n < 2) {
    let i = 0;
    while (i < n - 2 && time(i + 1) < t) i++;
    const a = S[i], b = S[Math.min(i + 1, n - 1)], ta = time(i), tb = time(Math.min(i + 1, n - 1));
    const f = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 1;
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f };
  }
  // depois da linha do gol: rede, rebote na trave, bola indo embora ou nas mãos do goleiro
  const a = S[n - 2], b = S[n - 1], dt0 = Math.max(1 / 60, T - time(n - 2));
  const vx = (b[0] - a[0]) / dt0, vy = (b[1] - a[1]) / dt0, e = Math.min(0.6, t - T);
  switch (res.result) {
    case 'goal': return { x: b[0] + vx * Math.min(e, 0.08), y: Math.max(-1.9, b[1] + vy * e), z: Math.max(0, b[2] - e * 2) };
    case 'saved': { const k = res.flight.keeper; return { x: k ? k.to : b[0], y: 0.45 + e * 1.2, z: 0 }; } // nas mãos do goleiro (e um pouco pra frente)
    case 'post': case 'bar': return { x: b[0] - vx * 0.25 * e, y: b[1] - vy * 0.35 * e, z: Math.max(0, b[2] - e * 2) };
    case 'over': return { x: b[0] + vx * e, y: b[1] + vy * e, z: b[2] + e * 4 };
    default: return { x: b[0] + vx * e, y: b[1] + vy * e, z: b[2] };
  }
}

export function keeperAt(f: HattrickFlight, t: number) {
  const k = f.keeper ?? (f.cross ? { react: 0.35, speed: 2.4, to: Math.max(-3.2, Math.min(3.2, f.cross.x * 0.7)) } : null);
  if (!k) return 0;
  const moved = k.speed * Math.max(0, t - k.react);
  return Math.sign(k.to) * Math.min(Math.abs(k.to), moved);
}

// ─── desenho do campo (metros) ─────────────────────────────────────────────
export function Pitch() {
  return (
    <g>
      <defs>
        <linearGradient id="ht-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#25a75b" /><stop offset="1" stopColor="#187a42" /></linearGradient>
        <pattern id="ht-stripes" width="36" height="6" patternUnits="userSpaceOnUse"><rect width="36" height="3" fill="rgba(255,255,255,0.05)" /></pattern>
        <pattern id="ht-net" width="0.5" height="0.5" patternUnits="userSpaceOnUse"><path d="M0 0 L0.5 0 M0 0 L0 0.5" stroke="rgba(255,255,255,0.55)" strokeWidth="0.05" /></pattern>
      </defs>
      <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill="url(#ht-grass)" />
      <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill="url(#ht-stripes)" />
      <g stroke="rgba(255,255,255,0.85)" strokeWidth="0.16" fill="none">
        <line x1={VB.x} y1="0" x2={VB.x + VB.w} y2="0" />
        <rect x="-20.16" y="0" width="40.32" height="16.5" />
        <rect x="-9.16" y="0" width="18.32" height="5.5" />
        <path d="M -7.31 16.5 A 9.15 9.15 0 0 0 7.31 16.5" />
      </g>
      <circle cx="0" cy="11" r="0.22" fill="rgba(255,255,255,0.9)" />
      {/* gol: rede atrás da linha, traves e travessão */}
      <rect x="-3.66" y="-2.3" width="7.32" height="2.3" fill="url(#ht-net)" stroke="rgba(255,255,255,0.8)" strokeWidth="0.08" />
      <line x1="-3.66" y1="0" x2="3.66" y2="0" stroke="#fff" strokeWidth="0.32" strokeLinecap="round" />
      <circle cx="-3.66" cy="0" r="0.24" fill="#fff" stroke={INK} strokeWidth="0.06" />
      <circle cx="3.66" cy="0" r="0.24" fill="#fff" stroke={INK} strokeWidth="0.06" />
    </g>
  );
}

/** Goleiro visto de cima: corpo amarelo, braços abertos; `lean` inclina no pulo (−1..1). */
export function Keeper({ x, lean }: { x: number; lean: number }) {
  return (
    <g transform={`translate(${x.toFixed(3)} 0.6) rotate(${(lean * 55).toFixed(1)}) scale(1.35)`}>
      <ellipse cx="0" cy="0.15" rx="0.7" ry="0.3" fill="rgba(4,52,26,0.35)" />
      <line x1="-0.5" y1="0" x2={-1.15 - Math.max(0, -lean) * 0.4} y2="-0.25" stroke="#F2C200" strokeWidth="0.26" strokeLinecap="round" />
      <line x1="0.5" y1="0" x2={1.15 + Math.max(0, lean) * 0.4} y2="-0.25" stroke="#F2C200" strokeWidth="0.26" strokeLinecap="round" />
      <circle cx={-1.2 - Math.max(0, -lean) * 0.4} cy="-0.27" r="0.2" fill="#fff" stroke={INK} strokeWidth="0.06" />
      <circle cx={1.2 + Math.max(0, lean) * 0.4} cy="-0.27" r="0.2" fill="#fff" stroke={INK} strokeWidth="0.06" />
      <ellipse cx="0" cy="0" rx="0.55" ry="0.34" fill="#F2C200" stroke={INK} strokeWidth="0.08" />
      <circle cx="0" cy="-0.02" r="0.26" fill="#5b3a1e" stroke={INK} strokeWidth="0.06" />
    </g>
  );
}

/** Bola no campo: sombra no chão e a bola "subindo" (mais alta = mais acima e maior). */
export function FieldBall({ x, y, z, spin }: { x: number; y: number; z: number; spin: number }) {
  const k = 1 + z * 0.16;
  return (
    <g pointerEvents="none">
      <ellipse cx={x + 0.25 + z * 0.12} cy={y + 0.35} rx={BALL_R * 0.95} ry={BALL_R * 0.5} fill="#04341A" opacity={Math.max(0.15, 0.32 - z * 0.03)} />
      {/* a bola cartoon é desenhada em "pixels" (r = 10) e encolhida para metros */}
      <g transform={`translate(${x.toFixed(3)} ${(y - z * 0.45).toFixed(3)}) scale(${(k * BALL_R / 10).toFixed(4)})`}>
        <CartoonBall r={10} spin={spin} />
      </g>
    </g>
  );
}

/** Seta da mira (vermelha) + o "elástico" do puxão (branco, para trás). */
export function AimArrow({ from, aim }: { from: { x: number; y: number }; aim: Aim }) {
  const len = 1.8 + aim.power * 11;
  const tx = from.x + aim.dirX * len, ty = from.y + aim.dirY * len;
  const nx = -aim.dirY, ny = aim.dirX; // perpendicular
  const head = 1.3, wing = 0.85;
  const bx = tx - aim.dirX * head, by = ty - aim.dirY * head;
  const color = aim.valid ? '#E53935' : '#9aa7b8';
  return (
    <g pointerEvents="none">
      <line x1={from.x} y1={from.y} x2={from.x + aim.drag.x} y2={from.y + aim.drag.y} stroke="rgba(255,255,255,0.6)" strokeWidth="0.18" strokeDasharray="0.5 0.4" />
      <line x1={from.x} y1={from.y} x2={bx} y2={by} stroke={INK} strokeWidth="0.75" strokeLinecap="round" />
      <line x1={from.x} y1={from.y} x2={bx} y2={by} stroke={color} strokeWidth="0.5" strokeLinecap="round" />
      <polygon points={`${tx},${ty} ${bx + nx * wing},${by + ny * wing} ${bx - nx * wing},${by - ny * wing}`} fill={color} stroke={INK} strokeWidth="0.15" strokeLinejoin="round" />
    </g>
  );
}

/**
 * Vidas (bolas) à esquerda e vento (seta + força) à direita, por cima do campo.
 * Sem `lives`, mostra só o vento — é assim na demonstração da página inicial, que não tem vidas para perder.
 */
export function Hud({ lives, maxLives, wind }: { lives?: number; maxLives?: number; wind: { speed: number; angle: number } }) {
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between">
      {lives == null ? <span /> : (
      <div className="rounded-xl bg-navy-deep/80 px-2 py-1 text-center">
        <div className="flex gap-1">
          {Array.from({ length: maxLives ?? 0 }, (_, i) => (
            <svg key={i} viewBox="-11 -11 22 22" className={`h-6 w-6 ${i < lives ? '' : 'opacity-25 grayscale'}`}><CartoonBall r={10} /></svg>
          ))}
        </div>
        <div className="t-display text-[12px] text-white">Vidas</div>
      </div>
      )}
      <div className="flex items-center gap-2 rounded-xl bg-navy-deep/80 px-2 py-1">
        <svg viewBox="-12 -12 24 24" className="h-8 w-8" aria-hidden>
          <g transform={`rotate(${wind.angle})`}>
            <path d="M0 -9 L6 -1 L2.2 -1 L2.2 9 L-2.2 9 L-2.2 -1 L-6 -1 Z" fill="#fff" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          </g>
        </svg>
        <div className="text-right leading-none">
          <div className="t-display text-[18px] tabular-nums text-white">{wind.speed.toFixed(1)}</div>
          <div className="t-display text-[11px] text-white/80">vento</div>
        </div>
      </div>
    </div>
  );
}

/**
 * A batida: estádio visto de lado, a bola grande entra pela direita quicando. Toque em cima dela:
 * sx = lado (−1 esquerda … 1 direita), sy = altura (−1 em cima … 1 embaixo). Fora da bola ou sem
 * toque até ela sair = furou.
 */
export function StrikeScene({ onDone }: { onDone: (strike: { sx: number; sy: number } | null) => void }) {
  // mesmo formato do campo (48 x 44,5 m), para a cena caber sem cortar o gramado
  const W = 400, H = 371, R = 52, GROUND = 352;
  const [t, setT] = useState(0);
  const [mark, setMark] = useState<{ x: number; y: number; ok: boolean } | null>(null);
  const t0 = useRef(performance.now());
  const done = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  const pos = (tt: number) => {
    const f = Math.min(1, tt / STRIKE_MS);
    const x = W + R - f * (W + 2 * R);
    const hop = Math.abs(Math.sin(f * Math.PI * 2.5)) * 120 * (1 - f * 0.45);
    return { x, y: GROUND - R - hop };
  };
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (done.current) return;
      const tt = performance.now() - t0.current;
      setT(tt);
      if (tt >= STRIKE_MS) { done.current = true; setMark({ x: -99, y: -99, ok: false }); setTimeout(() => onDone(null), 250); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  function tap(e: RPointerEvent<SVGSVGElement>) {
    if (done.current) return;
    done.current = true;
    const pt = svg.current!.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    const b = pos(performance.now() - t0.current);
    const sx = (p.x - b.x) / R, sy = (p.y - b.y) / R;
    const ok = sx * sx + sy * sy <= 1;
    setMark({ x: p.x, y: p.y, ok });
    sound.play(ok ? 'pop' : 'error');
    setTimeout(() => onDone(ok ? { sx, sy } : null), 260);
  }
  const b = pos(t);
  return (
    <div className="absolute inset-0 z-10">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="block h-full w-full touch-none select-none" onPointerDown={tap} role="img" aria-label="Toque em cima da bola">
        <defs>
          <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#46b4ff" /><stop offset="1" stopColor="#bfe6ff" /></linearGradient>
          <pattern id="st-seats" width="16" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="11" rx="2" fill="#8d97a6" /><rect width="14" height="3" rx="1" fill="#a9b3c1" /></pattern>
          <pattern id="st-grass" width="60" height={H} patternUnits="userSpaceOnUse"><rect width="30" height={H} fill="rgba(255,255,255,0.06)" /></pattern>
        </defs>
        <rect width={W} height={H} fill="url(#st-sky)" />
        {[[70, 48, 0.9], [250, 34, 0.75], [352, 70, 1]].map(([cx, cy, s], i) => (
          <g key={i} transform={`translate(${cx} ${cy}) scale(${s})`} fill="#fff" opacity="0.95">
            <ellipse cx="0" cy="0" rx="34" ry="16" /><ellipse cx="-26" cy="6" rx="22" ry="12" /><ellipse cx="28" cy="6" rx="24" ry="12" /><ellipse cx="4" cy="-12" rx="22" ry="14" />
          </g>
        ))}
        <rect x="0" y="146" width={W} height="14" fill="#c9d0da" stroke="#7d8796" strokeWidth="2" />
        <rect x="0" y="160" width={W} height="104" fill="#6f7a89" />
        <rect x="6" y="165" width={W - 12} height="96" fill="url(#st-seats)" />
        <rect x="0" y="264" width={W} height="34" fill="#E53935" stroke="#9c1f1c" strokeWidth="3" />
        <text x={W / 2} y="290" textAnchor="middle" fontFamily='"Lilita One", Impact, sans-serif' fontSize="26" fontStyle="italic" fill="rgba(255,255,255,0.55)" letterSpacing="4">JOGAGOL · JOGAGOL</text>
        <rect x="0" y="298" width={W} height={H - 298} fill="#3cb54a" />
        <rect x="0" y="298" width={W} height={H - 298} fill="url(#st-grass)" />
        <ellipse cx={b.x} cy={GROUND + 5} rx={R * 0.9} ry="8" fill="#1f6b2a" opacity={0.25 + 0.2 * (1 - (GROUND - R - b.y) / 120)} />
        <g transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`}>
          <CartoonBall r={R} spin={(-b.x / R) * 57.3} />
        </g>
        {mark && mark.x > 0 && (
          <g transform={`translate(${mark.x} ${mark.y})`}>
            <circle r="13" fill={mark.ok ? '#FFC63D' : '#E53935'} stroke={INK} strokeWidth="3" />
            <path d="M-6 0 L6 0 M0 -6 L0 6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          </g>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
        <div className="t-display t-out text-[26px]">Toque em cima da bola!</div>
        <div className="t-out mx-auto mt-1 max-w-[300px] text-[12px] font-extrabold leading-tight">Centro: reta. Lado: curva pro outro lado. Embaixo: sobe.</div>
      </div>
      {mark && !mark.ok && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="t-display t-out t-red text-[44px]">FUROU!</span></div>}
    </div>
  );
}
