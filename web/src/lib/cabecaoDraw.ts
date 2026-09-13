/**
 * Cabeção — desenho do campo, jogadores e bola no canvas (arte própria, traço cartoon
 * do kit). Coordenadas lógicas 1000×500 (y para cima, chão em 0) → canvas.
 */
import { crestUrl } from '../components/Shield';

export interface Field { w: number; h: number; goalW: number; goalH: number; barH: number; playerR: number; ballR: number }
export interface DrawPlayer { x: number; y: number; face: number; kick: boolean; team: { slug: string; colorPrimary: string; colorSecondary: string }; skin: string; hair: string }
export interface DrawBall { x: number; y: number; vx: number }

const GROUND = 0.88; // fração da altura do canvas onde fica o chão
export const ASPECT = 16 / 10; // canvas largura/altura
const crests = new Map<string, HTMLImageElement>();
function crest(slug: string) {
  let im = crests.get(slug);
  if (!im) { im = new Image(); im.src = crestUrl(slug); crests.set(slug, im); }
  return im.complete && im.naturalWidth ? im : null;
}

let crowd: HTMLCanvasElement | null = null;
function crowdLayer(w: number, h: number) {
  if (crowd && crowd.width === w && crowd.height === h) return crowd;
  crowd = document.createElement('canvas'); crowd.width = w; crowd.height = h;
  const c = crowd.getContext('2d')!;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cols = ['#F5C26B', '#E8834B', '#5FB7E8', '#F06A8A', '#8ED26B', '#C79BFF', '#FFD84D', '#7A4A2B', '#FFFFFF'];
  const rows = 6, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    c.fillStyle = `rgba(20,45,90,${0.25 + r * 0.06})`; c.fillRect(0, r * rh, w, rh);
    const n = Math.floor(w / 13);
    for (let i = 0; i < n; i++) {
      const x = i * 13 + (r % 2) * 6 + rnd() * 3, y = r * rh + rh * 0.55 + rnd() * 3;
      c.fillStyle = cols[Math.floor(rnd() * cols.length)];
      c.beginPath(); c.arc(x, y - 6, 3.6, 0, Math.PI * 2); c.fill(); // cabeça
      c.fillStyle = cols[Math.floor(rnd() * cols.length)];
      c.fillRect(x - 4, y - 1, 8, 6); // corpo
    }
  }
  const shade = c.createLinearGradient(0, 0, 0, h); shade.addColorStop(0, 'rgba(10,25,60,0.45)'); shade.addColorStop(1, 'rgba(10,25,60,0.1)');
  c.fillStyle = shade; c.fillRect(0, 0, w, h);
  return crowd;
}

export function draw(ctx: CanvasRenderingContext2D, W: number, H: number, f: Field, players: DrawPlayer[], ball: DrawBall, t: number) {
  const sx = W / f.w;                     // escala horizontal
  const gy = H * GROUND;                  // y do chão no canvas
  const sy = sx;                          // mesma escala nos dois eixos (círculos continuam círculos)
  const X = (x: number) => x * sx;
  const Y = (y: number) => gy - y * sy;

  // céu noturno + arquibancada + refletores
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, '#0E2A5C'); sky.addColorStop(1, '#2C63B8');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const standsH = gy * 0.42;
  ctx.drawImage(crowdLayer(Math.round(W), Math.round(standsH)), 0, gy * 0.22);
  for (const lx of [W * 0.12, W * 0.38, W * 0.62, W * 0.88]) {
    const g = ctx.createRadialGradient(lx, gy * 0.12, 0, lx, gy * 0.12, W * 0.09);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.25, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(lx - W * 0.1, 0, W * 0.2, gy * 0.3);
  }
  // mureta + placa
  ctx.fillStyle = '#1E4C9C'; ctx.fillRect(0, gy * 0.64, W, gy * 0.08);
  ctx.fillStyle = '#3F7FDF'; ctx.fillRect(0, gy * 0.64, W, gy * 0.015);
  // gramado
  const grass = ctx.createLinearGradient(0, gy * 0.72, 0, gy);
  grass.addColorStop(0, '#4FBF3A'); grass.addColorStop(1, '#2E9A2A');
  ctx.fillStyle = grass; ctx.fillRect(0, gy * 0.72, W, gy - gy * 0.72);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 10; i += 2) ctx.fillRect((W / 10) * i, gy * 0.72, W / 10, gy - gy * 0.72);
  // linhas do campo (perspectiva simples)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W / 2, gy * 0.74); ctx.lineTo(W / 2, gy); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(W / 2, gy * 0.9, W * 0.09, gy * 0.07, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  // terra abaixo
  ctx.fillStyle = '#6B3F1E'; ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = '#4E2C13'; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.ellipse((i * 97) % W + 20, gy + 14 + (i * 37) % (H - gy - 20), 8, 4, 0, 0, Math.PI * 2); ctx.fill(); }

  // gols
  drawGoal(ctx, X, Y, f, 'left');
  drawGoal(ctx, X, Y, f, 'right');

  // sombras
  for (const p of players) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(X(p.x), gy + 2, f.playerR * sx * 0.9, 6, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(X(ball.x), gy + 2, f.ballR * sx * (1 - Math.min(0.6, ball.y / 600)), 4, 0, 0, Math.PI * 2); ctx.fill();

  // jogadores e bola
  for (const p of players) drawPlayer(ctx, X, Y, sx, sy, f, p);
  drawBall(ctx, X, Y, sx, f, ball, t);
}

function drawGoal(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, f: Field, side: 'left' | 'right') {
  const x0 = side === 'left' ? 0 : f.w, x1 = side === 'left' ? f.goalW : f.w - f.goalW;
  // rede
  ctx.save();
  ctx.beginPath(); ctx.rect(Math.min(X(x0), X(x1)), Y(f.goalH), Math.abs(X(x1) - X(x0)), Y(0) - Y(f.goalH)); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
  for (let i = -20; i < 20; i++) {
    ctx.beginPath(); ctx.moveTo(Math.min(X(x0), X(x1)) + i * 9, Y(f.goalH)); ctx.lineTo(Math.min(X(x0), X(x1)) + i * 9 + 40, Y(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(Math.min(X(x0), X(x1)) + i * 9 + 40, Y(f.goalH)); ctx.lineTo(Math.min(X(x0), X(x1)) + i * 9, Y(0)); ctx.stroke();
  }
  ctx.restore();
  // traves
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(X(x1), Y(0)); ctx.lineTo(X(x1), Y(f.goalH + f.barH / 2)); ctx.lineTo(X(x0), Y(f.goalH + f.barH / 2)); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(x1) + 3, Y(0)); ctx.lineTo(X(x1) + 3, Y(f.goalH)); ctx.stroke();
}

function drawPlayer(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, sx: number, sy: number, f: Field, p: DrawPlayer) {
  const cx = X(p.x), base = Y(p.y);
  const R = f.playerR * sx;
  const face = p.face;
  ctx.save();
  ctx.translate(cx, base);
  // pernas + chuteiras (a de trás fica parada; a da frente estica no chute)
  const legOff = p.kick ? 0.6 * R * face : 0;
  ctx.fillStyle = '#F2C9A0';
  ctx.fillRect(-R * 0.28, -R * 0.24, R * 0.18, R * 0.16);
  ctx.fillRect(R * 0.1 + legOff * 0.35, -R * 0.24, R * 0.18, R * 0.16);
  ctx.fillStyle = '#1B1B1B';
  roundRect(ctx, -R * 0.38 - (face < 0 ? R * 0.08 : 0), -R * 0.1, R * 0.38, R * 0.12, 3); ctx.fill();
  roundRect(ctx, R * 0.02 + legOff, -R * 0.13, R * 0.46, R * 0.13, 3); ctx.fill();
  // calção
  ctx.fillStyle = '#F5F5F5';
  roundRect(ctx, -R * 0.4, -R * 0.44, R * 0.8, R * 0.24, 4); ctx.fill();
  // camisa (cores do time) com faixa e escudo
  ctx.fillStyle = p.team.colorPrimary;
  roundRect(ctx, -R * 0.5, -R * 0.9, R, R * 0.52, 8); ctx.fill();
  ctx.fillStyle = p.team.colorSecondary;
  ctx.fillRect(-R * 0.5, -R * 0.9 + R * 0.16, R, R * 0.1);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; roundRect(ctx, -R * 0.5, -R * 0.9, R, R * 0.52, 8); ctx.stroke();
  const im = crest(p.team.slug);
  if (im) ctx.drawImage(im, -R * 0.15, -R * 0.82, R * 0.3, R * 0.3);
  // braço
  ctx.fillStyle = '#F2C9A0';
  ctx.beginPath(); ctx.arc(face * R * 0.56, -R * 0.62, R * 0.12, 0, Math.PI * 2); ctx.fill();
  // cabeça grande (o círculo físico de raio R vai de 0 a 2R; a cabeça ocupa a parte de cima)
  const hy = -R * 1.32, hr = R * 0.7;
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(3, hy + 4, hr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0, hy, hr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
  // cabelo (topo + costeleta atrás)
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, hy, hr, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(face * hr * 0.3, hy - hr * 0.45); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-face * hr * 0.98, hy - hr * 0.1); ctx.lineTo(-face * hr * 1.1, hy + hr * 0.5); ctx.lineTo(-face * hr * 0.75, hy + hr * 0.15); ctx.closePath(); ctx.fill();
  // olho, sobrancelha, orelha, boca
  const ex = face * hr * 0.42;
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(-face * hr * 0.95, hy + hr * 0.05, hr * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(ex, hy - hr * 0.02, hr * 0.22, hr * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1B2A4A'; ctx.beginPath(); ctx.arc(ex + face * hr * 0.08, hy, hr * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(ex + face * hr * 0.12, hy - hr * 0.05, hr * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p.hair; ctx.lineWidth = Math.max(2, hr * 0.09); ctx.beginPath(); ctx.moveTo(ex - hr * 0.22, hy - hr * 0.36); ctx.lineTo(ex + hr * 0.22, hy - hr * 0.42); ctx.stroke();
  ctx.strokeStyle = '#8A4B3B'; ctx.lineWidth = Math.max(2, hr * 0.07); ctx.beginPath(); ctx.arc(face * hr * 0.32, hy + hr * 0.4, hr * 0.16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, sx: number, f: Field, b: DrawBall, t: number) {
  const r = f.ballR * sx, cx = X(b.x), cy = Y(b.y);
  const rot = (b.x / f.ballR) % (Math.PI * 2);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.22, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  void t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
