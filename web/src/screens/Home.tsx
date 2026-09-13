import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { Home, Kind } from '../lib/types';
import { Shield } from '../components/Shield';
import { GoalOverlay } from '../components/GoalOverlay';
import { Panel, TopList, ProgressRing, useCountdown, Countdown } from '../components/ui';
import { countdown, hourLabel, timeAgo, pct } from '../lib/format';
import { toast } from '../components/Toast';

const TARGETS: { id: Kind; label: string; icon: string; color: string; to?: string }[] = [
  { id: 'AUTO', label: 'Chute', icon: '/ui/ico-energy.png', color: '#4CD137' },
  { id: 'PENALTY', label: 'Pênalti', icon: '/ui/ico-glove.png', color: '#FFC63D', to: '/penalti' },
  { id: 'FOUL', label: 'Falta', icon: '/ui/ico-star01_s.png', color: '#2EA8FF', to: '/falta' },
  { id: 'TRAIL', label: 'Trilha', icon: '/ui/ico-badge.png', color: '#FF8A2A', to: '/trilha' },
];

function KickTarget({ t, onAuto }: { t: typeof TARGETS[number]; onAuto: () => void }) {
  const me = useAuth((s) => s.me)!;
  const cd = me.cooldowns[t.id];
  const rem = useCountdown(cd.readyAt);
  const ready = rem <= 0;
  const progress = cd.cooldownMs ? 1 - rem / cd.cooldownMs : 1;
  const nav = useNavigate();
  const meta = useAuth((s) => s.meta);
  const unlockLvl = meta?.unlock[t.id] ?? 0;
  const trailActive = t.id === 'TRAIL' && me.trail.active;
  const active = (ready || trailActive) && cd.unlocked;

  function go() {
    if (!cd.unlocked) { toast(`${t.label} libera no nível ${unlockLvl}.`, 'error'); return; }
    if (!ready && !trailActive) { toast(`${t.label} recarrega em ${countdown(rem)}.`); return; }
    if (t.id === 'AUTO') onAuto(); else nav(t.to!);
  }

  return (
    <motion.button whileTap={{ scale: 0.93 }} onClick={go} className={`${active ? 'item-yellow' : 'item-blue'} flex flex-col items-center gap-0.5 pb-1`}>
      <ProgressRing progress={cd.unlocked ? progress : 0} color={active ? '#FFC63D' : t.color} track="rgba(255,255,255,0.35)" size={58} stroke={5}>
        {!cd.unlocked ? <img src="/ui/ico-lock01_s.png" alt="" className="h-6 w-6" /> : <img src={t.icon} alt="" className={`h-8 w-8 object-contain ${active ? 'animate-bob' : 'opacity-60 grayscale'}`} />}
      </ProgressRing>
      <span className="t-display text-[12px] uppercase text-navy-ink">{t.label}</span>
      <span className={`t-display text-[12px] tabular-nums ${active ? 'text-orange-deep' : 'text-muted'}`}>
        {!cd.unlocked ? `lvl ${unlockLvl}` : trailActive ? 'EM JOGO' : ready ? 'PRONTO' : countdown(rem)}
      </span>
    </motion.button>
  );
}

export function HomeScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
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
      <GoalOverlay open={!!overlay} goal={overlay?.goal ?? false} text={overlay?.text} money={overlay?.money} team={me.team} onClose={() => setOverlay(null)} />

      {/* Placar da partida do meu time */}
      <section className="panel-navy relative pt-5">
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap"><span className="trap trap-orange text-[11px] uppercase">{home?.season ? `Temporada ${home.season.number} · Rodada ${home.round?.number} · Série ${m?.serie ?? me.team.serie}` : 'Carregando…'}</span></div>
        {m ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <Link to={`/time/${m.home.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.home} size={58} /><span className="t-display text-center text-[12px] leading-tight">{m.home.name}</span></Link>
              <div className="flex items-baseline gap-2 font-display text-5xl tabular-nums">
                <span className={mine === 'home' ? 't-gold' : 't-out'}>{m.homeGoals}</span>
                <span className="text-2xl text-white/60">x</span>
                <span className={mine === 'away' ? 't-gold' : 't-out'}>{m.awayGoals}</span>
              </div>
              <Link to={`/time/${m.away.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.away} size={58} /><span className="t-display text-center text-[12px] leading-tight">{m.away.name}</span></Link>
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

      {/* Alvos de chute */}
      <section className="grid grid-cols-4 gap-2">
        {TARGETS.map((t) => <KickTarget key={t.id} t={t} onAuto={autoKick} />)}
      </section>
      <div className="flex items-center justify-between">
        <span className="t-display t-out text-[13px]">Rodada: {me.goalsRound} gols · Hora: {me.goalsHour}</span>
        <Link to="/partygol" className="btn btn-yellow btn-sm"><img src="/ui/ico-coin02.png" className="h-5 w-5" alt="" /> Party GoL</Link>
      </div>

      {/* Artilheiros */}
      <Panel title={`TOP HORA ${home ? hourLabel(home.hourKey) : ''}`} ribbon="orange">
        <TopList rows={home?.tops.hour.slice(0, 5) ?? []} highlight={me.nick} empty="Ninguém marcou nesta hora ainda. Seja o primeiro!" />
        {home?.records?.HOUR && <div className="mt-2 text-center text-[11px] font-extrabold text-muted">Recorde da hora: <span className="text-orange-deep">{home.records.HOUR.goals}</span> gols · {home.records.HOUR.nick}</div>}
      </Panel>
      <div className="grid grid-cols-2 gap-3">
        <Panel title="TOP RODADA" ribbon="blue"><TopList rows={home?.tops.round.slice(0, 5) ?? []} highlight={me.nick} empty="Sem gols na rodada." /></Panel>
        <Panel title="TEMPORADA" ribbon="green"><TopList rows={home?.tops.season.slice(0, 5) ?? []} highlight={me.nick} empty="Sem gols na temporada." /></Panel>
      </div>
      <Link to="/rankings" className="btn btn-blue btn-md w-full"><img src="/ui/ico-ranking.png" className="h-6 w-6" alt="" /> Rankings completos</Link>

      {home?.lastHour?.nick && (
        <div className="card-orange flex items-center gap-2 text-[13px] font-extrabold">
          <img src="/ui/ico-medal_gold.png" className="h-8 w-8" alt="" /> Artilheiro da hora {hourLabel(home.lastHour.hourKey)}: {home.lastHour.nick} com {home.lastHour.goals} gols
        </div>
      )}

      {/* Lances */}
      <Panel title="LANCES AO VIVO" ribbon="blue">
        <ul className="flex flex-col gap-1.5">
          {(home?.feed ?? []).slice(0, 12).map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-[12px] font-bold">
              <Shield team={f.team} size={20} className="mt-0.5" />
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
