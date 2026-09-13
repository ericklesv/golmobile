/**
 * Modelos 3D dos packs comprados (Unity Asset Store → FBX2glTF → gltf-transform):
 *   /3d/stadium.glb  Soccer Stadiums Extension Pack (st_080: arquibancada, torcida, linhas)
 *   /3d/goal.glb     Football Soccer Simulator (trave + rede)
 *   /3d/ball.glb     Soccer Players Uniforms Extension Pack
 *   /3d/keeper.glb   Football Soccer Simulator (malha do jogador + animações de goleiro)
 * Sistema de coordenadas do jogo: linha do gol em z=0, campo cresce para +z, metros.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

const URLS = { stadium: '/3d/stadium.glb', goal: '/3d/goal.glb', ball: '/3d/ball.glb', keeper: '/3d/keeper.glb' };
export function preloadModels() { Object.values(URLS).forEach((u) => useGLTF.preload(u)); }

/** Estádio inteiro (campo 68x110 m). Modelo vem em 1/100 e centrado: escala 100, gol em z=0. */
export function StadiumModel() {
  const { scene } = useGLTF(URLS.stadium);
  const obj = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o: any) => { if (o.isMesh) { o.frustumCulled = false; o.receiveShadow = true; } });
    return s;
  }, [scene]);
  return <primitive object={obj} scale={100} position={[0, 0, 55]} />;
}

/** Trave 7,32 x 2,44 com rede; frente da trave em z=0, rede para -z. */
export function GoalModel() {
  const { scene } = useGLTF(URLS.goal);
  const obj = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o: any) => { if (o.isMesh && o.name === 'Shape004') o.visible = false; });
    return s;
  }, [scene]);
  return <primitive object={obj} rotation={[0, Math.PI / 2, 0]} position={[0, 0, -1.0]} />;
}

/** Bola centrada na origem do grupo, raio ~0,21 m (2x o real, para leitura no celular). */
export function BallModel({ spin = 0 }: { spin?: number }) {
  const { scene } = useGLTF(URLS.ball);
  const obj = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!ref.current) return;
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -c.y, -c.z);
  }, [obj]);
  return <group ref={ref} scale={2}><primitive object={obj} /></group>;
}

export type KeeperAction = 'idle' | 'dive' | 'jump' | 'miss' | 'save_low';
export interface KeeperHandle { play: (a: KeeperAction, opts?: { flip?: boolean; once?: boolean }) => void }

interface KeeperProps { color?: string; skin?: string; shorts?: string; action?: KeeperAction; flip?: boolean; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number }

/** Jogador animado (goleiro ou barreira). `flip` espelha para mergulhar pro outro lado. */
export const KeeperModel = forwardRef<KeeperHandle, KeeperProps>(function KeeperModel({ color = '#f2c200', action = 'idle', flip = false, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }, ref) {
  const { scene, animations } = useGLTF(URLS.keeper);
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
  const group = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(animations, obj);
  const current = useRef<THREE.AnimationAction | null>(null);

  const play = (a: KeeperAction, opts: { once?: boolean } = {}) => {
    const next = actions[a];
    if (!next) return;
    const once = opts.once ?? a !== 'idle';
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    if (current.current && current.current !== next) { next.crossFadeFrom(current.current, 0.15, false); }
    next.play();
    current.current = next;
  };
  useImperativeHandle(ref, () => ({ play: (a, opts) => play(a, opts) }), [actions]);
  useEffect(() => { play(action); }, [action, actions]);
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);

  return (
    <group ref={group} position={position} rotation={rotation} scale={[flip ? -scale : scale, scale, scale]}>
      <primitive object={obj} />
    </group>
  );
});

export function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#ffffff', '#3a7d3a', 0.7]} />
      <directionalLight position={[-30, 50, 20]} intensity={1.6} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
      <directionalLight position={[30, 40, -20]} intensity={0.6} />
    </>
  );
}
