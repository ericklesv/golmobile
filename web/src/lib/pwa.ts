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

/** Aplica a versão nova e recarrega. */
export function applyUpdate() {
  if (apply) apply(true); else window.location.reload();
}
