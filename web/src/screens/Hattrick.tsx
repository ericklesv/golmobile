import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { HattrickFlight, HattrickResult, HattrickShootResponse, HattrickShot, HattrickState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { CartoonBall } from '../components/TrailBall';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';

/**
 * Hat Trick — chute de longe. Campo visto de cima em METROS (o gol em y = 0, x = 0 no meio; o SVG
 * usa metros direto como unidade). Fases: mira (toca na bola e puxa pra trás: seta = direção,
 * comprimento = força) → batida (vista de lado, a bola grande quica; toque nela: lado = efeito,
 * embaixo = sobe, fora = furou) → voo (o servidor decide; a tela só anima o caminho que ele mandou).
 */

const VB = { x: -18, y: -3.5, w: 36, h: 39.5 }; // 36 m de largura: gol e goleiro grandes o bastante
const BALL_R = 0.75;          // raio desenhado da bola no campo (m) — maior que o real, para enxergar
const TOUCH_R = 3.6;          // toque até essa distância da bola pega a bola
const MAX_DRAG = 10;          // puxar 10 m (no desenho) = força máxima
const STRIKE_MS = 2100;       // tempo da bola atravessar a tela da batida
const INK = '#14335F';

const RESULT_TEXT: Record<HattrickResult, string> = {
  goal: 'GOL!', saved: 'DEFENDEU!', wide: 'PRA FORA!', post: 'NA TRAVE!', bar: 'NO TRAVESSÃO!', over: 'POR CIMA!', whiff: 'FUROU!',
};

type Aim = { dirX: number; dirY: number; power: number; valid: boolean; drag: { x: number; y: number } };
type Flight = { res: HattrickShootResponse; t0: number; dur: number };

export function HattrickScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [game, setGame] = useState<HattrickState | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'aim' | 'strike' | 'flight'>('aim');
  const [aim, setAim] = useState<Aim | null>(null);
  const locked = useRef<Aim | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [banner, setBanner] = useState<{ text: string; good: boolean } | null>(null);
  const [goal, setGoal] = useState<{ title: string; text: string; levelPoints: number } | null>(null);
  const [, setTick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const load = () => api.hattrick().then((r) => setGame(r.state)).catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => { load(); }, []);

  // relógio do voo (re-render a cada quadro enquanto a bola voa)
  useEffect(() => {
    if (!flight) return;
    let raf = 0;
    const loop = () => { setTick((n) => n + 1); if (performance.now() - flight.t0 < flight.dur * 1000) raf = requestAnimationFrame(loop); else finishFlight(flight.res); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [flight]);

  async function start() {
    if (busy) return;
    setBusy(true);
    try { setGame((await api.hattrickStart()).state); setPhase('aim'); } catch (e) {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'locked') nav('/', { replace: true });
    } finally { setBusy(false); }
  }

  const shot: HattrickShot | null = flight?.res.shot ?? game?.shot ?? null;

  // ── mira (estilingue) ─────────────────────────────────────────────────────
  function toField(e: RPointerEvent) {
    const svg = svgRef.current!, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }
  function onDown(e: RPointerEvent<SVGSVGElement>) {
    if (phase !== 'aim' || !shot || busy) return;
    const p = toField(e);
    if (Math.hypot(p.x - shot.ball.x, p.y - shot.ball.y) > TOUCH_R) { toast('Toque na bola e puxe pra trás.'); return; }
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setAim({ dirX: 0, dirY: -1, power: 0, valid: false, drag: { x: 0, y: 0 } });
  }
  function onMove(e: RPointerEvent<SVGSVGElement>) {
    if (!dragging.current || !shot) return;
    const p = toField(e);
    const dx = p.x - shot.ball.x, dy = p.y - shot.ball.y, len = Math.hypot(dx, dy);
    const power = Math.min(1, len / MAX_DRAG);
    const dirX = len ? -dx / len : 0, dirY = len ? -dy / len : -1; // estilingue: a bola vai para o lado oposto ao puxão
    setAim({ dirX, dirY, power, valid: power >= 0.1 && dirY < -0.05, drag: { x: dx, y: dy } });
  }
  function onUp() {
    if (!dragging.current) return;
    dragging.current = false;
    const a = aim;
    setAim(null);
    if (!a) return;
    if (a.power < 0.1) { toast('Puxe mais para dar força.'); return; }
    if (!a.valid) { toast('Puxe para trás, para o lado contrário do gol.'); return; }
    locked.current = a;
    setPhase('strike');
  }

  // ── batida → chute ────────────────────────────────────────────────────────
  async function shoot(strike: { sx: number; sy: number } | null) {
    const a = locked.current;
    if (!a || !shot) return;
    setBusy(true);
    try {
      const res = await api.hattrickShoot({ i: shot.i, dirX: a.dirX, dirY: a.dirY, power: a.power, strike });
      sound.play('tap');
      if (res.result === 'whiff') { setPhase('aim'); finishFlight(res); return; }
      setPhase('flight');
      setFlight({ res, t0: performance.now(), dur: res.flight.T + 0.65 });
    } catch (e) {
      toast((e as Error).message, 'error');
      setPhase('aim');
      if (e instanceof ApiError && (e.code === 'stale' || e.code === 'no-run')) load();
    } finally { setBusy(false); }
  }

  function finishFlight(res: HattrickShootResponse) {
    const good = res.result === 'goal';
    sound.play(good ? 'goal' : 'error');
    setBanner({ text: res.goal?.hatTrick ? 'HAT TRICK!' : RESULT_TEXT[res.result], good });
    if (good || !res.state.playing) refresh();
    setTimeout(() => {
      setBanner(null);
      if (good && res.goal) { setGoal({ title: res.goal.hatTrick ? 'HAT TRICK!!!' : 'GOOOL!!!', text: res.goal.text, levelPoints: res.levelPoints }); return; }
      next(res);
    }, 1300);
    lastRes.current = res;
  }
  const lastRes = useRef<HattrickShootResponse | null>(null);
  function next(res: HattrickShootResponse | null = lastRes.current) {
    setFlight(null);
    setPhase('aim');
    if (res) setGame(res.state);
  }

  // ── desenho ───────────────────────────────────────────────────────────────
  const t = flight ? (performance.now() - flight.t0) / 1000 : 0;
  const ballPos = flight ? ballAt(flight.res, t) : shot ? { x: shot.ball.x, y: shot.ball.y, z: 0 } : null;
  const keeperX = flight ? keeperAt(flight.res.flight, t) : 0;
  const team = me.team;
  const lives = game?.lives ?? 3;
  const playingNow = !!game && (game.playing || !!flight || !!banner || !!goal);

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={!!goal} goal title={goal?.title} text={goal?.text} levelPoints={goal?.levelPoints} team={team} onClose={() => { setGoal(null); next(); }} />

      <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-green text-[18px]">HAT TRICK</div>
        <div className="trap trap-blue text-[12px] tabular-nums">{game?.goals ?? 0} {(game?.goals ?? 0) === 1 ? 'gol' : 'gols'}</div>
      </div>

      <div className="relative mx-auto flex w-full max-w-[460px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
        {!game ? null : playingNow && shot ? (
          <>
            <div className="relative mt-1 overflow-hidden rounded-2xl border-4 border-navy-deep shadow-lg">
              <svg ref={svgRef} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="block w-full touch-none select-none"
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="img" aria-label="Campo: toque na bola e puxe pra trás">
                <Pitch />
                <Keeper x={keeperX} lean={flight?.res.flight.keeper ? Math.max(-1, Math.min(1, keeperX / 3)) : 0} />
                {ballPos && <FieldBall x={ballPos.x} y={ballPos.y} z={ballPos.z} spin={t * 900} />}
                {aim && <AimArrow from={shot.ball} aim={aim} />}
                {phase === 'aim' && !aim && !flight && !banner && (
                  <circle cx={shot.ball.x} cy={shot.ball.y} r={2.2} fill="none" stroke="#FFC63D" strokeWidth="0.3" className="animate-ping" style={{ transformOrigin: 'center', transformBox: 'fill-box' }} />
                )}
              </svg>
              <Hud lives={lives} maxLives={game.maxLives} wind={shot.wind} />
              {banner && (
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className={`t-display t-out rounded-2xl bg-navy-deep/70 px-5 py-1 text-[42px] ${banner.good ? 't-gold' : 't-red'}`}>{banner.text}</span>
                </motion.div>
              )}
              {phase === 'strike' && <StrikeScene onDone={(s) => { setPhase('flight'); shoot(s); }} />}
            </div>
            <div className="panel mt-3 text-center text-navy-ink">
              {aim ? (
                <p className="t-display text-[18px]">{aim.valid ? `Força ${Math.round(aim.power * 100)}%` : 'Puxe pra trás, longe do gol'}</p>
              ) : (
                <p className="text-[14px] font-extrabold leading-snug">Toque na bola e puxe pra trás: a seta mostra a direção e a força. Depois, toque em cima da bola que passa.</p>
              )}
              <p className="mt-1 text-[12px] font-bold text-muted">Hoje: {game.goals} {game.goals === 1 ? 'gol' : 'gols'}, +{game.points} de nível. 3 gols é hat trick!</p>
            </div>
          </>
        ) : (
          <div className="panel mt-4 text-navy-ink">
            {game.finished ? (
              <div className="text-center">
                <div className="t-display text-[24px]">{game.goals >= 3 ? 'HAT TRICK!' : game.goals > 0 ? `${game.goals} ${game.goals === 1 ? 'gol' : 'gols'} do ${team.name}!` : 'Não foi dessa vez'}</div>
                <p className="mt-1 text-[14px] font-extrabold">{game.goals} {game.goals === 1 ? 'gol' : 'gols'}: +{game.points} de nível.</p>
                {game.freePlay ? (
                  <>
                    <p className="mt-2 text-[12px] font-bold text-muted">Modo de teste: pode jogar de novo quantas vezes quiser.</p>
                    <button onClick={start} disabled={busy} className="btn btn-green btn-lg mt-4 w-full">Jogar de novo</button>
                    <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-2 w-full">Voltar ao jogo</button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-[13px] font-bold text-muted">Novo Hat Trick em <Countdown readyAt={game.nextAt} className="text-orange-deep" />.</p>
                    <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-4 w-full">Voltar ao jogo</button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="t-display text-center text-[22px]">Chute de longe</div>
                <ol className="mt-3 flex flex-col gap-2 text-[14px] font-bold leading-snug">
                  <li><b className="text-orange-deep">1.</b> Toque na bola e puxe pra trás. A seta vermelha mostra a direção; quanto mais puxar, mais forte e mais difícil pro goleiro.</li>
                  <li><b className="text-orange-deep">2.</b> A bola passa quicando: toque em cima dela. No centro ela vai reta; no lado, faz curva pro outro lado; embaixo, ela sobe (embaixo demais, passa por cima do gol).</li>
                  <li><b className="text-orange-deep">3.</b> O vento empurra a bola para onde a seta dele aponta. Bola lenta sofre mais.</li>
                </ol>
                <p className="mt-3 text-center text-[13px] font-bold leading-snug text-muted">
                  3 vidas: pra fora, defendido ou furou, perde uma. Cada gol é gol do {team.name}, +{game.pointsPerGoal} de nível (até +{game.maxPoints}). Três gols é hat trick!
                </p>
                <button onClick={start} disabled={busy} className="btn btn-orange btn-lg mt-4 w-full">Começar</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── voo: posição da bola e do goleiro no tempo t (s) ──────────────────────────
function ballAt(res: HattrickShootResponse, t: number) {
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

function keeperAt(f: HattrickFlight, t: number) {
  const k = f.keeper ?? (f.cross ? { react: 0.35, speed: 2.4, to: Math.max(-3.2, Math.min(3.2, f.cross.x * 0.7)) } : null);
  if (!k) return 0;
  const moved = k.speed * Math.max(0, t - k.react);
  return Math.sign(k.to) * Math.min(Math.abs(k.to), moved);
}

// ─── desenho do campo (metros) ─────────────────────────────────────────────
function Pitch() {
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
function Keeper({ x, lean }: { x: number; lean: number }) {
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
function FieldBall({ x, y, z, spin }: { x: number; y: number; z: number; spin: number }) {
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
function AimArrow({ from, aim }: { from: { x: number; y: number }; aim: Aim }) {
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

/** Vidas (bolas) à esquerda e vento (seta + força) à direita, por cima do campo. */
function Hud({ lives, maxLives, wind }: { lives: number; maxLives: number; wind: { speed: number; angle: number } }) {
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between">
      <div className="rounded-xl bg-navy-deep/80 px-2 py-1 text-center">
        <div className="flex gap-1">
          {Array.from({ length: maxLives }, (_, i) => (
            <svg key={i} viewBox="-11 -11 22 22" className={`h-6 w-6 ${i < lives ? '' : 'opacity-25 grayscale'}`}><CartoonBall r={10} /></svg>
          ))}
        </div>
        <div className="t-display text-[12px] text-white">Vidas</div>
      </div>
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
function StrikeScene({ onDone }: { onDone: (strike: { sx: number; sy: number } | null) => void }) {
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
