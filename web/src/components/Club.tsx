import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { ClubBoard, ClubCandidate, ClubRole, ClubSeat, ClubState, Team } from '../lib/types';
import { Avatar } from './Avatar';
import { Shield } from './Shield';
import { Jersey } from './Jersey';
import { Panel, Spinner } from './ui';
import { toast } from './Toast';
import { timeAgo } from '../lib/format';
import { sound } from '../lib/sound';

/**
 * Diretoria e contratações (api/src/services/club.js): a tribuna da diretoria na página do time, as
 * movimentações e as janelas de proposta / doação de VIP usadas no perfil dos jogadores.
 */

export const roleLabel = (role: ClubRole, gender?: string) => (role === 'PRESIDENTE' ? 'Presidente' : gender === 'F' ? 'Diretora' : 'Diretor');
export const dayMonth = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const vipWord = (n: number) => `${n} VIP`;
const dayWord = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** Janela por cima da tela (mesmo molde da janela do PIX). Fecha no Esc e tocando fora. */
export function Sheet({ labelId, onClose, children }: { labelId: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby={labelId} onClick={onClose}
      className="fixed inset-y-0 left-1/2 z-[92] flex w-full max-w-[480px] -translate-x-1/2 flex-col overflow-y-auto bg-navy-deep/85 backdrop-blur-[2px]">
      <div className="relative m-auto w-full max-w-sm px-4 py-6" onClick={(e) => e.stopPropagation()}>
        <div className="panel text-center text-navy-ink">{children}</div>
      </div>
    </motion.div>
  );
}

/** Escolha de quantos VIP: − número + e atalhos. */
export function VipStepper({ value, max, onChange, chips = [] }: { value: number; max: number; onChange: (n: number) => void; chips?: number[] }) {
  const set = (n: number) => onChange(Math.max(1, Math.min(max, Math.floor(n) || 1)));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button onClick={() => set(value - 1)} disabled={value <= 1} className="btn btn-blue btn-sm h-11 w-11 text-[22px]" aria-label="Menos 1 VIP">−</button>
        <label className="flex items-center gap-1 rounded-2xl bg-gold/25 px-3 py-1">
          <img src="/ui/ico-crown_silver.png" alt="" className="h-8 w-8" />
          <input type="number" inputMode="numeric" min={1} max={max} value={value} onChange={(e) => set(Number(e.target.value))} aria-label="Quantidade de VIP"
            className="t-display w-16 bg-transparent text-center text-[32px] tabular-nums text-navy-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        </label>
        <button onClick={() => set(value + 1)} disabled={value >= max} className="btn btn-blue btn-sm h-11 w-11 text-[22px]" aria-label="Mais 1 VIP">+</button>
      </div>
      {chips.some((c) => c <= max) && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {chips.filter((c) => c <= max).map((c) => (
            <button key={c} onClick={() => set(c)} className={`rounded-full px-3 py-1 font-display text-[13px] ${value === c ? 'bg-navy-ink text-white' : 'bg-sky/15 text-navy-ink'}`}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Proposta de contratação para um jogador de outro time (feita por Presidente/Diretor). */
export function OfferModal({ nick, gender, teamName, onClose, onSent }: { nick: string; gender: string; teamName: string; onClose: () => void; onSent: () => void }) {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const rules = useAuth((s) => s.meta)?.club;
  const offerMax = rules?.offerMax ?? 100;
  const max = Math.max(1, Math.min(offerMax, me.vipDays));
  const [vip, setVip] = useState(Math.min(10, max));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ele = gender === 'F' ? 'ela' : 'ele';
  async function send() {
    if (busy) return;
    setBusy(true);
    try { await api.offerSend(nick, vip, msg); sound.play('coin'); toast(`Proposta de ${vipWord(vip)} enviada para ${nick}.`, 'success'); await refresh(); onSent(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  return (
    <Sheet labelId="offer-title" onClose={onClose}>
      <div id="offer-title" className="t-display text-[22px] leading-tight">Proposta para {nick}</div>
      <p className="text-[12px] font-bold text-muted">Hoje no {teamName}. Cada VIP vale 1 dia de contrato no {me.team.name}.</p>
      {me.vipDays < 1 ? (
        <>
          <p className="mt-3 rounded-xl bg-gold/25 p-2 text-[13px] font-extrabold">Você não tem VIP guardado para oferecer.</p>
          <Link to="/vip" className="btn btn-yellow btn-md mt-3 w-full">Comprar dias de VIP</Link>
          <button onClick={onClose} className="btn btn-blue btn-sm mt-2 w-full">Voltar</button>
        </>
      ) : (
        <>
          <div className="mt-3"><VipStepper value={vip} max={max} onChange={setVip} chips={[5, 10, 30, 60, 100]} /></div>
          <p className="mt-1 text-[11px] font-extrabold text-muted">Você tem {vipWord(me.vipDays)} guardados</p>
          <textarea className="field mt-2 min-h-[64px] text-left text-sm" maxLength={rules?.messageMax ?? 140} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Recado para ${nick} (opcional)`} />
          <div className="mt-2 rounded-xl bg-sky/10 p-2 text-left text-[12px] font-bold leading-snug">
            Se {ele} aceitar: joga pelo {me.team.name}, recebe {vipWord(vip)} e fica {dayWord(vip)} sem poder trocar de time.
            <span className="mt-1 block text-muted">O VIP sai do seu banco agora e volta se {ele} recusar ou não responder em {rules?.offerHours ?? 48} h.</span>
          </div>
          <button onClick={send} disabled={busy} className="btn btn-green btn-md mt-3 w-full">{busy ? 'Enviando…' : `Enviar proposta de ${vipWord(vip)}`}</button>
          <button onClick={onClose} className="btn btn-blue btn-sm mt-2 w-full">Voltar</button>
        </>
      )}
    </Sheet>
  );
}

/** Doação de VIP guardado para colega do mesmo time. */
export function GiftModal({ nick, onClose, onSent }: { nick: string; onClose: () => void; onSent: () => void }) {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  async function send() {
    if (busy) return;
    setBusy(true);
    try { await api.giftVip(nick, n); sound.play('coin'); toast(`Você mandou ${vipWord(n)} para ${nick}.`, 'success'); await refresh(); onSent(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  return (
    <Sheet labelId="gift-title" onClose={onClose}>
      <img src="/ui/ico-gift_blue.png" alt="" className="mx-auto -mt-1 h-14 w-14" />
      <div id="gift-title" className="t-display text-[22px] leading-tight">Mandar VIP para {nick}</div>
      {me.vipDays < 1 ? (
        <>
          <p className="mt-3 rounded-xl bg-gold/25 p-2 text-[13px] font-extrabold">Você não tem VIP guardado para mandar.</p>
          <button onClick={onClose} className="btn btn-blue btn-sm mt-3 w-full">Voltar</button>
        </>
      ) : (
        <>
          <div className="mt-3"><VipStepper value={n} max={me.vipDays} onChange={setN} chips={[1, 5, 10, 30]} /></div>
          <p className="mt-1 text-[11px] font-extrabold text-muted">Você tem {vipWord(me.vipDays)} guardados</p>
          <p className="mt-2 rounded-xl bg-sky/10 p-2 text-[12px] font-bold leading-snug">Os VIPs saem do seu banco e vão para o banco de {nick}. Não dá para desfazer.</p>
          <button onClick={send} disabled={busy} className="btn btn-yellow btn-md mt-3 w-full">{busy ? 'Enviando…' : `Mandar ${vipWord(n)}`}</button>
          <button onClick={onClose} className="btn btn-blue btn-sm mt-2 w-full">Voltar</button>
        </>
      )}
    </Sheet>
  );
}

/** Uma cadeira da tribuna: ocupada (foto, nick, cargo) ou vaga. */
function Seat({ seat, role, big = false, action }: { seat: ClubSeat | null; role: ClubRole; big?: boolean; action?: React.ReactNode }) {
  const size = big ? 64 : 48;
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center ${big ? '' : 'pt-5'}`}>
      <div className={`${seat ? (big ? 'item-yellow' : 'item-blue') : 'rounded-2xl border-2 border-dashed border-sky/50 bg-sky/5 p-2.5'} relative flex w-full flex-col items-center gap-0.5 pb-1 pt-1`}>
        {big && <img src="/ui/ico-crown_silver.png" alt="" className="absolute -top-6 left-1/2 h-8 w-8 -translate-x-1/2 drop-shadow" />}
        {seat ? (
          <Link to={`/jogador/${encodeURIComponent(seat.nick)}`} className="flex w-full flex-col items-center">
            <span className="relative">
              <Avatar url={seat.avatarUrl} size={size} />
              {seat.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-grass" />}
            </span>
            <span className={`t-display t-out mt-0.5 w-full truncate text-center ${big ? 'text-[15px]' : 'text-[12px]'}`}>{seat.nick}</span>
          </Link>
        ) : (
          <span className="flex flex-col items-center opacity-70">
            <img src="/ui/ico-userthumbnail.png" alt="" style={{ width: size, height: size }} />
            <span className="t-display mt-0.5 text-[12px] text-muted">vago</span>
          </span>
        )}
        <span className={`t-display text-[10px] uppercase tracking-wide ${seat ? 'text-white/85' : 'text-muted'}`}>{roleLabel(role, seat?.gender)}</span>
      </div>
      {action && <div className="mt-1 w-full">{action}</div>}
    </div>
  );
}

/**
 * Tribuna da diretoria (página do time). Em `mine` (o time do jogador) mostra as ações: assumir a
 * presidência, nomear/remover diretor (presidente) e sair do cargo.
 */
export function BoardPanel({ board, team, teamName, club, onClub }: { board: ClubBoard; team: Team; teamName: string; club: ClubState | null; onClub: (s: ClubState) => void }) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);
  const refresh = useAuth((s) => s.refresh);
  const designs = useAuth((s) => s.meta)?.kitDesigns ?? [];
  const now = useAuth((s) => s.now);
  const president = club?.role === 'PRESIDENTE';
  // uniforme: o do estado do clube (fresco depois de trocar) ou o da página do time
  const kitTeam: Team = club?.team ?? team;
  const design = club?.kit.design ?? kitTeam.kitDesign ?? 'classico';
  const designName = designs.find((d) => d.id === design)?.name ?? 'Clássico';
  const kitWait = club ? Math.max(0, club.kit.canChangeAt - now()) : 0;
  async function run(fn: () => Promise<ClubState>, ok?: string) {
    if (busy) return;
    setBusy(true);
    try { onClub(await fn()); if (ok) toast(ok, 'success'); await refresh(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  const b = club?.board ?? board;
  const directorAction = (seat: ClubSeat | null) => {
    if (!president) return undefined;
    if (seat) return <button onClick={() => window.confirm(`Tirar ${seat.nick} da diretoria?`) && run(() => api.clubRemoveDirector(seat.nick), `${seat.nick} saiu da diretoria.`)} disabled={busy} className="btn btn-gray btn-sm w-full !min-h-[30px] !text-[11px]">Remover</button>;
    return <button onClick={() => setPicking(true)} disabled={busy} className="btn btn-green btn-sm w-full !min-h-[30px] !text-[11px]">Nomear</button>;
  };
  return (
    <Panel title="DIRETORIA" ribbon="yellow">
      <div className="flex items-start gap-2 pt-3">
        <Seat seat={b.directors[0] ?? null} role="DIRETOR" action={directorAction(b.directors[0] ?? null)} />
        <Seat seat={b.president} role="PRESIDENTE" big />
        <Seat seat={b.directors[1] ?? null} role="DIRETOR" action={directorAction(b.directors[1] ?? null)} />
      </div>
      {club && (
        <div className="mt-3 flex flex-col gap-2">
          {!b.president && (club.claim.ok
            ? <button onClick={() => window.confirm(`Assumir a presidência do ${teamName}?`) && run(api.clubClaim, `Você é o presidente do ${teamName}!`)} disabled={busy} className="btn btn-yellow btn-md w-full">Assumir a presidência</button>
            : <p className="rounded-xl bg-gold/25 p-2 text-center text-[12px] font-extrabold">O {teamName} está sem presidente. {club.claim.reason}</p>)}
          {club.role && (
            <div className="flex gap-2">
              <Link to="/propostas" className="btn btn-blue btn-sm flex-1">Propostas que fiz</Link>
              <button onClick={() => window.confirm(club.role === 'PRESIDENTE' ? 'Sair da presidência? O time fica sem presidente até outro VIP assumir.' : 'Sair da diretoria?') && run(api.clubResign, 'Você saiu do cargo.')} disabled={busy} className="btn btn-gray btn-sm">Sair do cargo</button>
            </div>
          )}
          {club.role && <p className="text-center text-[11px] font-bold leading-snug text-muted">Para contratar, abra o perfil de um jogador de outro time e toque em Fazer proposta.</p>}
        </div>
      )}
      <p className="mt-2 text-center text-[11px] font-bold leading-snug text-muted">Presidente e diretores precisam ser VIP. Perde o cargo quem fica {club?.rules.roleLossDays ?? 3} dias sem VIP ou sem entrar no jogo.</p>

      {/* uniforme do time (pedido do dono, 15/09/2026): o presidente escolhe o desenho; as cores são as do time */}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-sky/10 px-2 py-1.5">
        <Jersey primary={kitTeam.colorPrimary} secondary={kitTeam.colorSecondary} tertiary={kitTeam.colorTertiary} design={design} size={44} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[11px] font-extrabold uppercase text-muted">Uniforme</span>
          <span className="block text-[14px] font-extrabold text-navy-ink">{designName}</span>
          {president && kitWait > 0 && <span className="block text-[10px] font-bold text-muted">dá para trocar de novo em {Math.ceil(kitWait / 3600_000)} h</span>}
        </span>
        {president && <button onClick={() => setKitOpen(true)} disabled={busy || kitWait > 0} className="btn btn-orange btn-sm !min-h-[32px] !text-[12px]">Mudar</button>}
      </div>
      <AnimatePresence>{picking && <CandidatesModal onClose={() => setPicking(false)} onPick={(nick) => { setPicking(false); run(() => api.clubAppoint(nick), `${nick} agora é da diretoria.`); }} />}</AnimatePresence>
      <AnimatePresence>{kitOpen && <KitModal team={kitTeam} current={design} onClose={() => setKitOpen(false)} onPick={(d) => { setKitOpen(false); run(() => api.clubKit(d), 'Uniforme trocado! Vale em tudo: Camisas, pênalti, falta e X1.'); }} />}</AnimatePresence>
    </Panel>
  );
}

/** Escolha do desenho do uniforme (só o presidente): as camisas nas cores do time, uma por desenho. */
function KitModal({ team, current, onClose, onPick }: { team: Team; current: string; onClose: () => void; onPick: (design: string) => void }) {
  const designs = useAuth((s) => s.meta)?.kitDesigns ?? [];
  const hours = useAuth((s) => s.meta)?.club?.kitChangeHours ?? 24;
  return (
    <Sheet labelId="kit-title" onClose={onClose}>
      <div id="kit-title" className="t-display text-[22px]">Uniforme do {team.name}</div>
      <p className="text-[12px] font-bold text-muted">As cores são as do time e não mudam — só o desenho. Vale no Camisas, no pênalti, na falta e no X1, inclusive para quem enfrenta o {team.name}. Uma troca a cada {hours} h.</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {designs.map((d) => (
          <button key={d.id} onClick={() => d.id !== current && window.confirm(`Trocar o uniforme para ${d.name}?`) && onPick(d.id)} disabled={d.id === current}
            className={`no-drag flex flex-col items-center rounded-xl p-2 ${d.id === current ? 'bg-gold/30 ring-2 ring-gold' : 'bg-sky/10 hover:bg-sky/20'}`}>
            <Jersey primary={team.colorPrimary} secondary={team.colorSecondary} tertiary={team.colorTertiary} design={d.id} size={64} />
            <span className="t-display mt-1 text-[13px] text-navy-ink">{d.name}</span>
            <span className="text-center text-[10px] font-bold leading-tight text-muted">{d.id === current ? 'atual' : d.desc}</span>
          </button>
        ))}
      </div>
      <button onClick={onClose} className="btn btn-blue btn-sm mt-3 w-full">Voltar</button>
    </Sheet>
  );
}

/** Lista dos VIPs do time sem cargo, para o presidente nomear diretor. */
function CandidatesModal({ onClose, onPick }: { onClose: () => void; onPick: (nick: string) => void }) {
  const [list, setList] = useState<ClubCandidate[] | null>(null);
  useEffect(() => { api.clubCandidates().then(setList).catch((e) => { toast((e as Error).message, 'error'); onClose(); }); }, []);
  return (
    <Sheet labelId="pick-title" onClose={onClose}>
      <div id="pick-title" className="t-display text-[22px]">Nomear diretor</div>
      <p className="text-[12px] font-bold text-muted">Só jogadores VIP do time, sem cargo.</p>
      <div className="mt-2 max-h-[50vh] overflow-y-auto">
        {!list ? <div className="flex justify-center py-4"><Spinner /></div> : list.length === 0 ? (
          <p className="py-4 text-[13px] font-extrabold text-muted">Nenhum VIP do time disponível agora.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl bg-sky/10 px-2 py-1.5 text-left">
                <Avatar url={c.avatarUrl} size={32} />
                <span className="min-w-0 flex-1"><span className="t-display block truncate text-[14px] text-sky-deep">{c.nick}</span><span className="text-[11px] font-bold text-muted">{c.goalsTotal} gols na carreira</span></span>
                <button onClick={() => onPick(c.nick)} className="btn btn-green btn-sm !min-h-[32px] !text-[12px]">Nomear</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button onClick={onClose} className="btn btn-blue btn-sm mt-3 w-full">Voltar</button>
    </Sheet>
  );
}

/** Movimentações do time: quem chegou e quem saiu por contratação. */
export function MovesPanel({ board, teamSlug }: { board: ClubBoard; teamSlug: string }) {
  if (!board.moves.length) return null;
  return (
    <Panel title="CONTRATAÇÕES" ribbon="green">
      <ul className="flex flex-col gap-1.5">
        {board.moves.map((m) => {
          const other = m.arrived ? m.fromTeam : m.team;
          return (
            <li key={m.id} className="flex items-center gap-2 rounded-xl bg-sky/10 px-2 py-1.5">
              <Link to={`/jogador/${encodeURIComponent(m.nick)}`}><Avatar url={m.avatarUrl} size={30} /></Link>
              <div className="min-w-0 flex-1 text-[12px] font-bold leading-snug">
                <Link to={`/jogador/${encodeURIComponent(m.nick)}`} className="t-display text-[14px] text-navy-ink">{m.nick}</Link>
                <span className={`ml-1 ${m.arrived ? 'text-grass-deep' : 'text-orange-deep'}`}>{m.arrived ? 'chegou' : 'saiu'}</span>
                <span className="block text-muted">{m.arrived ? `do ${other?.name ?? '—'}` : `para o ${other?.name ?? '—'}`} · {vipWord(m.vip)} · {timeAgo(m.at)}</span>
              </div>
              {other && other.slug !== teamSlug && <Link to={`/time/${other.slug}`} aria-label={other.name}><Shield team={other} size={26} /></Link>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
