/**
 * Captcha invisível da Cloudflare (Turnstile) no cadastro. Só aparece quando o servidor manda
 * `meta.turnstileSiteKey` (TURNSTILE_SITE_KEY + TURNSTILE_SECRET no .env da API — lib/security.js);
 * sem chave o componente não renderiza nada e o cadastro segue sem token.
 * O script oficial é carregado uma vez; o widget entrega o token por onToken.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '../store/auth';

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void } }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!loading) loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const siteKey = useAuth((s) => s.meta?.turnstileSiteKey);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let id: string | undefined; let alive = true;
    loadScript().then(() => {
      if (!alive || !ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, {
        sitekey: siteKey, theme: 'light', language: 'pt-BR', size: 'flexible',
        callback: (t: string) => onToken(t), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null),
      });
    }).catch(() => { /* Cloudflare fora do ar: o servidor também deixa passar nesse caso */ });
    return () => { alive = false; try { if (id) window.turnstile?.remove(id); } catch {} };
  }, [siteKey, onToken]);
  if (!siteKey) return null;
  return <div ref={ref} className="no-drag flex justify-center" />;
}
