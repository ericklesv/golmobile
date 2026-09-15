import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, MotionConfig } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { CamisasGuess, CamisasState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Jersey } from '../components/Jersey';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';

/**
 * Camisas — maior ou menor. 4 camisas de 1 a 11 (sem repetir número) nas cores do time do jogador:
 * a 1ª aparece e o jogador diz se a próxima é maior ou menor. Acertou as 4 é gol e vem outra
 * sequência, valendo até errar. As camisas escondidas só existem no servidor.
 */

type Reveal = { slots: number[]; miss: boolean; goal: CamisasGuess['goal']; next: CamisasState };

export function CamisasScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [game, setGame] = useState<CamisasState | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [goalText, setGoalText] = useState<string | null>(null);

  const load = () => api.camisas().then((r) => setGame(r.state)).catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => { load(); }, []);

  async function start() {
    if (busy) return;
    setBusy(true);
    try { setGame((await api.camisasStart()).state); } catch (e) {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'locked') nav('/', { replace: true });
    } finally { setBusy(false); }
  }

  async function guess(g: 'maior' | 'menor') {
    if (busy || reveal || !game?.playing) return;
    setBusy(true);
    try {
      const r = await api.camisasGuess(g);
      sound.play(r.correct ? 'pop' : 'error');
      if (r.goal) {
        // fechou as 4: mostra a sequência inteira, depois o gol; ao fechar o gol, vem a próxima
        setReveal({ slots: r.goal.seq, miss: false, goal: r.goal, next: r.state });
        setTimeout(() => setGoalText(r.goal!.text), 700);
        refresh();
      } else if (r.correct) {
        setGame(r.state);
      } else {
        setReveal({ slots: [...game.shown, r.number], miss: true, goal: null, next: r.state });
        setTimeout(() => { setReveal(null); setGame(r.state); refresh(); }, 1600);
      }
    } catch (e) {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'no-run') load(); // o dia virou no meio: recarrega
    } finally { setBusy(false); }
  }

  function closeGoal() {
    setGoalText(null);
    if (reveal?.goal) { setGame(reveal.next); setReveal(null); }
  }

  const shirts = game?.shirts ?? 4;
  const slots = reveal?.slots ?? game?.shown ?? [];
  const team = me.team;

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-frame relative flex min-h-full flex-col">
        <div className="stadium-bg" />
        <GoalOverlay open={!!goalText} goal title="GOOOL!!!" text={goalText ?? undefined} team={team} onClose={closeGoal} />

        <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
          <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
          <div className="ribbon ribbon-yellow text-[18px]">CAMISAS</div>
          <div className="trap trap-blue text-[12px] tabular-nums">{game?.goals ?? 0} {(game?.goals ?? 0) === 1 ? 'gol' : 'gols'}</div>
        </div>

        <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
          {!game ? null : game.playing || reveal ? (
            <>
              <p className="t-display t-out mt-2 text-center text-[19px] leading-tight">A próxima camisa é maior ou menor?</p>
              <p className="t-out text-center text-[12px] font-extrabold">As camisas vão de {game.min} a {game.max}, sem repetir.</p>

              <div className="mt-3 grid grid-cols-4 gap-2">
                {Array.from({ length: shirts }, (_, i) => {
                  const n = slots[i];
                  const isMiss = !!reveal?.miss && i === slots.length - 1;
                  const isCurrent = !reveal && i === slots.length - 1;
                  return <Slot key={i} n={n} miss={isMiss} current={isCurrent} primary={team.colorPrimary} secondary={team.colorSecondary} tertiary={team.colorTertiary} design={team.kitDesign} />;
                })}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button onClick={() => guess('menor')} disabled={busy || !!reveal} className="btn btn-red btn-lg w-full"><Arrow down /> Menor</button>
                <button onClick={() => guess('maior')} disabled={busy || !!reveal} className="btn btn-green btn-lg w-full"><Arrow /> Maior</button>
              </div>

              <div className="panel-navy mt-4 px-3 py-3 text-center">
                {reveal ? (
                  <motion.p initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`t-display text-[24px] ${reveal.miss ? 't-red' : 't-green'}`}>
                    {reveal.miss ? `Errou! Veio a ${slots[slots.length - 1]}.` : `Gol do ${team.name}!`}
                  </motion.p>
                ) : (
                  <p className="text-[14px] font-extrabold leading-snug text-white">
                    Acerte as {shirts} camisas e é gol do {team.name}. Depois vem outra sequência, valendo até errar.
                  </p>
                )}
                <p className="mt-1.5 text-[12px] font-extrabold text-white/75">
                  Hoje: {game.goals} {game.goals === 1 ? 'gol' : 'gols'}, +{game.points} de nível{game.points >= game.maxPoints ? ' (máximo)' : ''}
                </p>
              </div>
            </>
          ) : (
            <div className="panel mt-4 text-center text-navy-ink">
              {game.finished ? (
                <>
                  <div className="t-display text-[22px]">{game.goals > 0 ? `${game.goals} ${game.goals === 1 ? 'gol' : 'gols'} do ${team.name}!` : 'Não foi dessa vez'}</div>
                  {game.last?.miss && (
                    <>
                      <div className="mt-2 flex justify-center gap-1.5">
                        {game.last.seq.map((n, i) => (
                          <span key={i} className={`rounded-xl p-0.5 ${i === game.last!.seq.length - 1 ? 'ring-4 ring-danger' : ''}`}>
                            <Jersey number={n} primary={team.colorPrimary} secondary={team.colorSecondary} tertiary={team.colorTertiary} design={team.kitDesign} size={44} />
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-[13px] font-extrabold">Depois da {game.last.seq[game.last.seq.length - 2]} veio a {game.last.seq[game.last.seq.length - 1]}.</p>
                    </>
                  )}
                  <p className="mt-2 text-[14px] font-extrabold">{game.hits} {game.hits === 1 ? 'acerto' : 'acertos'}: +{game.points} de nível.</p>
                  <p className="mt-2 text-[13px] font-bold text-muted">Novas camisas em <Countdown readyAt={game.nextAt} className="text-orange-deep" />.</p>
                  <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-4 w-full">Voltar ao jogo</button>
                </>
              ) : (
                <>
                  <div className="t-display text-[22px]">Maior ou menor?</div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <Slot n={7} current={false} miss={false} primary={team.colorPrimary} secondary={team.colorSecondary} />
                    {[1, 2, 3].map((i) => <Slot key={i} current={false} miss={false} primary={team.colorPrimary} secondary={team.colorSecondary} />)}
                  </div>
                  <p className="mt-3 text-[14px] font-extrabold leading-snug">
                    Aparecem {shirts} camisas do {team.name}, de {game.min} a {game.max}, sem repetir número. Olhe a camisa e diga se a próxima é maior ou menor.
                  </p>
                  <p className="mt-2 text-[13px] font-bold leading-snug text-muted">
                    Acertou as {shirts}: é gol e vem outra sequência. Vale até errar. Cada acerto dá +{game.pointsPerHit} de nível (até +{game.maxPoints}). Uma partida por dia.
                  </p>
                  <button onClick={start} disabled={busy} className="btn btn-orange btn-lg mt-4 w-full">Começar</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}

/** Uma casa da sequência: camisa virada (verde) ou escondida (branca com "?"). */
function Slot({ n, miss, current, primary, secondary, tertiary, design }: { n?: number; miss: boolean; current: boolean; primary: string; secondary: string; tertiary?: string | null; design?: string | null }) {
  if (n === undefined) {
    return (
      <div className="card-white flex aspect-[4/5] items-center justify-center" style={{ borderRadius: 16 }}>
        <span className="t-display text-[38px] leading-none text-grass-deep">?</span>
      </div>
    );
  }
  return (
    <motion.div key={n} initial={{ rotateY: 90, scale: 0.9 }} animate={{ rotateY: 0, scale: 1 }} transition={{ duration: 0.35 }}
      className={`${miss ? 'card-orange' : 'card-green'} flex aspect-[4/5] items-center justify-center ${current ? 'ring-4 ring-gold' : ''} ${miss ? 'ring-4 ring-danger' : ''}`} style={{ borderRadius: 16 }}>
      <Jersey number={n} primary={primary} secondary={secondary} tertiary={tertiary} design={design} className="h-auto w-[116%] max-w-none drop-shadow" />
    </motion.div>
  );
}

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden style={{ transform: down ? 'rotate(180deg)' : undefined }}>
      <path d="M12 3 L21 13 L15.5 13 L15.5 21 L8.5 21 L8.5 13 L3 13 Z" fill="#fff" stroke="rgba(0,0,0,0.35)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
