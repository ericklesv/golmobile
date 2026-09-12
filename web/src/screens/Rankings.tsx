import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { TopRow } from '../lib/types';
import { Tabs, TopList, Spinner } from '../components/ui';
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

  useEffect(() => {
    setRows(null);
    let alive = true;
    api.rankings(scope, 50).then((r) => { if (alive) { setRows(r.rows); setKey(r.key); } }).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [scope]);

  const sub = scope === 'hora' && key ? `Hora ${hourLabel(key)}` : scope === 'rodada' ? `Rodada ${key ?? ''}` : scope === 'temporada' ? `Temporada ${key ?? ''}` : scope === 'geral' ? 'Todos os tempos' : `Gols de ${ITEMS.find((i) => i.id === scope)?.label.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-poster text-3xl uppercase text-chalk">Artilharia</h1>
      <Tabs value={scope} onChange={setScope} items={ITEMS} />
      <section className="card p-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-haze">{sub}</div>
        {rows === null ? <div className="flex justify-center py-8"><Spinner /></div> : <TopList rows={rows} highlight={me.nick} empty="Ninguém pontuou aqui ainda. Vai lá e chuta!" />}
      </section>
      <p className="px-1 text-[11px] text-hazedim">A artilharia da hora fecha em toda hora cheia; a da rodada às 19:00. Prêmios: 1º da rodada R$ 30 mil + 5 VIP · 1º da temporada R$ 300 mil + 40 VIP.</p>
    </div>
  );
}
