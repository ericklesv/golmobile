/**
 * Relatório AO VIVO do admin (pedido do dono, 18/09/2026: "métricas de tudo e em tempo real"): o miolo que o menu
 * flutuante da esquerda (AdminDock) e a aba Relatório do /admin mostram. Lê `GET /api/painel/relatorio?dias=`
 * (api/src/services/report.js) a cada 15 s enquanto a aba está visível.
 * Blocos, nesta ordem (dono, 22/09/2026: "precisamos ver essas infos primeiro e não ter que rolar"): agora — QUEM
 * está online (sem bots) e QUEM está jogando o X1 ao vivo, depois gols, contas, PIX, chat, bots —, a atividade
 * dos jogadores (últimos eventos), gols por hora, retenção dos últimos 7 dias, funil dos novatos pelos eventos
 * (lib/track.ts) e onde somem (última tela + tempo de sessão).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { AdminReport as Report, AdminX1Live } from '../lib/types';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const hm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
const EVENT_LABEL: Record<string, string> = { 'app.abriu': 'abriu o app', 'app.saiu': 'saiu', 'app.voltou': 'voltou ao app', 'cadastro.ok': 'CRIOU A CONTA', 'recarga.vista': 'viu a recarga', 'slider.visto': 'viu os minigames', 'erro.tela': 'ERRO na tela' };
const SCREEN: Record<string, string> = { home: 'Início', landing: 'Landing', cadastro: 'Cadastro', entrar: 'Login', penalti: 'Pênalti', falta: 'Falta', trilha: 'Trilha', liga: 'Liga', rankings: 'Rankings', loja: 'Loja', vip: 'VIP', time: 'Time', perfil: 'Perfil', chat: 'Chat', x1: 'X1', mensagens: 'Mensagens', ativos: 'Ativos', jogador: 'Jogador', partida: 'Partida', niveis: 'Níveis', termo: 'Termo', quiz: 'Quiz', memoria: 'Memória', qualtime: 'De que time é?', alvo: 'Alvo no Gol', estatisticas: 'Estatísticas', camisas: 'Camisas', 'hat-trick': 'Hat Trick', 'falta-pro': 'Falta PRO', 'ganha-ou-perde': 'Ganha ou Perde', partygol: 'Party GoL', penalcup: 'PenalCup', propostas: 'Propostas', admin: 'Painel', regras: 'Regras' };
const screen = (s: string) => SCREEN[s] || s;
const eventLabel = (e: Report['eventos'][number]) => {
  if (e.name.startsWith('tela.')) return `abriu ${screen(e.name.slice(5))}`;
  const base = EVENT_LABEL[e.name] || e.name;
  const d = e.data || {};
  if (e.name === 'app.saiu') return `${base} (${d.seg ?? '?'} s em ${screen(String(d.tela ?? ''))})`;
  if (e.name === 'app.abriu') return `${base}${d.ref ? ` via ${d.ref}` : ''}${d.twa ? ' · app' : d.pwa ? ' · PWA' : ''}`;
  if (e.name === 'erro.tela') return `${base}: ${String(d.msg ?? '').slice(0, 40)}`;
  return base;
};

const X1_GAME: Record<AdminX1Live['game'], string> = { FUTPREGO: 'FutPrego', BOTAO: 'Botão', FUTGOLF: 'Futgolf' };
/** "há 40 s" / "há 3 min" a partir do relógio do servidor (r.at), não do aparelho. */
const ago = (ms: number) => (ms < 60_000 ? `há ${Math.max(0, Math.round(ms / 1000))} s` : `há ${Math.round(ms / 60_000)} min`);

/** Nick que abre o perfil (a lista é só de admin: a marca de bot não sai daqui). */
function Nick({ nick, abbr, tag, vip }: { nick: string; abbr: string | null; tag?: string; vip?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <Link to={`/jogador/${encodeURIComponent(nick)}`} className={`font-extrabold hover:underline ${vip ? 'text-sky-light' : 'text-white'}`}>{nick}</Link>
      {abbr && <span className="text-[9px] font-bold text-white/50">{abbr}</span>}
      {tag && <span className="rounded bg-orange/80 px-1 text-[9px] font-extrabold uppercase text-white">{tag}</span>}
    </span>
  );
}

/** Card largo de ONLINE: o número e quem é (sem bots), o visto há menos tempo primeiro. */
function OnlineCard({ a }: { a: Report['agora'] }) {
  const resto = a.online - a.onlineList.length;
  return (
    <div className="rounded-xl bg-white/[0.07] px-2.5 py-2">
      <div className="flex items-baseline justify-between">
        <span><span className="t-display text-[22px] leading-none text-gold">{a.online}</span><span className="ml-1.5 text-[11px] font-extrabold uppercase text-white/90">online</span></span>
        <span className="text-[10px] font-bold text-white/55">{a.active24} ativos 24 h · sem bots</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] leading-tight">
        {a.onlineList.length ? a.onlineList.map((u) => <Nick key={u.id} nick={u.nick} abbr={u.abbr} vip={u.vip} />) : <span className="font-bold text-white/60">ninguém agora</span>}
        {resto > 0 && <span className="font-bold text-white/50">e mais {resto}</span>}
      </div>
    </div>
  );
}

/** Card largo do X1 AO VIVO: o número e, partida a partida, quem está jogando (bots marcados — só o admin vê). */
function X1Card({ a, now }: { a: Report['agora']; now: number }) {
  return (
    <div className="rounded-xl bg-white/[0.07] px-2.5 py-2">
      <div className="flex items-baseline justify-between">
        <span><span className={`t-display text-[22px] leading-none ${a.x1AoVivo ? 'text-green-400' : 'text-gold'}`}>{a.x1AoVivo}</span><span className="ml-1.5 text-[11px] font-extrabold uppercase text-white/90">X1 ao vivo</span></span>
        <span className="text-[10px] font-bold text-white/55">{a.x1Hoje} partidas hoje</span>
      </div>
      {a.x1Partidas.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {a.x1Partidas.map((m) => {
            const [p, q] = m.players;
            const tag = (x: AdminX1Live['players'][number]) => (x.bot ? 'treino' : x.ai ? 'bot' : undefined);
            const extra = m.training ? 'treino c/ bot' : m.freeplay ? 'mesma internet' : m.sameTeam ? 'amistoso' : null;
            return (
              <div key={m.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-white/5 pt-1 text-[11px] leading-tight">
                <span className="min-w-0 flex-1"><Nick nick={p.nick} abbr={p.abbr} tag={tag(p)} /> <span className="text-white/45">×</span> {q ? <Nick nick={q.nick} abbr={q.abbr} tag={tag(q)} /> : <span className="text-white/60">…</span>}</span>
                <span className="shrink-0 tabular-nums text-white/60">{X1_GAME[m.game]}{m.score ? ` ${m.score[0]}–${m.score[1]}` : ''} · {m.turns} jog. · {ago(now - m.since)}{extra ? ` · ${extra}` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tile({ v, l, s, warn }: { v: string | number; l: string; s?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.07] px-2.5 py-2">
      <div className={`t-display text-[22px] leading-none ${warn ? 'text-orange' : 'text-gold'}`}>{v}</div>
      <div className="mt-1 text-[11px] font-extrabold uppercase leading-tight text-white/90">{l}</div>
      {s && <div className="text-[10px] font-bold leading-tight text-white/55">{s}</div>}
    </div>
  );
}

function H({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="mb-1.5 mt-3 flex items-center justify-between"><span className="t-display text-[13px] uppercase tracking-wide text-sky-light">{children}</span>{right}</div>;
}

function Bar({ label, n, total, hi }: { label: string; n: number; total: number; hi?: boolean }) {
  const p = pct(n, total);
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between text-[11px] font-bold"><span className="truncate text-white/85">{label}</span><span className="ml-2 shrink-0 tabular-nums text-white">{n} <span className="text-white/50">({p}%)</span></span></div>
      <div className="mt-0.5 h-[6px] rounded-full bg-white/10"><div className={`h-full rounded-full ${hi ? 'bg-gold' : 'bg-sky'}`} style={{ width: `${Math.max(1, p)}%` }} /></div>
    </div>
  );
}

function Spark({ data }: { data: { h: number; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const W = 300, H = 44, slot = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="h-[56px] w-full" role="img" aria-label="Gols por hora nas últimas 24 h">
      {data.map((d, i) => { const h = Math.max(1, (d.n / max) * H); const last = i === data.length - 1; return (
        <g key={i}>
          <rect x={i * slot + 1.5} y={H - h} width={slot - 3} height={h} rx={2} fill={last ? '#FFC63D' : '#2EA8FF'} opacity={last ? 1 : 0.85} />
          {(d.h % 6 === 0 || last) && <text x={i * slot + slot / 2} y={H + 10} fontSize={8} fill="rgba(255,255,255,0.55)" textAnchor="middle">{d.h}h</text>}
        </g>); })}
    </svg>
  );
}

export function AdminReport({ compact = false }: { compact?: boolean }) {
  const [dias, setDias] = useState<1 | 7 | 30>(7);
  const [r, setR] = useState<Report | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => { if (document.visibilityState !== 'visible') return; api.adminRelatorio(dias).then((x) => { if (alive) { setR(x); setErro(null); } }).catch((e) => { if (alive) setErro((e as Error).message); }); };
    load();
    const iv = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(iv); };
  }, [dias]);

  if (!r) return <div className="p-3 text-[12px] font-bold text-white/70">{erro ? `Sem relatório: ${erro}` : 'Carregando…'}</div>;
  const a = r.agora, ret = r.retencao, f = r.funil, o = r.ondeSaem;
  const delta = (hoje: number, ontem: number) => `ontem ${ontem}`;
  const tiles = `grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`;
  return (
    <div className={`text-white ${compact ? 'px-3 pb-3' : 'rounded-2xl bg-navy-deep/85 px-3 pb-3 pt-1'}`}>
      <div className="flex items-center justify-between pt-2 text-[10px] font-bold text-white/60">
        <span><span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-green-400 align-middle" />ao vivo · {hm(r.at)}</span>
        <span>{erro ? <span className="text-orange">sem sinal</span> : 'atualiza a cada 15 s'}</span>
      </div>

      <H>Agora</H>
      <div className="flex flex-col gap-1.5">
        <OnlineCard a={a} />
        <X1Card a={a} now={r.at} />
      </div>
      <div className={`mt-1.5 ${tiles}`}>
        <Tile v={a.golsHora} l="gols nesta hora" s={`${a.marcaramHoje} marcaram hoje`} />
        <Tile v={a.golsHoje} l="gols hoje" s={delta(a.golsHoje, a.golsOntem)} />
        <Tile v={a.contasHoje} l="contas hoje" s={delta(a.contasHoje, a.contasOntem)} warn={a.contasHoje === 0} />
        <Tile v={a.pixHoje.n} l="PIX hoje" s={brl(a.pixHoje.cents)} />
        <Tile v={a.chatHoje} l="msgs no chat" s="hoje" />
        <Tile v={a.botsOnline} l="bots online" s={`${a.botsGolsHoje} gols de bot hoje`} />
        <Tile v={`${pct(a.marcaramHoje, a.active24)}%`} l="dos ativos marcaram" s={`${a.marcaramOntem} ontem`} />
      </div>

      <H>Atividade dos jogadores</H>
      <div className="max-h-[260px] overflow-y-auto rounded-xl bg-white/[0.05] px-2 py-1">
        {r.eventos.length ? r.eventos.map((e) => (
          <div key={e.id} className="flex gap-2 border-b border-white/5 py-0.5 text-[11px] leading-snug last:border-0">
            <span className="shrink-0 tabular-nums text-white/45">{hm(e.at).slice(0, 5)}</span>
            <span className="min-w-0 truncate"><b className={e.nick ? 'text-sky-light' : 'text-white/60'}>{e.nick ?? 'visitante'}</b> <span className={e.name === 'cadastro.ok' ? 'text-gold' : e.name === 'erro.tela' ? 'text-orange' : 'text-white/85'}>{eventLabel(e)}</span></span>
          </div>
        )) : <div className="py-1 text-[11px] font-bold text-white/60">nenhum evento ainda</div>}
      </div>
      <div className="mt-2 rounded-xl bg-white/[0.05] px-2 pt-1"><div className="text-[10px] font-bold text-white/55">Gols por hora · últimas 24 h (sem bots)</div><Spark data={a.porHora} /></div>

      <H>Retenção · contas dos últimos 7 dias</H>
      <div className="grid grid-cols-3 gap-1.5">
        <Tile v={`${pct(ret.d1, ret.base)}%`} l="voltaram" s={`${ret.d1} de ${ret.base}`} />
        <Tile v={`${pct(ret.d3, ret.base3)}%`} l="3+ dias" s={`${ret.d3} de ${ret.base3}`} />
        <Tile v={`${pct(ret.ativos48, ret.base)}%`} l="ativos 48 h" s={`${ret.ativos48} de ${ret.base}`} />
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-x-2 text-[10px] font-bold text-white/70">
        <span>dia</span><span className="text-right">contas</span><span className="text-right">chutaram</span><span className="text-right">voltaram</span>
        {ret.porDia.map((d) => (<div key={d.day} className="contents text-white/90">
          <span>{d.label}</span><span className="text-right tabular-nums">{d.n}</span><span className="text-right tabular-nums">{d.kicked}</span><span className="text-right tabular-nums">{d.d1 === null ? '—' : `${d.d1} (${pct(d.d1, d.n)}%)`}</span>
        </div>))}
      </div>

      <H right={<span className="flex gap-1">{([1, 7, 30] as const).map((d) => <button key={d} onClick={() => setDias(d)} className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${dias === d ? 'bg-white text-navy-ink' : 'bg-white/10 text-white/70'}`}>{d === 1 ? 'hoje' : `${d} d`}</button>)}</span>}>Funil dos novatos</H>
      <div className="mb-1 text-[10px] font-bold text-white/55">{f.cohort} contas no período · {f.medido} com eventos (medição desde 19/09)</div>
      {f.steps.map((s) => <Bar key={s.key} label={s.label} n={s.n} total={s.key === 'voltou' ? (s.base ?? f.base1) : f.cohort} hi={s.key === 'voltou'} />)}

      <H>Onde somem</H>
      <div className="text-[10px] font-bold text-white/55">Última tela de quem nunca mais voltou ({o.churned})</div>
      {o.ultimaTela.length ? o.ultimaTela.map((t) => <Bar key={t.tela} label={t.label} n={t.n} total={o.churned} />) : <div className="text-[11px] font-bold text-white/60">ainda sem dados — precisa de contas criadas depois da medição começar</div>}
      <div className="mt-1.5 rounded-xl bg-white/[0.05] px-2 py-1.5 text-[11px] font-bold text-white/85">
        Sessões dos novatos ({o.sessao.n}): mediana <span className="text-gold">{Math.round(o.sessao.medianaSeg / 60)} min</span> · até 1 min {o.sessao.ate1min} · 1–5 min {o.sessao.ate5min} · 5–15 min {o.sessao.ate15min} · 15+ min {o.sessao.mais15}
      </div>

    </div>
  );
}
