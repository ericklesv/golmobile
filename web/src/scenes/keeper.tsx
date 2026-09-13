/**
 * Jogador 3D (goleiro / barreira) com animação PROCEDURAL por osso.
 * A malha vem do Football Soccer Simulator (keeper.glb); as animações do pack não batem
 * com o rig, então as poses são definidas aqui. Os ossos têm rotação identidade na pose
 * de bind, logo o frame local de cada osso = frame do mundo (x direita, y cima, z frente).
 * O personagem olha para +z (para o batedor). Braços pendem para -y: girar em z=+90°
 * aponta o braço para +x; girar em x=-90° aponta para a frente (+z).
 *
 * Duas camadas:
 *  - POSES estáticas (idle, wall, celebrate): interpolação exponencial como antes.
 *  - CLIPS com keyframes (dive, jump, save_low, miss): linha do tempo real com
 *    agachamento de impulso → salto em ARCO parabólico → extensão → queda no chão,
 *    como um goleiro de verdade. Lado "positivo" do mergulho = +x (flip espelha).
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

// ---------- Uniforme de verdade: máscara do kit + AO + cores num canvas ----------
// kit-mask.png (do pack, com regiões extras pintadas no build — tools/3d/build3d.mjs):
// azul = cor primária, vermelho = secundária, verde = chuteira, magenta = luva,
// cinza = cabelo, preto = pele. kit-ao.png dá o sombreamento (dobras, rosto).
export interface KitColors { primary: string; secondary: string; skin?: string; hair?: string; boots?: string; gloves?: string; badge?: string /* slug do time → /escudos/<slug>.svg|png no peito */ }

const kitCache = new Map<string, THREE.CanvasTexture>();
let kitImages: Promise<[HTMLImageElement, HTMLImageElement]> | null = null;
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const hexRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const kitKeyOf = (kit?: KitColors | null) => kit ? `${kit.primary}|${kit.secondary}|${kit.skin ?? ''}|${kit.hair ?? ''}|${kit.boots ?? ''}|${kit.gloves ?? ''}|${kit.badge ?? ''}` : '';

async function loadBadge(slug: string): Promise<HTMLImageElement | null> {
  try { return await loadImg(`/escudos/${slug}.svg`); } catch { /* tenta png */ }
  try { return await loadImg(`/escudos/${slug}.png`); } catch { return null; }
}

async function kitTexture(kit: KitColors): Promise<THREE.CanvasTexture> {
  const key = kitKeyOf(kit);
  const hit = kitCache.get(key);
  if (hit) return hit;
  kitImages ??= Promise.all([loadImg('/3d/kit-mask.png'), loadImg('/3d/kit-ao.png')]);
  const [mask, ao] = await kitImages;
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(mask, 0, 0, S, S);
  const md = g.getImageData(0, 0, S, S).data;
  g.drawImage(ao, 0, 0, S, S);
  const ad = g.getImageData(0, 0, S, S).data;
  const prim = hexRgb(kit.primary), sec = hexRgb(kit.secondary);
  const skin = hexRgb(kit.skin ?? '#d9a06b'), hair = hexRgb(kit.hair ?? '#3a2a1d');
  const boots = hexRgb(kit.boots ?? '#26221f'), gloves = hexRgb(kit.gloves ?? kit.skin ?? '#d9a06b');
  const out = g.createImageData(S, S);
  for (let i = 0; i < md.length; i += 4) {
    const r = md[i], gr = md[i + 1], b = md[i + 2];
    let col: [number, number, number];
    if (r > 180 && b > 180 && gr < 100) col = gloves;
    else if (gr > 150 && r < 100 && b < 100) col = boots;
    else {
      const wP = Math.max(0, b - Math.max(r, gr)) / 255;
      const wS = Math.max(0, r - Math.max(gr, b)) / 255;
      const rest = Math.max(0, 1 - wP - wS);
      const base = Math.min(r, gr, b) >= 12 ? hair : skin;
      col = [prim[0] * wP + sec[0] * wS + base[0] * rest, prim[1] * wP + sec[1] * wS + base[1] * rest, prim[2] * wP + sec[2] * wS + base[2] * rest];
    }
    const shade = Math.min(1.25, ad[i] / 200); // AO do pack é ~0,78 no plano → normaliza para 1
    out.data[i] = Math.min(255, col[0] * shade);
    out.data[i + 1] = Math.min(255, col[1] * shade);
    out.data[i + 2] = Math.min(255, col[2] * shade);
    out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  // escudo do time no peito (ilha esquerda da máscara = frente da camisa)
  if (kit.badge) {
    const img = await loadBadge(kit.badge);
    if (img) { try { g.drawImage(img, 122, 96, 44, 44); } catch { /* svg sem tamanho: ignora */ } }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  kitCache.set(key, tex);
  return tex;
}

export type KeeperPose = 'idle' | 'wall' | 'dive' | 'jump' | 'miss' | 'save_low' | 'celebrate';
export interface KeeperHandle { pose: (p: KeeperPose) => void }

const D = Math.PI / 180;
type Rot = [number, number, number];
type V3 = [number, number, number];
interface Pose { bones: Record<string, Rot>; root?: { rot?: Rot; pos?: V3 } }

// ---------- Poses estáticas (graus) ----------
const POSES_DEG: Record<string, Pose> = {
  idle: { bones: { LeftArm: [0, 0, 18], RightArm: [0, 0, -18], LeftForeArm: [0, 0, 10], RightForeArm: [0, 0, -10], LeftUpLeg: [-8, 0, 4], RightUpLeg: [-8, 0, -4], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0], Spine: [8, 0, 0] } },
  wall: { bones: { LeftArm: [0, 0, 32], RightArm: [0, 0, -32], LeftForeArm: [-100, 0, 12], RightForeArm: [-100, 0, -12], Spine: [6, 0, 0], LeftUpLeg: [0, 0, 6], RightUpLeg: [0, 0, -6] } },
  celebrate: { bones: { LeftArm: [0, 0, 160], RightArm: [0, 0, -160], Spine: [-10, 0, 0], Head: [-10, 0, 0] }, root: { pos: [0, 0.15, 0] } },
};

// ---------- Conjuntos de ossos reaproveitados pelos clipes (graus) ----------
/** Posição de "pronto": joelhos dobrados, tronco inclinado, braços abertos na altura da cintura. */
const B_READY: Record<string, Rot> = { Spine: [16, 0, 0], Head: [-10, 0, 0], LeftArm: [0, 0, 38], RightArm: [0, 0, -38], LeftForeArm: [-35, 0, 12], RightForeArm: [-35, 0, -12], LeftUpLeg: [-32, 0, 8], RightUpLeg: [-32, 0, -8], LeftLeg: [48, 0, 0], RightLeg: [48, 0, 0] };
/** Agachamento de impulso carregando para +x: braços em balanço para trás, pernas bem dobradas. */
const B_LOAD: Record<string, Rot> = { Spine: [24, 0, -8], Head: [-14, 0, 8], LeftArm: [25, 0, 20], RightArm: [45, 0, -45], LeftForeArm: [-20, 0, 10], RightForeArm: [-15, 0, -15], LeftUpLeg: [-58, 0, 10], RightUpLeg: [-55, 0, -6], LeftLeg: [85, 0, 0], RightLeg: [82, 0, 0] };
/** Voo (subindo para o canto alto): braços lançados para o canto, perna de impulso esticada atrás. */
const B_FLIGHT: Record<string, Rot> = { Spine: [0, 0, -8], Head: [0, 0, 14], LeftArm: [0, 0, 152], RightArm: [0, 0, 128], LeftForeArm: [0, 0, 12], RightForeArm: [0, 0, 22], LeftUpLeg: [0, 0, -12], RightUpLeg: [-28, 0, 22], LeftLeg: [14, 0, 0], RightLeg: [48, 0, 0] };
/** Extensão máxima (horizontal no ar, mãos juntas em direção à bola). */
const B_EXTEND: Record<string, Rot> = { Spine: [0, 0, -10], Head: [0, 0, 12], LeftArm: [0, 0, 172], RightArm: [0, 0, 152], LeftForeArm: [0, 0, 8], RightForeArm: [0, 0, 18], LeftUpLeg: [0, 0, -10], RightUpLeg: [-20, 0, 25], LeftLeg: [10, 0, 0], RightLeg: [40, 0, 0] };
/** No chão depois do mergulho: corpo levemente encolhido. */
const B_LAND: Record<string, Rot> = { Spine: [4, 0, -14], Head: [4, 0, 10], LeftArm: [0, 0, 160], RightArm: [12, 0, 138], LeftForeArm: [0, 0, 26], RightForeArm: [0, 0, 32], LeftUpLeg: [-6, 0, -8], RightUpLeg: [-28, 0, 26], LeftLeg: [32, 0, 0], RightLeg: [58, 0, 0] };

// ---------- Clipes (tempos em segundos; ease do trecho que TERMINA no frame) ----------
type EaseName = 'lin' | 'in' | 'out' | 'inOut';
interface FrameDeg { t: number; ease?: EaseName; bones: Record<string, Rot>; root?: { rot?: Rot; pos?: V3 } }

const CLIPS_DEG: Partial<Record<KeeperPose, FrameDeg[]>> = {
  // Mergulho no canto alto: agacha, salta em arco (sobe até ~0,85 m), estica e cai no chão.
  dive: [
    { t: 0.0, bones: B_READY },
    { t: 0.16, ease: 'out', bones: B_LOAD, root: { rot: [0, 0, -8], pos: [0.12, -0.24, 0] } },
    { t: 0.36, ease: 'out', bones: B_FLIGHT, root: { rot: [0, 0, -52], pos: [0.8, 0.9, 0] } },
    { t: 0.56, ease: 'lin', bones: B_EXTEND, root: { rot: [0, 0, -84], pos: [1.4, 0.58, 0] } },
    { t: 0.74, ease: 'in', bones: B_LAND, root: { rot: [0, 0, -96], pos: [1.65, 0.16, 0] } },
    { t: 1.0, ease: 'out', bones: B_LAND, root: { rot: [0, 0, -98], pos: [1.78, 0.14, 0] } },
  ],
  // Salto vertical (bola no meio/por cima): agacha, sobe reto com os braços, cai e amortece.
  jump: [
    { t: 0.0, bones: B_READY },
    { t: 0.16, ease: 'out', bones: { ...B_LOAD, Spine: [26, 0, 0], LeftArm: [45, 0, 22], RightArm: [45, 0, -22] }, root: { pos: [0, -0.26, 0] } },
    { t: 0.34, ease: 'out', bones: { Spine: [-4, 0, 0], Head: [-12, 0, 0], LeftArm: [0, 0, 168], RightArm: [0, 0, -168], LeftForeArm: [0, 0, 8], RightForeArm: [0, 0, -8], LeftUpLeg: [-45, 0, 6], RightUpLeg: [-45, 0, -6], LeftLeg: [75, 0, 0], RightLeg: [75, 0, 0] }, root: { pos: [0, 0.85, 0] } },
    { t: 0.54, ease: 'in', bones: { Spine: [4, 0, 0], LeftArm: [0, 0, 120], RightArm: [0, 0, -120], LeftUpLeg: [-18, 0, 6], RightUpLeg: [-18, 0, -6], LeftLeg: [28, 0, 0], RightLeg: [28, 0, 0] }, root: { pos: [0, 0.3, 0] } },
    { t: 0.68, ease: 'out', bones: { Spine: [20, 0, 0], LeftArm: [-55, 0, 22], RightArm: [-55, 0, -22], LeftUpLeg: [-48, 0, 8], RightUpLeg: [-48, 0, -8], LeftLeg: [72, 0, 0], RightLeg: [72, 0, 0] }, root: { pos: [0, -0.16, 0] } },
    { t: 0.95, ease: 'out', bones: B_READY, root: { pos: [0, 0, 0] } },
  ],
  // Mergulho rasteiro: arco baixo, quase rente ao chão, mãos na frente.
  save_low: [
    { t: 0.0, bones: B_READY },
    { t: 0.14, ease: 'out', bones: B_LOAD, root: { rot: [0, 0, -10], pos: [0.15, -0.28, 0] } },
    { t: 0.32, ease: 'out', bones: { Spine: [12, 0, -14], Head: [0, 0, 12], LeftArm: [0, 0, 118], RightArm: [0, 0, 100], LeftForeArm: [0, 0, 10], RightForeArm: [0, 0, 12], LeftUpLeg: [-8, 0, -10], RightUpLeg: [-32, 0, 26], LeftLeg: [12, 0, 0], RightLeg: [52, 0, 0] }, root: { rot: [0, 0, -48], pos: [0.72, 0.3, 0] } },
    { t: 0.5, ease: 'in', bones: { Spine: [15, 0, -20], Head: [4, 0, 10], LeftArm: [0, 0, 112], RightArm: [0, 0, 104], LeftForeArm: [0, 0, 10], RightForeArm: [0, 0, 10], LeftUpLeg: [-10, 0, -10], RightUpLeg: [-30, 0, 30], LeftLeg: [14, 0, 0], RightLeg: [50, 0, 0] }, root: { rot: [0, 0, -76], pos: [1.28, 0.12, 0] } },
    { t: 0.75, ease: 'out', bones: B_LAND, root: { rot: [0, 0, -78], pos: [1.4, 0.1, 0] } },
  ],
  // Batido: tenta um bote curto, cai de joelhos e olha a bola entrar.
  miss: [
    { t: 0.0, bones: B_READY },
    { t: 0.16, ease: 'out', bones: B_LOAD, root: { rot: [0, 0, -6], pos: [0.1, -0.2, 0] } },
    { t: 0.38, ease: 'out', bones: { Spine: [8, 0, -12], Head: [0, 0, 14], LeftArm: [0, 0, 132], RightArm: [-30, 0, -40], LeftForeArm: [0, 0, 24], LeftUpLeg: [-12, 0, 8], RightUpLeg: [-20, 0, -18], LeftLeg: [20, 0, 0], RightLeg: [35, 0, 0] }, root: { rot: [0, 0, -32], pos: [0.5, 0.28, 0] } },
    { t: 0.6, ease: 'in', bones: { Spine: [12, 0, -16], Head: [12, 0, 8], LeftArm: [0, 0, 120], RightArm: [-30, 0, -40], LeftForeArm: [0, 0, 30], LeftUpLeg: [-14, 0, 10], RightUpLeg: [-18, 0, -20], LeftLeg: [26, 0, 0], RightLeg: [40, 0, 0] }, root: { rot: [0, 0, -34], pos: [0.62, 0.1, 0] } },
    { t: 0.95, ease: 'out', bones: { Spine: [14, 0, -14], Head: [16, 0, 6], LeftArm: [0, 0, 110], RightArm: [-30, 0, -40], LeftForeArm: [0, 0, 34], LeftUpLeg: [-16, 0, 10], RightUpLeg: [-18, 0, -20], LeftLeg: [30, 0, 0], RightLeg: [44, 0, 0] }, root: { rot: [0, 0, -34], pos: [0.66, 0.08, 0] } },
  ],
};

// ---------- Conversão para radianos, uma vez ----------
const toRad = (r: Rot): Rot => [r[0] * D, r[1] * D, r[2] * D];
interface Frame { t: number; ease: EaseName; bones: Record<string, Rot>; root: { rot: Rot; pos: V3 } }
const POSES: Record<string, { bones: Record<string, Rot>; root: { rot: Rot; pos: V3 } }> = Object.fromEntries(Object.entries(POSES_DEG).map(([k, p]) => [k, {
  bones: Object.fromEntries(Object.entries(p.bones).map(([b, r]) => [b, toRad(r)])),
  root: { rot: toRad(p.root?.rot ?? [0, 0, 0]), pos: p.root?.pos ?? [0, 0, 0] },
}]));
const CLIPS: Partial<Record<KeeperPose, Frame[]>> = Object.fromEntries(Object.entries(CLIPS_DEG).map(([k, frames]) => [k, frames!.map((f) => ({
  t: f.t, ease: f.ease ?? 'inOut',
  bones: Object.fromEntries(Object.entries(f.bones).map(([b, r]) => [b, toRad(r)])),
  root: { rot: toRad(f.root?.rot ?? [0, 0, 0]), pos: f.root?.pos ?? [0, 0, 0] },
}))]));

const EASES: Record<EaseName, (t: number) => number> = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
};

const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];

/** Avalia um clipe em `e` segundos: interpola ossos e root entre os keyframes vizinhos. */
function sampleClip(frames: Frame[], e: number): { bones: (name: string) => Rot; root: { rot: Rot; pos: V3 } } {
  let i = frames.length - 1;
  for (let j = 0; j < frames.length; j++) if (frames[j].t > e) { i = j - 1; break; }
  const a = frames[Math.max(0, i)];
  const b = frames[Math.min(frames.length - 1, i + 1)];
  const span = b.t - a.t;
  const u = span > 0 ? EASES[b.ease](Math.min(1, Math.max(0, (e - a.t) / span))) : 1;
  const mix = (p: Rot | V3, q: Rot | V3): Rot => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
  return {
    bones: (name) => mix(a.bones[name] ?? [0, 0, 0], b.bones[name] ?? [0, 0, 0]),
    root: { rot: mix(a.root.rot, b.root.rot), pos: mix(a.root.pos, b.root.pos) as V3 },
  };
}

interface Props { color?: string; kit?: KitColors; pose?: KeeperPose; flip?: boolean; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number; speed?: number; seed?: number; custom?: Record<string, Rot>; sampleAt?: number }

export const KeeperModel = forwardRef<KeeperHandle, Props>(function KeeperModel({ color = '#f2c200', kit, pose = 'idle', flip = false, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, speed = 6, seed = 0, custom, sampleAt }, ref) {
  const { scene } = useGLTF('/3d/keeper.glb');
  const obj = useMemo(() => {
    const s = SkeletonUtils.clone(scene) as THREE.Group;
    s.traverse((o: any) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.frustumCulled = false;
        o.material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0 });
      }
    });
    return s;
  }, [scene, color]);
  const bones = useMemo(() => {
    const m = new Map<string, THREE.Object3D>();
    obj.traverse((o) => { if (BONES.includes(o.name)) m.set(o.name, o); });
    return m;
  }, [obj]);
  // uniforme composto (máscara + cores); enquanto carrega, fica a cor chapada de fallback
  const kitKey = kitKeyOf(kit);
  useEffect(() => {
    if (!kit) return;
    let alive = true;
    kitTexture(kit).then((tex) => {
      if (!alive) return;
      obj.traverse((o: any) => {
        if (o.isMesh || o.isSkinnedMesh) { o.material.map = tex; o.material.color.set('#ffffff'); o.material.needsUpdate = true; }
      });
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj, kitKey]);
  const target = useRef<KeeperPose>(pose);
  const startedAt = useRef(0);
  const prevProp = useRef(pose);
  const root = useRef<THREE.Group>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const jumpK = useRef(1); // variação de altura do mergulho (cada salto sai diferente)
  const setPose = (p: KeeperPose) => {
    if (target.current === p) return;
    target.current = p;
    startedAt.current = performance.now();
    jumpK.current = (p === 'dive' || p === 'save_low') && sampleAt === undefined ? 1 + Math.random() * 0.45 : 1;
  };
  useImperativeHandle(ref, () => ({ pose: setPose }), []);
  // só o prop MUDANDO troca a pose (re-render não pode desfazer um pose() via ref)
  if (prevProp.current !== pose) { prevProp.current = pose; setPose(pose); }

  useFrame(({ clock }, dt) => {
    const clip = custom ? undefined : CLIPS[target.current];
    let boneAt: (name: string) => Rot;
    let rootRot: Rot; let rootPos: V3;
    if (clip) {
      const s = sampleClip(clip, sampleAt ?? (performance.now() - startedAt.current) / 1000);
      boneAt = s.bones; rootRot = s.root.rot;
      // salto com altura variável: escala só o que passa de 0,2 m (aterrissagem/deitado não flutua)
      const y = s.root.pos[1];
      rootPos = [s.root.pos[0], y > 0.2 ? 0.2 + (y - 0.2) * jumpK.current : y, s.root.pos[2]];
    } else {
      const P = custom
        ? { bones: Object.fromEntries(Object.entries(custom).map(([b, r]) => [b, toRad(r)])), root: { rot: [0, 0, 0] as Rot, pos: [0, 0, 0] as V3 } }
        : POSES[target.current] ?? POSES.idle;
      boneAt = (name) => P.bones[name] ?? [0, 0, 0];
      rootRot = P.root.rot; rootPos = P.root.pos;
    }
    // clipes seguem a linha do tempo de perto; poses estáticas mantêm a suavização antiga
    const k = 1 - Math.exp(-(clip ? 22 : speed) * dt);
    const t = clock.getElapsedTime() + seed;
    const breathing = !clip && (target.current === 'idle' || target.current === 'wall');
    for (const [name, bone] of bones) {
      let [x, y, z] = boneAt(name);
      if (breathing) {
        if (name === 'Spine') x += Math.sin(t * 1.6) * 0.03;
        if (name === 'LeftArm') z += Math.sin(t * 1.3) * 0.04;
        if (name === 'RightArm') z -= Math.sin(t * 1.3 + 1) * 0.04;
        if (name === 'Head') y += Math.sin(t * 0.7) * 0.15;
      }
      e.set(x, y, z, 'XYZ'); q.setFromEuler(e);
      bone.quaternion.slerp(q, k);
    }
    if (root.current) {
      e.set(rootRot[0], rootRot[1], rootRot[2], 'XYZ'); q.setFromEuler(e);
      root.current.quaternion.slerp(q, k);
      root.current.position.lerp(v.set(rootPos[0], rootPos[1], rootPos[2]), k);
    }
  });

  return (
    <group position={position} rotation={rotation} scale={[flip ? -scale : scale, scale, scale]}>
      <group ref={root}><primitive object={obj} /></group>
    </group>
  );
});
