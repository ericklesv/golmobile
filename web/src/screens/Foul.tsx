import { Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { KickResult } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown, Spinner, useCountdown } from '../components/ui';
import { toast } from '../components/Toast';
import { useCaptcha } from '../components/Captcha';
import { KickArrowButton } from '../components/KickArrows';
import { ease, clamp01 } from '../scenes/common';
import { StadiumModel, GoalModel, BallModel, KeeperModel, SceneLights, preloadModels, type KeeperHandle } from '../scenes/models';

type Dir = 'left' | 'over' | 'right';
type Outcome = 'goal' | 'wall' | 'keeper' | 'out';
interface Shot { dir: Dir; outcome: Outcome; t0: number }

const START = new THREE.Vector3(1.5, 0.21, 20);
const WALL_Z = 10.5;

function targetFor(dir: Dir, outcome: Outcome): THREE.Vector3 {
  if (outcome === 'wall') return new THREE.Vector3(dir === 'left' ? -1.2 : dir === 'right' ? 1.0 : 0, 1.4, WALL_Z);
  if (outcome === 'out') return new THREE.Vector3(dir === 'left' ? -4.2 : dir === 'right' ? 4.2 : 0.5, dir === 'over' ? 3.2 : 1.2, -1);
  const x = dir === 'left' ? -2.8 : dir === 'right' ? 2.8 : 0.4;
  const y = dir === 'over' ? 2.0 : 1.0;
  return new THREE.Vector3(x, y, outcome === 'goal' ? -0.6 : 0.3);
}

function Scene({ shot, keeperColor, wallColor }: { shot: Shot | null; keeperColor: string; wallColor: string }) {
  const ball = useRef<THREE.Group>(null);
  const keeper = useRef<THREE.Group>(null);
  const wall = useRef<THREE.Group>(null);
  const kh = useRef<KeeperHandle>(null);
  const started = useRef<number | null>(null);

  useFrame(({ camera }) => {
    const b = ball.current, k = keeper.current, w = wall.current;
    if (!b || !k || !w) return;
    if (!shot) {
      b.position.copy(START);
      k.position.set(0, 0, 0.5);
      w.position.y = 0;
      camera.position.lerp(new THREE.Vector3(3.5, 2.4, 26), 0.08);
      camera.lookAt(0, 1.3, 4);
      return;
    }
    if (started.current !== shot.t0) {
      started.current = shot.t0;
      const a = shot.outcome === 'keeper' ? (shot.dir === 'over' ? 'jump' : 'save_low') : shot.outcome === 'goal' ? 'dive' : 'miss';
      setTimeout(() => kh.current?.pose(a), 350);
    }
    const e = (performance.now() - shot.t0) / 1000;
    const flight = shot.outcome === 'wall' ? 0.45 : 1.0;
    const p = clamp01(e / flight);
    const tgt = targetFor(shot.dir, shot.outcome);
    const curve = shot.dir === 'left' ? -2.2 : shot.dir === 'right' ? 2.2 : 0;
    b.position.x = START.x + (tgt.x - START.x) * p + Math.sin(p * Math.PI) * curve;
    b.position.z = START.z + (tgt.z - START.z) * p;
    const arc = shot.dir === 'over' ? 2.6 : 1.0;
    b.position.y = START.y + (tgt.y - START.y) * p + Math.sin(p * Math.PI) * arc;
    b.rotation.x -= 0.2;
    if (p >= 1) {
      const q = clamp01((e - flight) / 0.6);
      if (shot.outcome === 'goal') { b.position.z = tgt.z - 1.2 * q; b.position.y = Math.max(0.21, tgt.y - 0.9 * q); }
      if (shot.outcome === 'wall') { b.position.z = tgt.z + 5 * q; b.position.y = 0.21 + Math.sin(q * Math.PI) * 1.4; }
      if (shot.outcome === 'keeper') { b.position.x = k.position.x * 0.8; b.position.y = 1.0; }
      if (shot.outcome === 'out') { b.position.z = tgt.z - 4 * q; b.position.y = tgt.y + 1.5 * q; }
    }
    const jump = shot.dir === 'over' ? Math.sin(clamp01((e - 0.15) / 0.5) * Math.PI) * 0.5 : 0;
    w.position.y = jump;
    const kp = clamp01((e - 0.35) / 0.55);
    const kdir = shot.outcome === 'goal' ? (shot.dir === 'left' ? 1 : -1) : (shot.dir === 'left' ? -1 : shot.dir === 'right' ? 1 : 0);
    k.position.set(kdir * 1.2 * ease.out(kp), 0, 0.5);
    camera.position.lerp(new THREE.Vector3(2 + tgt.x * 0.2, 2.6, 17), 0.03);
    camera.lookAt(tgt.x * 0.5, 1.5, 2);
  });

  const keeperFlip = shot ? (shot.outcome === 'goal' ? shot.dir === 'left' : shot.dir === 'right') : false;
  return (
    <>
      <SceneLights />
      <StadiumModel />
      <GoalModel />
      <group ref={keeper} position={[0, 0, 0.5]}><KeeperModel ref={kh} color={keeperColor} flip={keeperFlip} speed={7} /></group>
      <group ref={wall} position={[0, 0, WALL_Z]}>
        {[-1.2, -0.4, 0.4, 1.2].map((x, i) => <KeeperModel key={x} color={wallColor} pose="wall" position={[x, 0, 0]} seed={i * 1.7} />)}
      </group>
      <group ref={ball}><BallModel /></group>
    </>
  );
}

export function FoulScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KickResult | null>(null);
  const [overlay, setOverlay] = useState(false);
  const rem = useCountdown(me.cooldowns.FOUL.readyAt);
  const ready = rem <= 0 && me.cooldowns.FOUL.unlocked;
  const captcha = useCaptcha(me.captchaRequired);
  useEffect(() => { preloadModels(); }, []);

  async function kick(dir: Dir) {
    if (busy || !ready || shot) return;
    if (me.captchaRequired && !captcha.payload) { toast('Responda a conta anti-robô antes de cobrar.'); return; }
    setBusy(true);
    try {
      const r = await api.foul(dir, captcha.payload);
      setResult(r);
      setShot({ dir, outcome: (r.outcome ?? (r.goal ? 'goal' : 'keeper')) as Outcome, t0: performance.now() });
      setTimeout(() => setOverlay(true), 2000);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cooldown') { toast('Falta ainda em recarga.'); refresh(); }
      else if (e instanceof ApiError && e.code === 'captcha') { toast(e.message, 'error'); captcha.refresh(); refresh(); }
      else toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  const missTitle = { wall: 'NA BARREIRA!', keeper: 'DEFENDEU!', out: 'PRA FORA!', goal: '' }[shot?.outcome ?? 'goal'];

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <GoalOverlay open={overlay} goal={!!result?.goal} title={result?.goal ? (result.rebound ? 'NO REBOTE!' : 'GOLAÇO!!') : missTitle} text={result?.text} money={result?.money} team={me.team}
        onClose={() => { setOverlay(false); nav('/'); }} />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-blue">FALTA</div>
        <div className="trap trap-orange text-[12px]">{ready ? <span className="t-green">PRONTO</span> : <Countdown readyAt={me.cooldowns.FOUL.readyAt} />}</div>
      </div>
      <div className="h-[62vh] w-full">
        <Canvas shadows camera={{ position: [3.5, 2.4, 26], fov: 50 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'linear-gradient(#46b4ff, #1f7ae6)' }}>
          <Suspense fallback={null}><Scene shot={shot} keeperColor="#f2c200" wallColor="#7f1d1d" /></Suspense>
        </Canvas>
      </div>
      <div className="relative flex flex-1 flex-col justify-center gap-3 px-4 pb-6">
        <div className="stadium-bg" />
        {!shot && captcha.box}
        <p className="t-display t-out relative text-center text-[13px] uppercase tracking-widest">
          {shot ? (result?.goal ? 'É GOL!' : 'Não foi dessa vez…') : `Escolha a cobrança · ${Math.round((0.5 + me.dexterity / 100) * 100)}% de acerto`}
        </p>
        <div className="relative flex items-end justify-around px-2">
          <KickArrowButton dir="left" label="Por fora" onClick={() => kick('left')} disabled={!ready || busy || !!shot} />
          <KickArrowButton dir="up" label="Por cima" onClick={() => kick('over')} disabled={!ready || busy || !!shot} />
          <KickArrowButton dir="right" label="Por fora" onClick={() => kick('right')} disabled={!ready || busy || !!shot} />
          {busy && !shot && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
        </div>
        {!me.cooldowns.FOUL.unlocked && <p className="t-display t-red relative text-center text-[13px]">Falta libera no nível 1 (Pintinho, 22 gols).</p>}
      </div>
    </div>
  );
}
