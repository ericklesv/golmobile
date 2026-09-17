import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { Shield } from './Shield';
import { Panel } from './ui';
import { nickProps } from '../lib/nick';
import type { TopRow } from '../lib/types';

/**
 * REI DO X1 DA RODADA (pedido do dono, 17/09/2026): o pódio do Ranking X1 desta rodada na tela inicial —
 * 1º no meio, mais alto, 2º à esquerda e 3º à direita.
 *
 * O símbolo do X1 no jogo é a CAVEIRA (ico-skullking_*), não troféu nem coroa — a coroa aqui já quer dizer VIP,
 * e trocar o significado confundiria. Os degraus têm alturas diferentes de propósito: é a informação (quem
 * está na frente) virando desenho, sem precisar de legenda. Com menos de 3 jogadores mostra só quem tem; com
 * nenhum, vira convite para jogar.
 */
const LUGAR = [
  { icone: '/ui/ico-skullking_silver.png', degrau: 'h-10 bg-[#C8D4E4]', anel: 'ring-[3px] ring-[#C8D4E4]', ordem: 'order-1' }, // 2º
  { icone: '/ui/ico-skullking_gold.png', degrau: 'h-[68px] bg-gold', anel: 'ring-4 ring-gold', ordem: 'order-2' }, // 1º
  { icone: '/ui/ico-skullking_bronze.png', degrau: 'h-6 bg-[#E39A63]', anel: 'ring-[3px] ring-[#E39A63]', ordem: 'order-3' }, // 3º
];

function Lugar({ row, pos }: { row: TopRow; pos: 1 | 2 | 3 }) {
  const l = LUGAR[pos === 1 ? 1 : pos === 2 ? 0 : 2];
  const rei = pos === 1;
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center justify-end ${l.ordem}`}>
      <img src={l.icone} className={rei ? 'h-10 w-10' : 'h-7 w-7'} alt={`${pos}º lugar`} />
      <Link to={`/jogador/${row.nick}`} className="no-drag flex min-w-0 flex-col items-center">
        <div className={`relative rounded-full ${l.anel}`}>
          <Avatar url={row.avatarUrl} size={rei ? 62 : 46} />
          <Shield team={row.team} size={rei ? 26 : 20} className="absolute -bottom-1 -right-1" />
        </div>
        <span className={`mt-1 max-w-full truncate ${rei ? 'text-[14px]' : 'text-[12px]'} t-display`}>
          <span className={nickProps(row, { plain: 'text-navy-ink' }).className} style={nickProps(row).style}>{row.nick}</span>
        </span>
      </Link>
      <span className={`t-display ${rei ? 'text-[20px]' : 'text-[16px]'} leading-none text-grass-deep`}>{row.goals}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{row.goals === 1 ? 'ponto' : 'pontos'}</span>
      <div className={`mt-1 flex w-full items-start justify-center rounded-t-lg border-x-2 border-t-2 border-white/60 ${l.degrau} pt-0.5`}>
        <span className="t-display text-[13px] text-navy-ink">{pos}º</span>
      </div>
    </div>
  );
}

export function X1King({ rows }: { rows: TopRow[] }) {
  const podio = rows.slice(0, 3);
  return (
    <Panel title="REI DO X1 DA RODADA" ribbon="yellow">
      {podio.length === 0 ? (
        <div className="py-2 text-center">
          <p className="text-[13px] font-bold text-muted">Ninguém venceu no X1 nesta rodada ainda.</p>
          <Link to="/x1" className="btn btn-green btn-sm mt-2">Desafiar alguém</Link>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-center gap-2">
            {podio.map((r, i) => <Lugar key={r.userId} row={r} pos={(i + 1) as 1 | 2 | 3} />)}
          </div>
          {/* o chão do pódio: sem ele os degraus parecem cortados na borda do painel */}
          <div className="h-2 w-full rounded-full bg-[#B8C7DC] shadow-[inset_0_-2px_0_rgba(0,0,0,.12)]" />
          <p className="mt-2 text-center text-[11px] font-bold text-muted">
            3 pontos por vitória, 1 por empate, −2 por derrota. Fecha com a rodada, às 19h.
          </p>
        </>
      )}
    </Panel>
  );
}
