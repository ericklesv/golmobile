import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { QuizResult, QuizState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown, useCountdown } from '../components/ui';
import { toast } from '../components/Toast';

/**
 * Quiz do dia — 5 perguntas de futebol, 4 alternativas, 20 s cada. O relógio é do servidor
 * (começa quando a pergunta é pedida); a certa só chega depois de responder. A tela só mostra.
 */

type Feedback = { q: string; options: string[]; choice: number; correctChoice: number; correct: boolean; timeout: boolean };

export function QuizScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const cfg = meta?.quiz ?? { questions: 5, seconds: 20, pointsPerHit: 6, goalAt: 3 };

  const [game, setGame] = useState<QuizState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [overlay, setOverlay] = useState(false);

  function load() { api.quiz().then((r) => setGame(r.state)).catch((e) => toast((e as Error).message, 'error')); }
  useEffect(load, []);

  const current = game?.current ?? null;
  const rem = useCountdown(current?.deadline ?? null);

  async function next() {
    if (!game || busy) return;
    setBusy(true);
    try {
      const r = await api.quizNext(game.day);
      setFeedback(null);
      setGame(r.state);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }

  async function answer(choice: number) {
    if (!game || !current || busy) return;
    setBusy(true);
    try {
      const r = await api.quizAnswer(current.index, choice, game.day);
      setFeedback({ q: current.q, options: current.options, choice, correctChoice: r.correctChoice, correct: r.correct, timeout: r.timeout });
      setGame(r.state);
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

  // acabou o tempo com a pergunta no ar: conta como erro. Confere o relógio de novo aqui —
  // no render em que a pergunta chega, `rem` ainda é o 0 da anterior.
  const now = useAuth((s) => s.now);
  useEffect(() => {
    if (current && rem <= 0 && !busy && now() >= current.deadline) answer(-1);
  }, [rem, current?.index]);

  // teclado (computador): 1–4 respondem; Enter começa/segue
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
  const results = game?.results ?? [];
  const finished = !!game?.finished;
  const late = onAir && rem <= 5000;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal title="GOOOL!!!" text={game?.reward?.text} levelPoints={game?.reward?.levelPoints} team={me.team} onClose={() => setOverlay(false)} />

      <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-orange">QUIZ</div>
        <div className="trap trap-blue text-[13px] tabular-nums">{game ? `${Math.min(game.index + (onAir ? 1 : 0), game.total) || 0}/${game.total}` : '…'}</div>
      </div>

      {/* Placar de pênaltis: uma bola por pergunta; 3 acertos = gol */}
      <Shootout total={game?.total ?? cfg.questions} results={results} onAir={onAir ? current!.index : -1} goalAt={cfg.goalAt} />

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3 pb-4" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
        {!game ? null : finished && !feedback ? (
          <Result game={game} team={me.team.name} cfg={cfg} onBack={() => nav('/')} />
        ) : onAir ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <div className="bar flex-1" aria-hidden><i className="yellow" style={{ width: `calc(${Math.max(0, Math.min(100, (rem / (cfg.seconds * 1000)) * 100))}% + 6px)` }} /></div>
              <span className={`t-display w-8 text-right text-[20px] tabular-nums ${late ? 't-red' : 't-out'}`} aria-live="polite">{Math.ceil(rem / 1000)}</span>
            </div>
            <Question text={current!.q} />
            <div className="mt-3 flex flex-col gap-2">
              {current!.options.map((opt, k) => (
                <button key={k} onClick={() => answer(k)} disabled={busy} className="btn btn-white btn-md w-full text-[17px] leading-tight">{opt}</button>
              ))}
            </div>
          </>
        ) : feedback ? (
          <>
            <div className={`t-display mt-4 text-center text-[24px] ${feedback.correct ? 't-green' : 't-red'}`}>
              {feedback.correct ? 'Acertou!' : feedback.timeout ? 'Acabou o tempo' : 'Errou'}
            </div>
            <Question text={feedback.q} />
            <div className="mt-3 flex flex-col gap-2">
              {feedback.options.map((opt, k) => {
                const cls = k === feedback.correctChoice ? 'btn-green' : k === feedback.choice ? 'btn-red' : 'btn-white opacity-50';
                return <div key={k} className={`btn ${cls} btn-md w-full text-[17px] leading-tight`}>{opt}</div>;
              })}
            </div>
            <button onClick={() => (finished ? setFeedback(null) : next())} disabled={busy} className="btn btn-orange btn-lg mt-auto w-full">
              {finished ? 'Ver resultado' : 'Próxima pergunta'}
            </button>
          </>
        ) : (
          <div className="panel mt-4 text-center text-navy-ink">
            <div className="t-display text-[22px]">{game.index === 0 ? 'Quiz do dia' : 'Continue o quiz'}</div>
            <p className="mt-1 text-[14px] font-extrabold leading-snug">
              {cfg.questions} perguntas de futebol, {cfg.seconds} segundos cada. Cada acerto vale +{cfg.pointsPerHit} de nível; com {cfg.goalAt} acertos, é gol do {me.team.name}.
            </p>
            <p className="mt-2 text-[12px] font-bold text-muted">O relógio só começa quando a pergunta aparece.</p>
            <button onClick={next} disabled={busy} className="btn btn-orange btn-lg mt-4 w-full">{game.index === 0 ? 'Começar' : 'Próxima pergunta'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Question({ text }: { text: string }) {
  return <div className="panel mt-3 text-center text-[17px] font-extrabold leading-snug text-navy-ink">{text}</div>;
}

/** Uma bola por pergunta, como numa disputa de pênaltis. A marca depois da 3ª mostra onde vira gol. */
function Shootout({ total, results, onAir, goalAt }: { total: number; results: QuizResult[]; onAir: number; goalAt: number }) {
  const hits = results.filter((r) => r.correct).length;
  return (
    <div className="relative mt-1 flex flex-col items-center">
      <div className="flex items-center gap-2" style={{ ['--tile' as string]: '34px' }}>
        {Array.from({ length: total }, (_, k) => {
          const r = results[k];
          const cls = r ? (r.correct ? 'tile-correct' : 'tile-wrong') : k === onAir ? 'tile-now' : 'tile-slot';
          return (
            <div key={k} className="flex items-center gap-2">
              <div className={`tile ${cls}`} role="img" aria-label={r ? (r.correct ? `Pergunta ${k + 1}: acertou` : `Pergunta ${k + 1}: errou`) : `Pergunta ${k + 1}`}>
                {r && <img src={r.correct ? '/ui/check-green.png' : '/ui/pi-close.png'} alt="" className="h-4 w-4" />}
              </div>
              {k === goalAt - 1 && k < total - 1 && <span className="h-6 w-[3px] rounded bg-white/70" aria-hidden />}
            </div>
          );
        })}
      </div>
      <p className="t-out mt-1 text-[12px] font-extrabold">
        {hits >= goalAt ? 'Gol garantido!' : `${goalAt} acertos é gol`}
      </p>
    </div>
  );
}

function Result({ game, team, cfg, onBack }: { game: QuizState; team: string; cfg: { goalAt: number }; onBack: () => void }) {
  const goal = !!game.reward?.goal;
  const missing = Math.max(0, cfg.goalAt - game.hits);
  return (
    <div className="panel mt-3 text-navy-ink">
      <div className={`t-display text-center text-[22px] ${goal ? 'text-grass-deep' : ''}`}>
        {goal ? `Gol do ${team}!` : `Faltou ${missing} ${missing === 1 ? 'acerto' : 'acertos'} para o gol`}
      </div>
      <p className="mt-0.5 text-center text-[14px] font-extrabold">{game.hits} de {game.total} acertos: +{game.reward?.levelPoints ?? 0} de nível.</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {game.results.map((r, k) => (
          <li key={k} className="flex items-start gap-2 text-[12px] font-bold leading-snug">
            <img src={r.correct ? '/ui/check-green.png' : '/ui/pi-close.png'} alt={r.correct ? 'acertou' : 'errou'} className={`mt-0.5 h-4 w-4 shrink-0 ${r.correct ? '' : 'rounded-full bg-danger p-0.5'}`} />
            <span className="text-muted">{r.q} <b className="text-navy-ink">{r.options[r.correctChoice]}</b></span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[13px] font-extrabold text-muted">Novo quiz em <Countdown readyAt={game.nextAt} className="text-orange-deep" /></p>
      <button onClick={onBack} className="btn btn-orange btn-md mt-3 w-full">Voltar ao jogo</button>
    </div>
  );
}
