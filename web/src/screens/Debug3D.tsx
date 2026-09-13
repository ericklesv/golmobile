import { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { StadiumModel, GoalModel, BallModel, KeeperModel, SceneLights, type KeeperPose } from '../scenes/models';

/** Rota oculta /debug3d?view=penalty|foul|top|goal|keeper&pose=idle|wall|dive|jump|miss|save_low|celebrate&flip=1 — só para conferir escala/orientação. */
export function Debug3DScreen() {
  const [q] = useSearchParams();
  const view = q.get('view') ?? 'penalty';
  const pose = (q.get('pose') ?? 'idle') as KeeperPose;
  const flip = q.get('flip') === '1';
  const cams: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
    penalty: { pos: [0, 1.6, 15], look: [0, 1.2, 0], fov: 48 },
    foul: { pos: [3.5, 2.2, 25], look: [0, 1.2, 4], fov: 50 },
    top: { pos: [0, 60, 60], look: [0, 0, 30], fov: 50 },
    goal: { pos: [0, 2, 6], look: [0, 1.2, 0], fov: 60 },
    keeper: { pos: [3, 1.6, 3], look: [0, 1, 0], fov: 50 },
  };
  const c = cams[view] ?? cams.penalty;
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#46b4ff' }}>
      <Canvas shadows camera={{ position: c.pos, fov: c.fov }} gl={{ antialias: true }} onCreated={({ camera }) => camera.lookAt(...c.look)}>
        <Suspense fallback={null}>
          <SceneLights />
          <StadiumModel />
          <GoalModel />
          <group position={[0, 0.21, 11]}><BallModel /></group>
          <KeeperModel color="#f2c200" pose={pose} flip={flip} position={[0, 0, 0.4]} />
          <KeeperModel color="#c3131a" pose="wall" position={[-1.2, 0, 10.5]} seed={1} />
          <KeeperModel color="#c3131a" pose="wall" position={[-0.4, 0, 10.5]} seed={2} />
          <gridHelper args={[40, 40]} position={[0, 0.02, 20]} />
          <axesHelper args={[5]} />
        </Suspense>
        <OrbitControls target={c.look} />
      </Canvas>
    </div>
  );
}
