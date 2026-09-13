import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { QualtimeState, Team } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Shield, crestUrl } from '../components/Shield';
import { Countdown, useCountdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';

/**
 * De que time é? — 8 pistas (estádio, estado, apelido, ídolo), 4 escudos, 10 s cada.
 * Mesma mecânica do Quiz: o relógio é do servidor e a resposta certa só chega depois.
 */

type Feedback = { text: string; options: (Team | null)[]; choice: number; correctChoice: number; correct: boolean; timeout: boolean };

export function QualtimeScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();

  const [game, setGame] = useState<QualtimeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [overlay, setOverlay] = useState(false);

  function load() {
    api.qualtime().then((r) => setGame(r.state)).catch((e) => {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'locked') nav('/', { replace: true });
    });
  }
  useEffect(load, []);
  // pré-carrega os escudos: a opção aparece já com a imagem
  useEffect(() => { for (const t of meta?.teams ?? []) { const im = new Image(); im.src = crestUrl(t.slug); } }, [meta]);

  const current = game?.current ?? null;
  const rem = useCountdown(current?.deadline ?? null);
  const seconds = game?.seconds ?? 10;

  async function next() {
    if (!game || busy) return;
    setBusy(true);
    try { const r = await api.qualtimeNext(game.day); setFeedback(null); setGame(r.state); }
    catch (e) { handleError(e); } finally { setBusy(false); }
  }

  async function answer(choice: number) {
    if (!game || !current || busy) return;
    setBusy(true);
    try {
      const r = await api.qualtimeAnswer(current.index, choice, game.day);
      setFeedback({ text: current.text, options: current.options, choice, correctChoice: r.correctChoice, correct: r.correct, timeout: r.timeout });
      setGame(r.state);
      sound.play(r.correct ? 'pop' : 'error');
      if (r.state.finished) {
        refresh();
        if (r.state.reward?.goal) setTimeout(() => setOverlay(true), 1100);
      }
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }

  function handleError(e: unknown) {
    if (e instanceof ApiError && ['day-changed', 'finished', 'out-of-sync', 'not-served'].includes(e.code)) { toast(e.message); setFeedback(null); load(); }
    else toast((e as Error).message, 'error');
  }

  const now = useAuth((s) => s.now);
  useEffect(() => {
    if (current && rem <= 0 && !busy && now() >= current.deadline) answer(-1);
  }, [rem, current?.index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (overlay || e.ctrlKey || e.metaKey || e.altKey) return;
      if (current && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(Number(e.key) - 1); }
      else if (!current && e.key === 'Enter' && game && !game.finished) { e.preventDefault(); next(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onAir = !!current;
  const finished = !!game?.finished;
  const late = onAir && rem <= 3000;
  const hits = game?.hits ?? 0;
  const goalAt = game?.goalAt ?? 6;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal title="GOOOL!!!" text={game?.reward?.text ?? undefined} levelPoints={game?.reward?.levelPoints} team={me.team} onClose={() => setOverlay(false)} />

      <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-green text-[16px]">DE QUE TIME É?</div>
        <div className="trap trap-blue text-[13px] tabular-nums">{game ? `${Math.min(game.index + (onAir ? 1 : 0), game.total) || 0}/${game.total}` : '…'}</div>
      </div>

      {/* uma bolinha por pista; a marca mostra onde vira gol */}
      <div className="relative mt-1 flex flex-col items-center">
        <div className="flex items-center gap-1.5" style={{ ['--tile' as string]: '28px' }}>
          {Array.from({ length: game?.total ?? 8 }, (_, k) => {
            const r = game?.results[k];
            const cls = r ? (r.correct ? 'tile-correct' : 'tile-wrong') : onAir && k === current!.index ? 'tile-now' : 'tile-slot';
            return (
              <div key={k} className="flex items-center gap-1.5">
                <div className={`tile ${cls}`}>{r && <img src={r.correct ? '/ui/check-green.png' : '/ui/pi-close.png'} alt="" className="h-3.5 w-3.5" />}</div>
                {k === goalAt - 1 && k < (game?.total ?? 8) - 1 && <span className="h-5 w-[3px] rounded bg-white/70" aria-hidden />}
              </div>
            );
          })}
        </div>
        <p className="t-out mt-1 text-[12px] font-extrabold">{hits >= goalAt ? 'Gol garantido!' : `${goalAt} acertos é gol`}</p>
      </div>

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
        {!game ? null : finished && !feedback ? (
          <div className="panel mt-3 text-navy-ink">
            <div className={`t-display text-center text-[22px] ${game.reward?.goal ? 'text-grass-deep' : ''}`}>
              {game.reward?.goal ? `Gol do ${me.team.name}!` : `Faltou ${Math.max(0, goalAt - hits)} ${goalAt - hits === 1 ? 'acerto' : 'acertos'} para o gol`}
            </div>
            <p className="mt-0.5 text-center text-[14px] font-extrabold">{hits} de {game.total} acertos: +{game.reward?.levelPoints ?? 0} de nível.</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {game.results.map((r, k) => (
                <li key={k} className="flex items-center gap-2 text-[12px] font-bold leading-snug">
                  <img src={r.correct ? '/ui/check-green.png' : '/ui/pi-close.png'} alt="" className={`h-4 w-4 shrink-0 ${r.correct ? '' : 'rounded-full bg-danger p-0.5'}`} />
                  <span className="flex-1 text-muted">{r.text}</span>
                  <Shield team={r.options[r.correctChoice]} size={22} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-center text-[13px] font-extrabold text-muted">Pistas novas em <Countdown readyAt={game.nextAt} className="text-orange-deep" /></p>
            <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-3 w-full">Voltar ao jogo</button>
          </div>
        ) : onAir ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <div className="bar flex-1" aria-hidden><i className="yellow" style={{ width: `calc(${Math.max(0, Math.min(100, (rem / (seconds * 1000)) * 100))}% + 6px)` }} /></div>
              <span className={`t-display w-8 text-right text-[20px] tabular-nums ${late ? 't-red' : 't-out'}`} aria-live="polite">{Math.ceil(rem / 1000)}</span>
            </div>
            <div className="panel mt-3 text-center text-[17px] font-extrabold leading-snug text-navy-ink">{current!.text}</div>
            <Options options={current!.options} onPick={answer} disabled={busy} />
          </>
        ) : feedback ? (
          <>
            <div className={`t-display mt-3 text-center text-[24px] ${feedback.correct ? 't-green' : 't-red'}`}>
              {feedback.correct ? 'Acertou!' : feedback.timeout ? 'Acabou o tempo' : 'Errou'}
            </div>
            <div className="panel mt-2 text-center text-[15px] font-extrabold leading-snug text-navy-ink">{feedback.text}</div>
            <Options options={feedback.options} correct={feedback.correctChoice} chosen={feedback.choice} />
            <button onClick={() => (finished ? setFeedback(null) : next())} disabled={busy} className="btn btn-orange btn-lg mt-auto w-full">
              {finished ? 'Ver resultado' : 'Próxima pista'}
            </button>
          </>
        ) : (
          <div className="panel mt-4 text-center text-navy-ink">
            <div className="t-display text-[22px]">{game.index === 0 ? 'De que time é?' : 'Continue jogando'}</div>
            <p className="mt-1 text-[14px] font-extrabold leading-snug">
              {game.total} pistas — estádio, estado, apelido ou ídolo — e 4 escudos pra escolher, {seconds} segundos cada. Cada acerto vale +{game.pointsPerHit} de nível; com {goalAt} acertos, é gol do {me.team.name}.
            </p>
            <p className="mt-2 text-[12px] font-bold text-muted">O relógio só começa quando a pista aparece.</p>
            <button onClick={next} disabled={busy} className="btn btn-orange btn-lg mt-4 w-full">{game.index === 0 ? 'Começar' : 'Próxima pista'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Grade 2×2 de escudos. Depois da resposta, a certa fica verde e a errada escolhida fica vermelha. */
function Options({ options, onPick, disabled, correct, chosen }: { options: (Team | null)[]; onPick?: (k: number) => void; disabled?: boolean; correct?: number; chosen?: number }) {
  const answered = correct !== undefined;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {options.map((t, k) => {
        const cls = !answered ? 'item-blue' : k === correct ? 'item-green' : k === chosen ? 'item-yellow hue-wrong' : 'item-blue opacity-50';
        return (
          <button key={k} onClick={() => onPick?.(k)} disabled={disabled || answered} className={`${cls} no-drag flex flex-col items-center justify-center gap-1 py-3 transition-transform active:scale-95`} aria-label={t?.name}>
            <Shield team={t} size={64} />
            <span className="t-display t-out text-[13px] leading-tight">{t?.name ?? '?'}</span>
          </button>
        );
      })}
    </div>
  );
}
