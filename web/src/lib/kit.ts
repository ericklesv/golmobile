/**
 * Uniforme do time (pedido do dono, 15/09/2026): o presidente escolhe o DESENHO (api: KIT_DESIGNS em rules.js,
 * Team.kitDesign); as cores são SEMPRE as do time — primária, secundária e a 3ª quando tiver (ex.: Santa Cruz).
 * Este módulo é a ÚNICA fonte de "como pintar" cada desenho, usada em três lugares:
 *   - camisa SVG (components/Jersey.tsx — Camisas e a escolha do presidente);
 *   - peças do X1 (PregoBoard / BotaoField: prego e botão);
 *   - uniforme 3D (scenes/keeper.tsx: goleiro e barreira do pênalti, falta e Falta PRO — inclusive o adversário).
 * Desenho novo: entrada em KIT_DESIGNS (api) + os três pintores aqui.
 */
export type KitDesign = 'classico' | 'liso' | 'listras' | 'faixas' | 'metades' | 'diagonal';
export const KIT_DESIGNS: KitDesign[] = ['classico', 'liso', 'listras', 'faixas', 'metades', 'diagonal'];

export interface KitPaint { primary: string; secondary: string; tertiary?: string | null; design?: KitDesign | string | null }

export const designOf = (d?: string | null): KitDesign => (KIT_DESIGNS.includes(d as KitDesign) ? (d as KitDesign) : 'classico');

/** Cores das faixas do desenho: a 3ª cor (se houver) entra no meio, separando as outras duas. */
export const kitBands = (k: KitPaint): string[] => (k.tertiary ? [k.primary, k.tertiary, k.secondary] : [k.primary, k.secondary]);

/**
 * Cor de um ponto da CAMISA num retângulo normalizado (u, v em 0..1; u da esquerda para a direita, v de cima para
 * baixo). É o pintor "por pixel" — a camisa 3D e as peças do X1 usam; a camisa SVG usa as formas equivalentes.
 * `stripe` = largura da listra/faixa em frações do retângulo.
 */
export function kitPixel(k: KitPaint, u: number, v: number, stripe = 1 / 6): string {
  const d = designOf(k.design);
  const bands = kitBands(k);
  const cycle = (t: number) => bands[((Math.floor(t / stripe) % bands.length) + bands.length) % bands.length];
  switch (d) {
    case 'liso': return k.primary;
    case 'listras': return cycle(u);
    case 'faixas': return cycle(v);
    case 'metades': return bands.length === 3 ? (u < 1 / 3 ? bands[0] : u < 2 / 3 ? bands[1] : bands[2]) : (u < 0.5 ? k.primary : k.secondary);
    case 'diagonal': {
      // faixa do ombro direito ao quadril esquerdo (como a do São Paulo/Vasco): largura ~ 22 % do retângulo
      const t = u + v; // 0..2
      if (bands.length === 3) return t > 0.78 && t < 1.22 ? (t > 0.9 && t < 1.1 ? bands[1] : bands[2]) : k.primary;
      return t > 0.8 && t < 1.2 ? k.secondary : k.primary;
    }
    case 'classico':
    default: {
      // faixa no peito (igual ao uniforme 3D padrão): 0,36..0,50 da altura; com 3ª cor, um filete dela nas bordas
      if (v > 0.36 && v < 0.5) return k.secondary;
      if (bands.length === 3 && ((v > 0.33 && v <= 0.36) || (v >= 0.5 && v < 0.53))) return bands[1];
      return k.primary;
    }
  }
}

/** Faixas de uma peça redonda do X1 (prego/botão): cores e direção. `null` = peça lisa (cor principal + aro na secundária). */
export function discBands(k: KitPaint): { bands: string[]; dir: 'h' | 'v' | 'd' } | null {
  const d = designOf(k.design);
  const bands = kitBands(k);
  if (d === 'listras') return { bands, dir: 'v' };
  if (d === 'faixas') return { bands, dir: 'h' };
  if (d === 'metades') return { bands, dir: 'v' };
  if (d === 'diagonal') return { bands: bands.length === 3 ? [k.primary, bands[1], k.secondary, bands[1], k.primary] : [k.primary, k.secondary, k.primary], dir: 'd' };
  // clássico e liso: tricolor vira faixas horizontais (pedido da torcida do Santa Cruz); bicolor fica liso
  if (bands.length === 3) return { bands, dir: 'h' };
  return null;
}
