import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { QualtimeOption, QualtimeState, QualtimeTeam } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Shield, crestUrl } from '../components/Shield';
import { Countdown, useCountdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';

/**
 * De que time é? — 10 pistas alternando dois formatos: `crest` (pista em texto → 4 escudos)
 * e `name` (escudo → 4 pistas do mesmo tipo). 7 s por pista, menos meio segundo a cada
 * acerto seguido. Mesma mecânica do Quiz: o relógio é do servidor e a resposta certa (e o
 * tipo da pista) só chegam depois de responder.
 */

const TYPE_LABEL: Record<string, string> = {
  stadium: 'Estádio', city: 'Cidade', founded: 'Fundação', profile: 'Cores e estado', nick: 'Apelido', mascot: 'Mascote', idol: 'Ídolo', classic: 'Clássico',
};

type Feedback = { mode: 'crest' | 'name'; text: string; team: QualtimeTeam | null; options: QualtimeOption[]; choice: number; correctChoice: number; correct: boolean; timeout: boolean; type: string };

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
  const seconds = current?.seconds ?? game?.seconds ?? 7;

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
      setFeedback({ mode: current.mode, text: current.text, team: current.team, options: current.options, choice, correctChoice: r.correctChoice, correct: r.correct, timeout: r.timeout, type: r.type });
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
  const late = onAir && rem <= 2500;
  const hits = game?.hits ?? 0;
  const goalAt = game?.goalAt ?? 8;
  const total = game?.total ?? 10;
  const streak = game?.streak ?? 0;
  const nextSeconds = game ? Math.max(game.minSeconds, game.seconds - game.streakStep * streak) : seconds;
  const fmt = (s: number) => s.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

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
        <div className="flex items-center gap-1" style={{ ['--tile' as string]: '24px' }}>
          {Array.from({ length: total }, (_, k) => {
            const r = game?.results[k];
            const cls = r ? (r.correct ? 'tile-correct' : 'tile-wrong') : onAir && k === current!.index ? 'tile-now' : 'tile-slot';
            return (
              <div key={k} className="flex items-center gap-1">
                <div className={`tile ${cls}`}>{r && <img src={r.correct ? '/ui/check-green.png' : '/ui/pi-close.png'} alt="" className="h-3 w-3" />}</div>
                {k === goalAt - 1 && k < total - 1 && <span className="h-5 w-[3px] rounded bg-white/70" aria-hidden />}
              </div>
            );
          })}
        </div>
        <p className="t-out mt-1 text-[12px] font-extrabold">
          {hits >= goalAt ? 'Gol garantido!' : total - (game?.index ?? 0) < goalAt - hits ? 'Sem gol hoje — mas cada acerto vale nível' : `${goalAt} acertos é gol`}
          {!finished && streak > 0 && ` · ${streak} seguido${streak > 1 ? 's' : ''}: próxima em ${fmt(nextSeconds)} s`}
        </p>
      </div>

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
        {!game ? null : finished && !feedback ? (
          <div className="panel mt-3 text-navy-ink">
            <div className={`t-display text-center text-[22px] ${game.reward?.goal ? 'text-grass-deep' : ''}`}>
              {game.reward?.goal ? `Gol do ${me.team.name}!` : `Faltou ${Math.max(0, goalAt - hits)} ${goalAt - hits === 1 ? 'acerto' : 'acertos'} para o gol`}
            </div>
            <p className="mt-0.5 text-center text-[14px] font-extrabold">{hits} de {game.total} acertos: +{game.reward?.levelPoints ?? 0} de nível.</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {game.results.map((r, k) => {
                const team = r.mode === 'name' ? r.team : r.options[r.correctChoice]?.team ?? null;
                return (
                  <li key={k} className="flex items-center gap-2 text-[12px] font-bold leading-snug">
                    <img src={r.correct ? '/ui/check-green.png' : '/ui/pi-close.png'} alt="" className={`h-4 w-4 shrink-0 ${r.correct ? '' : 'rounded-full bg-danger p-0.5'}`} />
                    <span className="flex-1 text-muted">
                      <span className="text-navy-ink/70">{TYPE_LABEL[r.type] ?? r.type}:</span> {r.mode === 'name' ? `${team?.name} — ${r.options[r.correctChoice]?.text}` : r.text}
                    </span>
                    <Shield team={team} size={22} />
                  </li>
                );
              })}
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
            <Prompt mode={current!.mode} text={current!.text} team={current!.team} />
            <Options mode={current!.mode} options={current!.options} onPick={answer} disabled={busy} />
          </>
        ) : feedback ? (
          <>
            <div className={`t-display mt-3 text-center text-[24px] ${feedback.correct ? 't-green' : 't-red'}`}>
              {feedback.correct ? 'Acertou!' : feedback.timeout ? 'Acabou o tempo' : 'Errou'}
            </div>
            <Prompt mode={feedback.mode} text={feedback.text} team={feedback.team} tag={TYPE_LABEL[feedback.type] ?? feedback.type} />
            <Options mode={feedback.mode} options={feedback.options} correct={feedback.correctChoice} chosen={feedback.choice} />
            <button onClick={() => (finished ? setFeedback(null) : next())} disabled={busy} className="btn btn-orange btn-lg mt-auto w-full">
              {finished ? 'Ver resultado' : 'Próxima pista'}
            </button>
          </>
        ) : (
          <div className="panel mt-4 text-center text-navy-ink">
            <div className="t-display text-[22px]">{game.index === 0 ? 'De que time é?' : 'Continue jogando'}</div>
            <p className="mt-1 text-[14px] font-extrabold leading-snug">
              {game.total} rodadas, alternando: uma pista e 4 escudos, ou um escudo e 4 pistas. Estádio, cidade, fundação, cores, apelido, mascote, ídolo ou clássico — e os escudos errados são parecidos de propósito.
            </p>
            <p className="mt-2 text-[13px] font-extrabold leading-snug">
              {game.seconds} segundos por pista; cada acerto seguido tira {fmt(game.streakStep)} s (mínimo {game.minSeconds} s). +{game.pointsPerHit} de nível por acerto; com {goalAt} acertos, é gol do {me.team.name}.
            </p>
            <p className="mt-2 text-[12px] font-bold text-muted">O relógio só começa quando a pista aparece.</p>
            <button onClick={next} disabled={busy} className="btn btn-orange btn-lg mt-4 w-full">{game.index === 0 ? 'Começar' : 'Próxima pista'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Enunciado: a pista em texto (modo crest) ou o escudo em destaque (modo name). O tipo só aparece depois da resposta. */
function Prompt({ mode, text, team, tag }: { mode: 'crest' | 'name'; text: string; team: QualtimeTeam | null; tag?: string }) {
  return (
    <div className="panel mt-3 text-center text-navy-ink">
      {tag && <div className="mx-auto mb-1 w-fit rounded-full bg-navy-deep/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-navy-ink/70">{tag}</div>}
      {mode === 'name' ? (
        <div className="flex items-center justify-center gap-3">
          <Shield team={team} size={64} />
          <div className="text-left">
            <div className="t-display text-[20px] leading-tight">{team?.name ?? '?'}</div>
            <div className="text-[13px] font-extrabold leading-snug text-muted">{text}</div>
          </div>
        </div>
      ) : (
        <div className="text-[17px] font-extrabold leading-snug">{text}</div>
      )}
    </div>
  );
}

/**
 * As 4 opções: grade 2×2 de escudos (modo crest) ou lista de pistas (modo name).
 * Depois da resposta, a certa fica verde e a errada escolhida fica vermelha.
 */
function Options({ mode, options, onPick, disabled, correct, chosen }: { mode: 'crest' | 'name'; options: QualtimeOption[]; onPick?: (k: number) => void; disabled?: boolean; correct?: number; chosen?: number }) {
  const answered = correct !== undefined;
  const clsOf = (k: number) => (!answered ? 'item-blue' : k === correct ? 'item-green' : k === chosen ? 'item-yellow hue-wrong' : 'item-blue opacity-50');
  if (mode === 'name') {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {options.map((o, k) => (
          <button key={k} onClick={() => onPick?.(k)} disabled={disabled || answered} className={`${clsOf(k)} no-drag flex items-center gap-2 px-3 py-2.5 text-left transition-transform active:scale-[0.98]`}>
            <span className="t-display t-out w-5 shrink-0 text-[15px]">{k + 1}</span>
            <span className="t-display t-out flex-1 text-[15px] leading-tight">{o.text}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {options.map((o, k) => (
        <button key={k} onClick={() => onPick?.(k)} disabled={disabled || answered} className={`${clsOf(k)} no-drag flex flex-col items-center justify-center gap-1 py-3 transition-transform active:scale-95`} aria-label={o.team?.name}>
          <Shield team={o.team} size={64} />
          <span className="t-display t-out text-[13px] leading-tight">{o.team?.name ?? '?'}</span>
        </button>
      ))}
    </div>
  );
}
