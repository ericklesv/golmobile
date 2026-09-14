import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Scene, type Flight } from './FaltaPro';
import type { FaltaProKick, FaltaProKickResponse } from '../lib/types';
import type { KitColors } from '../scenes/models';

/**
 * Rota oculta /debug-faltapro — SÓ para conferir a cena do Falta PRO por screenshot,
 * sem login. Renderiza a MESMA Scene da tela real com uma cobrança mockada.
 *   ?flight=1        anima um voo com curva (mesma matemática do servidor, copiada
 *                    AQUI SÓ PARA DEBUG — a fonte da verdade é api/src/lib/faltapro.js)
 *   ?t=<segundos>    congela o voo naquele instante (ex.: ?flight=1&t=0.5)
 *   ?spin= &dirX= &dirY= &power=   mudam o gesto do voo mockado
 *   ?bx=&bz=         mudam a posição da bola (a barreira acompanha, como no sorteio)
 */

const GK_KIT: KitColors = { primary: '#f2c200', secondary: '#14335F', gloves: '#e8e8e8' };
const WALL_KIT: KitColors = { primary: '#c3131a', secondary: '#F4F7FB' };

// cobrança fixa: bola a ~19 m, barreira de 4, alvos no ângulo (mesma forma de publicKick)
function mockKick(bx: number, bz: number): FaltaProKick {
  const dist = Math.hypot(bx, bz) || 1, side = bx !== 0 ? Math.sign(bx) : 1;
  const wz = bz * (1 - 9.15 / dist); // barreira a 9,15 m, na reta bola → meio do gol
  const cover = side * 3.66 * 0.6;
  const cx = bx + (cover - bx) * ((bz - wz) / bz);
  return {
    i: 1, ball: { x: bx, z: bz },
    wall: { z: +wz.toFixed(2), x0: +(cx - 0.8).toFixed(2), x1: +(cx + 0.8).toFixed(2), n: 4 },
    keeperX: side * 0.6,
    targets: [{ x: -3.01, y: 1.79 }, { x: 3.01, y: 1.79 }],
  };
}

// cópia da física de api/src/lib/faltapro.js (só debug; NUNCA usar para decidir gol)
const C = { goalHalf: 3.66, barHeight: 2.44, ballR: 0.11, vMin: 15, vMax: 29, elevMax: 0.55, sideMax: 0.5, spinAcc: 12, spinComp: 0.95, spinCompMax: 0.5, g: 9.8, drag: 0.06 };
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function mockFlight(kick: FaltaProKick, g: { dirX: number; dirY: number; power: number; spin: number }): FaltaProKickResponse {
  const b = kick.ball, distH = Math.hypot(b.x, b.z) || 1;
  const speed = C.vMin + g.power * (C.vMax - C.vMin);
  const theta = g.dirY * C.elevMax;
  // dirX mira o ponto de chegada; a saída abre pro lado do arco e o Magnus traz de volta
  const T0 = distH / Math.max(1, speed * Math.cos(theta));
  const comp = clampN(Math.atan2(0.5 * C.spinAcc * g.spin * C.spinComp * T0 * T0, distH), -C.spinCompMax, C.spinCompMax);
  const phi = g.dirX * C.sideMax - comp;
  const h0x = -b.x / distH, h0z = -b.z / distH;
  const hx = h0x * Math.cos(phi) - h0z * Math.sin(phi);
  const hz = h0x * Math.sin(phi) + h0z * Math.cos(phi);
  let vx = speed * Math.cos(theta) * hx, vz = speed * Math.cos(theta) * hz, vy = speed * Math.sin(theta);
  let x = b.x, y = C.ballR, z = b.z, t = 0;
  const dt = 1 / 120, samples: [number, number, number][] = [[x, z, y]];
  let step = 0, cross: { x: number; y: number; t: number } | null = null;
  while (t < 4) {
    const sh = Math.hypot(vx, vz) || 1;
    const ax = g.spin * C.spinAcc * (-vz / sh) - vx * C.drag;
    const az = g.spin * C.spinAcc * (vx / sh) - vz * C.drag;
    const ay = -C.g - vy * C.drag;
    const px = x, py = y, pz = z;
    vx += ax * dt; vy += ay * dt; vz += az * dt;
    x += vx * dt; y += vy * dt; z += vz * dt; t += dt; step++;
    if (z <= 0) {
      const f = pz / (pz - z || 1);
      cross = { x: px + (x - px) * f, y: py + (y - py) * f, t: t - dt + dt * f };
      samples.push([cross.x, 0, cross.y]);
      break;
    }
    if (step % 4 === 0) samples.push([x, z, y]);
    if (vz > -0.5 || Math.abs(x) > 30) break;
  }
  const T = cross ? cross.t : t;
  const state = { day: 0, nextAt: 0, kicks: 5, goalAt: 3, pointsPerGoal: 4, maxPoints: 20, targetMoney: 50, playing: true, finished: false, i: 1, goals: 0, points: 0, money: 0, kick, results: [] };
  return {
    state, result: 'goal', target: null, levelPoints: 4, money: 0, goal: null,
    flight: { T, samples, cross: cross ? { x: cross.x, y: cross.y } : null, wall: { jump: false, hit: null }, keeper: { react: 0.3, speed: 3, from: kick.keeperX, to: -2.4, save: false } },
    kick,
  };
}

export function DebugFaltaProScreen() {
  const [q] = useSearchParams();
  const wantFlight = q.get('flight') === '1';
  const freeze = q.get('t') ? Number(q.get('t')) : null;
  const KICK = useMemo(() => mockKick(q.get('bx') ? Number(q.get('bx')) : 3, q.get('bz') ? Number(q.get('bz')) : 19), [q]);
  const flight = useMemo<Flight | null>(() => {
    if (!wantFlight) return null;
    const g = {
      dirX: q.get('dirX') ? Number(q.get('dirX')) : -0.25,
      dirY: q.get('dirY') ? Number(q.get('dirY')) : 0.5,
      power: q.get('power') ? Number(q.get('power')) : 0.7,
      spin: q.get('spin') ? Number(q.get('spin')) : -0.8,
    };
    const res = mockFlight(KICK, g);
    const start = performance.now();
    return {
      res, dur: res.flight.T + 1.15,
      // ?t= congela: t0 "anda junto" com o relógio para o instante ficar fixo
      get t0() { return freeze !== null ? performance.now() - freeze * 1000 : start; },
    } as Flight;
  }, [wantFlight, freeze, q]);
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1f7ae6' }}>
      <Canvas shadows camera={{ position: [0, 1, 30], fov: 58 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'linear-gradient(#46b4ff, #1f7ae6)' }}
        onCreated={(st) => { (window as unknown as Record<string, unknown>).__dbgFP = st; }}>
        <Suspense fallback={null}><Scene kick={KICK} flight={flight} gkKit={GK_KIT} wallKit={WALL_KIT} /></Suspense>
      </Canvas>
    </div>
  );
}
