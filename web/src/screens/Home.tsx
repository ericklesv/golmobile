import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Target, Flag, Route, Dice5, Lock, Crown } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { Home, Kind } from '../lib/types';
import { Shield } from '../components/Shield';
import { GoalOverlay } from '../components/GoalOverlay';
import { Section, TopList, ProgressRing, useCountdown, Countdown } from '../components/ui';
import { countdown, hourLabel, timeAgo, pct } from '../lib/format';
import { toast } from '../components/Toast';

const TARGETS: { id: Kind; label: string; icon: any; color: string; to?: string; hint: string }[] = [
  { id: 'AUTO', label: 'Chute direto', icon: Zap, color: '#22E58A', hint: 'gol garantido' },
  { id: 'PENALTY', label: 'Pênalti', icon: Target, color: '#FFC24B', to: '/penalti', hint: 'escolha o canto' },
  { id: 'FOUL', label: 'Falta', icon: Flag, color: '#38BDF8', to: '/falta', hint: 'passe a barreira' },
  { id: 'TRAIL', label: 'Trilha', icon: Route, color: '#FF7A59', to: '/trilha', hint: 'drible a defesa' },
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

  function go() {
    if (!cd.unlocked) { toast(`${t.label} libera no nível ${unlockLvl}.`, 'error'); return; }
    if (!ready && !trailActive) { toast(`${t.label} recarrega em ${countdown(rem)}.`); return; }
    if (t.id === 'AUTO') onAuto(); else nav(t.to!);
  }

  const active = (ready || trailActive) && cd.unlocked;
  return (
    <motion.button whileTap={{ scale: 0.93 }} onClick={go} className={`flex flex-col items-center gap-1 rounded-2xl border p-2 transition ${active ? 'border-transparent bg-night-2' : 'border-line bg-night-2/50'}`}
      style={active ? { boxShadow: `0 0 22px ${t.color}55, inset 0 0 0 1px ${t.color}` } : undefined}>
      <ProgressRing progress={cd.unlocked ? progress : 0} color={t.color} size={64} stroke={4}>
        {!cd.unlocked ? <Lock className="h-5 w-5 text-hazedim" /> : <t.icon className="h-6 w-6" style={{ color: active ? t.color : '#54697E' }} />}
      </ProgressRing>
      <span className="font-score text-[13px] font-bold uppercase leading-none text-chalk">{t.label}</span>
      <span className="font-score text-xs tabular-nums" style={{ color: active ? t.color : '#8098AE' }}>
        {!cd.unlocked ? `lvl ${unlockLvl}` : trailActive ? 'EM JOGO' : ready ? 'PRONTO' : countdown(rem)}
      </span>
    </motion.button>
  );
}

export function HomeScreen() {
  const me = useAuth((s) => s.me)!;
  const setMe = useAuth((s) => s.setMe);
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
    <div className="flex flex-col gap-3">
      <GoalOverlay open={!!overlay} goal={overlay?.goal ?? false} text={overlay?.text} money={overlay?.money} team={me.team} onClose={() => setOverlay(null)} />

      {/* Placar da partida do meu time */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-haze">
          <span>{home?.season ? `Temporada ${home.season.number} · Rodada ${home.round?.number}` : 'Carregando…'} · Série {m?.serie ?? me.team.serie}</span>
          {roundEnds && <span className="text-flood">termina em <Countdown readyAt={roundEnds} /></span>}
        </div>
        {m ? (
          <div className="px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <Link to={`/time/${m.home.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.home} size={52} /><span className="text-center text-[11px] font-bold leading-tight text-chalk">{m.home.name}</span></Link>
              <div className="flex items-baseline gap-2 font-score text-4xl font-extrabold tabular-nums text-chalk">
                <span className={mine === 'home' ? 'text-turf drop-shadow-[0_0_12px_rgba(34,229,138,0.6)]' : ''}>{m.homeGoals}</span>
                <span className="text-xl text-hazedim">x</span>
                <span className={mine === 'away' ? 'text-turf drop-shadow-[0_0_12px_rgba(34,229,138,0.6)]' : ''}>{m.awayGoals}</span>
              </div>
              <Link to={`/time/${m.away.slug}`} className="flex flex-1 flex-col items-center gap-1"><Shield team={m.away} size={52} /><span className="text-center text-[11px] font-bold leading-tight text-chalk">{m.away.name}</span></Link>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-night-1">
              <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, background: `linear-gradient(90deg, ${m.home.colorPrimary}, ${m.home.colorSecondary})` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-haze">
              <span>{pct(m.pct)}</span>
              <span className={status === 'VENCENDO' ? 'text-turf' : status === 'PERDENDO' ? 'text-card' : 'text-flood'}>{me.team.abbr} {status}</span>
              <span>{pct(100 - m.pct)}</span>
            </div>
          </div>
        ) : (
          <div className="px-3 py-6 text-center text-sm text-hazedim">{home ? 'Seu time folga nesta rodada.' : '…'}</div>
        )}
      </section>

      {/* Alvos de chute */}
      <section className="grid grid-cols-4 gap-2">
        {TARGETS.map((t) => <KickTarget key={t.id} t={t} onAuto={autoKick} />)}
      </section>
      <div className="flex items-center justify-between px-1 text-[11px] text-haze">
        <span>Sua rodada: <b className="text-chalk">{me.goalsRound}</b> gols · hora: <b className="text-chalk">{me.goalsHour}</b></span>
        <Link to="/partygol" className="inline-flex items-center gap-1 rounded-full border border-flood/40 bg-flood/10 px-2 py-1 font-bold uppercase tracking-wider text-flood"><Dice5 className="h-3.5 w-3.5" /> Party GoL</Link>
      </div>

      {/* Artilheiros */}
      <Section title={`Top Hora · ${home ? hourLabel(home.hourKey) : ''}`} right={home?.records?.HOUR && <span className="text-[10px] text-haze">rec. <b className="text-flood">{home.records.HOUR.goals}</b> {home.records.HOUR.nick}</span>}>
        <TopList rows={home?.tops.hour.slice(0, 5) ?? []} highlight={me.nick} empty="Ninguém marcou nesta hora ainda. Seja o primeiro!" />
      </Section>
      <div className="grid grid-cols-2 gap-3">
        <Section title="Top Rodada" right={home?.records?.ROUND && <span className="text-[10px] text-haze">rec. <b className="text-flood">{home.records.ROUND.goals}</b></span>}>
          <TopList rows={home?.tops.round.slice(0, 5) ?? []} highlight={me.nick} empty="Sem gols na rodada." />
        </Section>
        <Section title="Top Temporada" right={home?.records?.SEASON && <span className="text-[10px] text-haze">rec. <b className="text-flood">{home.records.SEASON.goals}</b></span>}>
          <TopList rows={home?.tops.season.slice(0, 5) ?? []} highlight={me.nick} empty="Sem gols na temporada." />
        </Section>
      </div>
      <Link to="/rankings" className="btn-ghost w-full py-2 text-sm">Ver rankings completos</Link>

      {home?.lastHour?.nick && (
        <div className="flex items-center gap-2 rounded-xl border border-flood/30 bg-flood/10 px-3 py-2 text-xs text-chalk">
          <Crown className="h-4 w-4 text-flood" /> Artilheiro da hora {hourLabel(home.lastHour.hourKey)}: <b>{home.lastHour.nick}</b> com {home.lastHour.goals} gols
        </div>
      )}

      {/* Lances */}
      <Section title="Lances ao vivo" right={<span className="text-[10px] text-haze">{home?.online ?? 0} online</span>}>
        <ul className="flex flex-col gap-1.5">
          {(home?.feed ?? []).slice(0, 12).map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-xs">
              <Shield team={f.team} size={18} className="mt-0.5 shrink-0" />
              <span className={`flex-1 leading-snug ${f.goal ? 'text-chalk' : 'text-haze'}`}>{f.text}</span>
              <span className="shrink-0 text-[10px] text-hazedim">{timeAgo(f.at)}</span>
            </li>
          ))}
          {!home?.feed?.length && <li className="py-3 text-center text-xs text-hazedim">O estádio ainda está em silêncio…</li>}
        </ul>
      </Section>
    </div>
  );
}
