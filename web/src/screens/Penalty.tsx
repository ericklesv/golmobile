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
import { Pitch, Goal, Player, Ball, Stadium, Lights, ease, clamp01 } from '../scenes/common';

type Dir = 'left' | 'center' | 'right';
interface Shot { dir: Dir; keeperDir: Dir; goal: boolean; t0: number }
const X: Record<Dir, number> = { left: -2.6, center: 0, right: 2.6 };

function Scene({ shot, teamColor }: { shot: Shot | null; teamColor: string }) {
  const ball = useRef<THREE.Group>(null);
  const keeper = useRef<THREE.Group>(null);
  const cam = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.6, 15));

  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    const b = ball.current, k = keeper.current;
    if (!b || !k) return;
    if (!shot) {
      b.position.set(0, 0.22, 11);
      // goleiro balança esperando
      k.position.set(Math.sin(t * 1.5) * 0.4, 0, 0.3);
      k.rotation.z = 0;
      camera.position.lerp(cam.current, 0.08);
      camera.lookAt(0, 1.2, 0);
      return;
    }
    const e = (performance.now() - shot.t0) / 1000;
    const flight = 0.75;
    const p = clamp01(e / flight);
    const tx = X[shot.dir] * (shot.goal ? 1 : 0.92);
    const ty = shot.dir === 'center' ? 0.9 : 1.5;
    if (p < 1) {
      b.position.x = tx * ease.out(p);
      b.position.z = 11 - 11 * p;
      b.position.y = 0.22 + Math.sin(p * Math.PI) * 1.2 + ty * p;
    } else if (shot.goal) {
      const q = clamp01((e - flight) / 0.35);
      b.position.z = -1.6 * q; b.position.y = Math.max(0.22, (0.22 + ty) - 1.0 * q);
    } else {
      // defesa: bola volta rebatida
      const q = clamp01((e - flight) / 0.6);
      b.position.z = 0.6 + 6 * q; b.position.y = 0.22 + Math.sin(q * Math.PI) * 1.6; b.position.x = tx * (1 - q * 0.4);
    }
    // goleiro mergulha no canto escolhido por ele
    const kp = clamp01((e - 0.12) / 0.55);
    const kx = X[shot.keeperDir] * 0.8 * ease.out(kp);
    k.position.set(kx, 0, 0.3);
    k.rotation.z = shot.keeperDir === 'center' ? 0 : (shot.keeperDir === 'left' ? 1 : -1) * 1.1 * ease.out(kp);
    k.position.y = shot.keeperDir === 'center' ? 0 : 0.5 * Math.sin(kp * Math.PI);
    // câmera acompanha
    camera.position.lerp(new THREE.Vector3(tx * 0.3, 1.8, 9), 0.04);
    camera.lookAt(tx * 0.5, 1.2, 0);
  });

  return (
    <>
      <Lights />
      <Stadium c1={teamColor} />
      <Pitch />
      <Goal />
      <group ref={keeper}><Player color="#111827" arms={0.5} gloves /></group>
      <group ref={ball}><Ball position={[0, 0, 0]} /></group>
      <fog attach="fog" args={['#7fc5ff', 30, 70]} />
    </>
  );
}

export function PenaltyScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KickResult | null>(null);
  const [overlay, setOverlay] = useState(false);
  const rem = useCountdown(me.cooldowns.PENALTY.readyAt);
  const ready = rem <= 0 && me.cooldowns.PENALTY.unlocked;

  async function kick(dir: Dir) {
    if (busy || !ready || shot) return;
    setBusy(true);
    try {
      const r = await api.penalty(dir);
      setResult(r);
      setShot({ dir, keeperDir: r.keeperDir ?? dir, goal: r.goal, t0: performance.now() });
      setTimeout(() => setOverlay(true), 1500);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cooldown') { toast('Pênalti ainda em recarga.'); refresh(); }
      else toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowLeft') kick('left');
      if (ev.key === 'ArrowUp') kick('center');
      if (ev.key === 'ArrowRight') kick('right');
      if (ev.key === 'Escape') nav('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <GoalOverlay open={overlay} goal={!!result?.goal} title={result?.goal ? (result.rebound ? 'NO REBOTE!' : 'GOOOOL!!') : 'DEFENDEU!'} text={result?.text} money={result?.money} team={me.team}
        onClose={() => { setOverlay(false); nav('/'); }} />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-yellow">PÊNALTI</div>
        <div className="trap trap-blue text-[12px]">{ready ? <span className="t-green">PRONTO</span> : <Countdown readyAt={me.cooldowns.PENALTY.readyAt} />}</div>
      </div>
      <div className="h-[62vh] w-full">
        <Canvas shadows camera={{ position: [0, 1.6, 15], fov: 48 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'linear-gradient(#46b4ff, #1f7ae6)' }}>
          <Suspense fallback={null}><Scene shot={shot} teamColor={me.team.colorPrimary} /></Suspense>
        </Canvas>
      </div>
      <div className="relative flex flex-1 flex-col justify-center gap-3 px-4 pb-6">
        <div className="stadium-bg" />
        <p className="t-display t-out relative text-center text-[13px] uppercase tracking-widest">
          {shot ? (result?.goal ? 'É GOL!' : 'O goleiro foi no canto certo…') : `Escolha o canto · destreza ${me.dexterity} · ${Math.round((2 / 3 + me.dexterity / 100) * 100)}% de acerto`}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(['left', 'center', 'right'] as Dir[]).map((d) => (
            <button key={d} onClick={() => kick(d)} disabled={!ready || busy || !!shot} className="btn btn-orange btn-lg relative text-[19px]">
              {busy && !shot ? <Spinner /> : d === 'left' ? 'Esquerda' : d === 'center' ? 'Meio' : 'Direita'}
            </button>
          ))}
        </div>
        {!ready && me.cooldowns.PENALTY.unlocked && !shot && <p className="t-display t-out relative text-center text-[12px]">Recarga: {me.vip ? '5 min (VIP)' : '10 min · VIP bate a cada 5'}</p>}
      </div>
    </div>
  );
}
