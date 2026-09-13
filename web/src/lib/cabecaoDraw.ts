/**
 * Cabeção — desenho no canvas. Arena em camadas (céu, refletores, arquibancada, torcida,
 * placas, gramado, terra, gols) vindas de `/api/uploads/cabecao/` (pack de estudo, fora do
 * git — ver docs/ROADMAP.md); jogadores desenhados em vetor com a camisa do time. Coordenadas
 * lógicas 800×400 (y para cima, chão em 0) → canvas. As texturas têm 1334 px de largura.
 */
import { crestUrl } from '../components/Shield';

export interface Field { w: number; h: number; goalW: number; goalH: number; barH: number; playerR: number; ballR: number }
export interface DrawPlayer { x: number; y: number; vx: number; face: number; kick: boolean; grounded: boolean; team: { slug: string; colorPrimary: string; colorSecondary: string }; skin: string; hair: string }
export interface DrawBall { x: number; y: number; vx: number }

export const ASPECT = 16 / 10;
const TEX_W = 1334;
const GROUND = 0.8;
const BASE = '/api/uploads/cabecao/';
const NAMES = ['sky.jpg', 'lights.png', 'stands.png', 'ads.png', 'grass.png', 'dirt.png', 'goal-back.png', 'goal-front.png', 'ball.png', 'fans0.png', 'fans1.png', 'fans2.png', 'fans3.png'] as const;
const img = new Map<string, HTMLImageElement>();
function tex(name: string): HTMLImageElement | null {
  let im = img.get(name);
  if (!im) { im = new Image(); im.src = BASE + name; img.set(name, im); }
  return im.complete && im.naturalWidth ? im : null;
}
export function preloadArena() { for (const n of NAMES) tex(n); }

const crests = new Map<string, HTMLImageElement>();
function crest(slug: string) {
  let im = crests.get(slug);
  if (!im) { im = new Image(); im.src = crestUrl(slug); crests.set(slug, im); }
  return im.complete && im.naturalWidth ? im : null;
}

// torcida: folha 560×360 com 8 colunas × 2 linhas de torcedores (70×90 cada)
const FAN_W = 70, FAN_H = 90;
let fanSeats: { sheet: number; cell: number; x: number; row: number; phase: number }[] | null = null;
function seats() {
  if (fanSeats) return fanSeats;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  fanSeats = [];
  for (let row = 0; row < 2; row++) {
    const step = 52 + row * 6;
    for (let x = -30 + (row ? 26 : 0); x < TEX_W + 30; x += step) fanSeats.push({ sheet: Math.floor(rnd() * 4), cell: Math.floor(rnd() * 16), x: x + rnd() * 8, row, phase: rnd() * Math.PI * 2 });
  }
  return fanSeats;
}

export function draw(ctx: CanvasRenderingContext2D, W: number, H: number, f: Field, players: DrawPlayer[], ball: DrawBall, t: number, excited: boolean) {
  const sx = W / f.w;          // escala lógica → canvas
  const ts = W / TEX_W;        // escala das texturas → canvas
  const gy = H * GROUND;       // chão
  const X = (x: number) => x * sx;
  const Y = (y: number) => gy - y * sx;
  const at = (name: string, x: number, y: number, w?: number, h?: number) => { const im = tex(name); if (im) ctx.drawImage(im, x, y, w ?? im.naturalWidth * ts, h ?? im.naturalHeight * ts); return !!im; };

  // fundo
  ctx.fillStyle = '#5E7FA8'; ctx.fillRect(0, 0, W, H);
  at('sky.jpg', 0, 0, W, Math.max(340 * ts, gy - 380 * ts));
  at('stands.png', 0, gy - 731 * ts);
  at('lights.png', 0, 0);
  // torcida (duas fileiras, pulando quando tem gol)
  const fanScale = ts * 0.78;
  for (const s of seats()) {
    const im = tex(`fans${s.sheet}.png`);
    if (!im) continue;
    const bob = excited ? Math.abs(Math.sin(t / 140 + s.phase)) * 14 * ts : Math.sin(t / 900 + s.phase) * 2 * ts;
    const scale = s.row === 0 ? fanScale * 0.9 : fanScale;
    const baseY = s.row === 0 ? gy - 418 * ts : gy - 372 * ts;
    ctx.drawImage(im, (s.cell % 8) * FAN_W, Math.floor(s.cell / 8) * FAN_H, FAN_W, FAN_H, s.x * ts, baseY - FAN_H * scale - bob, FAN_W * scale, FAN_H * scale);
  }
  at('ads.png', 0, gy - 407 * ts);
  at('grass.png', 0, gy - 150 * ts + 8 * ts);
  at('dirt.png', 0, gy - 12 * ts, W, H - gy + 12 * ts);
  // gols (fundo)
  const gb = tex('goal-back.png'), gf = tex('goal-front.png');
  const goalBottom = gy + 6 * ts;
  const mirrored = (im: HTMLImageElement) => { ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(im, 0, goalBottom - im.naturalHeight * ts, im.naturalWidth * ts, im.naturalHeight * ts); ctx.restore(); };
  if (gb) { ctx.drawImage(gb, 0, goalBottom - gb.naturalHeight * ts, gb.naturalWidth * ts, gb.naturalHeight * ts); mirrored(gb); }

  // sombras
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (const p of players) { ctx.beginPath(); ctx.ellipse(X(p.x), gy + 2, f.playerR * sx * 0.85, 5 * ts + 2, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(X(ball.x), gy + 2, f.ballR * sx * (1 - Math.min(0.6, ball.y / 500)), 4 * ts + 1, 0, 0, Math.PI * 2); ctx.fill();

  for (const p of players) drawPlayer(ctx, X, Y, sx, f, p, t);
  drawBall(ctx, X, Y, sx, f, ball);

  // gols (frente — a rede cobre a bola quando entra)
  if (gf) { ctx.drawImage(gf, 0, goalBottom - gf.naturalHeight * ts, gf.naturalWidth * ts, gf.naturalHeight * ts); mirrored(gf); }
  else {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
    for (const [x0, x1] of [[0, f.goalW], [f.w, f.w - f.goalW]]) { ctx.beginPath(); ctx.moveTo(X(x1), Y(0)); ctx.lineTo(X(x1), Y(f.goalH)); ctx.lineTo(X(x0), Y(f.goalH)); ctx.stroke(); }
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, sx: number, f: Field, p: DrawPlayer, t: number) {
  const cx = X(p.x), base = Y(p.y);
  const R = f.playerR * sx;
  const face = p.face;
  const running = p.grounded && Math.abs(p.vx) > 1;
  const swing = running ? Math.sin(t / 60) : 0;          // pernas alternando
  const squash = p.grounded ? 1 : 1.04;                   // no ar, estica um pouco
  ctx.save();
  ctx.translate(cx, base);
  ctx.scale(1, squash);
  const skin = p.skin, dark = shade(p.skin, -28);
  // pernas (meião branco) + chuteiras
  const legOff = p.kick ? 0.62 * R * face : 0;
  const legA = swing * 0.14 * R, legB = -swing * 0.14 * R;
  ctx.fillStyle = '#F7F7F7';
  ctx.fillRect(-R * 0.3 + legA * face, -R * 0.26, R * 0.2, R * 0.18);
  ctx.fillRect(R * 0.1 + legB * face + legOff * 0.35, -R * 0.26, R * 0.2, R * 0.18);
  ctx.fillStyle = '#1B1B1B';
  roundRect(ctx, -R * 0.4 + legA * face - (face < 0 ? R * 0.08 : 0), -R * 0.1, R * 0.4, R * 0.12, 3); ctx.fill();
  roundRect(ctx, R * 0.02 + legB * face + legOff, -R * 0.13, R * 0.46, R * 0.13, 3); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(R * 0.1 + legB * face + legOff, -R * 0.1, R * 0.12, R * 0.03);
  // calção
  ctx.fillStyle = '#F5F5F5'; roundRect(ctx, -R * 0.42, -R * 0.46, R * 0.84, R * 0.26, 4); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-R * 0.42, -R * 0.26, R * 0.84, R * 0.05);
  // camisa com sombreado, gola, faixa e escudo
  const shirtG = ctx.createLinearGradient(-R * 0.5, 0, R * 0.5, 0);
  shirtG.addColorStop(0, shade(p.team.colorPrimary, -18)); shirtG.addColorStop(0.5, p.team.colorPrimary); shirtG.addColorStop(1, shade(p.team.colorPrimary, -30));
  ctx.fillStyle = shirtG; roundRect(ctx, -R * 0.52, -R * 0.92, R * 1.04, R * 0.54, 9); ctx.fill();
  ctx.fillStyle = p.team.colorSecondary; ctx.fillRect(-R * 0.52, -R * 0.92 + R * 0.17, R * 1.04, R * 0.1);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; roundRect(ctx, -R * 0.52, -R * 0.92, R * 1.04, R * 0.54, 9); ctx.stroke();
  ctx.fillStyle = p.team.colorSecondary; ctx.beginPath(); ctx.moveTo(-R * 0.14, -R * 0.92); ctx.lineTo(0, -R * 0.78); ctx.lineTo(R * 0.14, -R * 0.92); ctx.closePath(); ctx.fill(); // gola
  const im = crest(p.team.slug);
  if (im) ctx.drawImage(im, face * R * 0.14 - R * 0.13, -R * 0.74, R * 0.26, R * 0.26);
  // braço
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(face * R * 0.58, -R * 0.62, R * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  // cabeça (o círculo físico vai de 0 a 2R)
  const hy = -R * 1.32, hr = R * 0.72;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(3, hy + 5, hr, 0, Math.PI * 2); ctx.fill();
  const headG = ctx.createRadialGradient(-face * hr * 0.25, hy - hr * 0.3, hr * 0.2, 0, hy, hr * 1.05);
  headG.addColorStop(0, shade(skin, 14)); headG.addColorStop(1, dark);
  ctx.fillStyle = headG; ctx.beginPath(); ctx.arc(0, hy, hr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2.2; ctx.stroke();
  // orelha (atrás)
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(-face * hr * 0.96, hy + hr * 0.05, hr * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // cabelo: calota + franja + costeleta
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, hy, hr * 1.02, Math.PI * 1.0, Math.PI * 2.0); ctx.lineTo(face * hr * 0.35, hy - hr * 0.4); ctx.lineTo(face * hr * 0.05, hy - hr * 0.55); ctx.lineTo(-face * hr * 0.4, hy - hr * 0.35); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-face * hr * 1.0, hy - hr * 0.2); ctx.lineTo(-face * hr * 1.08, hy + hr * 0.45); ctx.lineTo(-face * hr * 0.8, hy + hr * 0.15); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, hy, hr * 1.02, Math.PI * 1.0, Math.PI * 2.0); ctx.stroke();
  // olho grande + sobrancelha + nariz + boca
  const ex = face * hr * 0.42, ey = hy + hr * 0.02;
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(ex, ey, hr * 0.24, hr * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#1B2A4A'; ctx.beginPath(); ctx.arc(ex + face * hr * 0.08, ey + hr * 0.02, hr * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(ex + face * hr * 0.12, ey - hr * 0.04, hr * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p.hair; ctx.lineWidth = Math.max(2, hr * 0.1); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - face * hr * 0.24, ey - hr * 0.36); ctx.lineTo(ex + face * hr * 0.2, ey - hr * 0.44); ctx.stroke();
  ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.5, hr * 0.06); ctx.beginPath(); ctx.moveTo(face * hr * 0.72, ey + hr * 0.05); ctx.lineTo(face * hr * 0.8, ey + hr * 0.3); ctx.stroke(); // nariz
  ctx.strokeStyle = '#7A3B2E'; ctx.lineWidth = Math.max(2, hr * 0.07); ctx.beginPath(); ctx.arc(face * hr * 0.42, hy + hr * 0.42, hr * 0.2, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, sx: number, f: Field, b: DrawBall) {
  const r = f.ballR * sx, cx = X(b.x), cy = Y(b.y);
  const rot = (b.x / f.ballR) % (Math.PI * 2);
  const im = tex('ball.png');
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  if (im) ctx.drawImage(im, -r * 1.08, -r * 1.08, r * 2.16, r * 2.16);
  else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Clareia (>0) ou escurece (<0) uma cor #rrggbb. */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
