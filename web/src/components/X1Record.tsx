import { Link } from 'react-router-dom';
import { Panel } from './ui';
import type { X1Game, X1Record as Rec, X1Tally } from '../lib/types';

/**
 * Campanha no X1 no perfil (pedido do dono, 15/09/2026: "no perfil os dados do X1 ao invés de FUTPREGO"):
 * a temporada no Ranking X1 (posição e pontos — 3 por vitória, 1 por empate, −2 por derrota: services/x1.js),
 * o total de sempre — vitórias, derrotas, empates, aproveitamento, pontos e a maior sequência sem perder — e
 * cada jogo. Sem partidas: no próprio perfil, convite para jogar.
 */
const GAMES: { id: X1Game; name: string }[] = [{ id: 'FUTPREGO', name: 'FutPrego' }, { id: 'BOTAO', name: 'Futebol de Botão' }];
const medal = ['/ui/ico-medal_gold.png', '/ui/ico-medal_silver.png', '/ui/ico-medal_bronze.png'];
const pts = (n: number) => `${n} ${Math.abs(n) === 1 ? 'ponto' : 'pontos'}`;

export function X1Record({ record, isMe = false }: { record?: Rec; isMe?: boolean }) {
  if (!record) return null;
  const { wins, losses, draws, season } = record;
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
          {season && (
            <Link to="/rankings?aba=x1-temporada" className="mb-2 flex items-center gap-2 rounded-xl bg-gold/20 px-2 py-1.5 ring-1 ring-gold/60">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                {season.position && season.position <= 3 ? <img src={medal[season.position - 1]} className="ico h-9 w-9" alt="" /> : <span className="font-display text-[20px] leading-none text-navy-ink">{season.position ? `${season.position}º` : '–'}</span>}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[12px] font-extrabold text-muted">Ranking X1, temporada {season.number}</span>
                <span className="block text-[14px] font-extrabold text-navy-ink">
                  {season.played > 0 ? `${pts(season.points)} em ${season.played} ${season.played === 1 ? 'partida' : 'partidas'}` : 'Nenhuma partida nesta temporada'}
                </span>
              </span>
            </Link>
          )}
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
            {GAMES.map((g) => {
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
