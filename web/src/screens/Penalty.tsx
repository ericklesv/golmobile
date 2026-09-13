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
import { ease, clamp01, bounceY } from '../scenes/common';
import { StadiumModel, GoalModel, BallModel, KeeperModel, SceneLights, preloadModels, type KeeperHandle, type KitColors } from '../scenes/models';

type Dir = 'left' | 'center' | 'right';
interface Shot { dir: Dir; keeperDir: Dir; goal: boolean; t0: number }
const X: Record<Dir, number> = { left: -2.7, center: 0, right: 2.7 };
const GK_KIT = { primary: '#f2c200', secondary: '#14335F', gloves: '#e8e8e8' }; // uniforme clássico de goleiro

function Scene({ shot, keeperColor, kit }: { shot: Shot | null; keeperColor: string; kit: KitColors }) {
  const ball = useRef<THREE.Group>(null);
  const keeper = useRef<THREE.Group>(null);
  const kh = useRef<KeeperHandle>(null);
  const started = useRef<number | null>(null);

  useFrame(({ camera }) => {
    const b = ball.current, k = keeper.current;
    if (!b || !k) return;
    if (!shot) {
      b.position.set(0, 0.21, 11);
      k.position.set(0, 0, 0.5);
      camera.position.lerp(new THREE.Vector3(0, 1.7, 16), 0.08);
      camera.lookAt(0, 1.4, 0);
      return;
    }
    if (started.current !== shot.t0) {
      started.current = shot.t0;
      // pequeno atraso = tempo de reação; o clipe faz o salto em arco completo
      const pose = shot.keeperDir === 'center' ? 'jump' : 'dive';
      setTimeout(() => kh.current?.pose(pose), pose === 'jump' ? 100 : 150);
    }
    const e = (performance.now() - shot.t0) / 1000;
    const flight = 0.8;
    const p = clamp01(e / flight);
    // defesa: o voo termina NA LUVA (mais perto e mais baixo que o canto do gol)
    const save = !shot.goal;
    const tx = X[shot.dir] * (shot.goal ? 1 : 0.82);
    const ty = shot.dir === 'center' ? (save ? 0.9 : 1.0) : (save ? 1.1 : 1.6);
    const endZ = save ? 0.55 : 0;
    if (p < 1) {
      b.position.x = tx * ease.out(p);
      b.position.z = 11 - (11 - endZ) * p;
      b.position.y = 0.21 + Math.sin(p * Math.PI) * 1.0 + ty * p;
      b.rotation.x -= 0.25;
    } else if (shot.goal) {
      // GOL: estufa a rede, a rede devolve e a bola quica no chão dentro do gol
      const t = e - flight;
      const yHit = 0.21 + ty;
      b.position.x = tx;
      if (t < 0.12) {
        b.position.z = -1.35 * ease.out(t / 0.12);
        b.position.y = yHit;
        b.rotation.x -= 0.4;
      } else {
        const t2 = t - 0.12;
        b.position.z = -1.35 + 0.75 * ease.out(clamp01(t2 / 0.5));
        b.position.y = bounceY(yHit, t2);
        b.position.x = tx * (1 - 0.08 * clamp01(t2 / 1.2));
        b.rotation.x -= 0.12;
      }
    } else if (shot.dir === 'center') {
      // ENCAIXOU: o goleiro segura a bola no peito e desce com ela
      const t = e - flight;
      b.position.x = 0;
      b.position.z = 0.75;
      b.position.y = 1.15 - 0.3 * clamp01(t / 0.6);
      b.rotation.x -= 0.02;
    } else {
      // ESPALMADA: a bola bate na luva e volta quicando para o campo
      const t = e - flight;
      const d = Math.min(t, 1.8);
      b.position.z = 0.55 + 4.0 * d - 0.55 * d * d;
      b.position.x = tx - Math.sign(tx) * 0.7 * Math.min(t, 1.4);
      b.position.y = bounceY(0.21 + ty, t, 0.21, 9, 0.5);
      b.rotation.x -= 0.1;
    }
    // o clipe do mergulho já leva o corpo ~1,8 m para o lado; o grupo só complementa o alcance
    const kp = clamp01((e - 0.25) / 0.5);
    k.position.set(X[shot.keeperDir] * 0.2 * ease.out(kp), 0, 0.5);
    camera.position.lerp(new THREE.Vector3(tx * 0.25, 1.9, 9.5), 0.04);
    camera.lookAt(tx * 0.5, 1.3, 0);
  });

  return (
    <>
      <SceneLights />
      <StadiumModel />
      <GoalModel />
      <group ref={keeper} position={[0, 0, 0.5]}>
        <KeeperModel ref={kh} color={keeperColor} kit={kit} flip={shot?.keeperDir === 'left'} speed={7} />
      </group>
      <group ref={ball}><BallModel /></group>
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
  const captcha = useCaptcha(me.captchaRequired);
  const [oppKit, setOppKit] = useState<KitColors | null>(null);
  useEffect(() => { preloadModels(); }, []);
  // goleiro veste a camisa do adversário da rodada (com escudo); sem partida, kit padrão
  useEffect(() => {
    let alive = true;
    api.opponent().then(({ opponent }) => {
      if (alive && opponent) setOppKit({ primary: opponent.colorPrimary, secondary: opponent.colorSecondary, gloves: '#e8e8e8', badge: opponent.slug });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function kick(dir: Dir) {
    if (busy || !ready || shot) return;
    if (me.captchaRequired && !captcha.payload) { toast('Responda a conta anti-robô antes de bater.'); return; }
    setBusy(true);
    try {
      const r = await api.penalty(dir, captcha.payload);
      setResult(r);
      setShot({ dir, keeperDir: r.keeperDir ?? dir, goal: r.goal, t0: performance.now() });
      setTimeout(() => setOverlay(true), r.goal ? 2300 : 1800); // gol: deixa a bola quicar na rede antes do overlay
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cooldown') { toast('Pênalti ainda em recarga.'); refresh(); }
      else if (e instanceof ApiError && e.code === 'captcha') { toast(e.message, 'error'); captcha.refresh(); refresh(); }
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
        <Canvas shadows camera={{ position: [0, 1.7, 16], fov: 48 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'linear-gradient(#46b4ff, #1f7ae6)' }}>
          <Suspense fallback={null}><Scene shot={shot} keeperColor="#f2c200" kit={oppKit ?? GK_KIT} /></Suspense>
        </Canvas>
      </div>
      <div className="relative flex flex-1 flex-col justify-center gap-3 px-4 pb-6">
        <div className="stadium-bg" />
        {!shot && captcha.box}
        <p className="t-display t-out relative text-center text-[13px] uppercase tracking-widest">
          {shot ? (result?.goal ? 'É GOL!' : 'O goleiro foi no canto certo…') : `Escolha o canto · destreza ${me.dexterity} · ${Math.round((2 / 3 + me.dexterity / 100) * 100)}% de acerto`}
        </p>
        <div className="relative flex items-end justify-around px-2">
          <KickArrowButton dir="left" label="Esquerda" onClick={() => kick('left')} disabled={!ready || busy || !!shot} />
          <KickArrowButton dir="up" label="Meio" onClick={() => kick('center')} disabled={!ready || busy || !!shot} />
          <KickArrowButton dir="right" label="Direita" onClick={() => kick('right')} disabled={!ready || busy || !!shot} />
          {busy && !shot && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
        </div>
        {!ready && me.cooldowns.PENALTY.unlocked && !shot && <p className="t-display t-out relative text-center text-[12px]">Recarga: {me.vip ? '5 min (VIP)' : '10 min · VIP bate a cada 5'}</p>}
      </div>
    </div>
  );
}
