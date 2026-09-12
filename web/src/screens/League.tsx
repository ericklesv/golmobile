import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { League, MatchView, Serie } from '../lib/types';
import { Shield } from '../components/Shield';
import { Tabs, Spinner, Countdown, Empty } from '../components/ui';
import { pct } from '../lib/format';

export function LeagueScreen() {
  const me = useAuth((s) => s.me)!;
  const [league, setLeague] = useState<League | null>(null);
  const [serie, setSerie] = useState<Serie>(me.team.serie);
  const [view, setView] = useState<'tabela' | 'jogos'>('tabela');
  const [roundN, setRoundN] = useState<number | null>(null);
  const [matches, setMatches] = useState<MatchView[] | null>(null);
  const [roundInfo, setRoundInfo] = useState<any>(null);

  useEffect(() => { api.league().then((l) => { setLeague(l); setRoundN(l.round?.number ?? null); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!roundN) return;
    setMatches(null);
    api.round(roundN).then((r) => { setMatches(r.matches); setRoundInfo(r.round); }).catch(() => setMatches([]));
  }, [roundN]);

  const table = league?.standings[serie] ?? [];
  const maxRound = league?.rounds.length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <h1 className="font-poster text-3xl uppercase text-chalk">Brasileirão</h1>
        {league?.season && <div className="text-right text-[11px] text-haze">Temporada {league.season.number} · Rodada {league.round?.number}/{league.season.totalRounds}<br />{league.round && <>fecha em <Countdown readyAt={new Date(league.round.endsAt).getTime()} className="text-flood" /></>}</div>}
      </div>
      <Tabs value={view} onChange={setView} items={[{ id: 'tabela', label: 'Classificação' }, { id: 'jogos', label: 'Jogos da rodada' }]} />
      <Tabs value={serie} onChange={setSerie} items={[{ id: 'A', label: 'Série A' }, { id: 'B', label: 'Série B' }, { id: 'C', label: 'Série C' }]} />

      {view === 'tabela' ? (
        <section className="card overflow-hidden">
          {!league ? <div className="flex justify-center py-8"><Spinner /></div> : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-haze">
                <tr><th className="py-2 pl-2 text-left">#</th><th className="text-left">Time</th><th>PG</th><th>J</th><th>V</th><th>E</th><th>D</th><th className="pr-2">SG</th></tr>
              </thead>
              <tbody>
                {table.map((s) => {
                  const zone = s.position <= 1 ? 'border-l-4 border-flood' : s.position <= 2 && serie !== 'A' ? 'border-l-4 border-turf' : s.position >= table.length - 1 && serie !== 'C' ? 'border-l-4 border-card' : 'border-l-4 border-transparent';
                  return (
                    <tr key={s.team.slug} className={`border-t border-line/50 ${zone} ${s.team.slug === me.team.slug ? 'bg-turf/10' : ''}`}>
                      <td className="py-1.5 pl-2 font-score font-bold text-haze">{s.position}</td>
                      <td><Link to={`/time/${s.team.slug}`} className="flex items-center gap-2 font-semibold text-chalk"><Shield team={s.team} size={22} />{s.team.name}</Link></td>
                      <td className="text-center font-score text-base font-bold text-chalk">{s.points}</td>
                      <td className="text-center text-haze">{s.played}</td><td className="text-center text-haze">{s.wins}</td><td className="text-center text-haze">{s.draws}</td><td className="text-center text-haze">{s.losses}</td>
                      <td className="pr-2 text-center text-haze">{s.diff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap gap-3 border-t border-line/50 px-3 py-2 text-[10px] text-haze">
            <span><i className="mr-1 inline-block h-2 w-2 bg-flood" />Campeão</span>
            {serie !== 'A' && <span><i className="mr-1 inline-block h-2 w-2 bg-turf" />Acesso</span>}
            {serie !== 'C' && <span><i className="mr-1 inline-block h-2 w-2 bg-card" />Rebaixamento</span>}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button className="btn-ghost px-3 py-1" disabled={!roundN || roundN <= 1} onClick={() => setRoundN((n) => (n ?? 1) - 1)}><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-center"><div className="font-poster text-lg text-chalk">{roundN}ª RODADA</div><div className="text-[10px] uppercase tracking-widest text-haze">{roundInfo?.status === 'LIVE' ? 'ao vivo' : 'encerrada'}</div></div>
            <button className="btn-ghost px-3 py-1" disabled={!roundN || roundN >= maxRound} onClick={() => setRoundN((n) => (n ?? 1) + 1)}><ChevronRight className="h-4 w-4" /></button>
          </div>
          {matches === null ? <div className="flex justify-center py-8"><Spinner /></div> : matches.filter((m) => m.serie === serie).length === 0 ? <Empty text="Sem jogos nesta série." /> : matches.filter((m) => m.serie === serie).map((m) => (
            <div key={m.id} className="card p-3">
              <div className="flex items-center gap-2">
                <Link to={`/time/${m.home.slug}`} className="flex flex-1 items-center gap-2 text-sm font-semibold text-chalk"><Shield team={m.home} size={26} /><span className="truncate">{m.home.name}</span></Link>
                <div className="font-score text-xl font-extrabold tabular-nums text-chalk">{m.homeGoals} <span className="text-hazedim">x</span> {m.awayGoals}</div>
                <Link to={`/time/${m.away.slug}`} className="flex flex-1 items-center justify-end gap-2 text-right text-sm font-semibold text-chalk"><span className="truncate">{m.away.name}</span><Shield team={m.away} size={26} /></Link>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-night-1"><div className="h-full" style={{ width: `${m.pct}%`, background: m.home.colorPrimary }} /></div>
              <div className="mt-1 flex justify-between text-[10px] text-haze"><span>{pct(m.pct)}</span><span>{pct(100 - m.pct)}</span></div>
            </div>
          ))}
          {roundInfo?.top?.length > 0 && (
            <div className="card p-3">
              <div className="mb-1 font-poster uppercase text-chalk">Artilheiros da rodada</div>
              <ol className="text-sm">{roundInfo.top.slice(0, 5).map((r: any) => <li key={r.userId} className="flex justify-between py-0.5"><span className="text-chalk">{r.position}. {r.nick}</span><b className="text-turf">{r.goals}</b></li>)}</ol>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
