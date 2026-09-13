import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { StatsPair, StatsPlayer, StatsState } from '../lib/types';
import { Shield } from '../components/Shield';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';

/**
 * Estatísticas — "quem tem mais X?" entre dois jogadores do Brasileirão 2025, em forma de
 * placar. Acertou, segue; errou, acaba. Os números só chegam depois de escolher.
 */

type Reveal = { pair: StatsPair; picked: 'a' | 'b'; correct: boolean };
const REVEAL_MS = 1500;

export function StatsScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const cfg = meta?.stats ?? { pointsPerHit: 3, maxPoints: 30, goalAt: 5, season: 'Brasileirão 2025' };

  const [game, setGame] = useState<StatsState | null>(null);
  const [noData, setNoData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    api.stats().then((r) => setGame(r.state)).catch((e) => {
      if (e instanceof ApiError && e.code === 'no-data') setNoData(true); else toast((e as Error).message, 'error');
    });
  }, []);

  async function start() {
    if (busy) return;
    setBusy(true);
    try { setGame((await api.statsStart()).state); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function pick(side: 'a' | 'b') {
    if (busy || reveal || !game?.run?.pair) return;
    setBusy(true);
    try {
      const r = await api.statsPick(side);
      setReveal({ pair: r.revealed, picked: side, correct: r.correct });
      setTimeout(() => {
        setReveal(null);
        setGame(r.state);
        if (!r.correct && r.state.run?.mode === 'daily') {
          refresh();
          if (r.state.daily.reward?.goal) setOverlay(true);
        }
      }, REVEAL_MS);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const run = game?.run ?? null;
  const playing = !!run && !run.over;
  // o acerto já conta na hora da revelação (o estado novo só entra depois da animação)
  const streak = (run?.streak ?? 0) + (reveal?.correct ? 1 : 0);
  const pair = reveal?.pair ?? run?.pair ?? null;
  const valendo = !game?.daily.finished;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal title="GOOOL!!!" text={game?.daily.reward?.text} levelPoints={game?.daily.reward?.levelPoints} team={me.team} onClose={() => setOverlay(false)} />

      <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-orange text-[18px]">ESTATÍSTICAS</div>
        <div className="trap trap-blue text-[12px]">Recorde {game?.best ?? 0}</div>
      </div>

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
        {noData ? (
          <div className="panel mt-4 text-center text-[14px] font-extrabold text-navy-ink">As estatísticas ainda não foram carregadas. Volte mais tarde.</div>
        ) : !game ? null : playing || reveal ? (
          <>
            <div className="mt-1 flex items-baseline justify-center gap-2">
              <span className="t-display t-gold text-[40px] leading-none tabular-nums">{streak}</span>
              <span className="t-display t-out text-[15px]">{streak === 1 ? 'acerto seguido' : 'acertos seguidos'}</span>
            </div>
            <p className="t-out mt-0.5 text-center text-[12px] font-extrabold">
              Valendo: +{cfg.pointsPerHit} de nível por acerto; {cfg.goalAt} seguidos é gol.
            </p>
            {pair && (
              <>
                <div className="t-display t-out mt-3 text-center text-[22px] leading-tight">{pair.question}</div>
                <p className="t-out text-center text-[12px] font-extrabold">{pair.note ?? game.season}</p>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                  <PlayerCard p={pair.a} state={reveal ? (reveal.pair.winner === 'a' ? 'win' : 'lose') : null} picked={reveal?.picked === 'a'} onPick={() => pick('a')} disabled={busy || !!reveal} />
                  <span className="t-display self-center text-[26px] text-white/70">x</span>
                  <PlayerCard p={pair.b} state={reveal ? (reveal.pair.winner === 'b' ? 'win' : 'lose') : null} picked={reveal?.picked === 'b'} onPick={() => pick('b')} disabled={busy || !!reveal} />
                </div>
                {reveal && (
                  <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`t-display mt-4 text-center text-[26px] ${reveal.correct ? 't-green' : 't-red'}`}>
                    {reveal.correct ? 'Acertou!' : 'Errou!'}
                  </motion.div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="panel mt-4 text-center text-navy-ink">
            {run?.over ? (
              <>
                <div className="t-display text-[22px]">Fim da sequência: {run.streak}</div>
                {game.daily.reward && (
                  <p className="mt-1 text-[14px] font-extrabold">
                    {game.daily.reward.goal ? `Gol do ${me.team.name}! ` : ''}+{game.daily.reward.levelPoints} de nível.
                  </p>
                )}
                {run.streak > 0 && run.streak >= game.best && <p className="mt-1 text-[13px] font-extrabold text-orange-deep">Seu recorde!</p>}
              </>
            ) : valendo ? (
              <>
                <div className="t-display text-[22px]">Quem tem mais?</div>
                <p className="mt-1 text-[14px] font-extrabold leading-snug">
                  Jogadores do {game.season} e duelos da história do Brasileirão: escolha quem tem mais. Acertou, vem outro par; errou, acaba.
                </p>
              </>
            ) : (
              <div className="t-display text-[22px]">Você já jogou hoje</div>
            )}
            <p className="mt-2 text-[13px] font-bold leading-snug text-muted">
              {valendo
                ? `Uma partida por dia: +${cfg.pointsPerHit} de nível por acerto (até +${cfg.maxPoints}) e ${cfg.goalAt} acertos seguidos é gol do ${me.team.name}.`
                : <>Nova partida em <Countdown readyAt={game.nextAt} className="text-orange-deep" />.</>}
            </p>
            {valendo
              ? <button onClick={start} disabled={busy} className="btn btn-orange btn-lg mt-4 w-full">Começar</button>
              : <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-4 w-full">Voltar ao jogo</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerCard({ p, state, picked, onPick, disabled }: { p: StatsPlayer; state: 'win' | 'lose' | null; picked: boolean; onPick: () => void; disabled: boolean }) {
  const [photoOk, setPhotoOk] = useState(true);
  const ring = state === 'win' ? 'ring-4 ring-grass' : state === 'lose' && picked ? 'ring-4 ring-danger' : '';
  return (
    <button onClick={onPick} disabled={disabled} className={`card-white flex min-w-0 flex-col items-center gap-1 text-center transition ${ring} ${state === 'lose' && !picked ? 'opacity-60' : ''}`} style={{ borderRadius: 18 }}>
      <div className="relative mt-1">
        {p.photo && photoOk
          ? <img src={p.photo} alt="" onError={() => setPhotoOk(false)} className="h-20 w-20 rounded-full bg-sky/20 object-cover" />
          : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky/20"><TeamCrest team={p.team} size={56} /></div>}
        {p.photo && photoOk && <span className="absolute -bottom-1 -right-1"><TeamCrest team={p.team} size={30} /></span>}
      </div>
      <div className="t-display w-full truncate text-[15px] leading-tight text-navy-ink">{p.name}</div>
      <div className="min-h-[15px] w-full truncate text-[11px] font-bold text-muted">{p.subtitle}</div>
      {state ? (
        <motion.div initial={{ scale: 0.4 }} animate={{ scale: 1 }}
          className={`t-display leading-none tabular-nums ${(p.show ?? '').length > 5 ? 'text-[16px] leading-tight' : 'text-[30px]'} ${state === 'win' ? 'text-grass-deep' : 'text-danger'}`}>
          {p.show ?? p.value}
        </motion.div>
      ) : (
        <span className="btn btn-sky btn-sm mt-1 w-full">Escolher</span>
      )}
    </button>
  );
}

function TeamCrest({ team, size }: { team: StatsPlayer['team']; size: number }) {
  if (team.slug) return <Shield team={{ slug: team.slug, abbr: team.abbr, name: team.name }} size={size} />;
  return <span className="inline-flex items-center justify-center rounded-full font-display text-white" style={{ width: size, height: size, fontSize: size * 0.32, background: team.colorPrimary }}>{team.abbr}</span>;
}
