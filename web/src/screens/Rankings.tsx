import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { TopRow } from '../lib/types';
import { Tabs, TopList, Spinner, Panel } from '../components/ui';
import { hourLabel } from '../lib/format';

type Scope = 'hora' | 'rodada' | 'temporada' | 'geral' | 'penal' | 'falta' | 'trilha';
const ITEMS: { id: Scope; label: string }[] = [
  { id: 'hora', label: 'Hora' }, { id: 'rodada', label: 'Rodada' }, { id: 'temporada', label: 'Temporada' }, { id: 'geral', label: 'Geral' },
  { id: 'penal', label: 'Pênalti' }, { id: 'falta', label: 'Falta' }, { id: 'trilha', label: 'Trilha' },
];

export function RankingsScreen() {
  const me = useAuth((s) => s.me)!;
  const [scope, setScope] = useState<Scope>('hora');
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [key, setKey] = useState<any>(null);
  // Trocar de aba limpa a lista E a chave no mesmo instante: a chave da Temporada/Rodada é um
  // número; se sobrasse para a aba Hora (que espera "2026-09-13-14"), a tela quebrava.
  const pick = (s: Scope) => { setRows(null); setKey(null); setScope(s); };

  useEffect(() => {
    let alive = true;
    api.rankings(scope, 50).then((r) => { if (alive) { setRows(r.rows); setKey(r.key); } }).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [scope]);

  const sub = scope === 'hora' && key ? `HORA ${hourLabel(key)}` : scope === 'rodada' ? `RODADA ${key ?? ''}` : scope === 'temporada' ? `TEMPORADA ${key ?? ''}` : scope === 'geral' ? 'TODOS OS TEMPOS' : `GOLS DE ${ITEMS.find((i) => i.id === scope)?.label.toUpperCase()}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center"><div className="ribbon ribbon-orange ribbon-lg"><img src="/ui/ico-trophy_s.png" className="mr-2 h-9 w-9" alt="" />ARTILHARIA</div></div>
      <Tabs value={scope} onChange={pick} items={ITEMS} />
      <Panel title={sub} ribbon="blue">
        {rows === null ? <div className="flex justify-center py-8"><Spinner /></div> : <TopList rows={rows} highlight={me.nick} empty="Ninguém pontuou aqui ainda. Vai lá e chuta!" />}
      </Panel>
      <div className="panel-full text-center text-[12px] font-extrabold">A artilharia da hora fecha em toda hora cheia; a da rodada às 19:00. 1º da rodada: R$ 30 mil + 5 VIP · 1º da temporada: R$ 300 mil + 40 VIP.</div>
    </div>
  );
}
