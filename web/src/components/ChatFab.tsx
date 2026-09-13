import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { chatLastSeen } from '../screens/Chat';

/** Botão flutuante do chat com contador de mensagens novas (sala geral), acima da barra de abas. */
export function ChatFab() {
  const nav = useNavigate();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const check = () => api.chat('geral', chatLastSeen()).then((r) => alive && setUnread(r.messages.length)).catch(() => {});
    check();
    const iv = setInterval(check, 20_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return (
    <button onClick={() => nav('/chat')} aria-label="Chat" className="no-drag fixed right-3 z-40 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-sky shadow-[0_6px_0_#0B2D6B,0_10px_20px_rgba(0,0,0,0.4)] transition active:translate-y-1 active:shadow-[0_2px_0_#0B2D6B]" style={{ bottom: 'calc(var(--sab) + 92px)', left: 'min(calc(50% + 240px - 68px), calc(100% - 68px))' }}>
      <img src="/ui/ico-chat.png" className="h-8 w-8" alt="" />
      {unread > 0 && <span className="t-display absolute -right-1 -top-1 min-w-[22px] rounded-full border-2 border-white bg-card px-1 text-center text-[11px] leading-[18px] text-white">{unread > 60 ? '60+' : unread}</span>}
    </button>
  );
}
