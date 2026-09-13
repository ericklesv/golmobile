/**
 * Laterais do desktop — porte fiel do `PageShell`/`GutterPainter` do Managol 2.0
 * (lib/widgets/page_shell.dart): gradiente sóbrio, brilho radial vindo de fora,
 * grade escalonada de mini-logos quase invisíveis que "acendem" perto do cursor
 * (holofote dourado) e sombra interna junto à coluna do app. Só aparece quando a
 * tela é mais larga que o app (max-width 480 + respiro).
 */
import { useEffect, useRef } from 'react';

const LOGO_W = 30;          // largura do mini-logo
const CELL = 64;            // espaçamento da grade
const BASE_OPACITY = 0.07;  // opacidade base
const HOVER_OPACITY = 0.55; // opacidade "acesa"
const HOVER_RADIUS = 140;   // raio do holofote
const CONTENT_W = 480;      // largura do app
const GLOW = '#FFC53D';

export function Gutters() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = '/brand/logo-v.webp';
    let hover: { x: number; y: number } | null = null;
    let raf = 0, w = 0, h = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const paintGutter = (rect: { x: number; y: number; w: number; h: number }, innerOnRight: boolean) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
      // 1) base
      const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      g.addColorStop(0, '#0C2A4C'); g.addColorStop(1, '#050D1F');
      ctx.fillStyle = g; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      // 2) brilho radial discreto vindo do lado externo
      const cx = innerOnRight ? rect.x : rect.x + rect.w, cy = rect.y + rect.h * 0.35;
      const r = Math.max(rect.w, rect.h) * 1.4;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, 'rgba(27,55,102,0.5)'); rg.addColorStop(1, 'rgba(27,55,102,0)');
      ctx.fillStyle = rg; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      // 3) holofote dourado seguindo o cursor (só nesta lateral)
      const here = hover && hover.x >= rect.x && hover.x <= rect.x + rect.w;
      if (here && hover) {
        const sg = ctx.createRadialGradient(hover.x, hover.y, 0, hover.x, hover.y, HOVER_RADIUS);
        sg.addColorStop(0, 'rgba(255,197,61,0.07)'); sg.addColorStop(1, 'rgba(255,197,61,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(hover.x, hover.y, HOVER_RADIUS, 0, Math.PI * 2); ctx.fill();
      }
      // 4) marca-d'água: grade escalonada de mini-logos que acendem no hover
      if (img.complete && img.naturalWidth) {
        const logoH = LOGO_W * (img.naturalHeight / img.naturalWidth);
        const innerLimitX = innerOnRight ? rect.x + rect.w - 10 : rect.x + 10;
        let row = 0;
        for (let y = rect.y - CELL; y < rect.y + rect.h + CELL; y += CELL) {
          const offsetX = row % 2 === 0 ? 0 : CELL / 2;
          for (let x = rect.x - CELL + offsetX; x < rect.x + rect.w + CELL; x += CELL) {
            const dx = x + (CELL - LOGO_W) / 2, dy = y + (CELL - logoH) / 2;
            if (innerOnRight ? dx + LOGO_W > innerLimitX : dx < innerLimitX) continue;
            let opacity = BASE_OPACITY;
            if (here && hover) {
              const dist = Math.hypot(dx + LOGO_W / 2 - hover.x, dy + logoH / 2 - hover.y);
              if (dist < HOVER_RADIUS) { const t = 1 - dist / HOVER_RADIUS; opacity = BASE_OPACITY + (HOVER_OPACITY - BASE_OPACITY) * t * t; }
            }
            ctx.globalAlpha = opacity;
            ctx.drawImage(img, dx, dy, LOGO_W, logoH);
          }
          row++;
        }
        ctx.globalAlpha = 1;
      }
      // 5) sombra interna na borda do conteúdo
      const sw = 22;
      const sx = innerOnRight ? rect.x + rect.w - sw : rect.x;
      const sg2 = ctx.createLinearGradient(innerOnRight ? rect.x + rect.w : rect.x, 0, innerOnRight ? rect.x + rect.w - sw : rect.x + sw, 0);
      sg2.addColorStop(0, 'rgba(0,0,0,0.4)'); sg2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg2; ctx.fillRect(sx, rect.y, sw, rect.h);
      ctx.restore();
    };

    const draw = () => {
      raf = 0;
      ctx.clearRect(0, 0, w, h);
      const gutterW = (w - CONTENT_W) / 2;
      if (gutterW <= 1) return;
      paintGutter({ x: 0, y: 0, w: gutterW, h }, true);
      paintGutter({ x: w - gutterW, y: 0, w: gutterW, h }, false);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const move = (e: MouseEvent) => { hover = { x: e.clientX, y: e.clientY }; schedule(); };
    const leave = () => { hover = null; schedule(); };

    img.onload = draw;
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseleave', leave);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('mousemove', move); window.removeEventListener('mouseleave', leave); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0" />;
}

/** Fixa o GLOW na paleta caso alguém queira reaproveitar. */
export const GUTTER_GLOW = GLOW;
