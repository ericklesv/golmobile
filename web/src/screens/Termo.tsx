import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { TermoColor, TermoState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';

/**
 * Termo do dia — uma palavra de futebol por dia. Toda a conta (dicionário, cores,
 * gol, pontos) é da API; a tela só digita, anima e mostra. A palavra só chega
 * quando o jogo acaba.
 */

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const RANK: Record<TermoColor, number> = { absent: 1, present: 2, correct: 3 };
const SAYS: Record<TermoColor, string> = { correct: 'no lugar certo', present: 'em outro lugar', absent: 'não tem' };
const REVEAL_MS = 240;
const HELP_SEEN = 'brgol.termo.ajuda';

/** Sem acento, e Ç vale C — é assim que chute e resposta se comparam. */
const keyOf = (w: string) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Tecla física → letra do jogo (a–z; acento e ç valem a letra base). */
function letterOf(key: string): string | null {
  if ([...key].length !== 1) return null;
  const l = keyOf(key);
  return /^[a-z]$/.test(l) ? l : null;
}
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

export function TermoScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const letters = meta?.termo.letters ?? 5;
  const tries = meta?.termo.tries ?? 6;
  const points = meta?.termo.levelPoints ?? [30, 25, 20, 15, 10, 5];

  const [game, setGame] = useState<TermoState | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState<{ row: number; shown: number } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const rowShake = useAnimationControls();
  const [overlay, setOverlay] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    api.termo().then(setGame).catch((e) => toast((e as Error).message, 'error'));
    try { if (!localStorage.getItem(HELP_SEEN)) { setHelp(true); localStorage.setItem(HELP_SEEN, '1'); } } catch {}
  }, []);

  const locked = !game || game.finished || busy || !!revealing;

  function press(l: string) { if (!locked) setTyped((t) => (t.length < letters ? t + l : t)); }
  function erase() { if (!locked) setTyped((t) => t.slice(0, -1)); }
  /** A linha da vez treme: chute recusado (não gasta tentativa). */
  function refuse(msg: string) {
    toast(msg);
    if (!reduce) rowShake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.4 } });
  }

  async function reveal(row: number) {
    if (reduce) return;
    for (let k = 0; k <= letters; k++) {
      setRevealing({ row, shown: k });
      await wait(REVEAL_MS);
    }
    setRevealing(null);
  }

  async function kick() {
    if (locked || !game) return;
    if (typed.length < letters) { refuse(`A palavra tem ${letters} letras.`); return; }
    setBusy(true);
    try {
      const r = await api.termoGuess(typed, game.day);
      const isNew = r.state.guesses.length > game.guesses.length;
      setGame(r.state);
      setTyped('');
      if (isNew) await reveal(r.state.guesses.length - 1);
      if (r.state.won && isNew) {
        setCelebrate(true);
        await wait(reduce ? 0 : 600);
        setOverlay(true);
      }
      if (r.state.finished) refresh();
    } catch (e) {
      if (e instanceof ApiError && ['not-a-word', 'bad-word', 'repeated'].includes(e.code)) refuse(e.message);
      else if (e instanceof ApiError && ['finished', 'day-changed'].includes(e.code)) { toast(e.message); setTyped(''); api.termo().then(setGame).catch(() => {}); }
      else toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  // teclado físico (computador)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || help || overlay) return;
      if (e.key === 'Enter') { e.preventDefault(); kick(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); erase(); return; }
      const l = letterOf(e.key);
      if (l) { e.preventDefault(); press(l); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // cada tecla fica com a melhor cor que a letra já teve (a linha que está virando ainda não conta)
  const keyColors = useMemo(() => {
    const map: Record<string, TermoColor> = {};
    game?.guesses.forEach((g, gi) => {
      if (revealing?.row === gi) return;
      [...keyOf(g.word)].forEach((ch, i) => {
        const c = g.colors[i];
        if (!map[ch] || RANK[c] > RANK[map[ch]]) map[ch] = c;
      });
    });
    return map;
  }, [game, revealing]);

  const used = game?.guesses.length ?? 0;
  const wonRow = game?.won ? used - 1 : -1;
  // o resultado só aparece depois que a última linha terminou de virar (senão entrega o final)
  const done = !!game?.finished && !revealing;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal title="GOOOL!!!" text={game?.reward?.text} levelPoints={game?.reward?.levelPoints} team={me.team} onClose={() => setOverlay(false)} />

      <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-orange">TERMO</div>
        <button onClick={() => setHelp(true)} className="btn-sq btn-sq-sky h-12 w-12" aria-label="Como jogar"><img src="/ui/ico-info.png" className="h-7 w-7" alt="" /></button>
      </div>
      <p className="t-display t-out relative px-4 text-center text-[15px] leading-tight">Palavra de futebol do dia. Acertou, é gol do {me.team.name}.</p>

      {/* Tabuleiro + a escada de prêmio (quanto vale acertar em cada tentativa) */}
      <div className="relative mx-auto mt-3 flex flex-col gap-[6px]" style={{ ['--tile' as string]: 'min(62px, calc((100vw - 110px) / 5), calc((100dvh - 380px) / 6))' }}>
        {Array.from({ length: tries }, (_, r) => {
          const g = game?.guesses[r];
          const isNow = !game?.finished && r === used;
          const flipping = revealing?.row === r;
          const shown = flipping ? revealing.shown : letters;
          const chars = g ? [...g.word] : isNow ? [...typed] : [];
          const tag = flipping || isNow ? 'now' : r === wonRow ? 'won' : r < used ? 'spent' : 'next';
          return (
            <motion.div key={r} animate={isNow ? rowShake : undefined} className="flex items-center gap-[6px]">
              <span className="w-10" aria-hidden />
              {Array.from({ length: letters }, (_, i) => {
                const ch = chars[i] ?? '';
                const color = g && i < shown ? g.colors[i] : null;
                const cls = color ? `tile-${color}${flipping ? ' tile-flip' : ''}${celebrate && r === wonRow ? ' tile-jump' : ''}`
                  : g || ch ? `tile-typed${!g ? ' animate-pop' : ''}` : isNow ? 'tile-now' : 'tile-slot';
                return (
                  <div key={`${i}-${ch}`} className={`tile ${cls}`} style={celebrate && r === wonRow ? { animationDelay: `${i * 80}ms` } : undefined}
                    role="img" aria-label={ch ? `${ch.toUpperCase()}${color ? `, ${SAYS[color]}` : ''}` : 'vazia'}>
                    {ch}
                  </div>
                );
              })}
              <span className={`flex w-10 items-center gap-0.5 font-display text-[15px] tabular-nums ${tag === 'won' ? 't-gold' : tag === 'now' ? 't-gold scale-110' : tag === 'spent' ? 'text-white/40 line-through' : done ? 'text-white/40' : 't-out opacity-70'}`}>
                {tag === 'won' && <img src="/ui/check-green.png" alt="" className="h-4 w-4" />}+{points[r]}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="relative mt-auto px-2 pb-3 pt-3" style={{ paddingBottom: 'calc(var(--sab) + 12px)' }}>
        {game && done ? (
          <div className="panel text-center text-navy-ink">
            {game.won ? (
              <>
                <div className="t-display text-[22px] text-grass-deep">Gol do {me.team.name}!</div>
                <div className="mt-0.5 text-[14px] font-extrabold">Acertou em {used} {used === 1 ? 'tentativa' : 'tentativas'}: +{game.reward?.levelPoints ?? 0} de nível.</div>
              </>
            ) : (
              <>
                <div className="text-[13px] font-extrabold text-muted">A palavra de hoje era</div>
                <div className="mt-1 flex justify-center gap-1" style={{ ['--tile' as string]: '40px' }}>
                  {[...(game.answer ?? '')].map((ch, i) => <div key={i} className="tile tile-correct">{ch}</div>)}
                </div>
              </>
            )}
            <div className="mt-2 text-[13px] font-extrabold text-muted">Nova palavra em <Countdown readyAt={game.nextAt} className="text-orange-deep" /></div>
            <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-3 w-full">Voltar ao jogo</button>
          </div>
        ) : (
          <div className="panel-navy flex flex-col gap-[6px]" aria-label="Teclado">
            {KEY_ROWS.map((row, n) => (
              <div key={row} className="flex gap-1">
                {[...row].map((l) => (
                  <button key={l} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => press(l)} disabled={locked}
                    className={`key ${keyColors[l] ? `key-${keyColors[l]}` : ''}`} aria-label={`${l.toUpperCase()}${keyColors[l] ? `, ${SAYS[keyColors[l]]}` : ''}`}>
                    {l}
                  </button>
                ))}
                {n === 1 && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={erase} disabled={locked} className="key" style={{ flex: 1.5 }} aria-label="Apagar">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
                    </svg>
                  </button>
                )}
                {n === 2 && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={kick} disabled={locked} className="key key-kick">Chutar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {help && <TermoHelp team={me.team.name} tries={tries} letters={letters} points={points} onClose={() => setHelp(false)} />}
    </div>
  );
}

/** Como jogar — abre sozinho na primeira vez. Exemplos fora do calendário de respostas. */
function TermoHelp({ team, tries, letters, points, onClose }: { team: string; tries: number; letters: number; points: number[]; onClose: () => void }) {
  const examples: { word: string; at: number; color: TermoColor; text: string }[] = [
    { word: 'NUVEM', at: 0, color: 'correct', text: 'O N está na palavra, e nesse lugar.' },
    { word: 'PRATO', at: 2, color: 'present', text: 'O A está na palavra, mas em outro lugar.' },
    { word: 'FILME', at: 3, color: 'absent', text: 'O M não está na palavra.' },
  ];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy-deep/80 px-4 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal aria-label="Como jogar">
      <div className="relative w-full max-w-sm pt-7" onClick={(e) => e.stopPropagation()}>
        <div className="absolute left-0 right-0 top-0 z-10 flex justify-center"><div className="ribbon ribbon-blue">COMO JOGAR</div></div>
        <div className="panel pt-8 text-[13px] font-bold leading-snug text-navy-ink">
          <p>Adivinhe a palavra de futebol do dia em até {tries} tentativas. Cada chute é uma palavra de {letters} letras; acento e Ç não contam.</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {examples.map((ex) => (
              <li key={ex.word}>
                <div className="inline-flex gap-1 rounded-xl bg-sky/25 p-1.5" style={{ ['--tile' as string]: '34px' }}>
                  {[...ex.word].map((ch, i) => <div key={i} className={`tile ${i === ex.at ? `tile-${ex.color}` : 'tile-typed'}`}>{ch}</div>)}
                </div>
                <p className="mt-1">{ex.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3">Acertou, é gol do {team} e ganha pontos de nível: +{points[0]} na 1ª tentativa, caindo até +{points[points.length - 1]} na {points.length}ª. Uma palavra por dia; a próxima chega à meia-noite.</p>
          <button onClick={onClose} className="btn btn-orange btn-md mt-4 w-full">Entendi</button>
        </div>
      </div>
    </div>
  );
}
