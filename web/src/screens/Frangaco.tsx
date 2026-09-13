import { Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { FrangacoPending, FrangacoReward, FrangacoState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Shield } from '../components/Shield';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';
import { ease, clamp01, bounceY } from '../scenes/common';
import { StadiumModel, GoalModel, BallModel, KeeperModel, SceneLights, preloadModels, type KeeperHandle, type KitColors } from '../scenes/models';

/**
 * Frangaço — duelo de pênaltis alternado contra um clube IA da mesma série (transposto do
 * Managol). Você BATE (mira contínua no gol, com finta opcional) e DEFENDE (um alvo aparece
 * onde a bola vai e você tem uma janela de reação para tocar nele). Toda a decisão é do
 * servidor (services/frangaco.js); esta tela só mira, toca e anima o resultado.
 * Coordenadas 0..1 do gol: x 0 = trave esquerda do batedor, y 0 = chão, 1 = travessão.
 */

const GK_KIT: KitColors = { primary: '#f2c200', secondary: '#14335F', gloves: '#e8e8e8' };
const GX = (x: number) => (x - 0.5) * 7.32; // 0..1 → metros (0 no meio do gol)
const GY = (y: number) => 0.22 + y * 1.98;  // 0..1 → altura do centro da bola

interface KickAnim { xBola: number; yBola: number; xGk: number; gol: boolean; saved: boolean; out: boolean; t0: number }
interface DefAnim {
  target: { x: number; y: number }; flightMs: number; windowMs: number; t0: number;
  result: { defendeu: boolean; x: number; t0: number } | null;
}

function Scene({ view, kickAnim, defAnim, myKit, oppKit, anunciado, onAim }: {
  view: 'attack' | 'defense';
  kickAnim: KickAnim | null;
  defAnim: DefAnim | null;
  myKit: KitColors; oppKit: KitColors;
  anunciado: number | null;
  onAim: (x: number, y: number) => void;
}) {
  const ball = useRef<THREE.Group>(null);
  const gkGroup = useRef<THREE.Group>(null);
  const gk = useRef<KeeperHandle>(null);   // goleiro adversário (quando eu bato)
  const myGk = useRef<KeeperHandle>(null); // o meu goleiro (quando eu defendo)
  const ring = useRef<THREE.Group>(null);
  const kickStarted = useRef<number | null>(null);
  const saveStarted = useRef<number | null>(null);
  const look = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const b = ball.current;
    if (!b) return;
    if (view === 'attack') {
      const k = gkGroup.current;
      if (!kickAnim) {
        b.position.set(0, 0.21, 11);
        k?.position.set(0, 0, 0.5);
        camera.position.lerp(look.current.set(0, 1.7, 16), 0.08);
        camera.lookAt(0, 1.4, 0);
        return;
      }
      if (kickStarted.current !== kickAnim.t0) {
        kickStarted.current = kickAnim.t0;
        const pose = kickAnim.saved
          ? (kickAnim.yBola < 0.3 ? 'save_low' : Math.abs(kickAnim.xGk - 0.5) < 0.12 ? 'jump' : 'dive')
          : 'dive'; // pulou no canto que escolheu (certo ou errado)
        setTimeout(() => gk.current?.pose(pose), 150);
      }
      const e = (performance.now() - kickAnim.t0) / 1000;
      const flight = 0.8;
      const p = clamp01(e / flight);
      const tx = GX(kickAnim.xBola), ty = GY(kickAnim.yBola);
      if (p < 1) {
        b.position.set(tx * ease.out(p), 0.21 + (ty - 0.21) * p + Math.sin(p * Math.PI) * 0.7, 11 - 11 * p);
        b.rotation.x -= 0.25;
      } else if (kickAnim.gol) {
        // GOL: estufa a rede e a bola quica dentro do gol (igual ao pênalti)
        const t = e - flight;
        if (t < 0.12) { b.position.set(tx, ty, -1.35 * ease.out(t / 0.12)); b.rotation.x -= 0.4; }
        else {
          const t2 = t - 0.12;
          b.position.set(tx * (1 - 0.08 * clamp01(t2 / 1.2)), bounceY(ty, t2), -1.35 + 0.75 * ease.out(clamp01(t2 / 0.5)));
          b.rotation.x -= 0.12;
        }
      } else if (kickAnim.saved) {
        const q = clamp01((e - flight) / 0.4);
        b.position.set(tx + (GX(kickAnim.xGk) - tx) * q, ty + (0.8 - ty) * q, 0.2 + 0.5 * q);
      } else {
        // PRA FORA: segue o voo além do gol
        const q = e - flight;
        b.position.set(tx * (1 + q * 0.15), Math.max(0.21, ty + 1.1 * q - 2.6 * q * q), -q * 6);
      }
      k?.position.set(GX(kickAnim.xGk) * 0.2 * ease.out(clamp01((e - 0.25) / 0.5)), 0, 0.5);
      camera.position.lerp(look.current.set(tx * 0.25, 1.9, 9.5), 0.04);
      camera.lookAt(tx * 0.5, 1.3, 0);
      return;
    }
    // ── defendendo: câmera atrás do gol ─────────────────────────────────────
    camera.position.lerp(look.current.set(0, 3.0, -5.6), 0.09);
    camera.lookAt(0, 1.0, 11);
    if (!defAnim) { b.position.set(0, 0.21, 11); if (ring.current) ring.current.visible = false; return; }
    const t = performance.now() - defAnim.t0;
    const tx = GX(defAnim.target.x), ty = GY(defAnim.target.y);
    if (!defAnim.result) {
      const total = defAnim.flightMs + defAnim.windowMs + 400;
      const p = clamp01(t / total);
      b.position.set(tx * p, 0.21 + (ty - 0.21) * p + Math.sin(p * Math.PI) * 1.1, 11 - 10.6 * p);
      b.rotation.x += 0.2;
      if (ring.current) {
        ring.current.visible = t >= defAnim.flightMs;
        const s = 1 + 0.12 * Math.sin(t / 90);
        ring.current.scale.set(s, s, 1);
      }
      saveStarted.current = null;
      return;
    }
    const r = defAnim.result;
    if (saveStarted.current !== r.t0) {
      saveStarted.current = r.t0;
      if (ring.current) ring.current.visible = false;
      const pose = r.defendeu
        ? (defAnim.target.y < 0.3 ? 'save_low' : Math.abs(defAnim.target.x - 0.5) < 0.12 ? 'jump' : 'dive')
        : 'miss';
      myGk.current?.pose(pose);
    }
    const q = clamp01((performance.now() - r.t0) / 450);
    if (r.defendeu) {
      // agarrou: a bola morre nas luvas e cai amortecida
      const cur = b.position;
      cur.set(cur.x + (tx * 0.85 - cur.x) * q, cur.y + (Math.max(0.6, ty * 0.7) - cur.y) * q, cur.z + (1.1 - cur.z) * q);
      if (q >= 1) b.position.y = Math.max(0.25, b.position.y - 0.01);
    } else {
      // gol da IA: a bola entra e balança a rede
      const t2 = Math.max(0, performance.now() - r.t0) / 1000;
      b.position.set(tx, t2 < 0.12 ? ty : bounceY(ty, t2 - 0.12), t2 < 0.12 ? -1.35 * ease.out(t2 / 0.12) : -1.35 + 0.75 * ease.out(clamp01((t2 - 0.12) / 0.5)));
    }
  });

  const flipTarget = defAnim ? defAnim.target.x < 0.5 : false;
  return (
    <>
      <SceneLights />
      <StadiumModel />
      <GoalModel />
      {view === 'attack' ? (
        <group ref={gkGroup} position={[0, 0, 0.5]}>
          <KeeperModel ref={gk} kit={oppKit} flip={kickAnim ? kickAnim.xGk < 0.5 : false} speed={7} />
        </group>
      ) : (
        <>
          {/* eu no gol (de costas para a câmera) e o batedor da IA lá na marca */}
          <KeeperModel ref={myGk} kit={myKit} position={[0, 0, 0.45]} flip={flipTarget} speed={7} />
          <KeeperModel kit={oppKit} position={[0.5, 0, 12]} rotation={[0, Math.PI, 0]} pose="idle" />
        </>
      )}
      <group ref={ball}><BallModel /></group>
      {/* alvo da defesa (só aparece quando a janela abre) */}
      {view === 'defense' && defAnim && (
        <group ref={ring} position={[GX(defAnim.target.x), GY(defAnim.target.y), 0.12]} visible={false}>
          <mesh><ringGeometry args={[0.36, 0.54, 32]} /><meshBasicMaterial color="#FFC63D" transparent opacity={0.95} side={THREE.DoubleSide} /></mesh>
          <mesh><circleGeometry args={[0.3, 24]} /><meshBasicMaterial color="#E53935" transparent opacity={0.5} side={THREE.DoubleSide} /></mesh>
        </group>
      )}
      {/* canto anunciado da finta */}
      {view === 'attack' && anunciado !== null && (
        <mesh position={[GX(anunciado), 2.7, 0.1]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.2, 0.45, 12]} />
          <meshBasicMaterial color="#FFC63D" />
        </mesh>
      )}
      {/* plano de mira/toque sobre o gol (invisível; DoubleSide para o toque de trás do gol) */}
      <mesh position={[0, 1.5, 0.06]} onPointerDown={(ev: ThreeEvent<PointerEvent>) => {
        ev.stopPropagation();
        onAim(clamp01(ev.point.x / 7.32 + 0.5), clamp01((ev.point.y - 0.22) / 1.98));
      }}>
        <planeGeometry args={[9.6, 3.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

/** Bolinhas do placar da disputa: verde = converteu, vermelha = perdeu, vazia = por vir. */
function Dots({ shots, total }: { shots: boolean[]; total: number }) {
  const n = Math.max(total, shots.length);
  return (
    <div className="flex gap-1">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/85"
          style={{ background: i < shots.length ? (shots[i] ? '#22c55e' : '#E53935') : 'rgba(255,255,255,0.18)' }} />
      ))}
    </div>
  );
}

export function FrangacoScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [game, setGame] = useState<FrangacoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [finta, setFinta] = useState(false);
  const [anunciado, setAnunciado] = useState<number | null>(null);
  const [kickAnim, setKickAnim] = useState<KickAnim | null>(null);
  const [defAnim, setDefAnim] = useState<DefAnim | null>(null);
  const [banner, setBanner] = useState<{ text: string; good: boolean } | null>(null);
  const [overlay, setOverlay] = useState<FrangacoReward | null>(null);
  const [, setTick] = useState(0);
  const missTimer = useRef<number | null>(null);
  const tapped = useRef(false);

  const myKit: KitColors = { primary: me.team.colorPrimary, secondary: me.team.colorSecondary, gloves: '#e8e8e8', badge: me.team.slug };
  const opp = game?.opponent ?? null;
  const oppKit: KitColors = opp ? { primary: opp.colorPrimary, secondary: opp.colorSecondary, gloves: '#e8e8e8', badge: opp.slug } : GK_KIT;

  useEffect(() => { preloadModels(); }, []);
  useEffect(() => {
    api.frangaco().then((r) => {
      setGame(r.state);
      // defesa que ficou no ar (recarregou a página): retoma a animação na hora
      if (r.state.playing && r.state.duel?.turn === 'defense' && r.state.duel.pending) startDefense(r.state.duel.pending);
    }).catch((e) => toast((e as Error).message, 'error'));
    return () => { if (missTimer.current) window.clearTimeout(missTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // relógio da defesa (re-render para os textos "PREPARA / AGORA!")
  useEffect(() => {
    if (!defAnim || defAnim.result) return;
    let raf = 0;
    const loop = () => { setTick((n) => n + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [defAnim]);

  async function start() {
    if (busy) return;
    setBusy(true);
    try { setGame((await api.frangacoStart()).state); } catch (e) {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'locked') nav('/', { replace: true });
    } finally { setBusy(false); }
  }

  function finish(state: FrangacoState) {
    setGame(state);
    refresh();
    if (state.reward) setOverlay(state.reward);
  }

  function startDefense(p: FrangacoPending) {
    tapped.current = false;
    const anim: DefAnim = { target: p.target, flightMs: p.flightMs, windowMs: p.windowMs, t0: performance.now(), result: null };
    setDefAnim(anim);
    sound.play('pop');
    if (missTimer.current) window.clearTimeout(missTimer.current);
    missTimer.current = window.setTimeout(() => { if (!tapped.current) doSave(null, anim); }, p.flightMs + p.windowMs + 250);
  }

  async function doKick(x: number, y: number) {
    if (busy || kickAnim) return;
    setBusy(true);
    try {
      const res = await api.frangacoKick({ x, y, anunciado });
      sound.play('tap');
      setAnunciado(null); setFinta(false);
      const k = res.kick;
      const anim: KickAnim = { xBola: k.xBola, yBola: k.yBola, xGk: k.xGk, gol: k.gol, saved: !k.gol && k.motivo !== 'PRA FORA!', out: k.motivo === 'PRA FORA!', t0: performance.now() };
      setKickAnim(anim);
      window.setTimeout(() => { setBanner({ text: k.motivo, good: k.gol }); sound.play(k.gol ? 'goal' : 'error'); }, 850);
      window.setTimeout(() => {
        setBanner(null); setKickAnim(null);
        if (res.state.outcome) finish(res.state);
        else { setGame(res.state); if (res.defense) startDefense(res.defense); }
      }, 2500);
    } catch (e) {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && (e.code === 'no-duel' || e.code === 'not-your-kick' || e.code === 'over')) load();
    } finally { setBusy(false); }
  }

  async function doSave(click: { x: number; y: number; ms: number } | null, anim: DefAnim) {
    if (missTimer.current) window.clearTimeout(missTimer.current);
    try {
      const res = await api.frangacoSave(click ?? { x: null, y: null, ms: null });
      const s = res.save;
      setDefAnim({ ...anim, result: { defendeu: s.defendeu, x: s.clique?.x ?? anim.target.x, t0: performance.now() } });
      window.setTimeout(() => { setBanner({ text: s.motivo, good: s.defendeu }); sound.play(s.defendeu ? 'goal' : 'error'); }, 500);
      window.setTimeout(() => {
        setBanner(null); setDefAnim(null);
        if (res.state.outcome) finish(res.state);
        else setGame(res.state);
      }, 2400);
    } catch (e) {
      toast((e as Error).message, 'error');
      setDefAnim(null);
      load();
    }
  }

  const load = () => api.frangaco().then((r) => setGame(r.state)).catch(() => {});

  function onAim(x: number, y: number) {
    if (defAnim && !defAnim.result) {
      const t = performance.now() - defAnim.t0 - defAnim.flightMs;
      if (t < -120 || tapped.current) return; // o alvo ainda nem apareceu
      tapped.current = true;
      doSave({ x, y, ms: Math.max(0, Math.round(t)) }, defAnim);
      return;
    }
    if (!game?.playing || game.duel?.turn !== 'kick' || busy || kickAnim) return;
    if (finta && anunciado === null) { setAnunciado(x); sound.play('pop'); return; }
    doKick(x, y);
  }

  const duel = game?.duel ?? null;
  const view: 'attack' | 'defense' = defAnim || duel?.turn === 'defense' ? 'defense' : 'attack';
  const playing = !!game?.playing;
  const defT = defAnim && !defAnim.result ? performance.now() - defAnim.t0 : null;
  const windowOpen = defT !== null && defT >= (defAnim?.flightMs ?? 0);

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <GoalOverlay open={!!overlay} goal={!!overlay?.venceu}
        title={overlay?.champion ? 'CAMPEÃO DO FRANGAÇO!!' : overlay?.venceu ? 'CLASSIFICADO!' : 'ELIMINADO!'}
        text={overlay?.text ?? (overlay ? `Deu ${overlay.golsUser} x ${overlay.golsIa} para ${overlay.venceu ? 'você' : `o ${opp?.name ?? 'adversário'}`}.` : null)}
        money={overlay?.money ?? 0} levelPoints={overlay?.levelPoints ?? 0} team={me.team}
        onClose={() => setOverlay(null)} />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-orange">FRANGAÇO</div>
        <div className="trap trap-blue text-[12px]">{game ? game.phaseName.toUpperCase() : '…'}</div>
      </div>

      <div className="relative h-[56vh] w-full">
        <Canvas shadows camera={{ position: [0, 1.7, 16], fov: 48 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'linear-gradient(#46b4ff, #1f7ae6)' }}>
          <Suspense fallback={null}>
            <Scene view={view} kickAnim={kickAnim} defAnim={defAnim} myKit={myKit} oppKit={oppKit} anunciado={anunciado} onAim={onAim} />
          </Suspense>
        </Canvas>
        {playing && duel && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-navy-deep/80 px-3 py-1.5">
              <Shield team={me.team} size={26} />
              <span className="t-display text-[18px] tabular-nums text-white">{duel.golsUser}</span>
              <Dots shots={duel.user.map((k) => k.gol)} total={game!.kicks} />
              <span className="t-display text-[13px] text-white/70">x</span>
              <Dots shots={duel.ia.map((d) => d.gol)} total={game!.kicks} />
              <span className="t-display text-[18px] tabular-nums text-white">{duel.golsIa}</span>
              {opp && <Shield team={opp} size={26} />}
            </div>
          </div>
        )}
        {banner && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className={`t-display t-out rounded-2xl bg-navy-deep/70 px-5 py-1 text-[38px] ${banner.good ? 't-gold' : 't-red'}`}>{banner.text}</span>
          </motion.div>
        )}
        {defAnim && !defAnim.result && !banner && (
          <div className="pointer-events-none absolute inset-x-0 top-1/4 text-center">
            <span className={`t-display t-out text-[30px] ${windowOpen ? 't-gold' : ''}`}>{windowOpen ? 'TOQUE NO ALVO!' : 'AÍ VEM A COBRANÇA…'}</span>
          </div>
        )}
      </div>

      <div className="relative flex flex-1 flex-col justify-start gap-2 px-4 pb-5 pt-2">
        <div className="stadium-bg" />
        {!game ? null : playing && duel ? (
          <>
            {duel.turn === 'kick' && !kickAnim && !defAnim ? (
              <>
                <p className="t-display t-out relative text-center text-[13px] uppercase tracking-widest">
                  {duel.sudden ? 'MORTE SÚBITA · ' : `Cobrança ${Math.min(duel.round, game.kicks)} de ${game.kicks} · `}
                  {anunciado !== null ? 'Canto anunciado! Agora bata de verdade' : 'Toque no gol para bater'}
                </p>
                <div className="relative flex items-center justify-center gap-2">
                  <button onClick={() => { setFinta((f) => !f); if (finta) setAnunciado(null); }} disabled={busy}
                    className={`btn btn-sm no-drag ${finta ? 'btn-yellow' : 'btn-white'}`}>
                    {finta ? (anunciado !== null ? 'FINTA ARMADA' : 'FINTA: TOQUE 1 ANUNCIA') : 'FINTAR'}
                  </button>
                  {opp && <span className="t-display t-out text-[12px]">vs {opp.name}</span>}
                </div>
                <p className="t-out relative text-center text-[11px] font-extrabold text-white/85">
                  Com a finta, o primeiro toque ANUNCIA um canto (o goleiro acredita nele) e o segundo é a cobrança de verdade.
                  Destreza {me.dexterity}: quanto maior, mais fiel à mira.
                </p>
              </>
            ) : duel.turn === 'defense' || defAnim ? (
              <p className="t-display t-out relative text-center text-[13px] uppercase tracking-widest">
                Defesa {Math.min(duel.round, game.kicks)} de {game.kicks} · toque no alvo assim que ele aparecer
              </p>
            ) : (
              <p className="t-display t-out relative text-center text-[13px] uppercase tracking-widest">…</p>
            )}
          </>
        ) : (
          <div className="panel relative text-navy-ink">
            {game.finished ? (
              <div className="text-center">
                <div className="t-display text-[22px]">
                  {game.champion ? 'CAMPEÃO DO FRANGAÇO!' : game.outcome === 'venceu' ? `Classificado para ${game.phase + 1 < game.phases.length ? 'a ' + game.phases[game.phase + 1] : 'o título'}!` : 'Eliminado'}
                </div>
                {duel && <p className="mt-1 text-[14px] font-extrabold">Duelo de hoje: {duel.golsUser} x {duel.golsIa} contra o {opp?.name ?? 'adversário'}.</p>}
                {game.champion && <p className="mt-1 text-[13px] font-bold">+R$ {game.championMoney} e +{game.championLevelPoints} de nível pelo título!</p>}
                {game.outcome === 'perdeu' && <p className="mt-1 text-[13px] font-bold text-muted">O torneio recomeça das {game.phases[0]}.</p>}
                {game.freePlay ? (
                  <button onClick={start} disabled={busy} className="btn btn-green btn-lg mt-3 w-full">Jogar de novo (teste)</button>
                ) : (
                  <p className="mt-2 text-[13px] font-bold text-muted">Próximo duelo em <Countdown readyAt={game.nextAt} className="text-orange-deep" />.</p>
                )}
                <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-3 w-full">Voltar ao jogo</button>
              </div>
            ) : (
              <>
                <div className="t-display text-center text-[20px]">Duelo de pênaltis</div>
                <ol className="mt-2 flex flex-col gap-1.5 text-[13px] font-bold leading-snug">
                  <li><b className="text-orange-deep">1.</b> Você bate {game.kicks} e defende {game.kicks}, alternando, contra um clube da sua série.</li>
                  <li><b className="text-orange-deep">2.</b> Batendo: toque no gol para mirar. Dá para FINTAR: anuncie um canto e bata no outro.</li>
                  <li><b className="text-orange-deep">3.</b> Defendendo: um alvo aparece onde a bola vai — toque nele a tempo!</li>
                  <li><b className="text-orange-deep">4.</b> Mata-mata de {game.phases.length} fases, um duelo por dia. Venceu = 1 gol do time; campeão leva +R$ {game.championMoney} e +{game.championLevelPoints} de nível.</li>
                </ol>
                <div className="mt-3 flex flex-col gap-1">
                  {game.phases.map((name, i) => {
                    const h = game.history.find((x) => x.phase === i);
                    return (
                      <div key={i} className={`flex items-center justify-between rounded-lg px-2 py-1 text-[13px] font-extrabold ${i === game.phase ? 'bg-amber-100' : ''}`}>
                        <span>{name}</span>
                        <span className="text-muted">
                          {h ? `${h.golsUser} x ${h.golsIa} · ${h.opponent?.abbr ?? ''}` : i === game.phase ? 'HOJE' : i < game.phase ? '—' : 'a caminho'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button onClick={start} disabled={busy} className="btn btn-orange btn-lg mt-3 w-full">
                  {game.phase > 0 ? `Jogar a ${game.phaseName}` : 'Começar o duelo'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
