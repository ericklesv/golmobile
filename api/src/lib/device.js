/**
 * Aparelho do pedido (dono, 15/09/2026: "vários celulares na mesma internet têm de poder jogar; o mesmo PC tem de ser
 * limitado"). Três pistas, todas vindas do próprio aparelho (dá para falsificar — é pista, não prova):
 *   - `id`: código aleatório que o site grava no navegador na 1ª visita (web lib/device.ts) e manda em todo pedido
 *     (cabeçalho X-Device-Id; nos WebSockets, `?device=`). Todas as contas abertas naquele navegador têm o mesmo —
 *     "mesmo aparelho" no painel e a trava de 3 contas por aparelho (lib/security.js).
 *   - app da Play Store: cabeçalho X-App: twa (nos WebSockets, `?app=twa`).
 *   - User-Agent: celular ou PC, sistema e navegador — vira o nome ("Android · Chrome", "Windows · Edge", "App Android").
 */
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function osOf(ua) {
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPod/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'Chromebook';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Outro';
}
function browserOf(ua) {
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return null;
}

/** { id, label, mobile } do pedido HTTP (Express) ou do pedido de WebSocket (query `device`/`app`). */
export function deviceOf(req) {
  let q = null;
  try { q = new URL(req.url || '/', 'http://x').searchParams; } catch { /* sem query */ }
  const rawId = String(req.headers['x-device-id'] || q?.get('device') || '');
  const app = String(req.headers['x-app'] || q?.get('app') || '') === 'twa';
  const ua = String(req.headers['user-agent'] || '');
  const os = osOf(ua), browser = browserOf(ua);
  const mobile = app || /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  return {
    id: ID_RE.test(rawId) ? rawId : null,
    label: app ? `App ${os}` : browser ? `${os} · ${browser}` : os,
    mobile,
  };
}

/** Campos do User para gravar o último aparelho (só o que veio: front antigo sem código não apaga o que já havia). */
export function deviceData(req) {
  const d = deviceOf(req);
  return { ...(d.id ? { deviceId: d.id } : {}), device: d.label, deviceMobile: d.mobile };
}
