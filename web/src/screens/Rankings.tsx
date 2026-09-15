import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { TopRow } from '../lib/types';
import { Tabs, TopList, Spinner, Panel } from '../components/ui';
import { hourLabel, money as fmt } from '../lib/format';

type Scope = 'hora' | 'rodada' | 'temporada' | 'geral' | 'penal' | 'falta' | 'trilha' | 'x1';
type X1Scope = 'x1-rodada' | 'x1-temporada' | 'x1-geral';
const ITEMS: { id: Scope; label: string }[] = [
  { id: 'hora', label: 'Hora' }, { id: 'rodada', label: 'Rodada' }, { id: 'temporada', label: 'Temporada' }, { id: 'geral', label: 'Geral' },
  { id: 'penal', label: 'Pênalti' }, { id: 'falta', label: 'Falta' }, { id: 'trilha', label: 'Trilha' }, { id: 'x1', label: 'Ranking X1' },
];
const X1_ITEMS: { id: X1Scope; label: string }[] = [{ id: 'x1-rodada', label: 'Rodada' }, { id: 'x1-temporada', label: 'Temporada' }, { id: 'x1-geral', label: 'Geral' }];
const prizeLine = (rows: { from: number; to: number; money: number; vip: number }[]) =>
  rows.map((r) => `${r.from === r.to ? `${r.from}º` : `${r.from}º–${r.to}º`} ${[r.money > 0 ? fmt(r.money) : null, r.vip > 0 ? `${r.vip} VIP` : null].filter(Boolean).join(' + ')}`).join(' · ');

export function RankingsScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const [scope, setScope] = useState<Scope>('hora');
  const [x1, setX1] = useState<X1Scope>('x1-rodada'); // recorte dentro da aba Ranking X1
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [key, setKey] = useState<any>(null);
  // Trocar de aba limpa a lista E a chave no mesmo instante: a chave da Temporada/Rodada é um
  // número; se sobrasse para a aba Hora (que espera "2026-09-13-14"), a tela quebrava.
  // Tocar na aba que já está aberta não faz nada (antes limpava a lista e ela ficava carregando para sempre).
  const pick = (s: Scope) => { if (s === scope) return; setRows(null); setKey(null); setScope(s); };
  const pickX1 = (s: X1Scope) => { if (s === x1) return; setRows(null); setKey(null); setX1(s); };
  const apiScope = scope === 'x1' ? x1 : scope;

  useEffect(() => {
    let alive = true;
    api.rankings(apiScope, 50).then((r) => { if (alive) { setRows(r.rows); setKey(r.key); } }).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [apiScope]);

  const sub = scope === 'hora' && key ? `HORA ${hourLabel(key)}` : scope === 'rodada' ? `RODADA ${key ?? ''}` : scope === 'temporada' ? `TEMPORADA ${key ?? ''}` : scope === 'geral' ? 'TODOS OS TEMPOS'
    : scope === 'x1' ? (x1 === 'x1-rodada' ? `RODADA ${key ?? ''} · PONTOS` : x1 === 'x1-temporada' ? `TEMPORADA ${key ?? ''} · PONTOS` : 'PONTOS · TODOS OS TEMPOS') : `GOLS DE ${ITEMS.find((i) => i.id === scope)?.label.toUpperCase()}`;
  const fpPts = meta?.futprego?.points ?? { win: 3, draw: 1, loss: -2 };
  const fpPrizes = meta?.futprego?.prizes;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center"><div className="ribbon ribbon-orange ribbon-lg"><img src="/ui/ico-trophy_s.png" className="mr-2 h-9 w-9" alt="" />{scope === 'x1' ? 'RANKING X1' : 'ARTILHARIA'}</div></div>
      <Tabs value={scope} onChange={pick} items={ITEMS} />
      {scope === 'x1' && <Tabs value={x1} onChange={pickX1} items={X1_ITEMS} />}
      <Panel title={sub} ribbon="blue">
        {rows === null ? <div className="flex justify-center py-8"><Spinner /></div> : <TopList rows={rows} highlight={me.nick} empty={scope === 'x1' ? 'Ninguém pontuou no Ranking X1 ainda. Desafie alguém no FutPrego!' : 'Ninguém pontuou aqui ainda. Vai lá e chuta!'} />}
      </Panel>
      {scope === 'x1' ? (
        <div className="panel-full text-center text-[12px] font-extrabold">
          {x1 === 'x1-rodada' && fpPrizes && <p className="text-orange-deep">Fecha às 19:00 com a rodada: {prizeLine(fpPrizes.round)} — mínimo {fpPrizes.minGames} partidas na rodada.</p>}
          {x1 === 'x1-temporada' && fpPrizes && <p className="text-orange-deep">Fecha com a temporada: {prizeLine(fpPrizes.season)} — mínimo {fpPrizes.minGames} partidas na temporada.</p>}
          <p>Ranking X1 = FutPrego 1x1. Vitória {fpPts.win > 0 ? '+' : ''}{fpPts.win} · empate {fpPts.draw > 0 ? '+' : ''}{fpPts.draw} · derrota {fpPts.loss}. Só partidas de verdade (treino contra bot e W.O. antes de 2 jogadas não contam); a partida conta no período em que terminou. "Sem perder" = vitórias e empates seguidos.</p>
        </div>
      ) : <div className="panel-full text-center text-[12px] font-extrabold">A artilharia da hora fecha em toda hora cheia; a da rodada às 19:00. 1º da rodada: R$ 30 mil + 5 VIP · 1º da temporada: R$ 300 mil + 40 VIP.</div>}
    </div>
  );
}
