import { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { StadiumModel, GoalModel, BallModel, KeeperModel, SceneLights, type KeeperPose } from '../scenes/models';

/** Rota oculta /debug3d?view=penalty|foul|top|goal|keeper&pose=idle|wall|dive|jump|miss|save_low|celebrate&flip=1&at=0.4 — só para conferir escala/orientação; `at` congela o clipe naquele segundo. */
export function Debug3DScreen() {
  const [q] = useSearchParams();
  const view = q.get('view') ?? 'penalty';
  const pose = (q.get('pose') ?? 'idle') as KeeperPose;
  const flip = q.get('flip') === '1';
  const at = q.get('at') ? Number(q.get('at')) : undefined;
  // ?bones=LeftArm:0,-60,30;RightArm:0,60,-30 → pose customizada (graus) para iterar sem redeploy
  const custom = q.get('bones') ? Object.fromEntries(q.get('bones')!.split(';').map((t) => { const [b, v] = t.split(':'); return [b, v.split(',').map(Number) as [number, number, number]]; })) : undefined;
  const cams: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
    penalty: { pos: [0, 1.6, 15], look: [0, 1.2, 0], fov: 48 },
    foul: { pos: [3.5, 2.2, 25], look: [0, 1.2, 4], fov: 50 },
    top: { pos: [0, 60, 60], look: [0, 0, 30], fov: 50 },
    goal: { pos: [0, 2, 6], look: [0, 1.2, 0], fov: 60 },
    keeper: { pos: [3, 1.6, 3], look: [0, 1, 0], fov: 50 },
    ball: { pos: [0.7, 0.6, 12.2], look: [0, 0.21, 11], fov: 45 },
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
          <KeeperModel color="#f2c200" kit={{ primary: q.get('c1') ?? '#f2c200', secondary: q.get('c2') ?? '#14335F', gloves: '#e8e8e8', badge: q.get('badge') ?? undefined }} pose={pose} flip={flip} position={[0, 0, 0.4]} custom={custom} sampleAt={at} />
          <KeeperModel color="#c3131a" kit={{ primary: q.get('c1') ?? '#c3131a', secondary: q.get('c2') ?? '#F4F7FB', badge: q.get('badge') ?? undefined }} pose="wall" position={[-1.2, 0, 10.5]} seed={1} />
          <KeeperModel color="#c3131a" kit={{ primary: q.get('c1') ?? '#c3131a', secondary: q.get('c2') ?? '#F4F7FB', badge: q.get('badge') ?? undefined }} pose="wall" position={[-0.4, 0, 10.5]} seed={2} />
          <gridHelper args={[40, 40]} position={[0, 0.02, 20]} />
          <axesHelper args={[5]} />
        </Suspense>
        <OrbitControls target={c.look} />
      </Canvas>
    </div>
  );
}
