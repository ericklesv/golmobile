import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { PublicPlayer } from '../lib/types';
import { Shield } from '../components/Shield';
import { Avatar } from '../components/Avatar';
import { Panel, Spinner, Empty } from '../components/ui';
import { toast } from '../components/Toast';
import { num, timeAgo } from '../lib/format';
import { AnimatePresence } from 'framer-motion';
import { OfferModal, GiftModal, roleLabel, dayMonth } from '../components/Club';
import { NameBadges, TopHistory } from '../components/Badges';
import { ReportModal } from '../components/Account';
import { nickProps } from '../lib/nick';
import { X1Record } from '../components/X1Record';

export function PlayerScreen() {
  const { nick } = useParams();
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const setMe = useAuth((s) => s.setMe);
  const [p, setP] = useState<PublicPlayer | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'offer' | 'gift' | 'report' | null>(null);
  const [blocked, setBlocked] = useState(false); // eu bloqueei este jogador? (GET /api/account/blocks)
  const refresh = useAuth((s) => s.refresh);

  useEffect(() => { setP(undefined); api.player(nick!).then(setP).catch(() => setP(null)); }, [nick]);
  useEffect(() => { api.blocks().then((b) => setBlocked(b.some((x) => x.nick.toLowerCase() === String(nick).toLowerCase()))).catch(() => {}); }, [nick]);
  if (p === undefined) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!p) return <Empty text="Jogador não encontrado." />;

  const canNerf = me.level.lvl >= (meta?.nerfMinLevel ?? 14) && p.level.lvl >= (meta?.nerfMinLevel ?? 14) && p.id !== me.id && p.dexterity > 0;
  async function nerf() {
    if (busy || !window.confirm(`Nerfar ${p!.nick} por R$ 1.000? Ele perde 1 ponto de destreza.`)) return;
    setBusy(true);
    try { const r = await api.nerf(p!.nick); setMe(r.me); setP(await api.player(p!.nick)); toast(`${p!.nick} foi nerfado!`, 'success'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  const rate = (g: number, t: number) => (t ? `${Math.round((g / t) * 100)}%` : '—');
  const isMe = p.id === me.id;
  const sameTeam = p.team.slug === me.team.slug;
  // presidente: nomear/tirar diretor e passar a presidência (services/club.js confere tudo de novo)
  async function board(action: 'appoint' | 'remove' | 'pass') {
    const ask = { appoint: `Nomear ${p!.nick} para a diretoria?`, remove: `Tirar ${p!.nick} da diretoria?`, pass: `Passar a presidência do ${me.team.name} para ${p!.nick}? Você sai da diretoria.` }[action];
    if (busy || !window.confirm(ask)) return;
    setBusy(true);
    try {
      if (action === 'appoint') await api.clubAppoint(p!.nick); else if (action === 'remove') await api.clubRemoveDirector(p!.nick); else await api.clubPass(p!.nick);
      toast({ appoint: `${p!.nick} agora é da diretoria.`, remove: `${p!.nick} saiu da diretoria.`, pass: `${p!.nick} é ${p!.gender === 'F' ? 'a nova presidente' : 'o novo presidente'}.` }[action], 'success');
      await refresh(); setP(await api.player(p!.nick));
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-4">
      <section className="panel-navy">
        <div className="flex items-center gap-3">
          <div className="relative"><Avatar url={p.avatarUrl} size={64} /><Link to={`/time/${p.team.slug}`} className="absolute -bottom-1 -right-1"><Shield team={p.team} size={28} /></Link></div>
          <div className="min-w-0 flex-1">
            <div className="t-display truncate text-3xl"><span className={nickProps(p, { plain: 't-out', vipClass: 'text-sky-light', dark: true }).className} style={nickProps(p, { dark: true }).style}>{p.nick}</span> {p.vip && <img src="/ui/ico-crown_silver.png" className="ico h-5 w-5" alt="VIP" />}<NameBadges role={p.role} tops={p.tops} size={20} /></div>
            <div className="text-[12px] font-extrabold text-white/90"><Link to={`/time/${p.team.slug}`} className="t-gold t-display">{p.team.name}</Link> · {p.online ? <span className="t-green">online</span> : 'offline'}</div>
            <div className="trap trap-orange mt-1 text-[11px] uppercase">Lvl {p.level.lvl} · {p.level.name}</div>
            {(p.role || p.contractUntil) && (
              <div className="mt-1 flex flex-wrap gap-1">
                {p.role && <span className="trap trap-green text-[10px] uppercase">{roleLabel(p.role, p.gender)} do {p.team.abbr}</span>}
                {p.contractUntil && <span className="trap trap-blue text-[10px] uppercase">Contrato até {dayMonth(p.contractUntil)}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-white/15 p-2">
          <div className="t-display text-[10px] uppercase tracking-wider text-white/70">Texto pessoal</div>
          <p className={`text-[13px] font-bold ${p.bio ? 'text-white' : 'italic text-white/60'}`}>{p.bio || 'Este jogador ainda não escreveu nada.'}</p>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-2 text-center">
        {(['geral', 'penal', 'falta', 'trilha'] as const).map((k) => (
          <div key={k} className="item-blue"><div className="t-display t-out text-xl">{num(p.positions[k])}º</div><div className="t-display text-[10px] uppercase text-white/80">{k}</div></div>
        ))}
      </div>

      {p.history && <Panel title="TOP 10" ribbon="yellow"><TopHistory history={p.history} /></Panel>}

      <Panel title="NÚMEROS" ribbon="blue">
        <div className="grid grid-cols-2 gap-2 text-center">
          {[
            ['gols na carreira', num(p.goalsTotal)], ['destreza', p.dexterity],
            [`pênaltis · ${rate(p.stats.penalty.goals, p.stats.penalty.tries)}`, `${p.stats.penalty.goals}/${p.stats.penalty.tries}`],
            [`faltas · ${rate(p.stats.foul.goals, p.stats.foul.tries)}`, `${p.stats.foul.goals}/${p.stats.foul.tries}`],
            [`trilha · ${rate(p.stats.trail.goals, p.stats.trail.tries)}`, `${p.stats.trail.goals}/${p.stats.trail.tries}`],
            ['gols na temporada', p.goalsSeason],
          ].map(([l, v]) => <div key={l as string} className="rounded-xl bg-sky/10 py-2"><div className="font-display text-xl text-navy-ink">{v}</div><div className="label">{l}</div></div>)}
        </div>
      </Panel>

      <X1Record record={p.x1} history={p.history} isMe={isMe} />

      {!isMe && (me.role || sameTeam) && (
        <div className="flex flex-col gap-2">
          {me.role && !sameTeam && (p.contractUntil
            ? <p className="rounded-xl bg-white/85 p-2 text-center text-[12px] font-extrabold text-navy-ink">{p.nick} tem contrato com o {p.team.name} até {dayMonth(p.contractUntil)}. Depois disso dá para fazer proposta.</p>
            : <button onClick={() => setModal('offer')} className="btn btn-green btn-md w-full"><img src="/ui/ico-pass_golden.png" className="h-6 w-8 object-contain" alt="" /> Fazer proposta</button>)}
          {sameTeam && <button onClick={() => setModal('gift')} className="btn btn-yellow btn-md w-full"><img src="/ui/ico-gift_blue.png" className="h-6 w-6" alt="" /> Mandar VIP</button>}
          {me.role === 'PRESIDENTE' && sameTeam && (
            <div className="flex gap-2">
              {p.role === 'DIRETOR'
                ? <button onClick={() => board('remove')} disabled={busy} className="btn btn-gray btn-sm flex-1">Tirar da diretoria</button>
                : !p.role && p.vip && <button onClick={() => board('appoint')} disabled={busy} className="btn btn-blue btn-sm flex-1">Nomear diretor</button>}
              {p.vip && <button onClick={() => board('pass')} disabled={busy} className="btn btn-orange btn-sm flex-1">Passar a presidência</button>}
            </div>
          )}
        </div>
      )}

      {canNerf && <button onClick={nerf} disabled={busy} className="btn btn-red btn-md w-full">Nerfar destreza (R$ 1.000)</button>}
      {!isMe && (
        <div className="flex gap-2">
          <button onClick={() => setModal('report')} className="btn btn-gray btn-sm flex-1"><img src="/ui/flag-orange.png" className="h-5 w-5" alt="" /> Denunciar</button>
          <button onClick={async () => { if (busy) return; setBusy(true); try { const r = blocked ? await api.unblock(p!.nick) : await api.block(p!.nick); setBlocked(r.blocked); toast(r.blocked ? `${p!.nick} bloqueado.` : `${p!.nick} desbloqueado.`, 'success'); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); } }} disabled={busy} className={`btn btn-sm flex-1 ${blocked ? 'btn-orange' : 'btn-gray'}`}>{blocked ? 'Desbloquear' : 'Bloquear'}</button>
        </div>
      )}

      <Panel title="ÚLTIMOS LANCES" ribbon="green">
        {p.recent.length ? <ul className="flex flex-col gap-1.5 text-[12px] font-bold">{p.recent.map((r) => <li key={r.id} className="flex gap-2"><span className={`flex-1 ${r.goal ? 'text-navy-ink' : 'text-muted'}`}>{r.text}</span><span className="text-muted">{timeAgo(r.at)}</span></li>)}</ul> : <p className="text-xs font-bold text-muted">Nenhum lance ainda.</p>}
      </Panel>
      <p className="t-display t-out text-center text-[11px]">No JogaGol desde {new Date(p.createdAt).toLocaleDateString('pt-BR')}</p>
      <AnimatePresence>
        {modal === 'offer' && <OfferModal key="offer" nick={p.nick} gender={p.gender} teamName={p.team.name} onClose={() => setModal(null)} onSent={() => setModal(null)} />}
        {modal === 'gift' && <GiftModal key="gift" nick={p.nick} onClose={() => setModal(null)} onSent={() => setModal(null)} />}
        {modal === 'report' && <ReportModal key="report" nick={p.nick} blocked={blocked} onBlocked={setBlocked} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  );
}
