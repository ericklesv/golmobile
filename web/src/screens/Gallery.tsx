import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Gallery, GallerySeason } from '../lib/types';
import { Shield } from '../components/Shield';
import { Avatar } from '../components/Avatar';
import { Panel, Spinner, Empty, Tabs, TopList } from '../components/ui';
import { nickProps } from '../lib/nick';
import { num } from '../lib/format';

/**
 * Galeria de troféus (pedido do dono, 22/10/2026: os jogadores sentiram falta de ver os campeões e os artilheiros
 * das temporadas). Ocupa a aba que era do Perfil — o perfil abre pela foto no topo. Tudo vem de GET /api/gallery
 * (services/gallery.js), que só lê o que os fechamentos de rodada e de temporada já congelam.
 *
 * A peça principal é a ESTANTE: as taças dos campeões da temporada escolhida em cima da prateleira (a Série A no
 * meio, maior) e, embaixo, a plaquinha de cada série com o campeão e o vice. O resto são os painéis de sempre.
 */
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const COLUNAS = ['Série B', 'Série A', 'Série C']; // a Série A no meio, como o 1º lugar de um pódio
const ESCOPO = { HOUR: 'em 1 hora', ROUND: 'numa rodada', SEASON: 'numa temporada' } as const;
const REIS_VISIVEIS = 5;

export function GalleryScreen() {
  const [g, setG] = useState<Gallery | null>(null);
  const [erro, setErro] = useState(false);
  const [sel, setSel] = useState('');
  const [todasRodadas, setTodasRodadas] = useState(false);
  const carregar = () => {
    setErro(false);
    api.gallery().then((r) => { setG(r); setSel((s) => s || String(r.seasons[0]?.number ?? '')); }).catch(() => setErro(true));
  };
  useEffect(carregar, []);

  if (erro) return (
    <div className="flex flex-col gap-4">
      <Titulo />
      <Panel><p className="py-2 text-center text-sm font-bold text-muted">Não deu para abrir a galeria agora.</p>
        <button onClick={carregar} className="btn btn-blue btn-md mx-auto mt-1 flex">Tentar de novo</button></Panel>
    </div>
  );
  if (!g) return <div className="flex flex-col gap-4"><Titulo /><div className="flex justify-center py-10"><Spinner /></div></div>;

  const season = g.seasons.find((s) => String(s.number) === sel) ?? g.seasons[0];
  const reis = g.current?.kings ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Titulo />
      {g.seasons.length > 1 && <Tabs value={String(season?.number ?? '')} onChange={setSel} items={g.seasons.map((s) => ({ id: String(s.number), label: `Temporada ${s.number}` }))} />}
      <Estante season={season} current={g.current} />

      {season && (
        <Panel title="ARTILHEIROS" ribbon="orange">
          <p className="mb-2 text-center text-[12px] font-bold text-muted">Quem mais marcou na Temporada {season.number}</p>
          <TopList rows={season.scorers} empty="Ninguém marcou nesta temporada." />
        </Panel>
      )}
      {season && season.x1.length > 0 && (
        <Panel title="X1 DA TEMPORADA" ribbon="blue">
          <p className="mb-2 text-center text-[12px] font-bold text-muted">Os premiados do Ranking X1 (vitória 3, empate 1, derrota −2)</p>
          <TopList rows={season.x1} />
        </Panel>
      )}

      {g.records.length > 0 && (
        <Panel title="RECORDES" ribbon="green">
          <p className="mb-2 text-center text-[12px] font-bold text-muted">Os maiores números de gols de todos os tempos</p>
          <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${g.records.length}, minmax(0, 1fr))` }}>
            {g.records.map((r) => (
              <li key={r.scope}>
                <Link to={`/jogador/${encodeURIComponent(r.nick)}`} className="flex h-full flex-col items-center rounded-xl bg-sky/10 px-1 py-2 text-center">
                  <span className="t-display text-[24px] leading-none text-orange-deep">{num(r.goals)}</span>
                  <span className="min-h-[26px] text-[10px] font-extrabold leading-tight text-muted">gols {ESCOPO[r.scope]}</span>
                  <Avatar url={r.avatarUrl} size={30} className="mt-1.5" />
                  <span className={`mt-0.5 w-full truncate text-[12px] font-extrabold ${nickProps(r).className}`} style={nickProps(r).style}>{r.nick}</span>
                  {r.season !== null && <span className="text-[10px] font-bold text-muted">Temporada {r.season}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {g.hall.length > 0 && (
        <Panel title="MAIORES CAMPEÕES" ribbon="yellow">
          <ol className="flex flex-col gap-1">
            {g.hall.map((h, i) => (
              <li key={h.team.slug}>
                <Link to={`/time/${h.team.slug}`} className={`flex items-center gap-2 rounded-xl px-1.5 py-1 ${i % 2 === 0 ? 'bg-sky/10' : ''}`}>
                  <span className="w-5 shrink-0 text-center font-display text-base text-muted">{i + 1}</span>
                  <Shield team={h.team} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-extrabold leading-tight text-navy-ink">{h.team.name}</div>
                    <div className="text-[11px] font-bold leading-tight text-muted">
                      {[...h.titles.map((t) => `${t.count}× ${t.competition}`), h.vice ? `${h.vice} ${h.vice === 1 ? 'vice' : 'vices'}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-0.5" aria-label={`${h.champion} ${h.champion === 1 ? 'título' : 'títulos'}`}>
                    {Array.from({ length: Math.min(h.champion, 4) }, (_, k) => <img key={k} src="/ui/ico-trophy_s.png" className="h-5 w-5 object-contain" alt="" />)}
                    {h.champion > 4 && <b className="font-display text-[15px] text-orange-deep">×{h.champion}</b>}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {g.current && (
        <Panel title={`TEMPORADA ${g.current.number}`} ribbon="blue">
          <p className="mb-2 text-center text-[12px] font-bold text-muted">
            Em andamento{g.current.round ? `: rodada ${g.current.round} de ${g.current.totalRounds}` : ''}. O artilheiro de cada rodada que já fechou:
          </p>
          {reis.length === 0 ? <Empty text="Nenhuma rodada fechou ainda nesta temporada." /> : (
            <ol className="flex flex-col gap-1">
              {(todasRodadas ? reis : reis.slice(0, REIS_VISIVEIS)).map((k, i) => (
                <li key={k.round} className={`flex items-center gap-2 rounded-xl px-1.5 py-1 ${i % 2 === 0 ? 'bg-sky/10' : ''}`}>
                  <span className="w-[64px] shrink-0 font-display text-[13px] text-navy-ink">Rodada {k.round}</span>
                  <Link to={`/jogador/${encodeURIComponent(k.nick)}`} aria-label={k.nick}><Avatar url={k.avatarUrl} size={26} /></Link>
                  {k.team?.slug ? <Link to={`/time/${k.team.slug}`} aria-label={k.team.name}><Shield team={k.team} size={22} /></Link> : <Shield team={k.team} size={22} />}
                  <Link to={`/jogador/${encodeURIComponent(k.nick)}`} className="min-w-0 flex-1 truncate text-[14px] font-extrabold leading-tight">
                    <span className={nickProps(k).className} style={nickProps(k).style}>{k.nick}</span>
                  </Link>
                  <span className="font-display text-lg text-grass-deep">{k.goals}</span>
                </li>
              ))}
            </ol>
          )}
          {reis.length > REIS_VISIVEIS && (
            <button onClick={() => setTodasRodadas((v) => !v)} className="mt-2 w-full text-center text-[12px] font-extrabold text-sky-deep">
              {todasRodadas ? 'Mostrar só as últimas' : `Ver as ${reis.length} rodadas`}
            </button>
          )}
        </Panel>
      )}

      {g.kings.length > 0 && (
        <Panel title="REIS DA RODADA" ribbon="orange">
          <p className="mb-2 text-center text-[12px] font-bold text-muted">Quem mais vezes terminou a rodada como artilheiro (o número é quantas vezes)</p>
          <TopList rows={g.kings} />
        </Panel>
      )}
    </div>
  );
}

function Titulo() {
  return (
    <div className="flex flex-col items-center">
      <div className="ribbon ribbon-yellow ribbon-lg"><img src="/ui/ico-trophy_gold.png" className="mr-2 h-9 w-9 object-contain" alt="" />TROFÉUS</div>
      <p className="t-display t-out -mt-1 text-center text-[13px]">Campeões, artilheiros e recordes de cada temporada</p>
    </div>
  );
}

/** A prateleira: tábua de madeira com a borda de cima clara. */
function Prateleira() {
  return <div aria-hidden className="relative z-10 h-3.5 rounded-md bg-gradient-to-b from-[#d8994a] via-[#a2662a] to-[#6b3f14] shadow-[0_5px_0_rgba(0,0,0,0.35)]" />;
}

/** A estante da temporada: as três taças na prateleira e a plaquinha de cada série embaixo. */
function Estante({ season, current }: { season?: GallerySeason; current: Gallery['current'] }) {
  if (!season) return (
    <section className="panel-navy text-center">
      <div className="flex h-24 items-end justify-center gap-5 opacity-35" aria-hidden>
        {[56, 84, 56].map((w, i) => <img key={i} src="/ui/ico-trophy_silver.png" style={{ width: w }} className="object-contain grayscale" alt="" />)}
      </div>
      <Prateleira />
      <p className="mt-3 text-[13px] font-bold leading-snug text-white/90">
        A estante ainda está vazia. Os campeões da Temporada {current?.number ?? 1} entram aqui quando ela fechar{current ? `, depois da rodada ${current.totalRounds}` : ''}.
      </p>
    </section>
  );
  const por = Object.fromEntries(season.titles.map((t) => [t.competition, t]));
  return (
    <section className="panel-navy">
      <div className="text-center">
        <div className="t-display t-gold text-[24px] leading-none">Temporada {season.number}</div>
        <div className="mt-1 text-[11px] font-bold text-white/70">{dataCurta(season.startsAt)} a {season.endsAt ? dataCurta(season.endsAt) : '—'}</div>
      </div>
      <div className="relative mt-1">
        <img src="/ui/glow-circle.png" aria-hidden alt="" className="pointer-events-none absolute left-1/2 top-0 w-52 -translate-x-1/2 -translate-y-6 opacity-60" />
        <div className="relative grid grid-cols-3 items-end gap-1 px-1">
          {COLUNAS.map((c) => {
            const t = por[c];
            const grande = c === 'Série A';
            const w = grande ? 104 : 70;
            if (!t) return <div key={c} />;
            return (
              <Link key={c} to={`/time/${t.champion.slug}`} className="relative mx-auto block" style={{ width: w, height: Math.round(w * 0.84) }} aria-label={`${t.champion.name}, campeão da ${c}`}>
                <img src="/ui/ico-trophy_gold.png" alt="" className="h-full w-full object-contain drop-shadow-[0_3px_0_rgba(0,0,0,0.3)]" />
                <Shield team={t.champion} size={grande ? 38 : 26} className="absolute left-1/2 top-[14%] -translate-x-1/2" />
              </Link>
            );
          })}
        </div>
        <Prateleira />
        <div className="grid grid-cols-3 gap-1 pt-2.5 text-center">
          {COLUNAS.map((c) => {
            const t = por[c];
            if (!t) return <div key={c} />;
            const grande = c === 'Série A';
            return (
              <div key={c} className="min-w-0">
                <div className="text-[11px] font-extrabold text-white/60">{c}</div>
                <Link to={`/time/${t.champion.slug}`} className={`t-display flex min-h-[24px] items-center justify-center leading-tight ${grande ? 't-gold text-[17px]' : 't-out text-[14px]'}`}>{t.champion.name}</Link>
                {t.vice && (
                  <Link to={`/time/${t.vice.slug}`} className="mt-1 flex items-center justify-center gap-1 text-[11px] font-bold text-white/70">
                    <Shield team={t.vice} size={14} /><span className="truncate">vice: {t.vice.name}</span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
