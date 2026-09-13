import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { ChatMessage, ChatRoom } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Shield } from '../components/Shield';
import { Tabs, Spinner } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';

const LAST_SEEN_KEY = 'brgol.chat.lastSeen';
export function markChatSeen(id: number) { try { localStorage.setItem(LAST_SEEN_KEY, String(id)); } catch {} }
export function chatLastSeen(): number { try { return Number(localStorage.getItem(LAST_SEEN_KEY) || 0); } catch { return 0; } }

function hhmm(iso: string) { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

export function ChatScreen() {
  const me = useAuth((s) => s.me)!;
  const nav = useNavigate();
  const [room, setRoom] = useState<ChatRoom>('geral');
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [info, setInfo] = useState<{ online: number; canColor: boolean; colors: string[]; colorLevel: number } | null>(null);
  const [text, setText] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  // carga inicial + polling incremental a cada 3 s
  useEffect(() => {
    let alive = true;
    lastId.current = 0; setMsgs(null);
    const load = async () => {
      try {
        const r = await api.chat(room, lastId.current);
        if (!alive) return;
        setInfo({ online: r.online, canColor: r.canColor, colors: r.colors, colorLevel: r.colorLevel });
        if (r.messages.length) {
          lastId.current = r.messages[r.messages.length - 1].id;
          setMsgs((prev) => {
            const merged = [...(prev ?? []), ...r.messages.filter((m) => !(prev ?? []).some((p) => p.id === m.id))];
            return merged.slice(-150);
          });
          if (room === 'geral') markChatSeen(lastId.current);
        } else setMsgs((prev) => prev ?? []);
      } catch { if (alive) setMsgs((prev) => prev ?? []); }
    };
    load();
    const iv = setInterval(load, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [room]);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const m = await api.chatSend(room, t, color ?? undefined);
      setMsgs((prev) => [...(prev ?? []), m].slice(-150));
      lastId.current = Math.max(lastId.current, m.id);
      setText('');
      sound.play('coin');
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="app-frame relative flex min-h-full flex-col" style={{ height: '100dvh' }}>
      <div className="stadium-bg" />
      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav(-1)} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-blue"><img src="/ui/ico-chat.png" className="mr-2 h-7 w-7" alt="" />CHAT</div>
        <span className="trap trap-green text-[11px]">{info?.online ?? 0} online</span>
      </div>
      <div className="relative px-3"><Tabs value={room} onChange={setRoom} items={[{ id: 'geral', label: 'Geral' }, { id: 'time', label: `Torcida do ${me.team.abbr}` }]} /></div>

      <div ref={listRef} className="relative mx-3 mt-2 min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white/90 p-2 shadow-inner">
        {msgs === null ? <div className="flex justify-center py-8"><Spinner /></div> : msgs.length === 0 ? <p className="py-8 text-center text-sm font-bold text-muted">Ninguém falou nada ainda. Puxa o papo!</p> : (
          <ul className="flex flex-col gap-1.5">
            {msgs.map((m) => {
              const mine = m.user.id === me.id;
              return (
                <li key={m.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  <Link to={`/jogador/${encodeURIComponent(m.user.nick)}`} className="relative shrink-0">
                    <Avatar url={m.user.avatarUrl} size={34} />
                    <span className="t-display t-out absolute -bottom-1 -right-1 rounded-full bg-navy-deep px-1 text-[10px] leading-4">{m.user.level}</span>
                  </Link>
                  <div className={`max-w-[78%] rounded-2xl px-3 py-1.5 ${mine ? 'rounded-tr-sm bg-sky/25' : 'rounded-tl-sm bg-sky/10'}`}>
                    <div className="flex items-center gap-1 text-[11px] font-extrabold">
                      <Link to={`/jogador/${encodeURIComponent(m.user.nick)}`} className={m.user.nickColor ? `nick-${m.user.nickColor}` : m.user.vip ? 'text-sky-deep' : 'text-navy-ink'}>{m.user.nick}</Link>
                      {m.user.vip && <img src="/ui/ico-crown_silver.png" className="ico h-3.5 w-3.5" alt="VIP" />}
                      {m.user.team && <Link to={`/time/${m.user.team.slug}`}><Shield team={m.user.team} size={14} /></Link>}
                      <span className="text-[9px] font-bold uppercase text-muted">lvl {m.user.level} · {m.user.levelName}</span>
                      <span className="ml-auto pl-2 text-[9px] font-bold text-muted">{hhmm(m.at)}</span>
                    </div>
                    <p className="break-words text-[14px] font-bold leading-snug" style={{ color: m.color ?? '#14335F', textShadow: m.color ? '0 1px 0 rgba(0,0,0,0.25)' : undefined }}>{m.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={send} className="relative px-3 pb-3 pt-2" style={{ paddingBottom: 'calc(var(--sab) + 12px)' }}>
        {info?.canColor ? (
          <div className="no-drag mb-1 flex items-center gap-1.5 px-1">
            <span className="t-display t-out text-[10px] uppercase">Cor:</span>
            <button type="button" onClick={() => setColor(null)} className={`h-6 w-6 rounded-full border-2 bg-white ${color === null ? 'border-gold' : 'border-white/50'}`} aria-label="sem cor" />
            {info.colors.map((c) => <button type="button" key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-gold scale-110' : 'border-white/50'}`} style={{ background: c }} aria-label={c} />)}
          </div>
        ) : (
          <div className="mb-1 px-1 text-[10px] font-extrabold text-white/80">Mensagens coloridas liberam no nível {info?.colorLevel ?? 8} (Titular).</div>
        )}
        <div className="flex items-end gap-2">
          <input className="field flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={room === 'geral' ? 'Fala pra galera…' : `Fala pra torcida do ${me.team.name}…`} style={color ? { color } : undefined} />
          <button className="btn btn-green btn-md px-5" disabled={busy || !text.trim()}>{busy ? '…' : 'Enviar'}</button>
        </div>
      </form>
    </div>
  );
}
