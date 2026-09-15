import { registerSW } from 'virtual:pwa-register';
import { useAuth } from '../store/auth';

/**
 * Atualização do app (PWA). Antes o service worker trocava sozinho e a tela aberta ficava com o JavaScript
 * antigo até alguém recarregar — mensagens novas apareciam "sem formato", ícones novos sumiam (15/09/2026).
 * Agora: checa se há versão nova a cada 5 min (e ao voltar para a aba); quando há, `updateReady` liga e o
 * Layout mostra o banner "Atualizar" — o jogador escolhe a hora (nunca recarrega no meio de uma partida).
 */
let apply: ((reload?: boolean) => Promise<void>) | null = null;

export function setupPwa() {
  if (!('serviceWorker' in navigator)) return;
  apply = registerSW({
    immediate: true,
    onNeedRefresh() { useAuth.setState({ updateReady: true }); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => reg.update().catch(() => {});
      setInterval(check, 5 * 60_000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });
}

/**
 * Aplica a versão nova e recarrega a página — de um jeito que SEMPRE termina na versão nova:
 *  1. manda o service worker que está esperando assumir (skipWaiting) — o normal é ele assumir e a página recarregar;
 *  2. se em 1,5 s nada aconteceu, tira o registro do service worker e recarrega: sem ele, o navegador busca o
 *     index.html novo direto do servidor e registra o service worker novo (recarregar com o antigo no controle
 *     devolvia a página velha do cache e o banner voltava — caso do PC do dono, 15/09/2026).
 */
export function applyUpdate() {
  useAuth.setState({ updateReady: false });
  let done = false;
  const hard = async () => {
    if (done) return; done = true;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) { r.waiting?.postMessage({ type: 'SKIP_WAITING' }); await r.unregister(); }
      if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
    } catch { /* segue para o reload */ }
    window.location.reload();
  };
  const fallback = setTimeout(hard, 1500);
  if (!apply) { clearTimeout(fallback); hard(); return; }
  // quando o service worker novo assume, a página recarrega sozinha (lib do PWA); o timer acima é a rede de segurança
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!done) { done = true; clearTimeout(fallback); window.location.reload(); } }, { once: true });
  apply(true).catch(() => { clearTimeout(fallback); hard(); });
}
