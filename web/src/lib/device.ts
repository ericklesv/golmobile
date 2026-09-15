import { isTwa } from './twa';

/**
 * Código do aparelho (API lib/device.js; dono, 15/09/2026): um código aleatório gravado neste navegador na 1ª visita e
 * mandado em todo pedido (X-Device-Id) e nas conexões ao vivo (?device=). É o mesmo para todas as contas abertas
 * aqui: o painel mostra "mesmo aparelho" e a API deixa no máximo 3 contas ao mesmo tempo por aparelho. Sem
 * localStorage (janela anônima que bloqueia, etc.), vale o código da aba (sessionStorage) ou nenhum.
 */
const KEY = 'brgol.device';
let cached: string | null = null;

function fresh(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function deviceId(): string | null {
  if (cached) return cached;
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const st = store();
      let id = st.getItem(KEY);
      if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) { id = fresh(); st.setItem(KEY, id); }
      return (cached = id);
    } catch { /* bloqueado: tenta o próximo */ }
  }
  return null;
}

/** Cabeçalhos do aparelho para os pedidos à API. */
export function deviceHeaders(): Record<string, string> {
  const id = deviceId();
  return { ...(id ? { 'X-Device-Id': id } : {}), ...(isTwa() ? { 'X-App': 'twa' } : {}) };
}

/** O mesmo, para o endereço dos WebSockets (o navegador não deixa pôr cabeçalho neles). */
export function deviceQuery(): string {
  const id = deviceId();
  return `${id ? `&device=${encodeURIComponent(id)}` : ''}${isTwa() ? '&app=twa' : ''}`;
}
