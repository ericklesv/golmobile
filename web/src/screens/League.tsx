import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { League, MatchView, Serie } from '../lib/types';
import { Shield } from '../components/Shield';
import { Tabs, Spinner, Countdown, Empty, Panel } from '../components/ui';
import { pct } from '../lib/format';

export function LeagueScreen() {
  const me = useAuth((s) => s.me)!;
  const swapMin = useAuth((s) => s.meta?.serieASwap?.minGoals);
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
      <div className="flex justify-center"><div className="ribbon ribbon-green ribbon-lg"><img src="/ui/ico-trophy_s.png" className="mr-2 h-9 w-9" alt="" />BRASILEIRÃO</div></div>
      {league?.season && <div className="t-display t-out -mt-1 text-center text-[13px]">Temporada {league.season.number} · Rodada {league.round?.number}/{league.season.totalRounds} · fecha em <Countdown readyAt={new Date(league.round!.endsAt).getTime()} className="t-gold" /></div>}
      <Tabs value={view} onChange={setView} items={[{ id: 'tabela', label: 'Classificação' }, { id: 'jogos', label: 'Jogos da rodada' }]} />
      <Tabs value={serie} onChange={setSerie} items={[{ id: 'A', label: 'Série A' }, { id: 'B', label: 'Série B' }, { id: 'C', label: 'Série C' }]} />

      {view === 'tabela' ? (
        <div className="panel">
          {!league ? <div className="flex justify-center py-8"><Spinner /></div> : (
            <table className="w-full text-[13px] font-extrabold">
              <thead className="label"><tr><th className="py-1 pl-1 text-left">#</th><th className="text-left">Time</th><th>PG</th><th>J</th><th>V</th><th>E</th><th>D</th><th className="pr-1">SG</th></tr></thead>
              <tbody>
                {table.map((s) => {
                  const zone = s.position <= 1 ? 'bg-gold/30' : s.position <= 2 && serie !== 'A' ? 'bg-grass/25' : s.position >= table.length - 1 && serie !== 'C' ? 'bg-danger/15' : s.position % 2 ? 'bg-sky/10' : '';
                  return (
                    <tr key={s.team.slug} className={`${zone} ${s.team.slug === me.team.slug ? 'outline outline-2 outline-gold' : ''}`}>
                      <td className="rounded-l-lg py-1 pl-1 font-display text-muted">{s.position}</td>
                      <td><Link to={`/time/${s.team.slug}`} className="flex items-center gap-2 text-navy-ink"><Shield team={s.team} size={22} /><span className="truncate">{s.team.name}</span></Link></td>
                      <td className="text-center font-display text-base text-navy-ink">{s.points}</td>
                      <td className="text-center text-muted">{s.played}</td><td className="text-center text-muted">{s.wins}</td><td className="text-center text-muted">{s.draws}</td><td className="text-center text-muted">{s.losses}</td>
                      <td className="rounded-r-lg pr-1 text-center text-muted">{s.diff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-extrabold text-muted">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-gold" />Campeão</span>
            {serie !== 'A' && <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-grass" />Acesso</span>}
            {serie !== 'C' && <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-danger" />Rebaixamento</span>}
          </div>
          {swapMin && (
            <p className="mt-1.5 text-[11px] font-bold leading-snug text-muted">
              {serie === 'A'
                ? `Se um time da Série A passar a rodada sem marcar gol, quem mais marcou fora da A (com pelo menos ${swapMin} gols) sobe no lugar dele, e ele cai para a Série B.`
                : `Fez ${swapMin} gols ou mais numa rodada? Seu time pode subir direto para a Série A no lugar de um time da A que não marcou nenhum gol.`}
            </p>
          )}
        </div>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button className="btn-sq btn-sq-sky h-12 w-12" disabled={!roundN || roundN <= 1} onClick={() => setRoundN((n) => (n ?? 1) - 1)}><img src="/ui/pi-back.png" className="h-5 w-5" alt="anterior" /></button>
            <div className="text-center"><div className="t-display t-out text-2xl">{roundN}ª RODADA</div><div className="trap trap-blue text-[10px] uppercase">{roundInfo?.status === 'LIVE' ? 'ao vivo' : 'encerrada'}</div></div>
            <button className="btn-sq btn-sq-sky h-12 w-12" disabled={!roundN || roundN >= maxRound} onClick={() => setRoundN((n) => (n ?? 1) + 1)}><img src="/ui/pi-next01.png" className="h-5 w-5" alt="próxima" /></button>
          </div>
          {matches === null ? <div className="flex justify-center py-8"><Spinner /></div> : matches.filter((m) => m.serie === serie).length === 0 ? <Empty text="Sem jogos nesta série." /> : matches.filter((m) => m.serie === serie).map((m) => (
            <div key={m.id} className="panel">
              <div className="flex items-center gap-2">
                <Link to={`/time/${m.home.slug}`} className="flex flex-1 items-center gap-2 text-[13px] font-extrabold text-navy-ink"><Shield team={m.home} size={30} /><span className="truncate">{m.home.name}</span></Link>
                <Link to={`/partida/${m.id}`} className="flex flex-col items-center" aria-label="Ver a partida">
                  <span className="font-display text-2xl tabular-nums text-navy-ink">{m.homeGoals} <span className="text-muted">x</span> {m.awayGoals}</span>
                  <span className="text-[9px] font-extrabold uppercase text-sky-deep">ver partida</span>
                </Link>
                <Link to={`/time/${m.away.slug}`} className="flex flex-1 items-center justify-end gap-2 text-right text-[13px] font-extrabold text-navy-ink"><span className="truncate">{m.away.name}</span><Shield team={m.away} size={30} /></Link>
              </div>
              <div className="bar mt-2" style={{ height: 16 }}><i style={{ width: `calc(${m.pct}% + 6px)` }} /><span style={{ fontSize: 10 }}>{pct(m.pct)} · {pct(100 - m.pct)}</span></div>
            </div>
          ))}
          {roundInfo?.top?.length > 0 && (
            <Panel title="ARTILHEIROS DA RODADA" ribbon="orange">
              <ol className="text-[13px] font-extrabold">{roundInfo.top.slice(0, 5).map((r: any) => <li key={r.userId} className="flex justify-between py-0.5"><span className="text-navy-ink">{r.position}. {r.nick}</span><b className="text-grass-deep">{r.goals}</b></li>)}</ol>
            </Panel>
          )}
        </section>
      )}
    </div>
  );
}
