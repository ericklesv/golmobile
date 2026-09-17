import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { DailyStatus, Home, Kind } from '../lib/types';
import { Shield } from '../components/Shield';
import { GoalOverlay } from '../components/GoalOverlay';
import { MinigameSlider } from '../components/MinigameSlider';
import { X1King } from '../components/X1King';
import { Panel, TopList, ProgressRing, useCountdown, Countdown } from '../components/ui';
import { countdown, hourLabel, timeAgo, pct } from '../lib/format';
import { toast } from '../components/Toast';
import { PassCard } from '../components/Pass';

const TARGETS: { id: Kind; label: string; icon: string; color: string; to?: string }[] = [
  { id: 'AUTO', label: 'Chute', icon: '/ui/ico-energy.png', color: '#4CD137' },
  { id: 'PENALTY', label: 'Pênalti', icon: '/ui/ico-glove.png', color: '#FFC63D', to: '/penalti' },
  { id: 'FOUL', label: 'Falta', icon: '/ui/ico-star01_s.png', color: '#2EA8FF', to: '/falta' },
  { id: 'TRAIL', label: 'Trilha', icon: '/ui/ico-badge.png', color: '#FF8A2A', to: '/trilha' },
];

/** Chute de prata (bate 2x) e de ouro (bate 3x): a cor do metal e como a etiqueta chama cada um. */
const METAL = {
  PRATA: { ring: '#C8D4E4', pill: 'bg-[#C8D4E4]', nome: 'PRATA' },
  OURO: { ring: '#FFC63D', pill: 'bg-gold', nome: 'OURO' },
};

function KickTarget({ t, onAuto }: { t: typeof TARGETS[number]; onAuto: () => void }) {
  const me = useAuth((s) => s.me)!;
  const cd = me.cooldowns[t.id];
  const rem = useCountdown(cd.readyAt);
  const ready = rem <= 0 || !!cd.free; // sobrou batida da bola de prata/ouro: bate na hora
  const progress = cd.cooldownMs ? 1 - rem / cd.cooldownMs : 1;
  const nav = useNavigate();
  const meta = useAuth((s) => s.meta);
  const unlockLvl = meta?.unlock[t.id] ?? 0;
  const trailActive = t.id === 'TRAIL' && me.trail.active;
  const active = (ready || trailActive) && cd.unlocked;
  // a bola desta recarga: o card já fica prateado/dourado ENQUANTO o tempo corre, para o jogador ver o que vem
  const metal = cd.unlocked && cd.ball ? METAL[cd.ball] : null;
  const batidas = cd.kicks ?? 1;
  const faltam = cd.left ?? 1;

  function go() {
    if (!cd.unlocked) { toast(`${t.label} libera no nível ${unlockLvl}.`, 'error'); return; }
    if (!ready && !trailActive) { toast(`${t.label} recarrega em ${countdown(rem)}.`); return; }
    if (t.id === 'AUTO') onAuto(); else nav(t.to!);
  }

  return (
    <motion.button whileTap={{ scale: 0.93 }} onClick={go} className={`${active ? 'item-yellow' : 'item-blue'} relative flex flex-col items-center gap-0.5 pb-1`}>
      {metal && (
        <span className={`t-display absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full ${metal.pill} px-2 text-[10px] leading-[16px] text-navy-ink shadow-[0_2px_0_rgba(0,0,0,.18)]`}>
          {metal.nome}
        </span>
      )}
      <ProgressRing progress={cd.unlocked ? progress : 0} color={metal ? metal.ring : active ? '#FFC63D' : t.color} track="rgba(255,255,255,0.35)" size={58} stroke={metal ? 6 : 5}>
        {!cd.unlocked ? <img src="/ui/ico-lock01_s.png" alt="" className="h-6 w-6" /> : <img src={t.icon} alt="" className={`h-8 w-8 object-contain ${active ? 'animate-bob' : 'opacity-60 grayscale'}`} />}
      </ProgressRing>
      <span className="t-display text-[12px] uppercase text-navy-ink">{t.label}</span>
      <span className={`t-display text-[12px] tabular-nums ${active ? 'text-orange-deep' : 'text-muted'}`}>
        {!cd.unlocked ? `lvl ${unlockLvl}` : trailActive ? 'EM JOGO' : !ready ? countdown(rem)
          : metal ? (faltam < batidas ? `FALTAM ${faltam}` : `BATE ${batidas}x`) : 'PRONTO'}
      </span>
    </motion.button>
  );
}

export function HomeScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const offers = useAuth((s) => s.offers);
  const [home, setHome] = useState<Home | null>(null);
  const [overlay, setOverlay] = useState<{ goal: boolean; text: string; money: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const autoFired = useRef(false);

  const load = useCallback(() => api.home(me.team.slug).then(setHome).catch(() => {}), [me.team.slug]);
  useEffect(() => { load(); const iv = setInterval(load, 15_000); return () => clearInterval(iv); }, [load]);

  async function autoKick() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.autoKick();
      setOverlay({ goal: r.goal, text: r.text, money: r.money });
      await refresh();
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cooldown') { toast('Chute direto ainda em recarga.'); refresh(); }
      else toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  // Auto-chute igual ao original: com o app aberto, quando o tempo zera o chute sai sozinho.
  const autoRem = useCountdown(me.cooldowns.AUTO.readyAt);
  useEffect(() => {
    if (autoRem > 0) { autoFired.current = false; return; }
    if (autoFired.current || document.visibilityState !== 'visible' || overlay) return;
    autoFired.current = true;
    const t = setTimeout(autoKick, 800);
    return () => clearTimeout(t);
  }, [autoRem, overlay]);

  const m = home?.myMatch;
  const mine = m ? (m.home.slug === me.team.slug ? 'home' : 'away') : null;
  const myGoals = m ? (mine === 'home' ? m.homeGoals : m.awayGoals) : 0;
  const oppGoals = m ? (mine === 'home' ? m.awayGoals : m.homeGoals) : 0;
  const status = !m ? '' : myGoals > oppGoals ? 'VENCENDO' : myGoals < oppGoals ? 'PERDENDO' : 'EMPATANDO';
  const roundEnds = home?.round ? new Date(home.round.endsAt).getTime() : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Os chutes vêm ANTES de tudo: "a gente chuta mais do que eventa" (jogador GD, via dono em 17/09/2026) —
          antes era preciso descer a página para bater. */}
      {/* Alvos de chute */}
      <section className="grid grid-cols-4 gap-2">
        {TARGETS.map((t) => <KickTarget key={t.id} t={t} onAuto={autoKick} />)}
      </section>
      <div className="text-center"><span className="t-display t-out text-[13px]">Rodada: {me.goalsRound} gols · Hora: {me.goalsHour}</span></div>
      <PassCard />
      {offers > 0 && (
        <Link to="/propostas" className="card-orange flex items-center gap-3" style={{ borderRadius: 18 }}>
          <img src="/ui/ico-pass_golden.png" alt="" className="h-9 w-12 shrink-0 object-contain" />
          <span className="min-w-0 flex-1 text-[13px] font-extrabold leading-snug text-white">{offers === 1 ? 'Um time quer te contratar!' : `${offers} times querem te contratar!`} Veja quanto VIP estão oferecendo.</span>
          <span className="btn btn-yellow btn-sm shrink-0">Ver</span>
        </Link>
      )}
      <GoalOverlay open={!!overlay} goal={overlay?.goal ?? false} text={overlay?.text} money={overlay?.money} team={me.team} onClose={() => setOverlay(null)} />

      {/* Placar da partida do meu time */}
      <section className="panel-navy relative pt-5">
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap"><span className="trap trap-orange text-[11px] uppercase">{home?.season ? `Temporada ${home.season.number} · Rodada ${home.round?.number} · Série ${m?.serie ?? me.team.serie}` : 'Carregando…'}</span></div>
        {m ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <Link to={`/time/${m.home.slug}`} className="flex min-w-0 flex-1 flex-col items-center gap-1"><Shield team={m.home} size={58} /><span className="t-display text-center text-[12px] leading-tight">{m.home.name}</span></Link>
              <Link to={`/partida/${m.id}`} className="flex shrink-0 flex-col items-center" aria-label="Ver a partida">
                <div className="flex items-baseline gap-2 font-display text-5xl tabular-nums">
                  <span className={mine === 'home' ? 't-gold' : 't-out'}>{m.homeGoals}</span>
                  <span className="text-2xl text-white/60">x</span>
                  <span className={mine === 'away' ? 't-gold' : 't-out'}>{m.awayGoals}</span>
                </div>
                <span className="trap trap-blue mt-1 text-[9px] uppercase">ver partida</span>
              </Link>
              <Link to={`/time/${m.away.slug}`} className="flex min-w-0 flex-1 flex-col items-center gap-1"><Shield team={m.away} size={58} /><span className="t-display text-center text-[12px] leading-tight">{m.away.name}</span></Link>
            </div>
            <div className="bar mt-3"><i className={mine === 'home' ? 'yellow' : ''} style={{ width: `calc(${m.pct}% + 6px)` }} /><span>{pct(m.pct)} · {pct(100 - m.pct)}</span></div>
            <div className="mt-1 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider">
              <span className={status === 'VENCENDO' ? 't-green' : status === 'PERDENDO' ? 't-red' : 't-gold'}>{me.team.abbr} {status}</span>
              {roundEnds && <span className="text-white/80">fecha em <Countdown readyAt={roundEnds} className="t-gold" /></span>}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-sm font-bold text-white/80">{home ? 'Seu time folga nesta rodada.' : '…'}</div>
        )}
      </section>

      <MinigameSlider />


      {/* Artilheiros */}
      <Panel title={`TOP HORA ${home ? hourLabel(home.hourKey) : ''}`} ribbon="orange">
        <TopList rows={home?.tops.hour.slice(0, 5) ?? []} highlight={me.nick} empty="Ninguém marcou nesta hora ainda. Seja o primeiro!" />
        {home?.records?.HOUR && <div className="mt-2 text-center text-[11px] font-extrabold text-muted">Recorde da hora: <span className="text-orange-deep">{home.records.HOUR.goals}</span> gols · {home.records.HOUR.nick}</div>}
      </Panel>
      <Panel title="TOP RODADA" ribbon="blue"><TopList rows={home?.tops.round.slice(0, 5) ?? []} highlight={me.nick} empty="Sem gols na rodada." /></Panel>
      <Panel title="TOP TEMPORADA" ribbon="green"><TopList rows={home?.tops.season.slice(0, 5) ?? []} highlight={me.nick} empty="Sem gols na temporada." /></Panel>
      <X1King rows={home?.x1Round ?? []} />
      <Link to="/rankings" className="btn btn-blue btn-md w-full"><img src="/ui/ico-ranking.png" className="h-6 w-6" alt="" /> Rankings completos</Link>

      {home?.lastHour?.nick && (
        <div className="card-orange flex items-center gap-2 text-[13px] font-extrabold">
          <img src="/ui/ico-medal_gold.png" className="h-8 w-8" alt="" /> Artilheiro da hora {hourLabel(home.lastHour.hourKey)}: {home.lastHour.nick} com {home.lastHour.goals} gols
        </div>
      )}

      {/* Lances */}
      <Panel title="LANCES AO VIVO" ribbon="blue">
        <p className="mb-1 text-center text-[11px] font-bold text-muted">{home?.active ?? 0} {(home?.active ?? 0) === 1 ? 'jogador ativo' : 'jogadores ativos'} nas últimas 24 h</p>
        <ul className="flex flex-col gap-1.5">
          {(home?.feed ?? []).slice(0, 12).map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-[12px] font-bold">
              {f.team ? <Link to={`/time/${f.team.slug}`} className="mt-0.5 shrink-0"><Shield team={f.team} size={20} /></Link> : <Shield team={f.team} size={20} className="mt-0.5" />}
              <span className={`flex-1 leading-snug ${f.goal ? 'text-navy-ink' : 'text-muted'}`}>{f.text}</span>
              <span className="shrink-0 text-[10px] text-muted">{timeAgo(f.at)}</span>
            </li>
          ))}
          {!home?.feed?.length && <li className="py-3 text-center text-xs font-bold text-muted">O estádio ainda está em silêncio…</li>}
        </ul>
      </Panel>
    </div>
  );
}
