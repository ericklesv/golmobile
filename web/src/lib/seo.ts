import { useEffect } from 'react';

/**
 * SEO por página (pedido do dono, 15/09/2026): título, descrição, canonical e og:* das páginas PÚBLICAS
 * (landing, entrar, cadastro, legais). O Google roda o app e lê isto; os robôs de WhatsApp/Telegram/Facebook
 * NÃO rodam JavaScript — para eles vale só o que está no `web/index.html` (as tags padrão abaixo são as
 * mesmas de lá). Ao sair da página, volta ao padrão. Páginas logadas não chamam (não interessam ao Google).
 */
const BASE = 'https://jogagol.com.br';
const DEFAULT = {
  title: 'JogaGol — jogo de fazer gols online, o novo BRGOL',
  description: 'Jogo de fazer gols online e grátis: escolha seu clube, marque gols de pênalti, falta e trilha e dispute a artilharia com outros jogadores. O sucessor do clássico BRGOL, no celular e no PC.',
};

function set(selector: string, attr: string, value: string) {
  const el = document.head.querySelector<HTMLElement>(selector);
  if (el) el.setAttribute(attr, value);
}

function apply(title: string, description: string, path: string) {
  document.title = title;
  const url = BASE + path;
  set('meta[name="description"]', 'content', description);
  set('link[rel="canonical"]', 'href', url);
  set('meta[property="og:url"]', 'content', url);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', description);
  set('meta[name="twitter:title"]', 'content', title);
  set('meta[name="twitter:description"]', 'content', description);
}

/** `title` sem o sufixo (vira "Título · JogaGol"); `path` = rota canônica (padrão: a atual, sem query). */
export function useSeo(title: string, description: string, path?: string) {
  useEffect(() => {
    apply(`${title} · JogaGol`, description, path ?? window.location.pathname);
    return () => apply(DEFAULT.title, DEFAULT.description, '/');
  }, [title, description, path]);
}
