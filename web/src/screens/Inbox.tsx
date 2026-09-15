import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { InboxMessage, InboxPage } from '../lib/types';
import { Panel, Spinner, Empty } from '../components/ui';
import { toast } from '../components/Toast';
import { timeAgo } from '../lib/format';
import { MsgText } from '../components/MsgText';

/**
 * Caixa de mensagens (pedido do dono, 15/09/2026): avisos dos admins e do jogo — compra aprovada, VIP/saldo
 * recebidos, presentes (convite, doação, prêmio do X1) e atualizações. Tocar numa mensagem abre e marca
 * como lida; "Marcar todas" zera o selo do envelope (o número vem do /api/me e do heartbeat).
 */
const KIND: Record<string, { icon: string; label: string }> = {
  ADMIN: { icon: '/ui/pi-setting.png', label: 'Administração' },
  AVISO: { icon: '/ui/pi-bell.png', label: 'Aviso' },
  COMPRA: { icon: '/ui/ico-crown_silver.png', label: 'Compra' },
  PRESENTE: { icon: '/ui/ico-gift_purple.png', label: 'Presente' },
  PREMIO: { icon: '/ui/ico-trophy_s.png', label: 'Prêmio' },
};

export function InboxScreen() {
  const nav = useNavigate();
  const [data, setData] = useState<InboxPage | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);

  const load = (p: number) => api.inbox(p).then((r) => { setData(r); useAuth.setState({ unread: r.unread }); }).catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => { load(page); }, [page]);

  async function openMsg(m: InboxMessage) {
    setOpen(open === m.id ? null : m.id);
    if (m.read) return;
    try {
      const r = await api.inboxRead(m.id);
      setData((d) => (d ? { ...d, unread: r.unread, messages: d.messages.map((x) => (x.id === m.id ? { ...x, read: true } : x)) } : d));
      useAuth.setState({ unread: r.unread });
    } catch { /* fica como não lida; nada grave */ }
  }
  async function readAll() {
    try { await api.inboxReadAll(); setData((d) => (d ? { ...d, unread: 0, messages: d.messages.map((x) => ({ ...x, read: true })) } : d)); useAuth.setState({ unread: 0 }); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="app-frame relative flex min-h-full flex-col" style={{ minHeight: '100dvh' }}>
      <div className="stadium-bg" />
      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav(-1)} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-blue"><img src="/ui/ico-mail.png" className="mr-2 h-6 w-6" alt="" />MENSAGENS</div>
        <div className="w-12" />
      </div>
      <div className="relative flex-1 px-3 pb-6">
        <Panel title={data ? (data.unread > 0 ? `${data.unread} ${data.unread === 1 ? 'NÃO LIDA' : 'NÃO LIDAS'}` : 'TUDO LIDO') : 'CAIXA DE ENTRADA'} ribbon={data && data.unread > 0 ? 'orange' : 'green'}>
          {!data ? <div className="flex justify-center py-8"><Spinner /></div> : data.messages.length === 0 ? <Empty text="Nenhuma mensagem ainda. Avisos de compras, presentes e novidades do jogo chegam aqui." /> : (
            <>
              {data.unread > 0 && <button onClick={readAll} className="btn btn-gray btn-sm mb-2 w-full">Marcar todas como lidas</button>}
              <ul className="flex flex-col gap-1.5">
                {data.messages.map((m) => {
                  const k = KIND[m.kind] ?? KIND.AVISO;
                  return (
                    <li key={m.id}>
                      <button onClick={() => openMsg(m)} className={`no-drag w-full rounded-xl px-2 py-2 text-left ${m.read ? 'bg-sky/10' : 'bg-gold/25 ring-1 ring-gold/70'}`}>
                        <div className="flex items-center gap-2">
                          <img src={m.icon ?? k.icon} alt="" className="h-7 w-7 shrink-0 object-contain" />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[14px] leading-tight ${m.read ? 'font-bold text-navy-ink' : 'font-extrabold text-navy-ink'}`}>{m.title}</span>
                            <span className="block text-[10px] font-bold text-muted">{k.label}{m.from ? ` · ${m.from}` : ''} · {timeAgo(m.at)}</span>
                          </span>
                          {!m.read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-deep" aria-label="não lida" />}
                        </div>
                        {open === m.id && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-[13px] font-bold leading-snug text-navy-ink"><MsgText text={m.text} /></motion.p>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {data.pages > 1 && (
                <div className="mt-2 flex items-center justify-between">
                  <button className="btn btn-gray btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                  <span className="t-display text-sm text-navy-ink">pág. {data.page}/{data.pages}</span>
                  <button className="btn btn-gray btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
