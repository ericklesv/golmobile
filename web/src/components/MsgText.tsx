import type { ReactNode } from 'react';

/**
 * Texto de mensagem da caixa com ícones inline e links (pedido do dono, 15/09/2026): tokens entre colchetes viram
 * PNG do pack — `[vip]` coroa, `[coin]` moeda, `[gol]` bola, `[trofeu]`, `[medalha]`, `[estrela]`, `[presente]`,
 * `[caveira]` (Ranking X1), `[energia]`, `[alvo]`, `[aviso]`, `[whatsapp]` — e todo https://… vira link clicável
 * (abre em aba nova). Token desconhecido fica como texto. Vale no jogador e no admin.
 */
export const MSG_ICONS: Record<string, string> = {
  vip: '/ui/ico-crown_silver.png', coin: '/ui/ico-coin01_s.png', saldo: '/ui/ico-coin01_s.png', dinheiro: '/ui/ico-goldpouch.png',
  gol: '/ui/ico-ball.png', trofeu: '/ui/ico-trophy_gold.png', medalha: '/ui/ico-medal_gold.png', estrela: '/ui/ico-star_gold.png',
  presente: '/ui/ico-gift_purple.png', caveira: '/ui/ico-skull_gold.png', energia: '/ui/ico-energy.png', alvo: '/ui/ico-target.png',
  aviso: '/ui/pi-bell.png', whatsapp: '/ui/ico-whatsapp.png',
};
const TOKEN = /\[(\w+)\]|(https?:\/\/[^\s<>"')\]]+)/g;

export function MsgText({ text, className = '', iconSize = 16 }: { text: string; className?: string; iconSize?: number }) {
  const out: ReactNode[] = [];
  let last = 0, i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index!;
    if (m[2]) {
      // link: texto curto (domínio) para não estourar a linha no celular
      const url = m[2];
      let label = url;
      try { const u = new URL(url); label = u.hostname.includes('whatsapp') ? 'grupo do WhatsApp' : u.hostname + (u.pathname !== '/' ? u.pathname : ''); } catch { /* fica a URL */ }
      if (at > last) out.push(text.slice(last, at));
      out.push(<a key={i++} href={url} target="_blank" rel="noopener noreferrer" className="font-extrabold text-sky-deep underline">{label}</a>);
      last = at + m[0].length;
      continue;
    }
    const src = MSG_ICONS[m[1].toLowerCase()];
    if (!src) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push(<img key={i++} src={src} alt={m[1]} className="inline-block align-[-3px]" style={{ width: iconSize, height: iconSize }} />);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <span className={`whitespace-pre-wrap ${className}`}>{out}</span>;
}
