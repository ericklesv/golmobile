import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { HattrickFlight, HattrickResult, HattrickShootResponse, HattrickShot, HattrickState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';
// a vista (campo, goleiro, bola, mira, batida) é a MESMA da demonstração da página inicial — 27/09/2026
import { VB, TOUCH_R, MAX_DRAG, RESULT_TEXT, Pitch, Keeper, FieldBall, AimArrow, Hud, StrikeScene, ballAt, keeperAt, type Aim } from '../components/hattrickView';

/**
 * Hat Trick — chute de longe. Campo visto de cima em METROS (o gol em y = 0, x = 0 no meio; o SVG
 * usa metros direto como unidade). Fases: mira (toca na bola e puxa pra trás: seta = direção,
 * comprimento = força) → batida (vista de lado, a bola grande quica; toque nela: lado = efeito,
 * embaixo = sobe, fora = furou) → voo (o servidor decide; a tela só anima o caminho que ele mandou).
 */

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
