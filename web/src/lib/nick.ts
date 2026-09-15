/**
 * Como pintar um nick — UM lugar só (chat, rankings, partida, perfil, painel usam isto):
 *   1. `nickFade` (VIP com degradê escolhido no perfil) → texto com gradiente das duas cores + um brilho
 *      leve atrás (pedido do dono, 15/09/2026): cor do próprio degradê; se o degradê é claro (branco,
 *      gelo, prata…), o brilho é azul-marinho para continuar legível no painel branco;
 *   2. `nickColor` (cor sólida comprada na loja, nível 8+) → classe `nick-<cor>` do index.css;
 *   3. VIP sem nada → azul; 4. o resto → azul-marinho (ou a classe base que a tela pedir).
 * O servidor só manda `nickFade` enquanto o VIP está ativo, então aqui não se confere VIP.
 * O brilho é `filter: drop-shadow` (text-shadow não funciona com texto recortado em gradiente).
 */
import type { CSSProperties } from 'react';

export type NickFade = { a: string; b: string } | null;
export type NickLike = { nickFade?: NickFade; nickColor?: string | null; vip?: boolean };

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]: [number, number, number]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Estilo inline do degradê (texto recortado sobre o gradiente) + brilho. */
export function fadeStyle(fade: NickFade, dark = false): CSSProperties | undefined {
  if (!fade) return undefined;
  const a = rgb(fade.a), b = rgb(fade.b);
  const mid: [number, number, number] = [(a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1, (a[2] + b[2]) >> 1];
  const light = lum(mid) > 0.7; // branco/gelo/prata/amarelo: brilho escuro para ler no painel branco
  const glow = dark
    ? `drop-shadow(0 0 3px rgba(${a.join(',')},0.8)) drop-shadow(0 2px 0 rgba(0,0,0,0.55))` // fundo marinho: halo da cor + sombra de contorno
    : light
      ? 'drop-shadow(0 0 2px rgba(20,51,95,0.75))'
      : `drop-shadow(0 0 3px rgba(${mid.join(',')},0.55))`;
  return {
    backgroundImage: `linear-gradient(90deg, ${fade.a}, ${fade.b})`,
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', WebkitTextFillColor: 'transparent',
    filter: glow,
  };
}

/**
 * Classe + estilo para o nick. `plain` = classe de cor quando não há nada (padrão azul-marinho);
 * `dark` = o nick está sobre fundo escuro (perfil/página do jogador), onde a cor padrão é branca com contorno.
 */
export function nickProps(u: NickLike, opts: { plain?: string; vipClass?: string; dark?: boolean } = {}): { className: string; style?: CSSProperties } {
  const { plain = 'text-navy-ink', vipClass = 'text-sky-deep', dark = false } = opts;
  if (u.nickFade) return { className: '', style: fadeStyle(u.nickFade, dark) };
  if (u.nickColor) return { className: `nick-${u.nickColor}` };
  return { className: u.vip ? vipClass : plain };
}
