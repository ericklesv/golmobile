import { Link } from 'react-router-dom';
import { Panel } from './ui';

/**
 * Campanha no FutPrego no perfil (pedido do dono, 15/09/2026): vitórias, derrotas e empates, e o
 * aproveitamento como no futebol (3 pontos por vitória, 1 por empate). A barra mostra a divisão.
 * Sem partidas: no próprio perfil, convite para jogar.
 */
export function FutPregoRecord({ record, isMe = false }: { record?: { wins: number; losses: number; draws: number; points?: number; streak?: number; best?: number }; isMe?: boolean }) {
  if (!record) return null;
  const { wins, losses, draws } = record;
  const games = wins + losses + draws;
  return (
    <Panel title="FUTPREGO" ribbon="orange">
      {games === 0 ? (
        <div className="text-center">
          <p className="text-[13px] font-extrabold text-navy-ink">{isMe ? 'Você ainda não jogou o FutPrego.' : 'Ainda não jogou o FutPrego.'}</p>
          {isMe && <Link to="/futprego" className="btn btn-orange btn-sm mt-2 w-full">Jogar FutPrego</Link>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Tile value={wins} label={wins === 1 ? 'vitória' : 'vitórias'} className="text-grass-deep" />
            <Tile value={losses} label={losses === 1 ? 'derrota' : 'derrotas'} className="text-danger" />
            <Tile value={draws} label={draws === 1 ? 'empate' : 'empates'} className="text-navy-ink" />
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-sky/15" aria-hidden>
            <span className="bg-grass" style={{ width: `${(wins / games) * 100}%` }} />
            <span className="bg-muted/50" style={{ width: `${(draws / games) * 100}%` }} />
            <span className="bg-danger" style={{ width: `${(losses / games) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-center text-[12px] font-extrabold text-muted">
            {games} {games === 1 ? 'partida' : 'partidas'}, {Math.round(((wins * 3 + draws) / (games * 3)) * 100)}% de aproveitamento
          </p>
          {record.points !== undefined && (
            <p className="text-center text-[12px] font-extrabold text-navy-ink">
              <b className={record.points < 0 ? 'text-danger' : 'text-grass-deep'}>{record.points} {Math.abs(record.points) === 1 ? 'ponto' : 'pontos'}</b> no Ranking X1 · sem perder: máx. {record.best ?? 0}{(record.streak ?? 0) > 0 ? ` (agora ${record.streak})` : ''}
            </p>
          )}
        </>
      )}
    </Panel>
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
