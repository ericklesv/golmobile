import { useEffect, useState } from 'react';
import { nickProps } from '../lib/nick';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { MatchPage, Team } from '../lib/types';
import { Shield } from '../components/Shield';
import { Avatar } from '../components/Avatar';
import { NameBadges } from '../components/Badges';
import { Panel, Spinner, Empty, useCountdown } from '../components/ui';
import { countdown, pct, num } from '../lib/format';

/**
 * Página da partida (api/src/services/match.js). Tudo em espelho: mandante à esquerda, visitante à
 * direita. O gráfico "Como foi o jogo" mostra os gols de cada hora nas cores dos dois times.
 * Ao vivo, atualiza a cada 15 s.
 */

// cor do time que aparece bem no painel branco: a principal, ou a secundária se a principal for clara demais
const lum = (hex: string) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const dist = (a: string, b: string) => { const p = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }; const [x, y] = [p(a), p(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
function inks(home: Team, away: Team): [string, string] {
  const pick = (t: Team) => [t.colorPrimary, t.colorSecondary].find((c) => c && lum(c) < 0.82) ?? '#14335F';
  const h = pick(home);
  let a = pick(away);
  if (dist(h, a) < 90) a = [away.colorSecondary, away.colorPrimary].find((c) => c && lum(c) < 0.82 && dist(h, c) >= 90) ?? (dist(h, '#E8641A') >= 90 ? '#E8641A' : '#1467D9');
  return [h, a];
}
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const KIND_ROWS: { key: 'AUTO' | 'PENALTY' | 'FOUL' | 'TRAIL' | 'MINI'; label: string }[] = [
  { key: 'AUTO', label: 'Chute direto' }, { key: 'PENALTY', label: 'Pênalti' }, { key: 'FOUL', label: 'Falta' }, { key: 'TRAIL', label: 'Trilha' }, { key: 'MINI', label: 'Minigames' },
];

/** Linha espelhada: valor do mandante, rótulo no meio, valor do visitante (com barras opcionais). */
function Mirror({ label, home, away, bars, max, colors }: { label: React.ReactNode; home: React.ReactNode; away: React.ReactNode; bars?: [number, number]; max?: number; colors?: [string, string] }) {
  const w = (n: number) => `${max ? Math.max(n ? 6 : 0, Math.round((n / max) * 100)) : 0}%`;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1">
      <div className="flex items-center justify-end gap-1.5">
        <span className="font-display text-[16px] tabular-nums text-navy-ink">{home}</span>
        {bars && <span className="flex h-3 w-full max-w-[90px] justify-end overflow-hidden rounded-full bg-sky/10"><i className="block h-full rounded-full" style={{ width: w(bars[0]), background: colors?.[0] }} /></span>}
      </div>
      <span className="min-w-[88px] text-center text-[11px] font-extrabold leading-tight text-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        {bars && <span className="flex h-3 w-full max-w-[90px] overflow-hidden rounded-full bg-sky/10"><i className="block h-full rounded-full" style={{ width: w(bars[1]), background: colors?.[1] }} /></span>}
        <span className="font-display text-[16px] tabular-nums text-navy-ink">{away}</span>
      </div>
    </div>
  );
}

/** Como foi o jogo: uma coluna por hora; gols do mandante para cima, do visitante para baixo. */
function HourChart({ m, colors }: { m: MatchPage; colors: [string, string] }) {
  const n = Math.max(m.timeline.length, 1);
  const max = Math.max(1, ...m.timeline.map((t) => Math.max(t.home, t.away)));
  const W = 340, H = 150, mid = H / 2, pad = 2, bw = (W - pad * 2) / 24;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label="Gols por hora dos dois times">
        <line x1={0} x2={W} y1={mid} y2={mid} stroke="#6B86B3" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        {m.timeline.map((t, i) => {
          const x = pad + i * bw + bw * 0.15, w = bw * 0.7;
          const hh = (t.home / max) * (mid - 6), ah = (t.away / max) * (mid - 6);
          return (
            <g key={t.key}>
              <title>{`${t.hour}h: ${t.home} x ${t.away}`}</title>
              {t.home > 0 && <rect x={x} y={mid - hh} width={w} height={hh} rx={2} fill={colors[0]} />}
              {t.away > 0 && <rect x={x} y={mid} width={w} height={ah} rx={2} fill={colors[1]} />}
              {i % 3 === 0 && <text x={x + w / 2} y={H + 12} textAnchor="middle" fontSize={9} fontWeight={800} fill="#6B86B3">{t.hour}h</text>}
            </g>
          );
        })}
        {n < 24 && <rect x={pad + n * bw} y={4} width={W - pad - (pad + n * bw)} height={H - 8} rx={4} fill="#6B86B3" opacity={0.07} />}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] font-extrabold">
        <span className="flex items-center gap-1" style={{ color: colors[0] }}><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[0] }} />{m.home.name} (para cima)</span>
        <span className="flex items-center gap-1" style={{ color: colors[1] }}>{m.away.name} (para baixo)<i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[1] }} /></span>
      </div>
      <p className="mt-1 text-center text-[10px] font-bold text-muted">Gols de cada hora da rodada{m.status === 'LIVE' ? ' até agora' : ''}. A maior coluna vale {max}.</p>
    </div>
  );
}

function ScorerCol({ team, rows, side }: { team: Team; rows: MatchPage['tops']['home']; side: 'home' | 'away' }) {
  return (
    <div className="min-w-0">
      <div className={`mb-1 flex items-center gap-1.5 ${side === 'away' ? 'justify-end' : ''}`}>
        {side === 'home' && <Shield team={team} size={20} />}
        <span className="t-display truncate text-[13px] text-navy-ink">{team.abbr}</span>
        {side === 'away' && <Shield team={team} size={20} />}
      </div>
      {rows.length === 0 ? <p className={`text-[11px] font-bold text-muted ${side === 'away' ? 'text-right' : ''}`}>Ninguém marcou.</p> : (
        <ol className="flex flex-col gap-1">
          {rows.map((r, i) => (
            <li key={r.userId} className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${i === 0 ? 'bg-gold/25' : 'bg-sky/10'} ${side === 'away' ? 'flex-row-reverse text-right' : ''}`}>
              <Link to={`/jogador/${encodeURIComponent(r.nick)}`} className="shrink-0"><Avatar url={r.avatarUrl} size={22} /></Link>
              <Link to={`/jogador/${encodeURIComponent(r.nick)}`} className={`min-w-0 flex-1 truncate text-[12px] font-extrabold ${nickProps(r).className}`} style={nickProps(r).style}>{r.nick}</Link>
              <span className="font-display text-[14px] text-grass-deep">{r.goals}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function MatchScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.me);
  const [m, setM] = useState<MatchPage | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => api.match(Number(id)).then((r) => alive && setM(r)).catch(() => alive && setM((prev) => prev ?? null));
    setM(undefined); load();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15_000);
    return () => { alive = false; clearInterval(iv); };
  }, [id]);
  const rem = useCountdown(m?.status === 'LIVE' ? m.round.endsAt : null);

  if (m === undefined) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (m === null) return <Empty text="Partida não encontrada." />;
  const colors = inks(m.home, m.away);
  const live = m.status === 'LIVE';
  const mine = me ? (m.home.slug === me.team.slug ? 'home' : m.away.slug === me.team.slug ? 'away' : null) : null;
  const status = live
    ? <>AO VIVO · termina em <b className="t-gold tabular-nums">{rem > 0 ? countdown(rem) : 'instantes'}</b></>
    : m.result === 'draw' ? <>ENCERRADA · empate</> : <>ENCERRADA · vitória do <b className="t-gold">{(m.result === 'home' ? m.home : m.away).name}</b></>;
  const maxKind = Math.max(1, ...KIND_ROWS.flatMap((k) => [m.byKind.home[k.key], m.byKind.away[k.key]]));
  const st = m.standing;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => nav(-1)} className="btn-sq btn-sq-white h-11 w-11 shrink-0" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <span className="trap trap-orange text-[11px] uppercase">Série {m.serie} · {m.round.number}ª rodada · T{m.round.season}</span>
      </div>

      {/* placar */}
      <section className="panel-navy">
        <div className="flex items-center justify-between gap-2">
          <Link to={`/time/${m.home.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.home} size={64} /><span className="t-display text-center text-[13px] leading-tight">{m.home.name}</span>{mine === 'home' && <span className="trap trap-green text-[9px] uppercase">seu time</span>}</Link>
          <div className="flex items-baseline gap-2 font-display text-[52px] leading-none tabular-nums">
            <span className={m.homeGoals >= m.awayGoals ? 't-gold' : 't-out'}>{m.homeGoals}</span><span className="text-2xl text-white/60">x</span><span className={m.awayGoals >= m.homeGoals ? 't-gold' : 't-out'}>{m.awayGoals}</span>
          </div>
          <Link to={`/time/${m.away.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.away} size={64} /><span className="t-display text-center text-[13px] leading-tight">{m.away.name}</span>{mine === 'away' && <span className="trap trap-green text-[9px] uppercase">seu time</span>}</Link>
        </div>
        <div className="bar mt-3"><i style={{ width: `calc(${m.pct}% + 6px)` }} /><span>{pct(m.pct)} · {pct(100 - m.pct)}</span></div>
        <div className="mt-1.5 text-center text-[12px] font-extrabold uppercase tracking-wide text-white/90">{status}</div>
      </section>

      {/* artilheiro da partida */}
      {m.best && (
        <Link to={`/jogador/${encodeURIComponent(m.best.nick)}`} className="card-orange flex items-center gap-3" style={{ borderRadius: 18 }}>
          <span className="relative shrink-0"><Avatar url={m.best.avatarUrl} size={56} /><img src="/ui/ico-medal_gold.png" alt="" className="absolute -bottom-2 -right-2 h-8 w-8" /></span>
          <span className="min-w-0 flex-1">
            <span className="t-display block text-[12px] text-white/90">Artilheiro da partida</span>
            <span className="t-display t-out block truncate text-[22px] leading-tight">{m.best.nick}<NameBadges role={m.best.role} tops={m.best.tops} size={16} /></span>
          </span>
          <span className="shrink-0 text-center"><span className="t-display t-gold block text-[30px] leading-none">{m.best.goals}</span><span className="text-[10px] font-extrabold text-white">{m.best.goals === 1 ? 'gol' : 'gols'}</span></span>
        </Link>
      )}

      <Panel title="ARTILHEIROS" ribbon="blue">
        <div className="grid grid-cols-2 gap-2">
          <ScorerCol team={m.home} rows={m.tops.home} side="home" />
          <ScorerCol team={m.away} rows={m.tops.away} side="away" />
        </div>
      </Panel>

      <Panel title="COMO FOI O JOGO" ribbon="green">
        {m.timeline.every((t) => t.home + t.away === 0) ? <Empty text="Nenhum gol ainda. O primeiro gol aparece aqui." /> : <HourChart m={m} colors={colors} />}
      </Panel>

      <Panel title="GOLS POR TIPO" ribbon="orange">
        {KIND_ROWS.map((k) => <Mirror key={k.key} label={k.label} home={m.byKind.home[k.key]} away={m.byKind.away[k.key]} bars={[m.byKind.home[k.key], m.byKind.away[k.key]]} max={maxKind} colors={colors} />)}
        {m.minigames.length > 0 && <p className="mt-1 text-center text-[10px] font-bold text-muted">Minigames: {m.minigames.map((g) => `${g.label} ${g.home} x ${g.away}`).join(' · ')}</p>}
        {m.lost && m.lost.home + m.lost.away > 0 && <p className="mt-1 text-center text-[11px] font-extrabold text-danger">Gols perdidos no FutPrego: {m.home.abbr} −{m.lost.home} · {m.away.abbr} −{m.lost.away}</p>}
      </Panel>

      <Panel title="EM NÚMEROS" ribbon="yellow">
        <div className="mb-1 flex items-center justify-between"><Shield team={m.home} size={24} /><Shield team={m.away} size={24} /></div>
        <Mirror label="Jogadores que marcaram" home={num(m.scorersCount.home)} away={num(m.scorersCount.away)} />
        {m.online && <Mirror label="Torcedores online agora" home={num(m.online.home)} away={num(m.online.away)} />}
        {st.home && st.away && <>
          <Mirror label={`Posição na Série ${m.serie}`} home={`${st.home.position}º`} away={`${st.away.position}º`} />
          <Mirror label="Pontos" home={st.home.points} away={st.away.points} />
          <Mirror label="Campanha (V-E-D)" home={`${st.home.wins}-${st.home.draws}-${st.home.losses}`} away={`${st.away.wins}-${st.away.draws}-${st.away.losses}`} />
          <Mirror label="Saldo de gols" home={st.home.goalsFor - st.home.goalsAgainst} away={st.away.goalsFor - st.away.goalsAgainst} />
        </>}
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-sky/20 pt-2">
          {(['home', 'away'] as const).map((sd) => {
            const s = m.seasonTop[sd];
            return (
              <div key={sd} className={`min-w-0 ${sd === 'away' ? 'text-right' : ''}`}>
                <div className="text-[10px] font-extrabold text-muted">Artilheiro na temporada</div>
                {s ? <Link to={`/jogador/${encodeURIComponent(s.nick)}`} className={`flex items-center gap-1.5 ${sd === 'away' ? 'flex-row-reverse' : ''}`}><Avatar url={s.avatarUrl} size={22} /><span className="t-display min-w-0 truncate text-[13px] text-navy-ink">{s.nick}</span><span className="font-display text-[13px] text-grass-deep">{num(s.goals)}</span></Link> : <span className="text-[12px] font-bold text-muted">—</span>}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="CONFRONTOS" ribbon="blue">
        {m.h2h.matches.length === 0 ? <Empty text="Primeiro encontro entre os dois times." /> : <>
          <Mirror label="Vitórias" home={m.h2h.home} away={m.h2h.away} />
          <p className="-mt-1 text-center text-[11px] font-extrabold text-muted">{m.h2h.draws} {m.h2h.draws === 1 ? 'empate' : 'empates'}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {m.h2h.matches.map((p) => (
              <li key={p.id}><Link to={`/partida/${p.id}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg bg-sky/10 px-2 py-1">
                <span className={`text-right text-[12px] font-extrabold ${p.winner === 'home' ? 'text-grass-deep' : 'text-navy-ink'}`}>{m.home.abbr}</span>
                <span className="font-display text-[15px] tabular-nums text-navy-ink">{p.homeGoals} x {p.awayGoals}</span>
                <span className={`text-[12px] font-extrabold ${p.winner === 'away' ? 'text-grass-deep' : 'text-navy-ink'}`}>{m.away.abbr} <span className="text-[10px] font-bold text-muted">· T{p.season} R{p.round}</span></span>
              </Link></li>
            ))}
          </ul>
        </>}
      </Panel>

      <Panel title="ÚLTIMOS GOLS" ribbon="green">
        {m.recent.length === 0 ? <Empty text="Nenhum gol ainda." /> : (
          <ul className="flex flex-col gap-1">
            {m.recent.map((g) => {
              const team = g.side === 'home' ? m.home : m.away;
              return (
                <li key={g.id} className="flex items-center gap-2 text-[12px] font-bold">
                  <span className="w-10 shrink-0 font-display text-[12px] tabular-nums text-muted">{hhmm(g.at)}</span>
                  <Shield team={team} size={18} />
                  <Link to={`/jogador/${encodeURIComponent(g.nick)}`} className="min-w-0 truncate font-extrabold text-navy-ink">{g.nick}</Link>
                  <span className="ml-auto shrink-0 text-muted">{g.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
