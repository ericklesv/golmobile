import { Suspense, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { KickResult } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown, Spinner, useCountdown } from '../components/ui';
import { toast } from '../components/Toast';
import { Pitch, Goal, Player, Ball, Stadium, Lights, ease, clamp01 } from '../scenes/common';

type Dir = 'left' | 'over' | 'right';
type Outcome = 'goal' | 'wall' | 'keeper' | 'out';
interface Shot { dir: Dir; outcome: Outcome; t0: number }

const START = new THREE.Vector3(1.5, 0.22, 20);
const WALL_Z = 10.5;

function targetFor(dir: Dir, outcome: Outcome): THREE.Vector3 {
  if (outcome === 'wall') return new THREE.Vector3(dir === 'left' ? -1.2 : dir === 'right' ? 1.0 : 0, 1.4, WALL_Z);
  if (outcome === 'out') return new THREE.Vector3(dir === 'left' ? -4.2 : dir === 'right' ? 4.2 : 0.5, dir === 'over' ? 3.2 : 1.2, -1);
  const x = dir === 'left' ? -2.8 : dir === 'right' ? 2.8 : 0.4;
  const y = dir === 'over' ? 2.0 : 1.0;
  return new THREE.Vector3(x, y, outcome === 'goal' ? -0.6 : 0.3);
}

function Scene({ shot, teamColor }: { shot: Shot | null; teamColor: string }) {
  const ball = useRef<THREE.Group>(null);
  const keeper = useRef<THREE.Group>(null);
  const wall = useRef<THREE.Group>(null);

  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    const b = ball.current, k = keeper.current, w = wall.current;
    if (!b || !k || !w) return;
    if (!shot) {
      b.position.copy(START);
      k.position.set(Math.sin(t) * 0.3, 0, 0.4); k.rotation.z = 0;
      w.position.y = Math.sin(t * 2) * 0.03;
      camera.position.lerp(new THREE.Vector3(3.5, 2.2, 25), 0.08);
      camera.lookAt(0, 1.2, 4);
      return;
    }
    const e = (performance.now() - shot.t0) / 1000;
    const flight = shot.outcome === 'wall' ? 0.45 : 1.0;
    const p = clamp01(e / flight);
    const tgt = targetFor(shot.dir, shot.outcome);
    // trajetória: curva (efeito) lateral + parábola por cima da barreira
    const curve = shot.dir === 'left' ? -2.2 : shot.dir === 'right' ? 2.2 : 0;
    b.position.x = START.x + (tgt.x - START.x) * p + Math.sin(p * Math.PI) * curve;
    b.position.z = START.z + (tgt.z - START.z) * p;
    const arc = shot.dir === 'over' ? 2.6 : 1.0;
    b.position.y = START.y + (tgt.y - START.y) * p + Math.sin(p * Math.PI) * arc;
    if (p >= 1) {
      const q = clamp01((e - flight) / 0.6);
      if (shot.outcome === 'goal') { b.position.z = tgt.z - 1.2 * q; b.position.y = Math.max(0.22, tgt.y - 0.9 * q); }
      if (shot.outcome === 'wall') { b.position.z = tgt.z + 5 * q; b.position.y = 0.22 + Math.sin(q * Math.PI) * 1.4; }
      if (shot.outcome === 'keeper') { b.position.x = k.position.x * 0.8; b.position.y = 1.0; }
      if (shot.outcome === 'out') { b.position.z = tgt.z - 4 * q; b.position.y = tgt.y + 1.5 * q; }
    }
    // barreira pula quando a bola passa por cima
    const jump = shot.dir === 'over' ? Math.sin(clamp01((e - 0.15) / 0.5) * Math.PI) * 0.5 : 0;
    w.position.y = jump;
    // goleiro reage
    const kp = clamp01((e - 0.35) / 0.55);
    const kdir = shot.outcome === 'goal' ? (shot.dir === 'left' ? 1 : -1) : (shot.dir === 'left' ? -1 : shot.dir === 'right' ? 1 : 0);
    k.position.set(kdir * 2.0 * ease.out(kp), kdir === 0 ? 0.4 * Math.sin(kp * Math.PI) : 0.4 * Math.sin(kp * Math.PI), 0.4);
    k.rotation.z = -kdir * 1.0 * ease.out(kp);
    camera.position.lerp(new THREE.Vector3(2 + tgt.x * 0.2, 2.4, 16), 0.03);
    camera.lookAt(tgt.x * 0.5, 1.4, 2);
  });

  return (
    <>
      <Lights />
      <Stadium c1={teamColor} />
      <Pitch />
      <Goal />
      <group ref={keeper}><Player color="#111827" arms={0.4} gloves /></group>
      <group ref={wall} position={[0, 0, WALL_Z]}>
        {[-1.2, -0.4, 0.4, 1.2].map((x) => <Player key={x} color="#7f1d1d" position={[x, 0, 0]} arms={-0.2} />)}
      </group>
      <group ref={ball}><Ball position={[0, 0, 0]} /></group>
      <fog attach="fog" args={['#0A1B2B', 35, 80]} />
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

  async function kick(dir: Dir) {
    if (busy || !ready || shot) return;
    setBusy(true);
    try {
      const r = await api.foul(dir);
      setResult(r);
      setShot({ dir, outcome: (r.outcome ?? (r.goal ? 'goal' : 'keeper')) as Outcome, t0: performance.now() });
      setTimeout(() => setOverlay(true), 1800);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cooldown') { toast('Falta ainda em recarga.'); refresh(); }
      else toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  const missTitle = { wall: 'NA BARREIRA!', keeper: 'DEFENDEU!', out: 'PRA FORA!', goal: '' }[shot?.outcome ?? 'goal'];

  return (
    <div className="app-frame relative flex min-h-full flex-col bg-night-0">
      <GoalOverlay open={overlay} goal={!!result?.goal} title={result?.goal ? (result.rebound ? 'NO REBOTE!' : 'GOLAÇO!!') : missTitle} text={result?.text} money={result?.money} team={me.team}
        onClose={() => { setOverlay(false); nav('/'); }} />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="rounded-full bg-night-0/70 p-2 text-chalk backdrop-blur"><ArrowLeft className="h-5 w-5" /></button>
        <div className="rounded-full bg-night-0/70 px-3 py-1 font-poster text-lg tracking-wide text-sky-300 backdrop-blur">FALTA</div>
        <div className="rounded-full bg-night-0/70 px-3 py-1 text-xs text-chalk backdrop-blur">{ready ? <span className="text-turf">PRONTO</span> : <Countdown readyAt={me.cooldowns.FOUL.readyAt} />}</div>
      </div>
      <div className="h-[62vh] w-full">
        <Canvas shadows camera={{ position: [3.5, 2.2, 25], fov: 50 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'linear-gradient(#04101B, #0A1B2B)' }}>
          <Suspense fallback={null}><Scene shot={shot} teamColor={me.team.colorPrimary} /></Suspense>
        </Canvas>
      </div>
      <div className="relative flex flex-1 flex-col justify-center gap-3 px-4 pb-6">
        <p className="text-center text-xs uppercase tracking-widest text-haze">
          {shot ? (result?.goal ? 'É GOL!' : 'Não foi dessa vez…') : `Escolha a cobrança · ${Math.round((0.5 + me.dexterity / 100) * 100)}% de acerto`}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => kick('left')} disabled={!ready || busy || !!shot} className="btn py-5 text-sm bg-sky-400 text-night-0 shadow-[0_0_24px_rgba(56,189,248,0.35)]">{busy && !shot ? <Spinner /> : 'Por fora ‹'}</button>
          <button onClick={() => kick('over')} disabled={!ready || busy || !!shot} className="btn py-5 text-sm bg-sky-400 text-night-0 shadow-[0_0_24px_rgba(56,189,248,0.35)]">{busy && !shot ? <Spinner /> : 'Por cima'}</button>
          <button onClick={() => kick('right')} disabled={!ready || busy || !!shot} className="btn py-5 text-sm bg-sky-400 text-night-0 shadow-[0_0_24px_rgba(56,189,248,0.35)]">{busy && !shot ? <Spinner /> : '› Por fora'}</button>
        </div>
        {!me.cooldowns.FOUL.unlocked && <p className="text-center text-xs text-card">Falta libera no nível 1 (Pintinho, 22 gols).</p>}
      </div>
    </div>
  );
}
