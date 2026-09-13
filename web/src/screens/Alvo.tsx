import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { AlvoState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';

/**
 * Alvo no Gol — 10 alvos acendem um por vez no gol (posição do servidor), cada um por 1,5 s.
 * Toque = POST hit; o servidor decide se foi a tempo. Apagou sem toque, o próximo `next`
 * registra o erro. A tela encadeia os alvos sozinha depois do "Começar".
 */
const FLASH_MS = 420;

export function AlvoScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const now = useAuth((s) => s.now);
  const nav = useNavigate();
  const [game, setGame] = useState<AlvoState | null>(null);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState<{ x: number; y: number; hit: boolean } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [, tick] = useState(0);
  const busy = useRef(false);
  const timer = useRef<number | null>(null);
  const curRef = useRef<AlvoState['current']>(null); // alvo da vez (o botão que está saindo da tela não pode responder pelo anterior)

  function load() {
    api.alvo().then((r) => setGame(r.state)).catch((e) => {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'locked') nav('/', { replace: true });
    });
  }
  useEffect(() => { load(); return () => { if (timer.current) window.clearTimeout(timer.current); }; }, []);

  const current = game?.current ?? null;
  curRef.current = current;
  const finished = !!game?.finished;

  // relógio do anel do alvo (60 fps enquanto há alvo aceso)
  useEffect(() => {
    if (!current) return;
    let raf = 0;
    const loop = () => { tick((t) => t + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [current?.index]);

  async function next() {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await api.alvoNext(game?.day ?? 0);
      setGame(r.state);
      if (r.state.finished) finish(r.state);
    } catch (e) { handleError(e); } finally { busy.current = false; }
  }

  // alvo apagou sem toque: pede o próximo (o servidor registra o erro)
  useEffect(() => {
    if (!current || !running) return;
    const ms = Math.max(0, current.deadline - now()) + 120;
    timer.current = window.setTimeout(() => {
      if (!busy.current) { sound.play('error'); setFlash({ x: current.x, y: current.y, hit: false }); window.setTimeout(() => setFlash(null), FLASH_MS); next(); }
    }, ms);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [current?.index, running]);

  async function hit() {
    const cur = curRef.current;
    if (!cur || busy.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    busy.current = true;
    const spot = { x: cur.x, y: cur.y };
    try {
      const r = await api.alvoHit(cur.index, game!.day);
      sound.play(r.hit ? 'pop' : 'error');
      setFlash({ ...spot, hit: r.hit });
      setGame(r.state);
      window.setTimeout(() => setFlash(null), FLASH_MS);
      busy.current = false;
      if (r.state.finished) finish(r.state);
      else window.setTimeout(next, FLASH_MS);
    } catch (e) {
      busy.current = false;
      // alvo já tinha apagado/trocado: só ressincroniza e segue o jogo
      if (e instanceof ApiError && (e.code === 'out-of-sync' || e.code === 'not-served')) next(); else handleError(e);
    }
  }

  function finish(s: AlvoState) {
    setRunning(false);
    refresh();
    if (s.reward?.goal) window.setTimeout(() => setOverlay(true), 600);
  }

  function handleError(e: unknown) {
    if (e instanceof ApiError && ['day-changed', 'finished', 'out-of-sync', 'not-served'].includes(e.code)) { toast(e.message); setRunning(false); load(); }
    else toast((e as Error).message, 'error');
  }

  const total = game?.total ?? 10;
  const hits = game?.hits ?? 0;
  const goalAt = game?.goalAt ?? 7;
  const windowMs = game?.windowMs ?? 1500;
  const frac = current ? Math.max(0, Math.min(1, (current.deadline - now()) / windowMs)) : 0;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal title="GOOOL!!!" text={game?.reward?.text ?? undefined} levelPoints={game?.reward?.levelPoints} team={me.team} onClose={() => setOverlay(false)} />

      <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-orange text-[17px]">ALVO NO GOL</div>
        <div className="trap trap-blue text-[13px] tabular-nums">{game ? `${Math.min(game.index + (current ? 1 : 0), total)}/${total}` : '…'}</div>
      </div>

      <div className="relative mt-1 flex flex-col items-center">
        <div className="flex items-center gap-1" style={{ ['--tile' as string]: '24px' }}>
          {Array.from({ length: total }, (_, k) => {
            const r = game?.results[k];
            const cls = r ? (r.hit ? 'tile-correct' : 'tile-wrong') : current && k === current.index ? 'tile-now' : 'tile-slot';
            return (
              <div key={k} className="flex items-center gap-1">
                <div className={`tile ${cls}`}>{r && <img src={r.hit ? '/ui/check-green.png' : '/ui/pi-close.png'} alt="" className="h-3 w-3" />}</div>
                {k === goalAt - 1 && k < total - 1 && <span className="h-4 w-[3px] rounded bg-white/70" aria-hidden />}
              </div>
            );
          })}
        </div>
        <p className="t-out mt-1 text-[12px] font-extrabold">{hits >= goalAt ? 'Gol garantido!' : `${goalAt} alvos é gol`}</p>
      </div>

      {/* O gol: traves brancas, rede e o alvo aceso */}
      <div className="relative mx-3 mt-3 select-none" style={{ aspectRatio: '16 / 11' }}>
        <div className="absolute inset-x-0 bottom-0 top-0 rounded-t-md border-[10px] border-b-0 border-white shadow-[0_6px_0_rgba(0,0,0,0.25)]" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 14px), repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 14px), linear-gradient(180deg, rgba(10,40,90,0.55), rgba(10,40,90,0.75))' }} />
        <div className="absolute inset-x-0 bottom-0 h-[6px] bg-white/90" />
        {!running && !finished && game && (
          <button onClick={() => { setRunning(true); next(); }} className="btn btn-orange btn-lg absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-8">{game.index === 0 ? 'Começar' : 'Continuar'}</button>
        )}
        <AnimatePresence>
          {running && current && (
            <motion.button key={current.index} onPointerDown={hit} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="no-drag absolute h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 touch-none" style={{ left: `${current.x * 100}%`, top: `${current.y * 100}%` }} aria-label="alvo">
              <span className="absolute inset-0 rounded-full bg-white shadow-[0_4px_0_rgba(0,0,0,0.3)]" />
              <span className="absolute inset-[9px] rounded-full bg-danger" />
              <span className="absolute inset-[20px] rounded-full bg-white" />
              <span className="absolute inset-[29px] rounded-full bg-danger" />
              {/* anel do tempo: encolhe até apagar */}
              <span className="absolute -inset-1 rounded-full border-[5px] border-gold" style={{ transform: `scale(${0.8 + frac * 0.5})`, opacity: 0.35 + frac * 0.65 }} />
            </motion.button>
          )}
        </AnimatePresence>
        {flash && (
          <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${flash.x * 100}%`, top: `${flash.y * 100}%` }}>
            <span className={`t-display text-[26px] ${flash.hit ? 't-green' : 't-red'}`}>{flash.hit ? 'NA REDE!' : 'PASSOU'}</span>
          </div>
        )}
      </div>

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
        {!game ? null : finished ? (
          <div className="panel mt-3 text-navy-ink">
            <div className={`t-display text-center text-[22px] ${game.reward?.goal ? 'text-grass-deep' : ''}`}>
              {game.reward?.goal ? `Gol do ${me.team.name}!` : `Faltou ${Math.max(0, goalAt - hits)} ${goalAt - hits === 1 ? 'alvo' : 'alvos'} para o gol`}
            </div>
            <p className="mt-0.5 text-center text-[14px] font-extrabold">{hits} de {total} alvos: +{game.reward?.levelPoints ?? 0} de nível.</p>
            <p className="mt-3 text-center text-[13px] font-extrabold text-muted">Alvos novos em <Countdown readyAt={game.nextAt} className="text-orange-deep" /></p>
            <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-3 w-full">Voltar ao jogo</button>
          </div>
        ) : (
          <p className="mt-3 text-center text-[12px] font-extrabold text-white/90">
            {total} alvos acendem no gol, um de cada vez, por {(windowMs / 1000).toLocaleString('pt-BR')} s. Toque em cada um antes de apagar. Cada acerto vale +{game.pointsPerHit} de nível; com {goalAt}, é gol do {me.team.name}.
          </p>
        )}
      </div>
    </div>
  );
}
