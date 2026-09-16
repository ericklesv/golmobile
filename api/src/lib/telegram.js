/**
 * Avisos no Telegram para o dono (pedido de 15/09/2026): mesmo bot e mesmo chat do Managol
 * (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` no api/.env; vazios = desligado, nada quebra).
 * Toda mensagem começa com "⚽ JogaGol" para não confundir com as do Managol.
 *
 *   tg.info(texto)  — 👤 cadastro, 💰 pagamento, 🚀 API subiu, 🛡️ ação do painel…
 *   tg.warn(texto)  — ⚠️ segurança: cadastro barrado, conta trancada, denúncia, fail2ban…
 *   tg.error(texto) — 🔴 erro 500, exceção não tratada, scheduler, Efí…
 *
 * Opções: { key, every } = no máximo 1 aviso com essa chave a cada `every` ms; os repetidos são
 * contados e aparecem como "(+N iguais em X min)" no próximo envio — assim uma varredura ou uma
 * enxurrada de cadastros não vira 500 mensagens. Fila com 1 envio/s (limite do Telegram por chat);
 * na rajada, várias mensagens curtas vão juntas numa só. Fire-and-forget: nunca lança.
 * Texto em HTML (use tg.esc() para dados vindos do usuário).
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const TAG = '⚽ <b>JogaGol</b>';
const MAX_LEN = 3800;

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => `R$ ${Number(n).toFixed(2).replace('.', ',')}`;

const queue = [];
let timer = null;
const throttled = new Map(); // key -> { until, suppressed }

async function flush() {
  timer = null;
  if (!queue.length) return;
  // junta o que está na fila numa mensagem só (até o limite do Telegram)
  let text = '';
  while (queue.length && (text + queue[0]).length < MAX_LEN) text += (text ? '\n\n' : '') + queue.shift();
  if (!text) text = queue.shift().slice(0, MAX_LEN);
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn(`[telegram] envio falhou (${res.status}): ${(await res.text()).slice(0, 160)}`);
  } catch (e) {
    console.warn('[telegram] erro:', e.message);
  }
  if (queue.length) timer = setTimeout(flush, 1100);
}

function send(prefix, text, { key, every } = {}) {
  if (!TOKEN || !CHAT) return;
  let suffix = '';
  if (key && every) {
    const now = Date.now();
    const t = throttled.get(key);
    if (t && t.until > now) { t.suppressed += 1; return; }
    if (t?.suppressed) suffix = ` <i>(+${t.suppressed} iguais em ${Math.round(every / 60_000)} min)</i>`;
    throttled.set(key, { until: now + every, suppressed: 0 });
    if (throttled.size > 5000) for (const [k, v] of throttled) if (v.until < now) throttled.delete(k);
  }
  queue.push(`${TAG} ${prefix} ${text}${suffix}`);
  if (!timer) timer = setTimeout(flush, 300);
}

/** Manda uma foto (PNG em Buffer) com legenda em HTML (até 1024 caracteres) — relatório diário. Direto, sem fila. */
async function photo(png, caption) {
  if (!TOKEN || !CHAT) return false;
  try {
    const form = new FormData();
    form.append('chat_id', CHAT);
    form.append('caption', caption.slice(0, 1024));
    form.append('parse_mode', 'HTML');
    form.append('photo', new Blob([png], { type: 'image/png' }), 'relatorio.png');
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
    if (!res.ok) { console.warn(`[telegram] foto falhou (${res.status}): ${(await res.text()).slice(0, 160)}`); return false; }
    return true;
  } catch (e) { console.warn('[telegram] foto erro:', e.message); return false; }
}

export const tg = {
  enabled: () => !!(TOKEN && CHAT),
  photo,
  esc, money,
  info: (text, opts) => send('ℹ️', text, opts),
  warn: (text, opts) => send('⚠️', text, opts),
  error: (text, opts) => send('🔴', text, opts),
};
