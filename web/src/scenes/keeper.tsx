/**
 * Jogador 3D (goleiro / barreira) com animação PROCEDURAL por osso.
 * A malha vem do Football Soccer Simulator (keeper.glb); as animações do pack não batem
 * com o rig, então as poses são definidas aqui. Os ossos têm rotação identidade na pose
 * de bind, logo o frame local de cada osso = frame do mundo (x direita, y cima, z frente).
 * O personagem olha para +z (para o batedor). Braços pendem para -y: girar em z=+90°
 * aponta o braço para +x; girar em x=-90° aponta para a frente (+z).
 */
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

export type KeeperPose = 'idle' | 'wall' | 'dive' | 'jump' | 'miss' | 'save_low' | 'celebrate';
export interface KeeperHandle { pose: (p: KeeperPose) => void }

const D = Math.PI / 180;
type Rot = [number, number, number];
interface Pose { bones: Record<string, Rot>; root?: { rot?: Rot; pos?: [number, number, number] } }

// Ângulos em graus (convertidos abaixo). Lado "positivo" = +x (mergulho padrão para +x).
const POSES_DEG: Record<KeeperPose, Pose> = {
  idle: { bones: { LeftArm: [0, 0, 18], RightArm: [0, 0, -18], LeftForeArm: [0, 0, 10], RightForeArm: [0, 0, -10], LeftUpLeg: [-8, 0, 4], RightUpLeg: [-8, 0, -4], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0], Spine: [8, 0, 0] } },
  wall: { bones: { LeftArm: [-80, 0, 25], RightArm: [-80, 0, -25], LeftForeArm: [-15, 0, 80], RightForeArm: [-15, 0, -80], Spine: [6, 0, 0], LeftUpLeg: [0, 0, 6], RightUpLeg: [0, 0, -6] } },
  dive: { bones: { LeftArm: [0, 0, 170], RightArm: [0, 0, 150], LeftForeArm: [0, 0, 10], RightForeArm: [0, 0, 20], LeftUpLeg: [0, 0, -10], RightUpLeg: [-20, 0, 25], LeftLeg: [10, 0, 0], RightLeg: [40, 0, 0], Spine: [0, 0, -10], Head: [0, 0, 10] }, root: { rot: [0, 0, -75], pos: [0.9, 0.55, 0] } },
  jump: { bones: { LeftArm: [0, 0, 165], RightArm: [0, 0, -165], LeftForeArm: [0, 0, 8], RightForeArm: [0, 0, -8], LeftUpLeg: [-40, 0, 6], RightUpLeg: [-40, 0, -6], LeftLeg: [70, 0, 0], RightLeg: [70, 0, 0] }, root: { pos: [0, 0.7, 0] } },
  miss: { bones: { LeftArm: [0, 0, 120], RightArm: [-30, 0, -40], LeftForeArm: [0, 0, 30], LeftUpLeg: [-10, 0, 10], RightUpLeg: [-15, 0, -20], Spine: [0, 0, -15], Head: [10, 0, 0] }, root: { rot: [0, 0, -25], pos: [0.5, 0.1, 0] } },
  save_low: { bones: { LeftArm: [0, 0, 110], RightArm: [0, 0, 100], LeftForeArm: [0, 0, 10], RightForeArm: [0, 0, 10], LeftUpLeg: [-10, 0, -10], RightUpLeg: [-30, 0, 30], RightLeg: [50, 0, 0], Spine: [15, 0, -20] }, root: { rot: [0, 0, -55], pos: [0.6, 0.05, 0] } },
  celebrate: { bones: { LeftArm: [0, 0, 160], RightArm: [0, 0, -160], Spine: [-10, 0, 0], Head: [-10, 0, 0] }, root: { pos: [0, 0.15, 0] } },
};
const POSES: Record<KeeperPose, Pose> = Object.fromEntries(Object.entries(POSES_DEG).map(([k, p]) => [k, {
  bones: Object.fromEntries(Object.entries(p.bones).map(([b, r]) => [b, r.map((v) => v * D) as Rot])),
  root: p.root ? { rot: (p.root.rot ?? [0, 0, 0]).map((v) => v * D) as Rot, pos: p.root.pos ?? [0, 0, 0] } : { rot: [0, 0, 0], pos: [0, 0, 0] },
}])) as Record<KeeperPose, Pose>;

const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];

interface Props { color?: string; pose?: KeeperPose; flip?: boolean; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number; speed?: number; seed?: number; custom?: Record<string, Rot> }

export const KeeperModel = forwardRef<KeeperHandle, Props>(function KeeperModel({ color = '#f2c200', pose = 'idle', flip = false, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, speed = 6, seed = 0, custom }, ref) {
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
  const target = useRef<KeeperPose>(pose);
  const root = useRef<THREE.Group>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  useImperativeHandle(ref, () => ({ pose: (p) => { target.current = p; } }), []);
  target.current = pose;

  useFrame(({ clock }, dt) => {
    const P = custom ? { bones: Object.fromEntries(Object.entries(custom).map(([b, r]) => [b, r.map((v) => v * D) as Rot])), root: { rot: [0, 0, 0] as Rot, pos: [0, 0, 0] as [number, number, number] } } : POSES[target.current];
    const k = 1 - Math.exp(-speed * dt);
    const t = clock.getElapsedTime() + seed;
    const breathing = target.current === 'idle' || target.current === 'wall';
    for (const [name, bone] of bones) {
      const r = P.bones[name] ?? [0, 0, 0];
      let [x, y, z] = r;
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
      const [rx, ry, rz] = P.root!.rot!;
      e.set(rx, ry, rz, 'XYZ'); q.setFromEuler(e);
      root.current.quaternion.slerp(q, k);
      const [px, py, pz] = P.root!.pos!;
      root.current.position.lerp(new THREE.Vector3(px, py, pz), k);
    }
  });

  return (
    <group position={position} rotation={rotation} scale={[flip ? -scale : scale, scale, scale]}>
      <group ref={root}><primitive object={obj} /></group>
    </group>
  );
});
