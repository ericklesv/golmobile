import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { token } from '../lib/api';
import { useAuth } from '../store/auth';
import type { Team } from '../lib/types';
import { Avatar } from './Avatar';
import { Shield } from './Shield';
import { sound } from '../lib/sound';
import { money as fmt } from '../lib/format';

/**
 * Convite do FutPrego (pedido do dono, 14/09/2026): quando alguém desafia, quem está nas telas com as abas
 * vê um cartão pequeno embaixo do topo — "Fulano está te desafiando no FutPrego" — por 10 s. Só existe
 * dentro da Layout, então nunca aparece no meio de minigame, chute ou pênalti. Some quando alguém aceita
 * (o servidor avisa) ou quando o tempo acaba. Conexão leve: /api/ws/futprego?mode=lobby.
 */
interface Invite { id: number; from: { nick: string; avatarUrl: string | null; team: Team }; bet: number; seconds: number; until: number }

export function FutPregoInviteWatcher() {
  const meId = useAuth((s) => s.me?.id);
  const nav = useNavigate();
  const [inv, setInv] = useState<Invite | null>(null);

  useEffect(() => {
    if (!meId) return;
    let closed = false, tries = 0, timer: number | undefined, ws: WebSocket | null = null;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/ws/futprego?mode=lobby&token=${encodeURIComponent(token.get() ?? '')}`);
      ws.onopen = () => { tries = 0; };
      ws.onmessage = (ev) => {
        let m: any; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'invite') { setInv({ id: m.id, from: m.from, bet: m.bet, seconds: m.seconds, until: Date.now() + m.seconds * 1000 }); sound.play('pop'); }
        else if (m.t === 'invite-close') setInv((i) => (i && i.id === m.id ? null : i));
      };
      ws.onerror = () => {};
      ws.onclose = () => { if (closed) return; tries++; timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(tries, 5))); };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, [meId]);

  useEffect(() => {
    if (!inv) return;
    const t = window.setTimeout(() => setInv((i) => (i && i.id === inv.id ? null : i)), Math.max(0, inv.until - Date.now()));
    return () => clearTimeout(t);
  }, [inv]);

  const accept = () => { if (!inv) return; const id = inv.id; setInv(null); nav(`/futprego?aceitar=${id}`); };

  return (
    <div className="pointer-events-none fixed left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 px-3" style={{ top: 'calc(var(--sat) + 90px)' }}>
      <AnimatePresence>
        {inv && (
          <motion.div key={inv.id} role="alert" initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="card-white pointer-events-auto mx-auto flex max-w-[420px] items-center gap-2" style={{ borderRadius: 16 }}>
            <div className="relative shrink-0">
              <Avatar url={inv.from.avatarUrl} size={36} />
              <Shield team={inv.from.team} size={16} className="absolute -bottom-1 -right-1" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-extrabold leading-tight text-navy-ink"><b className="t-display text-[14px]">{inv.from.nick}</b> está te desafiando no FutPrego</div>
              <div className="text-[11px] font-bold text-muted">Cada um põe {fmt(inv.bet)}; quem marcar primeiro leva tudo.</div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-sky/20">
                <motion.div className="h-full bg-grass" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: Math.max(0.1, (inv.until - Date.now()) / 1000), ease: 'linear' }} />
              </div>
            </div>
            <button onClick={accept} className="btn btn-green btn-sm shrink-0">Aceitar</button>
            <button onClick={() => setInv(null)} className="shrink-0 px-1 text-[18px] font-black leading-none text-muted" aria-label="Fechar convite">×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
