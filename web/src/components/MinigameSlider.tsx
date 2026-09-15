import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { MinigameCard } from '../lib/types';
import { useCountdown } from './ui';
import { countdown } from '../lib/format';
import { toast } from './Toast';

/** Texto ao vivo do card: fila do Cabeção ou desafios abertos do FutPrego (null = mostra a descrição). */
function liveText(g: MinigameCard): string | null {
  const l = g.live;
  if (!l) return null;
  if (l.queue !== undefined) return `${l.queue} na fila · ${l.playing} jogando`;
  if (l.open) return l.open === 1 ? '1 pessoa desafiando agora' : `${l.open} pessoas desafiando agora`;
  if (l.playing) return `${l.playing} jogando agora`;
  return null;
}

/**
 * Slider horizontal de minigames da Home. Cada card mostra o estado: PRONTO (dá pra jogar),
 * CONTINUAR (começou e não terminou), JOGADO (volta em X), cadeado com o nível que libera,
 * ou EM BREVE. Rola por toque no celular e por arraste no PC (dragScroll global).
 */
function Card({ g }: { g: MinigameCard }) {
  const nav = useNavigate();
  const rem = useCountdown(g.finished && g.nextAt ? g.nextAt : null);
  const locked = !g.unlocked;
  const state = locked ? 'locked' : g.soon ? 'soon' : g.finished ? 'done' : g.started ? 'continue' : 'ready';
  const tone = state === 'ready' ? 'card-purple' : state === 'continue' ? 'card-orange' : state === 'done' ? 'card-blue' : 'card-blue';
  const label = state === 'locked' ? `NÍVEL ${g.unlockLevel}` : state === 'soon' ? 'EM BREVE' : state === 'done' ? (rem > 0 ? countdown(rem) : 'PRONTO') : state === 'continue' ? 'CONTINUAR' : 'PRONTO';
  const go = () => {
    if (locked) { toast(`${g.name} libera no nível ${g.unlockLevel}.`); return; }
    if (g.soon) { toast(`${g.name} chega em breve!`); return; }
    nav(g.route);
  };
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={go} className={`${tone} relative flex w-[156px] shrink-0 snap-start flex-col items-center gap-1 text-center ${locked || g.soon ? 'opacity-90' : ''}`} style={{ minHeight: 168 }}>
      <div className="relative">
        <img src={g.icon} alt="" className={`h-12 w-12 object-contain ${state === 'ready' ? 'animate-bob' : ''} ${locked || g.soon ? 'opacity-40 grayscale' : state === 'done' ? 'opacity-70' : ''}`} />
        {locked && <img src="/ui/ico-lock01_m.png" alt="" className="absolute -bottom-1 -right-2 h-7 w-7" />}
        {state === 'done' && g.won && <img src="/ui/check-green.png" alt="" className="absolute -bottom-1 -right-2 h-6 w-6" />}
      </div>
      <div className="t-display t-out text-[15px] leading-tight">{g.name}</div>
      <div className="line-clamp-2 text-[10.5px] font-extrabold leading-tight text-white/85">{locked ? `Libera no nível ${g.unlockLevel}.` : liveText(g) ?? g.desc}</div>
      <div className="mt-auto flex flex-col items-center leading-none">
        <span className="text-[9px] font-extrabold uppercase text-white/75">{locked || g.soon ? 'prêmio' : state === 'done' ? 'volta em' : 'prêmio'}</span>
        <span className={`t-display text-[13px] ${state === 'done' ? 't-out' : 't-gold'}`}>{state === 'done' ? label : g.rewardLabel}</span>
      </div>
      <span className={`trap ${state === 'ready' ? 'trap-green' : state === 'continue' ? 'trap-orange' : 'trap-blue'} absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] uppercase`}>{state === 'done' ? 'JOGADO' : label}</span>
    </motion.button>
  );
}

export function MinigameSlider() {
  const me = useAuth((s) => s.me)!;
  const [games, setGames] = useState<MinigameCard[] | null>(null);
  const load = useCallback(() => api.minigames().then((r) => setGames(r.games)).catch(() => {}), []);
  useEffect(() => { load(); }, [load, me.goalsTotal, me.levelBonus]);
  // quando o diário mais próximo renova, recarrega sozinho
  const soonest = games ? Math.min(...games.filter((g) => g.finished && g.nextAt).map((g) => g.nextAt as number), Infinity) : Infinity;
  useEffect(() => {
    if (!Number.isFinite(soonest)) return;
    const t = setTimeout(load, Math.max(1_000, soonest - Date.now() + 2_000));
    return () => clearTimeout(t);
  }, [soonest, load]);

  const ready = games?.filter((g) => g.available && !g.finished).length ?? 0;
  return (
    <section className="-mx-3">
      <div className="mb-1 flex items-center justify-between px-3">
        <span className="t-display t-out text-[15px] uppercase">Minigames</span>
        <span className="t-display t-gold text-[12px]">{ready > 0 ? `${ready} pra jogar` : games ? 'volte mais tarde' : ''}</span>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 pt-4" style={{ scrollbarWidth: 'none' }}>
        {(games ?? []).map((g) => <Card key={g.id} g={g} />)}
        {!games && <div className="card-blue h-[168px] w-[156px] shrink-0 opacity-50" />}
      </div>
    </section>
  );
}
