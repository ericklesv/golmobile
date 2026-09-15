import type { Team } from './types';
import type { TeamPaint } from '../components/PregoBoard';

/** As cores e o desenho do uniforme de um time, como as peças do X1 pintam. */
export const paintOf = (t: Pick<Team, 'colorPrimary' | 'colorSecondary' | 'colorTertiary' | 'kitDesign'>): TeamPaint =>
  ({ primary: t.colorPrimary, secondary: t.colorSecondary, tertiary: t.colorTertiary ?? null, design: t.kitDesign ?? null });

/** Luminância aproximada 0..1 de um #rrggbb (para saber se a cor é clara). */
const lum = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/**
 * Uniforme reserva do amistoso (dono, 15/09/2026: os dois do mesmo time ficavam com peças iguais): o lado 1 (quem
 * aceitou) joga com o uniforme "ao contrário". Time de cor escura: reserva BRANCA com a cor do time no detalhe (a 3ª
 * cor sai — o Santa Cruz tricolor ficava parecido demais só invertendo). Time de cor clara (branco, amarelo…): as
 * cores invertidas, base na cor secundária. Mesmo desenho do uniforme.
 */
export const reservePaint = (p: TeamPaint): TeamPaint => {
  if (lum(p.primary) >= 0.7) {
    const base = lum(p.secondary) >= 0.7 ? '#123C8A' : p.secondary; // clara com clara: marinho
    return { primary: base, secondary: p.primary, tertiary: null, design: p.design };
  }
  return { primary: '#FFFFFF', secondary: p.primary, tertiary: null, design: p.design };
};
