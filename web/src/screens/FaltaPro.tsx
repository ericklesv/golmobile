import { Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { FaltaProKick, FaltaProKickResponse, FaltaProResult, FaltaProState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown, Spinner } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';
import { ease, clamp01, bounceY } from '../scenes/common';
import { StadiumModel, GoalModel, BallModel, KeeperModel, SceneLights, preloadModels, type KeeperHandle, type KitColors } from '../scenes/models';

/**
 * Falta PRO — cobrança de falta 3D estilo Free Kick Classic. Câmera baixa atrás da Trionda,
 * barreira e goleiro com a camisa do adversário. O jogador ARRASTA a partir da bola: pra cima
 * dá altura, pro lado dá direção, rápido dá força e um ARCO no rastro dá efeito (curva).
 * O gesto vira { dirX, dirY, power, spin }, o SERVIDOR simula tudo e devolve o voo
 * (amostras [x, z, y] a 30/s) — a tela só reproduz. O cliente nunca decide gol.
 */

const GK_KIT: KitColors = { primary: '#f2c200', secondary: '#14335F', gloves: '#e8e8e8' };
const WALL_KIT: KitColors = { primary: '#c3131a', secondary: '#F4F7FB' };

const RESULT_TEXT: Record<FaltaProResult, string> = {
  goal: 'GOL!', saved: 'DEFENDEU!', wall: 'NA BARREIRA!', wide: 'PRA FORA!',
  over: 'POR CIMA!', post: 'NA TRAVE!', bar: 'NO TRAVESSÃO!', short: 'FALTOU FORÇA!',
};

export type Flight = { res: FaltaProKickResponse; t0: number; dur: number };
type Gesture = { dirX: number; dirY: number; power: number; spin: number };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Resume o arrasto em { dirX, dirY, power, spin } (ver lib/faltapro.js no servidor). */
function summarize(pts: { x: number; y: number; t: number }[], rect: DOMRect): Gesture | { error: string } | null {
  if (pts.length < 4) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const dur = last.t - first.t;
  if (dur < 40) return null;
  const dx = last.x - first.x, dy = last.y - first.y;
  const L = Math.hypot(dx, dy);
  if (L < rect.height * 0.08) return null;
  if (dy > -rect.height * 0.04) return { error: 'Arraste pra cima, na direção do gol.' };
  let path = 0;
  for (let i = 1; i < pts.length; i++) path += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const speed = path / dur; // px/ms → força pela VELOCIDADE do gesto
  const power = clamp(speed / (rect.height * 0.004), 0.15, 1);
  const dirX = clamp(dx / (rect.width * 0.35), -1, 1);
  const dirY = clamp(-dy / (rect.height * 0.55), 0, 1);
  // efeito: desvio lateral médio do rastro em relação à reta início→fim (arco = curva).
  // A bola SEGUE o arco desenhado (sai pro lado do arco e volta pra mira): o servidor
  // espera o Magnus CONTRA o arco, por isso o sinal negativo (ver lib/faltapro.js).
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  let dev = 0;
  for (const p of pts) dev += (p.x - first.x) * nx + (p.y - first.y) * ny;
  dev /= pts.length;
  const spin = clamp(-dev / (0.12 * L), -1, 1);
  return { dirX, dirY, power, spin };
}

// ─── voo: posição da bola no tempo t (amostras [x, z, y] do servidor) ─────────
function ballAt(res: FaltaProKickResponse, t: number): { x: number; y: number; z: number } {
  const S = res.flight.samples, T = res.flight.T, n = S.length;
  const time = (i: number) => (i === n - 1 ? T : Math.min(T, i / 30));
  if (t <= T || n < 2) {
    let i = 0;
    while (i < n - 2 && time(i + 1) < t) i++;
    const a = S[i], b = S[Math.min(i + 1, n - 1)], ta = time(i), tb = time(Math.min(i + 1, n - 1));
    const f = tb > ta ? clamp01((t - ta) / (tb - ta)) : 1;
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f };
  }
  // depois do fim do voo: rede, defesa, rebote ou bola indo embora
  const a = S[Math.max(0, n - 2)], b = S[n - 1], dt0 = Math.max(1 / 60, T - time(Math.max(0, n - 2)));
  const vx = (b[0] - a[0]) / dt0, vz = (b[1] - a[1]) / dt0, vy = (b[2] - a[2]) / dt0;
  const e = Math.min(0.9, t - T);
  switch (res.result) {
    case 'goal': { // estufa a rede e quica no chão dentro do gol
      if (e < 0.1) return { x: b[0] + vx * e * 0.5, y: b[2], z: Math.max(-1.35, b[1] + vz * e) };
      const e2 = e - 0.1;
      return { x: b[0], y: bounceY(b[2], e2), z: -1.35 + 0.55 * ease.out(clamp01(e2 / 0.6)) };
    }
    case 'saved': { const k = res.flight.keeper!; return { x: k.to, y: Math.max(0.25, (res.flight.cross?.y ?? 1) - e * 1.4), z: 0.55 + e * 0.4 }; }
    case 'post': case 'bar': return { x: b[0] - vx * 0.3 * e, y: Math.max(0.11, b[2] + vy * 0.2 * e - 4.9 * e * e), z: b[1] + Math.abs(vz) * 0.35 * e };
    case 'wall': return { x: b[0] + vx * 0.15 * e, y: Math.max(0.11, b[2] + 1.4 * e - 4.9 * e * e), z: b[1] + Math.abs(vz) * 0.28 * e };
    case 'over': case 'wide': return { x: b[0] + vx * e, y: Math.max(0.11, b[2] + vy * e - 4.9 * e * e), z: b[1] + vz * e };
    default: return { x: b[0], y: b[2], z: b[1] };
  }
}

export function Scene({ kick, flight, gkKit, wallKit }: { kick: FaltaProKick; flight: Flight | null; gkKit: KitColors; wallKit: KitColors }) {
  const ball = useRef<THREE.Group>(null);
  const keeper = useRef<THREE.Group>(null);
  const wallG = useRef<THREE.Group>(null);
  const kh = useRef<KeeperHandle>(null);
  const started = useRef<number | null>(null);
  const framed = useRef<number | null>(null); // nº da cobrança já enquadrada (corte seco na nova)
  const v = useMemo(() => new THREE.Vector3(), []);
  const b = kick.ball;
  const away = useMemo(() => { const d = Math.hypot(b.x, b.z) || 1; return { x: b.x / d, z: b.z / d }; }, [b.x, b.z]);
  const men = useMemo(() => {
    const w = (kick.wall.x1 - kick.wall.x0) / kick.wall.n;
    return Array.from({ length: kick.wall.n }, (_, i) => kick.wall.x0 + w * (i + 0.5));
  }, [kick]);
  const fk = flight?.res.flight.keeper ?? null;
  const keeperFlip = fk ? fk.to < fk.from : false; // o clipe mergulha para +x; flip espelha

  useFrame(({ camera }, dt) => {
    const t = flight ? (performance.now() - flight.t0) / 1000 : 0;
    if (ball.current) {
      // o servidor simula com raio real (0,11 m); o modelo visual tem 0,21 m — nunca enterrar
      if (!flight) { ball.current.position.set(b.x, 0.21, b.z); ball.current.rotation.set(0, 0, 0); }
      else { const p = ballAt(flight.res, t); ball.current.position.set(p.x, Math.max(0.21, p.y), p.z); ball.current.rotation.x -= 0.25; }
    }
    if (keeper.current) {
      const from = fk ? fk.from : kick.keeperX;
      let x = from;
      if (flight && fk) x = from + (fk.to - from) * 0.55 * ease.out(clamp01((t - fk.react) / 0.5));
      keeper.current.position.set(x, 0, 0.5);
    }
    if (wallG.current) {
      wallG.current.position.y = flight && flight.res.flight.wall.jump ? Math.sin(clamp01((t - 0.08) / 0.55) * Math.PI) * 0.5 : 0;
    }
    // os clipes dive/save_low terminam DEITADOS e seguram o último quadro; sem isto ele
    // ficava no chão nas cobranças seguintes (mesmo erro achado na Goleada, 18/09/2026)
    if (!flight && started.current !== null) { started.current = null; kh.current?.pose('idle'); }
    if (flight && started.current !== flight.t0) { // pose do goleiro (clipes procedurais)
      started.current = flight.t0;
      const cross = flight.res.flight.cross, r = flight.res.result;
      if (fk || r === 'goal') {
        const pose = fk && fk.save
          ? ((cross?.y ?? 0) > 1.5 ? (Math.abs(fk.to - fk.from) < 0.6 ? 'jump' : 'dive') : 'save_low')
          : 'dive'; // gol: mergulho no canto errado (flip acima)
        setTimeout(() => kh.current?.pose(pose), Math.max(140, (fk?.react ?? 0.3) * 1000));
      }
    }
    if (!flight) { // câmera baixa atrás da Trionda: bola grande embaixo, gol em cima (ref. Free Kick Classic)
      // Cobrança nova = CORTE SECO pro enquadramento (a suavização por lerp POR QUADRO
      // deixava a bola FORA DA TELA por vários segundos em celular lento — era o bug da
      // "bola invisível"); depois do corte, amortecimento por TEMPO (independe do FPS).
      v.set(b.x + away.x * 2.2, 1.0, b.z + away.z * 2.2);
      if (framed.current !== kick.i) { framed.current = kick.i; camera.position.copy(v); }
      else camera.position.lerp(v, 1 - Math.exp(-8 * dt));
      camera.lookAt(b.x * 0.65, 0.55, b.z * 0.65);
    } else {
      const p = ball.current!.position;
      camera.position.lerp(v.set(b.x * 0.5 + away.x * 3, 1.7, Math.min(b.z + 2, p.z + 7)), 1 - Math.exp(-2.8 * dt));
      camera.lookAt(p.x, Math.max(0.6, p.y), p.z);
    }
  });

  const hitTarget = flight && flight.res.result === 'goal' ? flight.res.target : null;
  return (
    <>
      <SceneLights />
      <StadiumModel />
      <GoalModel />
      {/* alvos bônus nos cantos superiores (aro dourado; verde quando acertado) */}
      {kick.targets.map((tg, i) => (
        <mesh key={i} position={[tg.x, tg.y, 0.14]}>
          <torusGeometry args={[0.5, 0.055, 10, 28]} />
          <meshStandardMaterial color={hitTarget === i ? '#22E58A' : '#FFC63D'} emissive={hitTarget === i ? '#0a5c33' : '#7a5c00'} roughness={0.35} />
        </mesh>
      ))}
      <group ref={keeper} position={[kick.keeperX, 0, 0.5]}><KeeperModel ref={kh} color="#f2c200" kit={gkKit} flip={keeperFlip} speed={7} /></group>
      <group ref={wallG}>
        {men.map((x, i) => <KeeperModel key={i} color="#7f1d1d" kit={wallKit} pose="wall" position={[x, 0, kick.wall.z]} seed={i * 1.7} />)}
      </group>
      <group ref={ball}><BallModel /></group>
    </>
  );
}

export function FaltaProScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [game, setGame] = useState<FaltaProState | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'aim' | 'flight'>('aim');
  const [flight, setFlight] = useState<Flight | null>(null);
  const [banner, setBanner] = useState<{ text: string; good: boolean } | null>(null);
  const [goal, setGoal] = useState<{ text: string; levelPoints: number; money: number } | null>(null);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const dragPts = useRef<{ x: number; y: number; t: number }[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [opp, setOpp] = useState<{ gk: KitColors; wall: KitColors } | null>(null);

  const load = () => api.faltapro().then((r) => setGame(r.state)).catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => { load(); preloadModels(); }, []);
  // goleiro E barreira vestem a camisa do adversário da rodada (com escudo)
  useEffect(() => {
    let alive = true;
    api.opponent().then(({ opponent }) => {
      if (alive && opponent) {
        const base = { primary: opponent.colorPrimary, secondary: opponent.colorSecondary, tertiary: opponent.colorTertiary ?? null, design: opponent.kitDesign ?? null, badge: opponent.slug };
        setOpp({ gk: { ...base, gloves: '#e8e8e8' }, wall: base });
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // relógio do voo: quando acaba, mostra o resultado
  useEffect(() => {
    if (!flight) return;
    const id = setTimeout(() => finishFlight(flight.res), flight.dur * 1000);
    return () => clearTimeout(id);
  }, [flight]);

  async function start() {
    if (busy) return;
    setBusy(true);
    try { setGame((await api.faltaproStart()).state); setPhase('aim'); } catch (e) {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'locked') nav('/', { replace: true });
    } finally { setBusy(false); }
  }

  const kick: FaltaProKick | null = flight?.res.kick ?? game?.kick ?? null;

  // ── o arrasto (mouse e touch, pointer events) ─────────────────────────────
  function local(e: RPointerEvent) {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  }
  function onDown(e: RPointerEvent<HTMLDivElement>) {
    if (phase !== 'aim' || busy || !kick || !game?.playing) return;
    const p = local(e);
    const r = boxRef.current!.getBoundingClientRect();
    if (p.y < r.height * 0.5) { toast('Arraste a partir da bola, embaixo da tela.'); return; }
    dragPts.current = [p];
    setTrail([{ x: p.x, y: p.y }]);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: RPointerEvent<HTMLDivElement>) {
    const pts = dragPts.current;
    if (!pts) return;
    const p = local(e);
    const lp = pts[pts.length - 1];
    if (Math.hypot(p.x - lp.x, p.y - lp.y) < 2) return;
    pts.push(p);
    setTrail((tr) => [...tr, { x: p.x, y: p.y }]);
  }
  function onUp() {
    const pts = dragPts.current;
    dragPts.current = null;
    setTrail([]);
    if (!pts || !kick) return;
    const g = summarize(pts, boxRef.current!.getBoundingClientRect());
    if (!g) { toast('Arraste a bola em direção ao gol.'); return; }
    if ('error' in g) { toast(g.error); return; }
    kickNow(g);
  }

  async function kickNow(g: Gesture) {
    if (busy || !kick) return;
    setBusy(true);
    try {
      const res = await api.faltaproKick({ i: kick.i, ...g });
      sound.play('tap');
      setPhase('flight');
      setFlight({ res, t0: performance.now(), dur: res.flight.T + 1.15 });
    } catch (e) {
      toast((e as Error).message, 'error');
      setPhase('aim');
      if (e instanceof ApiError && (e.code === 'stale' || e.code === 'no-run')) load();
    } finally { setBusy(false); }
  }

  const lastRes = useRef<FaltaProKickResponse | null>(null);
  function finishFlight(res: FaltaProKickResponse) {
    const good = res.result === 'goal';
    sound.play(good ? 'goal' : 'error');
    setBanner({ text: res.target !== null && good ? `NO ÂNGULO! +R$ ${res.money}` : RESULT_TEXT[res.result], good });
    if (good || !res.state.playing) refresh();
    lastRes.current = res;
    setTimeout(() => {
      setBanner(null);
      if (res.goal) { setGoal({ text: res.goal.text, levelPoints: res.levelPoints, money: res.money }); return; }
      next(res);
    }, 1400);
  }
  function next(res: FaltaProKickResponse | null = lastRes.current) {
    setFlight(null);
    setPhase('aim');
    if (res) setGame(res.state);
  }

  const team = me.team;
  const playingNow = !!game && (game.playing || !!flight || !!banner || !!goal);
  // durante o voo não entrega o resultado da cobrança atual (o banner conta no fim)
  const results = flight ? flight.res.state.results.filter((r) => r.i < flight.res.kick.i || !!banner) : game?.results ?? [];
  const shownI = flight ? flight.res.kick.i : game?.i ?? 1;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <GoalOverlay open={!!goal} goal title="GOOOL!!!" text={goal?.text} levelPoints={goal?.levelPoints} money={goal?.money} team={team} onClose={() => { setGoal(null); next(); }} />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-orange text-[18px]">FALTA PRO</div>
        <div className="trap trap-blue text-[12px] tabular-nums">{playingNow && game ? `${Math.min(shownI, game.kicks)}/${game.kicks}` : `${game?.goals ?? 0} gols`}</div>
      </div>

      {game && playingNow && kick ? (
        <>
          <div ref={boxRef} className="no-drag relative h-[66vh] w-full touch-none select-none"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <Canvas shadows camera={{ position: [0, 1, 30], fov: 58 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'linear-gradient(#46b4ff, #1f7ae6)' }}>
              <Suspense fallback={null}><Scene kick={kick} flight={flight} gkKit={opp?.gk ?? GK_KIT} wallKit={opp?.wall ?? WALL_KIT} /></Suspense>
            </Canvas>
            {/* aro de setas sob a bola (sprites do kit): arraste daqui */}
            {phase === 'aim' && !trail.length && !banner && (
              <div className="pointer-events-none absolute left-1/2 top-[82%] -translate-x-1/2 -translate-y-1/2">
                <img src="/ui/glow-circle.png" className="h-28 w-28 animate-pulse opacity-90" alt="" />
                <img src="/ui/pi-next01.png" className="absolute left-1/2 top-0 h-6 w-6 -translate-x-1/2 -translate-y-5 -rotate-90 animate-pulse" alt="" />
                <img src="/ui/pi-next01.png" className="absolute -left-3 top-3 h-5 w-5 rotate-[-135deg] animate-pulse" alt="" />
                <img src="/ui/pi-next01.png" className="absolute -right-3 top-3 h-5 w-5 -rotate-45 animate-pulse" alt="" />
              </div>
            )}
            {/* rastro do arrasto */}
            {trail.length > 1 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <polyline points={trail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#FFC63D" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
                <polyline points={trail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#14335F" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
              </svg>
            )}
            {banner && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className={`t-display t-out rounded-2xl bg-navy-deep/70 px-5 py-1 text-[40px] ${banner.good ? 't-gold' : 't-red'}`}>{banner.text}</span>
              </motion.div>
            )}
            {busy && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><Spinner /></div>}
          </div>
          <div className="relative flex flex-1 flex-col justify-center gap-2 px-4 pb-4">
            <div className="stadium-bg" />
            <div className="relative flex items-center justify-center gap-2">
              {Array.from({ length: game.kicks }, (_, i) => {
                const r = results.find((x) => x.i === i + 1);
                return (
                  <span key={i} className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-navy-deep ${r ? (r.result === 'goal' ? 'bg-[#22E58A]' : 'bg-[#c9d0da]') : 'bg-white/70'}`}>
                    {r ? (r.result === 'goal'
                      ? <img src={r.target !== null ? '/ui/ico-star01_s.png' : '/ui/check-green.png'} className="h-5 w-5" alt={r.target !== null ? 'alvo' : 'gol'} />
                      : <img src="/ui/pi-close.png" className="h-4 w-4 opacity-70" alt="errou" />) : <span className="t-display text-[13px] text-navy-ink/60">{i + 1}</span>}
                  </span>
                );
              })}
            </div>
            <p className="t-display t-out relative text-center text-[13px] uppercase tracking-widest">
              {phase === 'flight' ? 'Lá vai a bomba…' : 'Arraste a bola: arco no gesto dá efeito'}
            </p>
            <p className="t-out relative text-center text-[12px] font-extrabold text-white/90">
              {game.goals} de {game.goalAt} gols pra vencer · +{game.points} de nível{game.money > 0 ? ` · R$ ${game.money} de alvo` : ''}
            </p>
          </div>
        </>
      ) : game ? (
        <div className="relative mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)', paddingTop: 'calc(var(--sat) + 70px)' }}>
          <div className="stadium-bg" />
          <div className="panel relative text-navy-ink">
            {game.finished ? (
              <div className="text-center">
                <div className="t-display text-[24px]">{game.goals >= game.goalAt ? `Falta PRO vencido!` : game.goals > 0 ? `${game.goals} ${game.goals === 1 ? 'gol' : 'gols'} em ${game.kicks}` : 'Não foi dessa vez'}</div>
                <p className="mt-1 text-[14px] font-extrabold">
                  {game.goals}/{game.kicks} cobranças convertidas: +{game.points} de nível{game.money > 0 ? ` e R$ ${game.money} dos alvos` : ''}.
                  {game.goals >= game.goalAt ? ` Valeu 1 gol do ${team.name}!` : ` Faltou pra ${game.goalAt}: fica pra próxima.`}
                </p>
                {game.freePlay ? (
                  <>
                    <p className="mt-2 text-[12px] font-bold text-muted">Modo de teste: pode jogar de novo quantas vezes quiser.</p>
                    <button onClick={start} disabled={busy} className="btn btn-green btn-lg mt-4 w-full">Jogar de novo</button>
                    <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-2 w-full">Voltar ao jogo</button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-[13px] font-bold text-muted">Novas faltas em <Countdown readyAt={game.nextAt} className="text-orange-deep" />.</p>
                    <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-4 w-full">Voltar ao jogo</button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="t-display text-center text-[22px]">Cobrança de falta</div>
                <ol className="mt-3 flex flex-col gap-2 text-[14px] font-bold leading-snug">
                  <li><b className="text-orange-deep">1.</b> Arraste a partir da bola: pro lado dá a direção, pra cima dá a altura por cima da barreira.</li>
                  <li><b className="text-orange-deep">2.</b> Arraste rápido = bomba; devagar = colocada. Cuidado: forte demais sobe o travessão.</li>
                  <li><b className="text-orange-deep">3.</b> Desenhe um <b>arco</b> no arrasto pra dar efeito e curvar a bola por fora da barreira — que às vezes pula!</li>
                </ol>
                <p className="mt-3 text-center text-[13px] font-bold leading-snug text-muted">
                  {game.kicks} cobranças: {game.goalAt} gols valem 1 gol do {team.name}. +{game.pointsPerGoal} de nível por gol (até +{game.maxPoints}); no aro dourado do ângulo, +R$ {game.targetMoney}.
                </p>
                <button onClick={start} disabled={busy} className="btn btn-orange btn-lg mt-4 w-full">Começar</button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
