import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useSeo } from '../lib/seo';
import { Shield } from '../components/Shield';
import { Panel, TopList, Spinner, Tabs } from '../components/ui';
import { num, pct } from '../lib/format';
import type { Serie, TeamPage } from '../lib/types';

/**
 * Páginas PÚBLICAS dos times (Guilherme, 25/09/2026, auditoria de SEO: o Google só via uma página com conteúdo; tudo
 * do jogo estava atrás do login). `/times` = os 48 clubes por série; `/time/<slug>` sem login = placar da rodada,
 * posição, campanha, artilheiros da torcida e títulos, lidos de `GET /api/teams/:slug` (a mesma rota pública da tela do
 * time — nada novo no servidor). Com login, `/time/<slug>` continua sendo a tela completa do jogo (screens/Team.tsx,
 * com a diretoria). Os nicks ficam sem link: o perfil do jogador pede login. Time novo entra sozinho aqui (vem do
 * `/api/meta`), mas precisa entrar também no `web/public/sitemap.xml`.
 */

const SERIES: Serie[] = ['A', 'B', 'C'];
/** Links inertes: nesta página o perfil do jogador está atrás do login. */
const INERTE = '[&_a]:pointer-events-none';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-frame flex min-h-full flex-col px-5 pb-10" style={{ paddingTop: 'calc(var(--sat) + 20px)' }}>
      <div className="stadium-bg" />
      <header className="relative flex items-center justify-between gap-3">
        <Link to="/" aria-label="JogaGol — página inicial"><img src="/brand/logo-h.webp" alt="JogaGol" className="h-11 drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]" /></Link>
        <Link to="/cadastro" className="btn btn-orange btn-sm">Jogar grátis</Link>
      </header>
      <div className="relative mt-5 flex flex-col gap-3">{children}</div>
      <p className="t-display t-out relative mt-6 text-center text-[11px]"><Link to="/">Como funciona</Link> · <Link to="/times">Os 48 times</Link> · <Link to="/brgol">O que foi o BRGOL</Link> · <Link to="/privacidade">Privacidade</Link></p>
    </div>
  );
}

/** Os clubes de uma série, com link para a página de cada um. */
function SerieList({ serie, current }: { serie: Serie; current?: string }) {
  const teams = (useAuth((s) => s.meta)?.teams ?? []).filter((t) => t.serie === serie);
  if (!teams.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-1.5">
      {teams.map((t) => (
        <li key={t.slug}>
          <Link to={`/time/${t.slug}`} className={`flex items-center gap-2 rounded-xl p-1.5 ${t.slug === current ? 'bg-gold/40' : 'bg-sky/10'}`}>
            <Shield team={t} size={28} />
            <span className="min-w-0 truncate text-[12px] font-extrabold text-navy-ink">{t.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TeamsIndexScreen() {
  useSeo('Os 48 times do JogaGol — Séries A, B e C', 'Os clubes brasileiros do JogaGol, o jogo de fazer gols online: escolha o seu, veja o placar da rodada e os artilheiros da torcida em cada time das Séries A, B e C.', '/times');
  return (
    <Frame>
      <div className="text-center">
        <h1 className="t-display t-out text-[24px] leading-tight">Os 48 times do JogaGol</h1>
        <p className="mt-1 text-[13px] font-extrabold text-white/90 drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]">Escolha o seu clube: cada gol seu soma no placar dele na rodada de 24 horas.</p>
      </div>
      {SERIES.map((s) => <Panel key={s} title={`SÉRIE ${s}`} ribbon={s === 'A' ? 'orange' : s === 'B' ? 'blue' : 'green'}><SerieList serie={s} /></Panel>)}
      <Link to="/cadastro" className="btn btn-orange btn-lg w-full">Escolher meu time</Link>
    </Frame>
  );
}

export function PublicTeamScreen({ slug }: { slug: string }) {
  const [page, setPage] = useState<TeamPage | null>(null);
  const [erro, setErro] = useState(false);
  const [tab, setTab] = useState<'hour' | 'round' | 'season'>('round');
  useEffect(() => { setPage(null); setErro(false); api.team(slug).then(setPage).catch(() => setErro(true)); }, [slug]);
  // time que não existe: a página diz isso e pede ao Google para não indexar (senão vira "página vazia" no índice)
  useEffect(() => {
    if (!erro) return;
    const m = document.head.querySelector('meta[name="robots"]');
    const antes = m?.getAttribute('content');
    m?.setAttribute('content', 'noindex');
    return () => { if (antes) m?.setAttribute('content', antes); };
  }, [erro]);
  const t = page?.team;
  useSeo(
    t ? `${t.name} no JogaGol: placar, artilheiros e tabela` : 'Time do JogaGol',
    t ? `${t.name} (Série ${t.serie}) no JogaGol, o jogo de fazer gols online: veja o placar da rodada, a posição na tabela e os artilheiros da torcida. Escolha o ${t.name} e faça gols pelo seu time.` : 'Placar da rodada, tabela e artilheiros da torcida no JogaGol, o jogo de fazer gols online.',
    `/time/${slug}`,
  );

  if (erro) return (
    <Frame>
      <Panel title="TIME NÃO ENCONTRADO" ribbon="orange"><p className="text-center text-[14px] font-bold text-navy-ink/85">Esse time não existe no JogaGol. Veja <Link to="/times" className="text-sky-deep underline">os 48 times</Link>.</p></Panel>
    </Frame>
  );
  if (!page || !t) return <Frame><div className="flex justify-center py-16"><Spinner /></div></Frame>;
  const m = page.match;
  const mine = m ? (m.home.slug === t.slug ? 'home' : 'away') : null;
  const st = page.standing;

  return (
    <Frame>
      <section className="panel-navy relative">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white/90 p-2 shadow-lg"><Shield team={t} size={72} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="t-display t-out text-[26px] leading-tight">{t.name} no JogaGol</h1>
            <div className="trap trap-blue mt-1 text-[10px] uppercase">{t.state} · {t.stadium} · Série {t.serie}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-white/10 py-2 text-center">
          <div><div className="t-display t-out text-2xl">{st?.position ?? '-'}º</div><div className="t-display text-[10px] uppercase tracking-wider text-white/80">na Série {t.serie}</div></div>
          <div><div className="t-display t-gold text-2xl">{st?.points ?? 0}</div><div className="t-display text-[10px] uppercase tracking-wider text-white/80">pontos</div></div>
          <div><div className="t-display t-out text-2xl">{num(page.members)}</div><div className="t-display text-[10px] uppercase tracking-wider text-white/80">jogadores</div></div>
        </div>
        <p className="mt-2 text-center text-[12px] font-extrabold text-white/90">{st ? `Campanha na temporada: ${st.wins} vitórias, ${st.draws} empates e ${st.losses} derrotas · ` : ''}{num(page.totalGoals)} gols na história</p>
      </section>

      <Link to={`/cadastro?time=${t.slug}`} className="btn btn-orange btn-lg w-full">Jogar pelo {t.name}</Link>

      {m && (
        <Panel title={`JOGO DA RODADA ${m.round?.number ?? ''}`} ribbon="orange">
          <div className="flex items-center justify-between">
            <Link to={`/time/${m.home.slug}`} className="flex min-w-0 flex-1 flex-col items-center gap-1"><Shield team={m.home} size={48} /><span className="text-center text-[11px] font-extrabold text-navy-ink">{m.home.name}</span></Link>
            <span className="font-display shrink-0 text-4xl tabular-nums text-navy-ink"><span className={mine === 'home' ? 'text-orange-deep' : ''}>{m.homeGoals}</span> <span className="text-muted">x</span> <span className={mine === 'away' ? 'text-orange-deep' : ''}>{m.awayGoals}</span></span>
            <Link to={`/time/${m.away.slug}`} className="flex min-w-0 flex-1 flex-col items-center gap-1"><Shield team={m.away} size={48} /><span className="text-center text-[11px] font-extrabold text-navy-ink">{m.away.name}</span></Link>
          </div>
          <div className="bar mt-2" style={{ height: 16 }}><i style={{ width: `calc(${m.pct}% + 6px)` }} /><span style={{ fontSize: 10 }}>{pct(m.pct)} · {pct(100 - m.pct)}</span></div>
          <p className="mt-2 text-center text-[12px] font-bold text-muted">A rodada dura 24 horas e fecha às 19h: cada gol da torcida entra neste placar.</p>
        </Panel>
      )}

      <Panel title="ARTILHEIROS DA TORCIDA" ribbon="blue">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'hour', label: 'Hora' }, { id: 'round', label: 'Rodada' }, { id: 'season', label: 'Temporada' }]} />
        <div className={`mt-2 ${INERTE}`}><TopList rows={page.tops[tab]} empty="Ninguém marcou ainda." /></div>
      </Panel>

      {page.titles.length > 0 && (
        <Panel title="TÍTULOS" ribbon="yellow">
          <ul className="flex flex-wrap gap-2">{page.titles.map((tt, i) => <li key={i} className={`trap ${tt.place === 1 ? 'trap-orange' : 'trap-blue'} text-[11px]`}><img src={tt.place === 1 ? '/ui/ico-trophy_s.png' : '/ui/ico-medal_silver.png'} className="mr-1 h-5 w-5" alt="" />{tt.competition} · T{tt.season}</li>)}</ul>
        </Panel>
      )}

      <Panel title={`OUTROS TIMES DA SÉRIE ${t.serie}`} ribbon="green"><SerieList serie={t.serie} current={t.slug} /></Panel>
    </Frame>
  );
}
