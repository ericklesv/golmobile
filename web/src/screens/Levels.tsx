import { useAuth } from '../store/auth';
import { Panel, Bar } from '../components/ui';
import { num } from '../lib/format';

/** Página de níveis: a tabela original do BRGOL (Pintinho, Frango, Sub-12…) com o que cada um libera. */
export function LevelsScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const levels = meta?.levels ?? [];
  const cur = me.level.lvl;
  const next = me.level.next;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center"><div className="ribbon ribbon-blue ribbon-lg"><img src="/ui/lvl-badge-blue.png" className="mr-2 h-9 w-9" alt="" />NÍVEIS</div></div>

      <section className="panel-navy">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0"><img src="/ui/lvl-badge-yellow.png" alt="" className="h-16 w-16" /><span className="t-display t-out absolute inset-0 flex items-center justify-center pb-1 text-2xl">{cur}</span></div>
          <div className="min-w-0 flex-1">
            <div className="t-display t-out truncate text-2xl">{me.level.name}</div>
            <div className="text-[12px] font-extrabold text-white/90">{num(me.levelPoints)} pontos de nível</div>
          </div>
        </div>
        <div className="mt-3">
          <Bar value={me.levelPoints - me.level.goals} max={(next?.goals ?? me.levelPoints) - me.level.goals} label={next ? `faltam ${num(next.goals - me.levelPoints)} para ${next.name}` : 'nível máximo'} yellow />
        </div>
        <p className="mt-2 text-center text-[11px] font-bold text-white/80">Cada gol vale 1 ponto. O Termo e o Quiz do dia dão pontos extras. Quanto mais alto o nível, mais chutes, menos espera na Trilha e rebotes (segunda chance) nos chutes.</p>
      </section>

      <Panel title="A ESCADA DO CRAQUE" ribbon="orange">
        <ol className="flex flex-col gap-1">
          {levels.map((l) => {
            const done = l.lvl < cur, now = l.lvl === cur;
            return (
              <li key={l.lvl} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${now ? 'bg-gold/30 ring-2 ring-gold' : done ? 'bg-grass/15' : l.lvl % 2 ? 'bg-sky/10' : ''}`}>
                <div className="relative shrink-0">
                  <img src={now ? '/ui/lvl-badge-yellow.png' : '/ui/lvl-badge-blue.png'} alt="" className={`h-9 w-9 ${done ? '' : now ? '' : 'opacity-60 grayscale'}`} />
                  <span className="t-display t-out absolute inset-0 flex items-center justify-center pb-0.5 text-[13px]">{l.lvl}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`t-display text-[15px] ${now ? 'text-orange-deep' : done ? 'text-grass-deep' : 'text-navy-ink'}`}>{l.name}{now && <span className="ml-2 trap trap-orange text-[9px]">VOCÊ</span>}</div>
                  <div className="text-[11px] font-bold text-muted">{l.skill ?? 'Começo de carreira'}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-base text-navy-ink">{num(l.goals)}</div>
                  <div className="text-[9px] font-extrabold uppercase text-muted">pontos</div>
                </div>
                {done && <img src="/ui/check-green.png" className="h-6 w-6 shrink-0" alt="conquistado" />}
              </li>
            );
          })}
        </ol>
      </Panel>
      <p className="text-center text-[11px] font-bold text-white/80">Além da tabela: Bola Prateada (top 2–5 da temporada) e Bola Dourada (top 1).</p>
    </div>
  );
}
