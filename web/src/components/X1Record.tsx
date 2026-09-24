import { Link } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Panel } from './ui';
import { TopHistory, X1Now } from './Badges';
import type { TopScope, TopTally, X1Game, X1Record as Rec, X1Tally } from '../lib/types';

/**
 * Campanha no X1 no perfil (pedido do dono, 15/09/2026: "no perfil os dados do X1 ao invés de FUTPREGO"):
 * a temporada no Ranking X1 (posição e pontos — 3 por vitória, 1 por empate, −2 por derrota: services/x1.js),
 * o total de sempre — vitórias, derrotas, empates, aproveitamento, pontos e a maior sequência sem perder — e
 * cada jogo. Sem partidas: no próprio perfil, convite para jogar.
 */
const GAMES: { id: X1Game; name: string }[] = [{ id: 'FUTPREGO', name: 'FutPrego' }, { id: 'BOTAO', name: 'Futebol de Botão' }, { id: 'FUTGOLF', name: 'Futgolf' }];
const pts = (n: number) => `${n} ${Math.abs(n) === 1 ? 'ponto' : 'pontos'}`;

/** Medalhas do X1 (pedido do dono, 15/09/2026): posição de agora na rodada, na temporada e no geral (caveira no
 *  top 3) + quantas vezes levou 1º/2º/3º e ficou no top 10 nas rodadas e temporadas fechadas. */
function X1Medals({ record, history }: { record: Rec; history?: Record<TopScope, TopTally> }) {
  const rows: { scope: TopScope; label: string; st: { position: number | null; eligible: boolean; played: number } | null; to: string }[] = [
    { scope: 'X1_ROUND', label: record.round ? `Rodada ${record.round.number}` : 'Rodada', st: record.round, to: '/rankings?aba=x1-rodada' },
    { scope: 'X1_SEASON', label: record.season ? `Temporada ${record.season.number}` : 'Temporada', st: record.season, to: '/rankings?aba=x1-temporada' },
    { scope: 'X1_ALL', label: 'Geral', st: record.all, to: '/rankings?aba=x1-geral' },
  ];
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {rows.map((r) => (
          <Link key={r.scope} to={r.to} className="flex flex-col items-center rounded-xl bg-gold/20 px-1 py-1.5 ring-1 ring-gold/60">
            <span className="flex h-8 items-center justify-center"><X1Now scope={r.scope} position={r.st?.position ?? null} eligible={r.st?.eligible} /></span>
            <span className="mt-0.5 text-center text-[10px] font-extrabold leading-tight text-navy-ink">{r.label}</span>
            {r.st && r.scope !== 'X1_ALL' && r.st.position !== null && !r.st.eligible && <span className="text-center text-[9px] font-bold leading-tight text-muted">sem o mínimo p/ prêmio</span>}
          </Link>
        ))}
      </div>
      {history && <TopHistory history={history} scopes={['X1_ROUND', 'X1_SEASON']} emptyText="Nenhuma medalha do X1 ainda: fique no top 3 de uma rodada ou temporada." />}
    </div>
  );
}

export function X1Record({ record, history, isMe = false }: { record?: Rec; history?: Record<TopScope, TopTally>; isMe?: boolean }) {
  // jogo fora do rodízio (em teste) só aparece para quem já jogou — senão entregaria o jogo antes da hora
  const rotation: X1Game[] = useAuth((st) => st.meta?.x1?.today?.order) ?? ['FUTPREGO', 'BOTAO'];
  if (!record) return null;
  const { wins, losses, draws } = record;
  const games = wins + losses + draws;
  return (
    <Panel title="X1" ribbon="orange">
      {games === 0 ? (
        <div className="text-center">
          <p className="text-[13px] font-extrabold text-navy-ink">{isMe ? 'Você ainda não jogou o X1.' : 'Ainda não jogou o X1.'}</p>
          {isMe && <Link to="/x1" className="btn btn-orange btn-sm mt-2 w-full">Jogar o X1</Link>}
        </div>
      ) : (
        <>
          <X1Medals record={record} history={history} />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Tile value={wins} label={wins === 1 ? 'vitória' : 'vitórias'} className="text-grass-deep" />
            <Tile value={losses} label={losses === 1 ? 'derrota' : 'derrotas'} className="text-danger" />
            <Tile value={draws} label={draws === 1 ? 'empate' : 'empates'} className="text-navy-ink" />
          </div>
          <Bar t={record} />
          <p className="mt-1.5 text-center text-[12px] font-extrabold text-muted">
            {games} {games === 1 ? 'partida' : 'partidas'}, {Math.round(((wins * 3 + draws) / (games * 3)) * 100)}% de aproveitamento
          </p>
          <p className="text-center text-[12px] font-extrabold text-navy-ink">
            <b className={record.points < 0 ? 'text-danger' : 'text-grass-deep'}>{pts(record.points)}</b> no Ranking X1 geral · sem perder: máx. {record.best}{record.streak > 0 ? ` (agora ${record.streak})` : ''}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {GAMES.filter((g) => rotation.includes(g.id) || ((record.games?.[g.id]?.wins ?? 0) + (record.games?.[g.id]?.draws ?? 0) + (record.games?.[g.id]?.losses ?? 0)) > 0).map((g) => {
              const t = record.games?.[g.id];
              return (
                <li key={g.id} className="flex items-center justify-between rounded-xl bg-sky/10 px-2 py-1">
                  <span className="text-[13px] font-extrabold text-navy-ink">{g.name}</span>
                  <span className="font-display text-[14px] tabular-nums">
                    <span className="text-grass-deep">{t?.wins ?? 0}V</span> <span className="text-navy-ink">{t?.draws ?? 0}E</span> <span className="text-danger">{t?.losses ?? 0}D</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

function Bar({ t }: { t: Pick<X1Tally, 'wins' | 'losses' | 'draws'> }) {
  const n = t.wins + t.losses + t.draws;
  if (!n) return null;
  return (
    <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-sky/15" aria-hidden>
      <span className="bg-grass" style={{ width: `${(t.wins / n) * 100}%` }} />
      <span className="bg-muted/50" style={{ width: `${(t.draws / n) * 100}%` }} />
      <span className="bg-danger" style={{ width: `${(t.losses / n) * 100}%` }} />
    </div>
  );
}

function Tile({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="rounded-xl bg-sky/10 py-2">
      <div className={`font-display text-2xl leading-none tabular-nums ${className}`}>{value}</div>
      <div className="label mt-1">{label}</div>
    </div>
  );
}
