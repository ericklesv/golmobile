/**
 * Peças 3D compartilhadas (react-three-fiber) — campo, gol, goleiro, bola, estádio.
 * Tudo procedural (sem carregar modelos), para funcionar offline e leve no celular.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function makePitchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 === 0 ? '#1f8d4d' : '#25a25a';
    g.fillRect(0, i * 64, 512, 64);
  }
  // ruído leve de grama
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeBallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#111';
  for (let i = 0; i < 12; i++) {
    const x = (i % 4) * 64 + (Math.floor(i / 4) % 2) * 32 + 16;
    const y = Math.floor(i / 4) * 42 + 20;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13);
    }
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeCrowdTexture(c1 = '#c3131a', c2 = '#22405F'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a1b2b'; g.fillRect(0, 0, 1024, 256);
  const cols = [c1, c2, '#EDF4F3', '#0a1b2b', '#16324F', c1];
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
    g.globalAlpha = 0.5 + Math.random() * 0.5;
    g.fillRect(Math.random() * 1024, Math.random() * 256, 3, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Pitch({ size = 60 }: { size?: number }) {
  const tex = useMemo(makePitchTexture, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial map={tex} roughness={1} />
      </mesh>
      {/* linhas da área */}
      <Line pts={[[-9, 0.01, 0], [9, 0.01, 0]]} />
      <Line pts={[[-9, 0.01, 0], [-9, 0.01, 5.5]]} />
      <Line pts={[[9, 0.01, 0], [9, 0.01, 5.5]]} />
      <Line pts={[[-9, 0.01, 5.5], [9, 0.01, 5.5]]} />
      <Line pts={[[-20, 0.01, 0], [20, 0.01, 0]]} />
      <Line pts={[[-20, 0.01, 16.5], [20, 0.01, 16.5]]} />
      <Line pts={[[-20, 0.01, 0], [-20, 0.01, 16.5]]} />
      <Line pts={[[20, 0.01, 0], [20, 0.01, 16.5]]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 11]}>
        <circleGeometry args={[0.18, 16]} />
        <meshBasicMaterial color="#f5f5f5" />
      </mesh>
    </group>
  );
}

function Line({ pts }: { pts: [number, number, number][] }) {
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))), [pts]);
  return <primitive object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f5f5f5' }))} />;
}

/** Gol (7,32 m x 2,44 m) com rede quadriculada. */
export function Goal() {
  const net = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(240,240,240,0.85)'; g.lineWidth = 1.2;
    for (let x = 0; x <= 256; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
    for (let y = 0; y <= 128; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  const post = <meshStandardMaterial color="#f8f8f8" roughness={0.4} metalness={0.1} />;
  const W = 7.32, H = 2.44, D = 2.0;
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[-W / 2, H / 2, 0]}><cylinderGeometry args={[0.07, 0.07, H, 12]} />{post}</mesh>
      <mesh position={[W / 2, H / 2, 0]}><cylinderGeometry args={[0.07, 0.07, H, 12]} />{post}</mesh>
      <mesh position={[0, H, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.07, 0.07, W + 0.14, 12]} />{post}</mesh>
      {/* rede: fundo, laterais, teto */}
      <mesh position={[0, H / 2, -D]}><planeGeometry args={[W, H]} /><meshBasicMaterial map={net} transparent opacity={0.8} side={THREE.DoubleSide} /></mesh>
      <mesh position={[-W / 2, H / 2, -D / 2]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[D, H]} /><meshBasicMaterial map={net} transparent opacity={0.7} side={THREE.DoubleSide} /></mesh>
      <mesh position={[W / 2, H / 2, -D / 2]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[D, H]} /><meshBasicMaterial map={net} transparent opacity={0.7} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, H, -D / 2]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[W, D]} /><meshBasicMaterial map={net} transparent opacity={0.6} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

/** Jogador estilizado (goleiro/barreira): corpo cápsula + cabeça + braços. */
export function Player({ color = '#111', skin = '#d9a06b', position = [0, 0, 0] as [number, number, number], rotation = [0, 0, 0] as [number, number, number], arms = 0, gloves = false }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.95, 0]} castShadow><capsuleGeometry args={[0.28, 0.9, 6, 12]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
      <mesh position={[0, 1.72, 0]} castShadow><sphereGeometry args={[0.2, 16, 16]} /><meshStandardMaterial color={skin} /></mesh>
      <mesh position={[-0.12, 0.28, 0]}><capsuleGeometry args={[0.1, 0.45, 4, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.12, 0.28, 0]}><capsuleGeometry args={[0.1, 0.45, 4, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <group position={[-0.34, 1.3, 0]} rotation={[0, 0, arms]}>
        <mesh position={[0, -0.3, 0]}><capsuleGeometry args={[0.08, 0.5, 4, 8]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, -0.62, 0]}><sphereGeometry args={[0.11, 10, 10]} /><meshStandardMaterial color={gloves ? '#22E58A' : skin} /></mesh>
      </group>
      <group position={[0.34, 1.3, 0]} rotation={[0, 0, -arms]}>
        <mesh position={[0, -0.3, 0]}><capsuleGeometry args={[0.08, 0.5, 4, 8]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, -0.62, 0]}><sphereGeometry args={[0.11, 10, 10]} /><meshStandardMaterial color={gloves ? '#22E58A' : skin} /></mesh>
      </group>
    </group>
  );
}

export function Ball({ r = 0.22, position = [0, 0.22, 11] as [number, number, number], spin = 0 }) {
  const tex = useMemo(makeBallTexture, []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current && spin) ref.current.rotation.x -= spin * dt; });
  return (
    <mesh ref={ref} position={position} castShadow>
      <sphereGeometry args={[r, 24, 24]} />
      <meshStandardMaterial map={tex} roughness={0.5} />
    </mesh>
  );
}

/** Arquibancada ao fundo + placas de publicidade "BRGOL". */
export function Stadium({ c1, c2 }: { c1?: string; c2?: string }) {
  const crowd = useMemo(() => makeCrowdTexture(c1, c2), [c1, c2]);
  const board = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0A1B2B'; g.fillRect(0, 0, 1024, 96);
    g.font = 'bold 64px Anton, Impact, sans-serif'; g.fillStyle = '#22E58A'; g.textBaseline = 'middle';
    for (let x = 30; x < 1024; x += 260) g.fillText('BRGOL', x, 48);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      <mesh position={[0, 6, -14]}><planeGeometry args={[120, 12]} /><meshBasicMaterial map={crowd} /></mesh>
      <mesh position={[0, 0.5, -5]}><planeGeometry args={[60, 1]} /><meshBasicMaterial map={board} /></mesh>
      {/* holofotes */}
      <mesh position={[-18, 14, -12]}><sphereGeometry args={[0.8, 12, 12]} /><meshBasicMaterial color="#fff6d5" /></mesh>
      <mesh position={[18, 14, -12]}><sphereGeometry args={[0.8, 12, 12]} /><meshBasicMaterial color="#fff6d5" /></mesh>
    </group>
  );
}

export function Lights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#dfe9ff', '#1a4d2e', 0.5]} />
      <directionalLight position={[-12, 18, -6]} intensity={1.4} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[12, 18, 8]} intensity={0.8} />
    </>
  );
}

export const ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
