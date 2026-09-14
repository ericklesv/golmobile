import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { RefInviter, RefState } from '../lib/types';
import { Avatar } from './Avatar';
import { Shield } from './Shield';
import { Panel, Spinner } from './ui';
import { toast } from './Toast';
import { num } from '../lib/format';

/**
 * Convites — link de afiliado (api/src/services/referral.js). /convite/<código> guarda o código no
 * aparelho e leva ao cadastro; o cadastro manda o código e mostra quem convidou. No Perfil, o painel com o
 * link, a escada de gols (25 → 1000) e os convidados com a barra até o próximo marco.
 */

const KEY = 'brgol.convite';
export const savedInvite = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const clearInvite = () => { try { localStorage.removeItem(KEY); } catch {} };

/** Rota /convite/:code — guarda o convite e vai para o cadastro (quem já tem conta vai para o jogo). */
export function InviteRoute({ logged }: { logged: boolean }) {
  const { code } = useParams();
  if (!logged && code) { try { localStorage.setItem(KEY, code.toUpperCase().slice(0, 16)); } catch {} }
  return <Navigate to={logged ? '/' : '/cadastro'} replace />;
}

/** Aviso no cadastro: "Convite de fulano". */
export function InviteBanner() {
  const [inv, setInv] = useState<RefInviter | null>(null);
  useEffect(() => {
    const code = savedInvite();
    if (code) api.refLookup(code).then(setInv).catch(() => clearInvite()); // código inválido: esquece
  }, []);
  if (!inv) return null;
  return (
    <div className="card-green flex items-center gap-3" style={{ borderRadius: 18 }}>
      <span className="relative shrink-0"><Avatar url={inv.avatarUrl} size={42} /><Shield team={inv.team} size={20} className="absolute -bottom-1 -right-1" /></span>
      <p className="min-w-0 flex-1 text-[13px] font-extrabold leading-snug text-white">
        Convite de <span className="t-gold t-display text-[15px]">{inv.nick}</span>. Quando você marcar gols, {inv.nick} ganha VIP.
      </p>
    </div>
  );
}

/** A escada de gols: 7 marcos numa trilha; o de 1000 gols vale 10 VIP e é o maior. */
function Ladder({ st }: { st: RefState }) {
  const last = st.milestones.length - 1;
  return (
    <div className="relative mt-1 px-1 pt-1">
      <div className="absolute left-5 right-5 top-[21px] h-1.5 rounded-full bg-sky/25" aria-hidden />
      <ol className="relative flex items-start justify-between">
        {st.milestones.map((m, i) => (
          <li key={m.goals} className="flex flex-col items-center">
            <span className={`flex items-center justify-center rounded-full border-2 font-display leading-none ${i === last ? 'h-11 w-11 border-gold-deep bg-gold text-[12px] text-navy-ink shadow-md' : 'h-9 w-9 border-sky/60 bg-white text-[11px] text-navy-ink'}`}>{num(m.goals)}</span>
            <span className="mt-0.5 flex items-center gap-0.5 font-display text-[12px] text-grass-deep"><img src="/ui/ico-crown_silver.png" alt="" className="h-3.5 w-3.5" />+{m.vip}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-center text-[11px] font-bold text-muted">Gols do seu amigo. Até <b className="text-navy-ink">{st.perFriend} VIP</b> por amigo, e os VIPs caem no seu banco.</p>
    </div>
  );
}

/** Painel do Perfil: link, escada, resumo e convidados. */
export function InvitePanel() {
  const [st, setSt] = useState<RefState | null>(null);
  useEffect(() => { api.refMe().then(setSt).catch(() => {}); }, []);
  const link = st ? `${window.location.origin}/convite/${st.code}` : '';
  const shown = link.replace(/^https?:\/\//, '');
  const msg = `Bora jogar JogaGol comigo? Escolhe seu time e faz gol pra ele: ${link}`;

  async function copy() {
    try { await navigator.clipboard.writeText(link); toast('Link de convite copiado!', 'success'); }
    catch { toast('Não deu para copiar. Toque e segure no link para copiar.', 'error'); }
  }

  return (
    <Panel title="CONVIDE AMIGOS" ribbon="green">
      {!st ? <div className="flex justify-center py-4"><Spinner /></div> : (
        <>
          <p className="text-center text-[12px] font-bold leading-snug text-muted">Mande seu link. Quem criar conta por ele vira seu convidado, e você ganha VIP a cada marco de gols dele.</p>
          <div className="mt-2 break-all rounded-xl border-2 border-dashed border-sky/50 bg-sky/10 px-3 py-2 text-center font-display text-[16px] text-navy-ink select-all">{shown}</div>
          <div className="mt-2 flex gap-2">
            <button onClick={copy} className="btn btn-blue btn-md flex-1">Copiar link</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" className="btn btn-green btn-md flex-1">WhatsApp</a>
          </div>

          <div className="mt-3"><Ladder st={st} /></div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-sky/10 py-1.5"><div className="font-display text-[22px] text-navy-ink">{st.count}</div><div className="label">{st.count === 1 ? 'amigo convidado' : 'amigos convidados'}</div></div>
            <div className="rounded-xl bg-gold/20 py-1.5"><div className="flex items-center justify-center gap-1 font-display text-[22px] text-navy-ink"><img src="/ui/ico-crown_silver.png" alt="" className="h-6 w-6" />{st.earned}</div><div className="label">VIP ganhos</div></div>
          </div>

          {st.invited.length === 0 ? (
            <p className="mt-3 text-center text-[12px] font-bold text-muted">Ninguém entrou pelo seu link ainda. Mande para um amigo que gosta de futebol.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {st.invited.map((f) => {
                const prev = [...st.milestones].reverse().find((m) => m.goals <= f.goals)?.goals ?? 0;
                const pct = f.next ? Math.round(((f.goals - prev) / (f.next.goals - prev)) * 100) : 100;
                return (
                  <li key={f.nick} className="rounded-xl bg-sky/10 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="relative shrink-0"><Avatar url={f.avatarUrl} size={30} /><Shield team={f.team} size={16} className="absolute -bottom-1 -right-1" /></span>
                      <span className="t-display min-w-0 flex-1 truncate text-[14px] text-navy-ink">{f.nick}</span>
                      {f.earned > 0 && <span className="flex shrink-0 items-center gap-0.5 font-display text-[13px] text-grass-deep"><img src="/ui/ico-crown_silver.png" alt="" className="h-4 w-4" />+{f.earned}</span>}
                    </div>
                    <div className="bar mt-1" style={{ height: 16 }}>
                      <i style={{ width: `calc(${pct}% + 6px)` }} />
                      <span style={{ fontSize: 10 }}>{f.next ? `${num(f.goals)} de ${num(f.next.goals)} gols · próximo +${f.next.vip} VIP` : `${num(f.goals)} gols · todos os marcos pagos`}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-center text-[10px] font-bold text-muted">Conta criada na mesma internet que a sua não conta como convite.</p>
        </>
      )}
    </Panel>
  );
}
