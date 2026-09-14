/**
 * Estamos rodando dentro do app da Play Store (Trusted Web Activity)?
 * O TWA abre o site com `?src=twa` (startUrl do Bubblewrap, ver docs/PLAY_STORE.md) e o Chrome
 * manda `document.referrer = android-app://<pacote>`. Guardamos em sessionStorage (é por
 * "janela": não vaza para o Chrome comum, que divide o mesmo perfil/localStorage com o TWA).
 * Dentro do app, a compra de VIP por PIX fica escondida (política de pagamentos do Google Play):
 * lá o VIP se compra pelo Google Play Billing; no site, pelo PIX.
 */
const KEY = 'jogagol.twa';

export function detectTwa() {
  try {
    const src = new URLSearchParams(window.location.search).get('src');
    if (src === 'twa' || document.referrer.startsWith('android-app://')) sessionStorage.setItem(KEY, '1');
  } catch { /* sem storage = trata como navegador */ }
}

export function isTwa(): boolean {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
