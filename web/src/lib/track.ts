/**
 * Eventos de uso (funil dos novatos — recomendação 8 do relatório de retenção; dono, 18/09/2026): o que o jogador
 * VIU e FEZ, para o relatório do painel dizer em qual tela quem some fecha o app. Vai em lotes para
 * `POST /api/events` (api/src/routes/events.js), com ou sem login; o código do aparelho liga a landing e o
 * cadastro à conta criada depois. Ao esconder/fechar a aba, o lote sai por `sendBeacon` (o navegador entrega
 * mesmo com a página morrendo) — por isso o token e o aparelho vão no CORPO, não em cabeçalho.
 *
 * Eventos:
 *  - `app.abriu` { tela, ref, twa, pwa } · `app.saiu` { tela, seg } (aba escondida/fechada; seg = tempo visível) ·
 *    `app.voltou` — instalados por `installTracking()` (App.tsx)
 *  - `tela.<rota>` a cada tela (`trackScreen`, no TrackWatcher do App) — `home`, `penalti`, `termo`, `x1`, `chat`…
 *  - `app.abriu` e `cadastro.ok` levam `origem` { src, med, camp, term, gclid } quando a pessoa chegou por anúncio
 *  - `cadastro.ok` (store/auth.ts) · `recarga.vista` (Home: todos os chutes em recarga) · `slider.visto` (slider
 *    de minigames apareceu na tela) · `erro.tela` { msg } (ErrorBoundary)
 * Nunca atrapalha o jogo: qualquer falha é engolida.
 */
import { token } from './api';
import { deviceId } from './device';
import { isTwa } from './twa';

const BASE = import.meta.env.VITE_API_URL || '';
type Ev = { name: string; data?: Record<string, unknown>; at: number };
let queue: Ev[] = [];
let timer: number | null = null;
let currentScreen = '';
let visibleSince = Date.now();
let hidden = false;
let installed = false;

export function track(name: string, data?: Record<string, unknown>) {
  try {
    queue.push({ name, data, at: Date.now() });
    if (queue.length >= 15) flush();
    else if (!timer) timer = window.setTimeout(() => flush(), 3000);
  } catch { /* nunca atrapalha */ }
}

export function flush(beacon = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const now = Date.now();
  const batch = queue.splice(0, 25);
  const body = JSON.stringify({ token: token.get() ?? undefined, device: deviceId() ?? undefined, events: batch.map((e) => ({ name: e.name, data: e.data, ago: now - e.at })) });
  try {
    if (beacon && navigator.sendBeacon) navigator.sendBeacon(`${BASE}/api/events`, new Blob([body], { type: 'application/json' }));
    else fetch(`${BASE}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* nada */ }
  if (queue.length) timer = window.setTimeout(() => flush(), 1000);
}

/** Nome da tela a partir da rota: "/" → home, "/jogador/fulano" → jogador, "/bem-vindo" → landing. */
export function screenOf(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || 'home';
  return seg === 'bem-vindo' ? 'landing' : seg.toLowerCase().slice(0, 30);
}

/** Chamado a cada troca de rota (TrackWatcher). Repetir a mesma tela não conta. */
export function trackScreen(pathname: string) {
  const s = screenOf(pathname);
  if (s === currentScreen) return;
  currentScreen = s;
  track(`tela.${s}`);
}

/**
 * De onde a pessoa veio (Google Ads, 24/09/2026): `utm_*` e `gclid` da URL de entrada. Fica no aparelho por 30 dias
 * (clicou hoje, pode criar a conta amanhã) e vai no `app.abriu` (só na visita que chegou com eles) e no `cadastro.ok`
 * — é o que deixa o banco dizer quantos que vieram do anúncio criaram conta e voltaram.
 */
type Origem = { src?: string; med?: string; camp?: string; term?: string; gclid?: true };
const ORIGEM_KEY = 'brgol.origem';
const ORIGEM_MS = 30 * 86_400_000;

function origemDaUrl(): Origem | null {
  try {
    const q = new URLSearchParams(location.search);
    const v = (k: string) => q.get(k)?.trim().slice(0, 40) || undefined;
    const o: Origem = { src: v('utm_source'), med: v('utm_medium'), camp: v('utm_campaign'), term: v('utm_term'), gclid: q.get('gclid') ? true : undefined };
    return o.src || o.camp || o.gclid ? o : null;
  } catch { return null; }
}

/** A última origem de anúncio deste aparelho nos últimos 30 dias (para o `cadastro.ok`). */
export function origem(): Origem | undefined {
  try {
    const s = JSON.parse(localStorage.getItem(ORIGEM_KEY) || 'null');
    return s && Date.now() - s.at < ORIGEM_MS ? s.o : undefined;
  } catch { return undefined; }
}

/** Abertura, saída (com os segundos visíveis) e volta do app. Uma vez por carregamento. */
export function installTracking() {
  if (installed) return; // StrictMode roda o efeito duas vezes no dev
  installed = true;
  try {
    let ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch { ref = ''; }
    const pwa = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    const o = origemDaUrl();
    if (o) { try { localStorage.setItem(ORIGEM_KEY, JSON.stringify({ o, at: Date.now() })); } catch { /* sem armazenamento */ } }
    // currentScreen fica vazio de propósito: o TrackWatcher manda o `tela.<rota>` da primeira tela logo em seguida
    track('app.abriu', { tela: screenOf(location.pathname), ref: ref || undefined, twa: isTwa() || undefined, pwa: pwa || undefined, origem: o ?? undefined });
    const leave = () => {
      if (hidden) return;
      hidden = true;
      track('app.saiu', { tela: currentScreen, seg: Math.round((Date.now() - visibleSince) / 1000) });
      flush(true);
    };
    const back = () => { if (!hidden) return; hidden = false; visibleSince = Date.now(); track('app.voltou', { tela: currentScreen }); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); else back(); });
    window.addEventListener('pagehide', leave);
  } catch { /* nada */ }
}
