import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Crown, Syringe } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { PublicPlayer } from '../lib/types';
import { Shield } from '../components/Shield';
import { Section, Spinner, Empty } from '../components/ui';
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
    <div className="flex flex-col gap-3">
      <section className="card p-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2" style={{ borderColor: p.team.colorPrimary, background: `linear-gradient(135deg, ${p.team.colorPrimary}, ${p.team.colorSecondary})` }}>
              <span className="font-poster text-2xl text-white drop-shadow">{p.nick.slice(0, 2).toUpperCase()}</span>
            </div>
            <Shield team={p.team} size={26} className="absolute -bottom-1 -right-1" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`truncate font-poster text-2xl ${p.vip ? 'text-sky-300' : 'text-chalk'}`}>{p.nick} {p.vip && <Crown className="inline h-4 w-4 text-flood" />}</div>
            <div className="text-xs text-haze"><Link to={`/time/${p.team.slug}`} className="font-bold text-chalk">{p.team.name}</Link> · {p.online ? <span className="text-turf">online</span> : 'offline'}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-flood">Lvl {p.level.lvl} · {p.level.name}</div>
          </div>
        </div>
        {p.bio && <p className="mt-3 rounded-xl bg-night-1 p-3 text-sm text-chalk/90">{p.bio}</p>}
      </section>

      <div className="grid grid-cols-4 gap-2 text-center">
        {(['geral', 'penal', 'falta', 'trilha'] as const).map((k) => (
          <div key={k} className="rounded-xl bg-night-1 p-2"><div className="font-score text-lg font-bold text-chalk">{num(p.positions[k])}º</div><div className="text-[10px] uppercase text-haze">{k}</div></div>
        ))}
      </div>

      <Section title="Números">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-night-1 p-2"><div className="font-score text-xl font-bold text-turf">{num(p.goalsTotal)}</div><div className="text-[10px] uppercase text-haze">gols na carreira</div></div>
          <div className="rounded-xl bg-night-1 p-2"><div className="font-score text-xl font-bold text-chalk">{p.dexterity}</div><div className="text-[10px] uppercase text-haze">destreza</div></div>
          <div className="rounded-xl bg-night-1 p-2"><div className="font-score text-xl font-bold text-chalk">{p.stats.penalty.goals}/{p.stats.penalty.tries}</div><div className="text-[10px] uppercase text-haze">pênaltis · {rate(p.stats.penalty.goals, p.stats.penalty.tries)}</div></div>
          <div className="rounded-xl bg-night-1 p-2"><div className="font-score text-xl font-bold text-chalk">{p.stats.foul.goals}/{p.stats.foul.tries}</div><div className="text-[10px] uppercase text-haze">faltas · {rate(p.stats.foul.goals, p.stats.foul.tries)}</div></div>
          <div className="rounded-xl bg-night-1 p-2"><div className="font-score text-xl font-bold text-chalk">{p.stats.trail.goals}/{p.stats.trail.tries}</div><div className="text-[10px] uppercase text-haze">trilha · {rate(p.stats.trail.goals, p.stats.trail.tries)}</div></div>
          <div className="rounded-xl bg-night-1 p-2"><div className="font-score text-xl font-bold text-chalk">{p.goalsSeason}</div><div className="text-[10px] uppercase text-haze">gols na temporada</div></div>
        </div>
      </Section>

      {canNerf && (
        <button onClick={nerf} disabled={busy} className="btn-red w-full py-3 text-sm"><Syringe className="h-4 w-4" /> Nerfar destreza (R$ 1.000)</button>
      )}

      <Section title="Últimos lances">
        {p.recent.length ? <ul className="flex flex-col gap-1.5 text-xs">{p.recent.map((r) => <li key={r.id} className="flex gap-2"><span className={`flex-1 ${r.goal ? 'text-chalk' : 'text-haze'}`}>{r.text}</span><span className="text-hazedim">{timeAgo(r.at)}</span></li>)}</ul> : <p className="text-xs text-hazedim">Nenhum lance ainda.</p>}
      </Section>
      <p className="text-center text-[10px] text-hazedim">No BRGOL desde {new Date(p.createdAt).toLocaleDateString('pt-BR')}</p>
    </div>
  );
}
