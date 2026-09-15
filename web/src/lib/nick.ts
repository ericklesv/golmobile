/**
 * Como pintar um nick — UM lugar só (chat, rankings, partida, perfil, painel usam isto):
 *   1. `nickFade` (VIP com degradê escolhido no perfil) → texto com gradiente das duas cores;
 *   2. `nickColor` (cor sólida comprada na loja, nível 8+) → classe `nick-<cor>` do index.css;
 *   3. VIP sem nada → azul; 4. o resto → azul-marinho (ou a classe base que a tela pedir).
 * O servidor só manda `nickFade` enquanto o VIP está ativo, então aqui não se confere VIP.
 */
import type { CSSProperties } from 'react';

export type NickFade = { a: string; b: string } | null;
export type NickLike = { nickFade?: NickFade; nickColor?: string | null; vip?: boolean };

/** Estilo inline do degradê (texto recortado sobre o gradiente). */
export function fadeStyle(fade: NickFade, dark = false): CSSProperties | undefined {
  if (!fade) return undefined;
  return {
    backgroundImage: `linear-gradient(90deg, ${fade.a}, ${fade.b})`,
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', WebkitTextFillColor: 'transparent',
    // sobre fundo escuro o texto recortado perde o contorno (t-out não funciona com fill transparente): sombra por filtro
    filter: dark ? 'drop-shadow(0 2px 0 rgba(0,0,0,0.55))' : undefined,
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
