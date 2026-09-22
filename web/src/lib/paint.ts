import type { Team } from './types';
import type { TeamPaint } from '../components/PregoBoard';
import { discBands } from './kit';

/** As cores e o desenho do uniforme de um time, como as peças do X1 pintam. */
export const paintOf = (t: Pick<Team, 'colorPrimary' | 'colorSecondary' | 'colorTertiary' | 'kitDesign'>): TeamPaint =>
  ({ primary: t.colorPrimary, secondary: t.colorSecondary, tertiary: t.colorTertiary ?? null, design: t.kitDesign ?? null });

const rgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Luminância aproximada 0..1 de um #rrggbb (para saber se a cor é clara). */
const lum = (hex: string) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** Cor no espaço CIELAB (D65): a distância entre dois pontos daqui é "quanto o olho vê de diferença". */
const labCache = new Map<string, [number, number, number]>();
function lab(hex: string): [number, number, number] {
  const hit = labCache.get(hex);
  if (hit) return hit;
  const lin = rgb(hex).map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  const x = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const out: [number, number, number] = [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  labCache.set(hex, out);
  return out;
}
/** Diferença de cor (ΔE 1976): ~2 o olho mal percebe, ~10 "é outro tom", 50+ são cores diferentes. */
export const colorDiff = (a: string, b: string) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

/**
 * Pontos de uma peça do X1 (botão de linha ou prego, os dois ~72 % miolo / resto aro) numa grade fixa: a cor que
 * cada ponto mostra, seguindo o desenho do uniforme (lib/kit.ts → discBands, igual à tela). `face` diz se o ponto é
 * do miolo — o miolo é o que o olho lê como "a cor da peça", por isso pesa mais na comparação.
 */
const GRID = 16, INNER = 0.72; // grade PAR: com ímpar, a coluna do meio fazia a listra meio a meio parecer ter cor dominante
function discSamples(p: TeamPaint): { c: string; face: boolean }[] {
  const db = discBands(p);
  const rim = p.tertiary ?? p.secondary;
  const out: { c: string; face: boolean }[] = [];
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const x = ((i + 0.5) / GRID) * 2 - 1, y = ((j + 0.5) / GRID) * 2 - 1;
    const rho = Math.hypot(x, y);
    if (rho > 1) continue;
    if (rho > INNER) { out.push({ c: rim, face: false }); continue; }
    if (!db) { out.push({ c: p.primary, face: true }); continue; }
    const t = (db.dir === 'h' ? y : db.dir === 'v' ? x : (x - y) / Math.SQRT2) / INNER; // -1..1 ao longo das faixas
    const k = Math.min(db.bands.length - 1, Math.max(0, Math.floor(((t + 1) / 2) * db.bands.length)));
    out.push({ c: db.bands[k], face: true });
  }
  return out;
}

/** Quanto as peças de dois uniformes se diferenciam (0 = iguais): no miolo, no aro e no total (miolo 70 %, aro 30 %). */
export function kitDiff(a: TeamPaint, b: TeamPaint): { face: number; rim: number; total: number } {
  const sa = discSamples(a), sb = discSamples(b);
  let face = 0, nf = 0, rim = 0, nr = 0;
  for (let i = 0; i < sa.length; i++) {
    const d = colorDiff(sa[i].c, sb[i].c);
    if (sa[i].face) { face += d; nf++; } else { rim += d; nr++; }
  }
  face /= nf; rim /= nr;
  return { face, rim, total: 0.7 * face + 0.3 * rim };
}

/** A cor que mais aparece no miolo da peça e quanto dele ela ocupa (1 = peça lisa; 0,5 = listras meio a meio). */
function dominant(p: TeamPaint): { c: string; share: number } {
  const count = new Map<string, number>();
  let n = 0;
  for (const s of discSamples(p)) if (s.face) { count.set(s.c, (count.get(s.c) ?? 0) + 1); n++; }
  let c = p.primary, k = 0;
  for (const [col, m] of count) if (m > k) { c = col; k = m; }
  return { c, share: k / n };
}

/**
 * Os dois times se confundem em campo? (pedido do dono, 22/09/2026, depois de um Flamengo x Athletico-PR com as peças
 * idênticas no Botão). Três jeitos de se confundir, calibrados com os 48 times — conferir em `/debug-x1-kits?confrontos=1`:
 *  - o conjunto é parecido (`total` < 40): vermelho e preto x vermelho e preto, verde e branco x verde e branco…;
 *  - o miolo é da mesma cor e só o aro muda (`face` < 30): Flamengo x Internacional, Bahia x Cruzeiro — o miolo é o que
 *    o olho lê como "a cor da peça";
 *  - as duas peças são quase todas da mesma cor (a dominante ocupa 55 %+ do miolo nas duas): Sport (vermelho com a faixa
 *    preta na diagonal) x São Paulo — ponto a ponto a faixa parece diferença, mas os dois são "o time vermelho".
 */
export const KIT_CLASH = { total: 40, face: 30, dominant: 30, share: 0.55 };
export function kitClash(a: TeamPaint, b: TeamPaint): boolean {
  const d = kitDiff(a, b);
  if (d.total < KIT_CLASH.total || d.face < KIT_CLASH.face) return true;
  const x = dominant(a), y = dominant(b);
  return x.share >= KIT_CLASH.share && y.share >= KIT_CLASH.share && colorDiff(x.c, y.c) < KIT_CLASH.dominant;
}

/**
 * Uniforme reserva (dono, 15/09/2026, no amistoso; 22/09/2026, em todo confronto que se confunde). Time de cor escura:
 * reserva BRANCA com a cor do time no detalhe (a 3ª cor sai — o Santa Cruz tricolor ficava parecido demais só
 * invertendo). Time de cor clara (branco, amarelo…): as cores invertidas, base na cor secundária. Mesmo desenho.
 */
export const reservePaint = (p: TeamPaint): TeamPaint => {
  if (lum(p.primary) >= 0.7) {
    const base = lum(p.secondary) >= 0.7 ? '#123C8A' : p.secondary; // clara com clara: marinho
    return { primary: base, secondary: p.primary, tertiary: null, design: p.design };
  }
  return { primary: '#FFFFFF', secondary: p.primary, tertiary: null, design: p.design };
};

/** 3º uniforme, quando nem a reserva resolve (ex.: a reserva branca de um cai contra um time todo branco). */
const THIRD = ['#123C8A', '#F2C400', '#E8641A', '#6A1B9A', '#1E9BD7', '#0B7A3B', '#FFFFFF', '#1B1B1B'];
const thirdPaints = (p: TeamPaint): TeamPaint[] => THIRD.map((base) => {
  const contrast = lum(base) >= 0.6 ? '#1B1B1B' : '#FFFFFF';
  const detail = [p.primary, p.secondary].find((c) => colorDiff(c, base) >= 45) ?? contrast;
  return { primary: base, secondary: detail, tertiary: null, design: p.design };
});

type Kits = { paint: [TeamPaint, TeamPaint]; reserve: 0 | 1 | null };
const kitsCache = new Map<string, Kits>(); // a tela da partida redesenha a cada quadro: a conta sai uma vez por confronto
const keyOf = (p: TeamPaint) => `${p.primary}/${p.secondary}/${p.tertiary ?? ''}/${p.design ?? ''}`;
/**
 * As cores das peças numa partida do X1: [lado 0, lado 1] + qual lado está de reserva (null = os dois de titular).
 * Se os titulares se confundem (`kitClash`), o lado 1 (quem aceitou o desafio) veste a reserva; se ela
 * também se confunde, o lado 0 veste a dele; senão, o lado 1 vai de 3º uniforme. Só depende dos dois times e do lado,
 * então os dois aparelhos pintam igual sem o servidor saber de nada. Amistoso (mesmo time) cai aqui naturalmente.
 */
export function matchPaints(t0: TeamPaint, t1: TeamPaint): Kits {
  const key = `${keyOf(t0)}>${keyOf(t1)}`;
  let out = kitsCache.get(key);
  if (!out) { out = pickKits(t0, t1); kitsCache.set(key, out); }
  return out;
}
function pickKits(t0: TeamPaint, t1: TeamPaint): Kits {
  if (!kitClash(t0, t1)) return { paint: [t0, t1], reserve: null };
  const options: { paint: [TeamPaint, TeamPaint]; reserve: 0 | 1 }[] = [
    { paint: [t0, reservePaint(t1)], reserve: 1 },
    { paint: [reservePaint(t0), t1], reserve: 0 },
    ...thirdPaints(t1).map((p) => ({ paint: [t0, p] as [TeamPaint, TeamPaint], reserve: 1 as const })),
  ];
  const ok = options.find((o) => !kitClash(o.paint[0], o.paint[1]));
  if (ok) return ok;
  // nenhuma resolve (não acontece com os 48 times de hoje): fica a que mais se diferencia
  return options.reduce((best, o) => (kitDiff(o.paint[0], o.paint[1]).total > kitDiff(best.paint[0], best.paint[1]).total ? o : best));
}

/** Adversário genérico das "fotos" do X1 (começo da tela e janela do jogo do dia): branco com detalhe marinho. */
const RIVAL: TeamPaint = { primary: '#FFFFFF', secondary: '#123C8A' };
/** [meu time, adversário genérico] para as fotos — o adversário troca de uniforme se confundir com o meu (ex.: Santos). */
export const previewPaints = (mine: TeamPaint): [TeamPaint, TeamPaint] => matchPaints(mine, RIVAL).paint;
