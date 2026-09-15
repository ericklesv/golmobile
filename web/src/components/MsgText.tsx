import type { ReactNode, MouseEvent } from 'react';
import { Link } from 'react-router-dom';

/**
 * Texto de mensagem da caixa (pedido do dono, 15/09/2026) com:
 *  - ícones inline: `[vip]` coroa, `[coin]` moeda, `[gol]` bola, `[trofeu]`, `[medalha]`, `[estrela]`, `[presente]`,
 *    `[caveira]` (Ranking X1), `[energia]`, `[alvo]`, `[aviso]`, `[whatsapp]` (PNG do pack);
 *  - links escondidos num texto: `[clique aqui](https://…)` — e https://… solto também vira link (abre em aba nova);
 *    `[texto](/rota)` é link de dentro do jogo (react-router, sem recarregar) — usado nas mensagens de prêmio;
 *  - menção a jogador: `@nick` vira link para o perfil dele (incentiva quem dá sugestão).
 * Token desconhecido fica como texto. Vale no jogador e no admin. Os links NÃO podem ficar dentro de um <button>
 * (o clique só abriria/fechava a mensagem): o corpo da mensagem fica fora do botão do cabeçalho.
 */
export const MSG_ICONS: Record<string, string> = {
  vip: '/ui/ico-crown_silver.png', coin: '/ui/ico-coin01_s.png', saldo: '/ui/ico-coin01_s.png', dinheiro: '/ui/ico-goldpouch.png',
  gol: '/ui/ico-ball.png', trofeu: '/ui/ico-trophy_gold.png', medalha: '/ui/ico-medal_gold.png', estrela: '/ui/ico-star_gold.png',
  presente: '/ui/ico-gift_purple.png', caveira: '/ui/ico-skull_gold.png', energia: '/ui/ico-energy.png', alvo: '/ui/ico-target.png',
  aviso: '/ui/pi-bell.png', whatsapp: '/ui/ico-whatsapp.png',
};
// 1 = link com texto [texto](url) · 2/3 = seus grupos · 4 = ícone [nome] · 5 = URL solta · 6 = @nick
const TOKEN = /(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\))|\[(\w+)\]|(https?:\/\/[^\s<>"')\]]+)|@([A-Za-z0-9_.\-]{3,14})/g;
const stop = (e: MouseEvent) => e.stopPropagation();

export function MsgText({ text, className = '', iconSize = 16 }: { text: string; className?: string; iconSize?: number }) {
  const out: ReactNode[] = [];
  let last = 0, i = 0;
  const push = (node: ReactNode, at: number, len: number) => { if (at > last) out.push(text.slice(last, at)); out.push(node); last = at + len; };
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index!;
    if (m[1] && m[3].startsWith('/')) { // [texto](/rota) — dentro do jogo
      push(<Link key={i++} to={m[3]} onClick={stop} className="font-extrabold text-sky-deep underline">{m[2]}</Link>, at, m[0].length);
    } else if (m[1]) { // [texto](url)
      push(<a key={i++} href={m[3]} target="_blank" rel="noopener noreferrer" onClick={stop} className="font-extrabold text-sky-deep underline">{m[2]}</a>, at, m[0].length);
    } else if (m[4]) { // [ícone]
      const src = MSG_ICONS[m[4].toLowerCase()];
      if (!src) continue;
      push(<img key={i++} src={src} alt={m[4]} className="inline-block align-[-3px]" style={{ width: iconSize, height: iconSize }} />, at, m[0].length);
    } else if (m[5]) { // URL solta: mostra só o domínio
      let label = m[5];
      try { const u = new URL(m[5]); label = u.hostname.includes('whatsapp') ? 'grupo do WhatsApp' : u.hostname; } catch { /* fica a URL */ }
      push(<a key={i++} href={m[5]} target="_blank" rel="noopener noreferrer" onClick={stop} className="font-extrabold text-sky-deep underline">{label}</a>, at, m[0].length);
    } else if (m[6]) { // @nick → perfil
      push(<Link key={i++} to={`/jogador/${encodeURIComponent(m[6])}`} onClick={stop} className="font-extrabold text-orange-deep">@{m[6]}</Link>, at, m[0].length);
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return <span className={`whitespace-pre-wrap ${className}`}>{out}</span>;
}
