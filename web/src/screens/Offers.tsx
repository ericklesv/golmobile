import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { ClubState, OfferReceived, OfferStatus } from '../lib/types';
import { Shield } from '../components/Shield';
import { Avatar } from '../components/Avatar';
import { Panel, Spinner, Countdown } from '../components/ui';
import { Sheet, roleLabel, dayMonth } from '../components/Club';
import { toast } from '../components/Toast';
import { timeAgo } from '../lib/format';
import { sound } from '../lib/sound';

/**
 * Propostas de contratação (api/src/services/club.js): o contrato do jogador, as propostas que ele recebeu
 * (aceitar/recusar), as que fez como dirigente (cancelar) e os VIPs que recebeu de colegas.
 */

const STATUS: Record<OfferStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Aguardando', cls: 'bg-gold/30 text-navy-ink' },
  ACCEPTED: { label: 'Aceita', cls: 'bg-grass/25 text-grass-deep' },
  REFUSED: { label: 'Recusada', cls: 'bg-orange/20 text-orange-deep' },
  CANCELED: { label: 'Cancelada', cls: 'bg-muted/15 text-muted' },
  EXPIRED: { label: 'Venceu', cls: 'bg-muted/15 text-muted' },
};

export function OffersScreen() {
  const refresh = useAuth((s) => s.refresh);
  const [st, setSt] = useState<ClubState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<OfferReceived | null>(null);
  const [signed, setSigned] = useState<{ offer: OfferReceived; until: number } | null>(null);

  const apply = (s: ClubState) => { setSt(s); useAuth.setState({ offers: s.received.length }); };
  useEffect(() => { api.club().then(apply).catch((e) => toast((e as Error).message, 'error')); }, []);

  async function run(fn: () => Promise<ClubState>, ok?: string) {
    if (busy) return null;
    setBusy(true);
    try { const s = await fn(); apply(s); if (ok) toast(ok, 'success'); await refresh(); return s; }
    catch (e) { toast((e as Error).message, 'error'); api.club().then(apply).catch(() => {}); return null; }
    finally { setBusy(false); }
  }
  async function accept(o: OfferReceived) {
    setConfirm(null);
    const s = await run(() => api.offerAccept(o.id));
    if (s) { sound.play('goal'); setSigned({ offer: o, until: s.contract?.until ?? Date.now() + o.days * 86_400_000 }); }
  }

  if (!st) return <div className="flex justify-center py-10"><Spinner /></div>;
  const openSent = st.sent.filter((o) => o.status === 'PENDING').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center"><div className="ribbon ribbon-orange">PROPOSTAS</div></div>

      <section className="panel-navy">
        <div className="flex items-center gap-3">
          <img src="/ui/ico-pass_golden.png" alt="" className={`h-12 w-16 shrink-0 object-contain ${st.contract ? '' : 'opacity-50 grayscale'}`} />
          <div className="min-w-0 flex-1">
            <div className="t-display t-out text-[19px] leading-tight">{st.contract ? `Contrato com o ${st.team.name} até ${dayMonth(st.contract.until)}` : 'Sem contrato'}</div>
            <div className="text-[12px] font-bold leading-snug text-white/85">
              {st.contract ? 'Até lá você não troca de time nem aceita outra proposta.' : 'Presidentes e diretores de outros times podem te fazer propostas.'}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-extrabold text-white/90">
          <span>{st.bank} VIP guardados</span>
          {st.role && <span className="trap trap-orange text-[10px] uppercase">{roleLabel(st.role)} do {st.team.abbr}</span>}
        </div>
      </section>

      <Panel title="PARA VOCÊ" ribbon="orange">
        {st.received.length === 0 ? (
          <p className="py-3 text-center text-[13px] font-bold text-muted">Nenhuma proposta agora. Quem marca muitos gols chama a atenção dos presidentes.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {st.received.map((o) => (
              <li key={o.id} className="rounded-2xl border-2 border-gold bg-white p-3">
                <div className="flex items-center gap-3">
                  <Link to={`/time/${o.team.slug}`} className="shrink-0"><Shield team={o.team} size={56} /></Link>
                  <div className="min-w-0 flex-1">
                    <div className="t-display truncate text-[19px] leading-tight text-navy-ink">{o.team.name} quer você</div>
                    <div className="text-[12px] font-bold text-muted">Série {o.team.serie} · proposta de <Link to={`/jogador/${encodeURIComponent(o.from.nick)}`} className="font-extrabold text-sky-deep">{o.from.nick}</Link>{o.from.role ? ` (${roleLabel(o.from.role)})` : ''}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-center gap-3 rounded-xl bg-gold/20 py-2">
                  <span className="flex items-center gap-1"><img src="/ui/ico-crown_silver.png" alt="" className="h-8 w-8" /><span className="t-display text-[28px] leading-none text-navy-ink">{o.vip} VIP</span></span>
                  <span className="trap trap-blue text-[11px]">contrato de {o.days} {o.days === 1 ? 'dia' : 'dias'}</span>
                </div>
                {o.message && <p className="mt-2 rounded-xl bg-sky/10 px-3 py-2 text-[13px] font-bold italic leading-snug text-navy-ink">“{o.message}”</p>}
                <p className="mt-2 text-center text-[11px] font-extrabold text-muted">Responda em <Countdown readyAt={o.expiresAt} className="text-orange-deep" /></p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setConfirm(o)} disabled={busy} className="btn btn-green btn-md flex-1">Aceitar</button>
                  <button onClick={() => window.confirm(`Recusar a proposta do ${o.team.name}?`) && run(() => api.offerRefuse(o.id), 'Proposta recusada.')} disabled={busy} className="btn btn-gray btn-md">Recusar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {(st.role || st.sent.length > 0) && (
        <Panel title="QUE VOCÊ FEZ" ribbon="blue">
          {st.sent.length === 0 ? (
            <p className="py-2 text-center text-[13px] font-bold text-muted">Para contratar, abra o perfil de um jogador de outro time e toque em Fazer proposta.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {st.sent.map((o) => (
                <li key={o.id} className="flex items-center gap-2 rounded-xl bg-sky/10 px-2 py-1.5">
                  <Link to={`/jogador/${encodeURIComponent(o.to.nick)}`} className="relative shrink-0"><Avatar url={o.to.avatarUrl} size={34} /><Shield team={o.to.team} size={18} className="absolute -bottom-1 -right-1" /></Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/jogador/${encodeURIComponent(o.to.nick)}`} className="t-display block truncate text-[14px] text-navy-ink">{o.to.nick}</Link>
                    <div className="text-[11px] font-bold text-muted">{o.vip} VIP · {o.status === 'PENDING' ? <>vence em <Countdown readyAt={o.expiresAt} /></> : timeAgo(o.decidedAt ?? o.createdAt)}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-display text-[11px] ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                  {o.status === 'PENDING' && <button onClick={() => window.confirm(`Cancelar a proposta para ${o.to.nick}? Os ${o.vip} VIP voltam para você.`) && run(() => api.offerCancel(o.id), 'Proposta cancelada. O VIP voltou para você.')} disabled={busy} className="btn btn-gray btn-sm shrink-0 !min-h-[32px] !text-[11px]">Cancelar</button>}
                </li>
              ))}
            </ul>
          )}
          {openSent > 0 && <p className="mt-2 text-center text-[11px] font-bold text-muted">O VIP das propostas abertas fica separado e volta se não fechar.</p>}
        </Panel>
      )}

      {st.gifts.length > 0 && (
        <Panel title="VIP QUE VOCÊ GANHOU" ribbon="green">
          <ul className="flex flex-col gap-1 text-[13px] font-extrabold text-navy-ink">
            {st.gifts.map((g) => <li key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-sky/10 px-2 py-1"><span className="flex items-center gap-2"><img src="/ui/ico-gift_blue.png" alt="" className="h-5 w-5" />{g.nick} mandou {g.days} VIP</span><span className="text-[11px] text-muted">{timeAgo(g.at)}</span></li>)}
          </ul>
        </Panel>
      )}

      <AnimatePresence>
        {confirm && (
          <Sheet key="confirm" labelId="accept-title" onClose={() => setConfirm(null)}>
            <Shield team={confirm.team} size={72} className="mx-auto" />
            <div id="accept-title" className="t-display mt-1 text-[22px] leading-tight">Jogar pelo {confirm.team.name}?</div>
            <ul className="mt-2 flex flex-col gap-1 rounded-xl bg-sky/10 p-3 text-left text-[13px] font-bold leading-snug">
              <li>Você ganha <b>{confirm.vip} {confirm.vip === 1 ? 'dia' : 'dias'} de VIP</b>, valendo na hora.</li>
              <li>Fica <b>{confirm.days} {confirm.days === 1 ? 'dia' : 'dias'}</b> no {confirm.team.name} sem poder trocar de time.</li>
              <li>Seus gols passam a contar para o {confirm.team.name} a partir de agora.</li>
              {st.role && <li className="text-orange-deep">Você sai da diretoria do {st.team.name}.</li>}
              {st.received.length > 1 && <li className="text-muted">As outras propostas são recusadas.</li>}
            </ul>
            <button onClick={() => accept(confirm)} disabled={busy} className="btn btn-green btn-md mt-3 w-full">Aceitar proposta</button>
            <button onClick={() => setConfirm(null)} className="btn btn-blue btn-sm mt-2 w-full">Voltar</button>
          </Sheet>
        )}
        {signed && <SignedSheet key="signed" offer={signed.offer} until={signed.until} onClose={() => setSigned(null)} />}
      </AnimatePresence>
    </div>
  );
}

/** Comemoração da contratação: o escudo do time novo entra e o contrato aparece. */
function SignedSheet({ offer, until, onClose }: { offer: OfferReceived; until: number; onClose: () => void }) {
  const nav = useNavigate();
  return (
    <Sheet labelId="signed-title" onClose={onClose}>
      <motion.div initial={{ scale: 0.4 }} animate={{ scale: [0.4, 1.12, 1] }} id="signed-title" className="ribbon ribbon-green mx-auto -mt-1 w-[90%]">CONTRATADO!</motion.div>
      <motion.div initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.15 }} className="mx-auto mt-3 w-fit">
        <Shield team={offer.team} size={96} />
      </motion.div>
      <div className="t-display mt-2 text-[20px] leading-tight">Agora você joga pelo {offer.team.name}</div>
      <p className="mt-1 text-[13px] font-extrabold text-grass-deep">+{offer.vip} {offer.vip === 1 ? 'dia' : 'dias'} de VIP, já valendo</p>
      <p className="text-[12px] font-bold text-muted">Contrato até {dayMonth(until)}</p>
      <button onClick={() => { onClose(); nav('/time'); }} className="btn btn-green btn-md mt-4 w-full">Ver meu time</button>
      <button onClick={onClose} className="btn btn-blue btn-sm mt-2 w-full">Fechar</button>
    </Sheet>
  );
}
