import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { TeamPage } from '../lib/types';
import { Shield } from '../components/Shield';
import { Avatar } from '../components/Avatar';
import { Panel, TopList, Spinner, Tabs } from '../components/ui';
import { num, pct } from '../lib/format';

function Stat({ label, value, gold = false }: { label: string; value: React.ReactNode; gold?: boolean }) {
  return (
    <div className="text-center"><div className={`t-display text-2xl ${gold ? 't-gold' : 't-out'}`}>{value}</div><div className="t-display text-[10px] uppercase tracking-wider text-white/80">{label}</div></div>
  );
}

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
    <div className="flex flex-col gap-4">
      <section className="panel-navy relative">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white/90 p-2 shadow-lg"><Shield team={t} size={72} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="t-display t-out truncate text-3xl">{t.name}</h1>
            <div className="trap trap-blue mt-1 text-[10px] uppercase">{t.state} · {t.stadium} · Série {t.serie}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-white/10 py-2">
          <Stat label="posição" value={`${page.standing?.position ?? '-'}º`} />
          <Stat label="pontos" value={page.standing?.points ?? 0} gold />
          <Stat label="torcida" value={num(page.members)} />
          <Stat label="ativos 24h" value={page.active.length} />
        </div>
        {page.standing && <div className="mt-2 text-center text-[12px] font-extrabold text-white/90">Campanha {page.standing.wins}V {page.standing.draws}E {page.standing.losses}D · SG {page.standing.diff} · {num(page.totalGoals)} gols na história</div>}
      </section>

      {m && (
        <Panel title={`JOGO DA RODADA ${m.round?.number ?? ''}`} ribbon="orange">
          <div className="flex items-center justify-between">
            <Link to={`/time/${m.home.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.home} size={48} /><span className="text-center text-[11px] font-extrabold text-navy-ink">{m.home.name}</span></Link>
            <div className="font-display text-4xl tabular-nums text-navy-ink"><span className={mine === 'home' ? 'text-orange-deep' : ''}>{m.homeGoals}</span> <span className="text-muted">x</span> <span className={mine === 'away' ? 'text-orange-deep' : ''}>{m.awayGoals}</span></div>
            <Link to={`/time/${m.away.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.away} size={48} /><span className="text-center text-[11px] font-extrabold text-navy-ink">{m.away.name}</span></Link>
          </div>
          <div className="bar mt-2" style={{ height: 16 }}><i style={{ width: `calc(${m.pct}% + 6px)` }} /><span style={{ fontSize: 10 }}>{pct(m.pct)} · {pct(100 - m.pct)}</span></div>
        </Panel>
      )}

      <Panel title="ARTILHEIROS DA TORCIDA" ribbon="blue">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'hour', label: 'Hora' }, { id: 'round', label: 'Rodada' }, { id: 'season', label: 'Temporada' }]} />
        <div className="mt-2"><TopList rows={page.tops[tab]} highlight={me.nick} empty="Ninguém marcou ainda." /></div>
      </Panel>

      {page.titles.length > 0 && (
        <Panel title="TÍTULOS" ribbon="yellow">
          <ul className="flex flex-wrap gap-2">{page.titles.map((tt, i) => <li key={i} className={`trap ${tt.place === 1 ? 'trap-orange' : 'trap-blue'} text-[11px]`}><img src={tt.place === 1 ? '/ui/ico-trophy_s.png' : '/ui/ico-medal_silver.png'} className="mr-1 h-5 w-5" alt="" />{tt.competition} · T{tt.season}</li>)}</ul>
        </Panel>
      )}

      <Panel title="TORCEDORES ATIVOS" ribbon="green">
        <p className="mb-2 text-center text-[11px] font-bold text-muted">Quem entrou nas últimas 24 horas · ponto verde = online agora</p>
        {page.active.length ? <ul className="flex flex-wrap gap-2">{page.active.map((u) => <li key={u.nick}><Link to={`/jogador/${encodeURIComponent(u.nick)}`} className="pill-blue inline-flex items-center gap-1 text-[12px] font-extrabold text-white"><Avatar url={u.avatarUrl} size={18} />{u.online && <span className="inline-block h-2 w-2 rounded-full bg-grass shadow-[0_0_6px_#4CD137]" />}{u.nick}</Link></li>)}</ul> : <p className="text-xs font-bold text-muted">Ninguém da torcida entrou nas últimas 24 h.</p>}
      </Panel>
    </div>
  );
}
