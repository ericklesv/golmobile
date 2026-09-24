/**
 * Google Ads — tag do Google (gtag.js) para medir se o clique no anúncio virou conta (Guilherme, 24/09/2026: primeira
 * campanha de Pesquisa, "JogaGol | Pesquisa | Teste set-26", R$ 180 em 14 dias). Carregada SÓ no site jogagol.com.br
 * e SÓ para quem abre sem login (quem chega pelo anúncio): nunca no app da Play Store (TWA — a ficha declara "sem
 * anúncios" e a seção de segurança dos dados não cita o Google Ads), nunca no PC, nunca para jogador logado.
 * Só medição: `allow_ad_personalization_signals: false` (sem remarketing). A Política de Privacidade (screens/Legal.tsx)
 * descreve exatamente isto — mudou o que a tag faz, mude o texto lá.
 * Conversão "Cadastro JogaGol" = `adsSignup()` no cadastro que deu certo (store/auth.ts). A origem do clique (utm/gclid)
 * também vai para os nossos eventos (`origem` em lib/track.ts), para o banco dizer quantos do anúncio voltaram.
 */
import { token } from './api';
import { isTwa } from './twa';

const AW_ID = 'AW-17439857189';
/** Rótulo da ação de conversão "Cadastro JogaGol": o que vem depois da barra no `send_to` do snippet de evento. */
const SIGNUP_LABEL = 'gPYbCL_3kYQdEKW0_PtA';

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
}

let on = false;

export function installAds() {
  if (on) return;
  try {
    if (location.hostname !== 'jogagol.com.br' || isTwa() || token.get()) return;
    on = true;
    window.dataLayer = window.dataLayer || [];
    // o gtag.js exige o objeto `arguments`, não um array
    window.gtag = function gtag() { window.dataLayer!.push(arguments); }; // eslint-disable-line prefer-rest-params
    window.gtag('js', new Date());
    // page_location explícito: o gclid da URL de entrada vale mesmo se a rota trocar antes de o script chegar
    window.gtag('config', AW_ID, { page_location: location.href, allow_ad_personalization_signals: false });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${AW_ID}`;
    document.head.appendChild(s);
  } catch { /* nunca atrapalha o jogo */ }
}

/** Conta a conversão "Cadastro JogaGol". Sem a tag (app, PC, logado) ou sem o rótulo, não faz nada. */
export function adsSignup() {
  try { if (on && SIGNUP_LABEL) window.gtag?.('event', 'conversion', { send_to: `${AW_ID}/${SIGNUP_LABEL}` }); } catch { /* nada */ }
}
