import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { TeamPage } from '../lib/types';
import { Shield } from '../components/Shield';
import { Section, TopList, Spinner, Tabs } from '../components/ui';
import { num, pct } from '../lib/format';

export function TeamScreen() {
  const me = useAuth((s) => s.me)!;
  const { slug } = useParams();
  const s = slug ?? me.team.slug;
  const [page, setPage] = useState<TeamPage | null>(null);
  const [tab, setTab] = useState<'hour' | 'round' | 'season'>('round');

  useEffect(() => { setPage(null); api.team(s).then(setPage).catch(() => {}); }, [s]);
  if (!page) return <div className="flex justify-center py-16"><Spinner /></div>;
  const t = page.team;
  const m = page.match;
  const mine = m ? (m.home.slug === t.slug ? 'home' : 'away') : null;

  return (
    <div className="flex flex-col gap-3">
      <section className="card overflow-hidden">
        <div className="h-16" style={{ background: `linear-gradient(135deg, ${t.colorPrimary}, ${t.colorSecondary})`, opacity: 0.85 }} />
        <div className="-mt-9 flex items-end gap-3 px-3 pb-3">
          <Shield team={t} size={76} className="drop-shadow-lg" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate font-poster text-2xl uppercase text-chalk">{t.name}</h1>
            <div className="text-[11px] uppercase tracking-wider text-haze">{t.state} · {t.stadium} · Série {t.serie}</div>
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-line/60 border-t border-line/60 text-center">
          <div className="py-2"><div className="font-score text-lg font-bold text-chalk">{page.standing?.position ?? '-'}º</div><div className="text-[10px] uppercase text-haze">posição</div></div>
          <div className="py-2"><div className="font-score text-lg font-bold text-flood">{page.standing?.points ?? 0}</div><div className="text-[10px] uppercase text-haze">pontos</div></div>
          <div className="py-2"><div className="font-score text-lg font-bold text-chalk">{num(page.members)}</div><div className="text-[10px] uppercase text-haze">torcida</div></div>
          <div className="py-2"><div className="font-score text-lg font-bold text-turf">{page.online.length}</div><div className="text-[10px] uppercase text-haze">online</div></div>
        </div>
        {page.standing && <div className="border-t border-line/60 px-3 py-2 text-center text-xs text-haze">Campanha: <b className="text-chalk">{page.standing.wins}V {page.standing.draws}E {page.standing.losses}D</b> · SG {page.standing.diff} · {num(page.totalGoals)} gols na história</div>}
      </section>

      {m && (
        <section className="card p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-haze">Jogo da rodada {m.round?.number}</div>
          <div className="flex items-center justify-between">
            <Link to={`/time/${m.home.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.home} size={44} /><span className="text-center text-[11px] font-bold text-chalk">{m.home.name}</span></Link>
            <div className="font-score text-3xl font-extrabold tabular-nums text-chalk"><span className={mine === 'home' ? 'text-turf' : ''}>{m.homeGoals}</span> <span className="text-hazedim">x</span> <span className={mine === 'away' ? 'text-turf' : ''}>{m.awayGoals}</span></div>
            <Link to={`/time/${m.away.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.away} size={44} /><span className="text-center text-[11px] font-bold text-chalk">{m.away.name}</span></Link>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-night-1"><div className="h-full" style={{ width: `${m.pct}%`, background: m.home.colorPrimary }} /></div>
          <div className="mt-1 flex justify-between text-[10px] text-haze"><span>{pct(m.pct)}</span><span>{pct(100 - m.pct)}</span></div>
        </section>
      )}

      <Section title="Artilheiros da torcida">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'hour', label: 'Hora' }, { id: 'round', label: 'Rodada' }, { id: 'season', label: 'Temporada' }]} />
        <div className="mt-2"><TopList rows={page.tops[tab]} highlight={me.nick} empty="Ninguém marcou ainda." /></div>
      </Section>

      {page.titles.length > 0 && (
        <Section title="Títulos">
          <ul className="flex flex-wrap gap-2">{page.titles.map((tt, i) => <li key={i} className={`rounded-full px-3 py-1 text-xs font-bold ${tt.place === 1 ? 'bg-flood/15 text-flood' : 'bg-night-1 text-haze'}`}>{tt.place === 1 ? '🏆' : '🥈'} {tt.competition} · T{tt.season}</li>)}</ul>
        </Section>
      )}

      <Section title="Torcedores online">
        {page.online.length ? <ul className="flex flex-wrap gap-2">{page.online.map((u) => <li key={u.nick}><Link to={`/jogador/${encodeURIComponent(u.nick)}`} className="rounded-full bg-night-1 px-3 py-1 text-xs font-semibold text-chalk"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-turf" />{u.nick}</Link></li>)}</ul> : <p className="text-xs text-hazedim">Ninguém online agora.</p>}
      </Section>
      {t.slug !== me.team.slug && <Link to="/liga" className="btn-ghost w-full py-2 text-sm">Ver classificação</Link>}
    </div>
  );
}
