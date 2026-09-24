/**
 * Futgolf (X1): tipos do buraco que vem do servidor (api/src/lib/futgolf.js → buildCourse) e as contas da tela.
 * A física é só do servidor; aqui só desenho, câmera e cenário.
 */
export interface FgPoint { x: number; y: number }
export type FgPoly = [number, number][];
export interface FgCourse {
  id: string; name: string; par: number; W: number; H: number; mirror: boolean;
  tee: FgPoint; cup: FgPoint; tb: FgPoint; ball: number; cupR: number;
  boundary: FgPoly; islands: FgPoly[];
  zones: { t: 'agua' | 'areia' | 'mato' | 'seco'; poly: FgPoly }[];
  placas: { x1: number; y1: number; x2: number; y2: number }[];
  molas: { x: number; y: number; r: number }[];
  postes: { x: number; y: number; r: number; kind: string }[];
  boosts: { x: number; y: number; ang: number; len: number; wid: number }[];
  tuneis: { a: FgPoint; b: FgPoint; out: number }[];
}
/** O andamento da partida (futgolfView no servidor). `tbDist` −1 = caiu na água / perdeu o tempo no desempate. */
export interface FgView {
  phase: 'play' | 'tiebreak'; round: number; tbCount: number; par: number; cap: number;
  balls: [FgPoint, FgPoint]; strokes: [number, number]; holed: [boolean, boolean]; out: [boolean, boolean]; kicked: [boolean, boolean];
  tbDist: (number | null)[];
}
/** Evento de um chute, no quadro `f` em que acontece. */
export interface FgEvent { t: 'mola' | 'seta' | 'tunel' | 'agua' | 'buraco' | 'bate'; i?: number; f: number }

/** Direção de um ângulo das peças (graus: 0 = para cima, 90 = para a direita). */
export const dirOf = (deg: number): [number, number] => [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];
export const polyPath = (poly: FgPoly) => (poly.length ? `M${poly.map(([x, y]) => `${x} ${y}`).join('L')}Z` : '');

export function pointInPoly(x: number, y: number, poly: FgPoly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A moldura de tudo que se desenha (o campo e um pouco de mato em volta). */
export const courseBox = (c: FgCourse) => ({ x: -34, y: -34, w: c.W + 68, h: c.H + 68 });

/** A "foto" do jogo (começo do X1 e janela do jogo do dia): do meio do campo até o buraco, não o buraco inteiro. */
export const previewView = (c: FgCourse) => ({ x: -34, y: Math.max(-34, c.cup.y - 100), w: c.W + 68, h: (c.W + 68) * 1.45 });

/** Os lados que ainda chutam nesta rodada (quem embocou ou pegou a bola não chuta mais). */
export const golfActive = (v: FgView, side: 0 | 1) => (v.phase === 'play' ? !v.holed[side] && !v.out[side] : v.tbDist[side] === null);

/** Cenário (árvores e arbustos fora do campo): sempre o mesmo para o mesmo buraco, sem ir para o servidor. */
export function scenery(c: FgCourse) {
  let h = 0;
  for (const ch of `${c.id}:${c.mirror ? 1 : 0}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  const box = courseBox(c);
  const trees: { x: number; y: number; r: number; tone: number }[] = [];
  const b = c.boundary;
  const ok = (x: number, y: number, r: number) =>
    x > box.x - r && x < box.x + box.w + r && y > box.y - r && y < box.y + box.h + r
    && !pointInPoly(x, y, b) && !b.some(([px, py], i) => i % 3 === 0 && Math.hypot(px - x, py - y) < r + 10)
    && !trees.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.8);
  for (let i = 0; i < b.length; i += 4) {
    const [px, py] = b[i], [ax, ay] = b[(i - 1 + b.length) % b.length], [bx, by] = b[(i + 1) % b.length];
    let nx = -(by - ay), ny = bx - ax;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (pointInPoly(px + nx * 12, py + ny * 12, b)) { nx = -nx; ny = -ny; } // a normal para FORA
    for (const far of [0, 1]) {
      if (far && rnd() < 0.45) continue;
      const r = 12 + rnd() * 10, d = (far ? 62 : 28) + rnd() * 22, j = (rnd() - 0.5) * 20;
      const x = px + nx * d - ny * j, y = py + ny * d + nx * j;
      if (ok(x, y, r)) trees.push({ x, y, r, tone: rnd() });
    }
  }
  return trees;
}
