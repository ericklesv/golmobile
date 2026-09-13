import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { PublicPlayer } from '../lib/types';
import { Shield } from '../components/Shield';
import { Panel, Spinner, Empty } from '../components/ui';
import { toast } from '../components/Toast';
import { num, timeAgo } from '../lib/format';

export function PlayerScreen() {
  const { nick } = useParams();
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const setMe = useAuth((s) => s.setMe);
  const [p, setP] = useState<PublicPlayer | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setP(undefined); api.player(nick!).then(setP).catch(() => setP(null)); }, [nick]);
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
  return (
    <div className="flex flex-col gap-4">
      <section className="panel-navy">
        <div className="flex items-center gap-3">
          <div className="relative"><img src="/ui/ico-userthumbnail.png" alt="" className="h-16 w-16" /><Shield team={p.team} size={28} className="absolute -bottom-1 -right-1" /></div>
          <div className="min-w-0 flex-1">
            <div className={`t-display truncate text-3xl ${p.vip ? 'text-sky-light' : 't-out'}`}>{p.nick} {p.vip && <img src="/ui/ico-crown_silver.png" className="ico h-5 w-5" alt="VIP" />}</div>
            <div className="text-[12px] font-extrabold text-white/90"><Link to={`/time/${p.team.slug}`} className="t-gold t-display">{p.team.name}</Link> · {p.online ? <span className="t-green">online</span> : 'offline'}</div>
            <div className="trap trap-orange mt-1 text-[11px] uppercase">Lvl {p.level.lvl} · {p.level.name}</div>
          </div>
        </div>
        {p.bio && <p className="mt-3 rounded-xl bg-white/15 p-2 text-[13px] font-bold">{p.bio}</p>}
      </section>

      <div className="grid grid-cols-4 gap-2 text-center">
        {(['geral', 'penal', 'falta', 'trilha'] as const).map((k) => (
          <div key={k} className="item-blue"><div className="t-display t-out text-xl">{num(p.positions[k])}º</div><div className="t-display text-[10px] uppercase text-white/80">{k}</div></div>
        ))}
      </div>

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

      {canNerf && <button onClick={nerf} disabled={busy} className="btn btn-red btn-md w-full">Nerfar destreza (R$ 1.000)</button>}

      <Panel title="ÚLTIMOS LANCES" ribbon="green">
        {p.recent.length ? <ul className="flex flex-col gap-1.5 text-[12px] font-bold">{p.recent.map((r) => <li key={r.id} className="flex gap-2"><span className={`flex-1 ${r.goal ? 'text-navy-ink' : 'text-muted'}`}>{r.text}</span><span className="text-muted">{timeAgo(r.at)}</span></li>)}</ul> : <p className="text-xs font-bold text-muted">Nenhum lance ainda.</p>}
      </Panel>
      <p className="t-display t-out text-center text-[11px]">No BRGOL desde {new Date(p.createdAt).toLocaleDateString('pt-BR')}</p>
    </div>
  );
}
