/**
 * Modelos 3D dos packs comprados (Unity Asset Store → FBX2glTF → gltf-transform):
 *   /3d/stadium.glb  Soccer Stadiums Extension Pack (st_080: arquibancada, torcida, linhas)
 *   /3d/goal.glb     Football Soccer Simulator (trave + rede)
 *   /3d/ball.glb     Soccer Players Uniforms Extension Pack
 *   /3d/keeper.glb   Football Soccer Simulator (malha do jogador + animações de goleiro)
 * Sistema de coordenadas do jogo: linha do gol em z=0, campo cresce para +z, metros.
 */
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// bola = Trionda (modelo da Copa 2026, otimizado de Downloads/fifa_trionda_ball_world_cup_2026.glb)
const URLS = { stadium: '/3d/stadium.glb', goal: '/3d/goal.glb', ball: '/3d/trionda.glb', keeper: '/3d/keeper.glb' };
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
export function BallModel() {
  const { scene } = useGLTF(URLS.ball);
  const obj = useMemo(() => {
    const s = scene.clone(true);
    // Centra pelo bounds em espaço LOCAL, antes de o modelo ter pai. Isso era um useEffect
    // depois de montar e CORRIA contra o 1º frame do r3f: se o grupo da cena já estivesse
    // posicionado (Falta PRO: bola a ~19 m), o centro vinha em coordenadas de MUNDO e a
    // bola era jogada para trás do gol — "apareceu por 1 s e sumiu" no celular.
    s.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(s).getCenter(new THREE.Vector3());
    s.position.set(-c.x, -c.y, -c.z);
    s.traverse((o: any) => { if (o.isMesh) o.frustumCulled = false; });
    return s;
  }, [scene]);
  return <group scale={2}><primitive object={obj} /></group>;
}

export { KeeperModel, type KeeperHandle, type KeeperPose, type KitColors } from './keeper';

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
