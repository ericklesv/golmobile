import { useEffect, useMemo, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Shield } from './Shield';
import type { Team } from '../lib/types';
import { money as fmtMoney } from '../lib/format';
import { sound } from '../lib/sound';

interface Props {
  open: boolean;
  goal: boolean;
  title?: string;
  text?: string | null;
  money?: number;
  /** Pontos de nível extras (minigames diários). */
  levelPoints?: number;
  team?: Team | null;
  onClose: () => void;
  autoClose?: number;
  /** Bloco extra embaixo da narração (ex.: o retrospecto no fim do FutPrego). */
  children?: ReactNode;
}

/** Tela de resultado estilo "Stage Clear": ribbon, estrelas, prêmio em moedas/nível, narração. */
export function GoalOverlay({ open, goal, title, text, money = 0, levelPoints = 0, team, onClose, autoClose = 4500, children }: Props) {
  useEffect(() => {
    if (!open) return;
    sound.play(goal ? 'goal' : 'error');
    const t = setTimeout(onClose, autoClose);
    return () => clearTimeout(t);
  }, [open]);
  const confetti = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    x: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.8 + Math.random() * 1.4, rot: Math.random() * 720 - 360,
    color: i % 3 === 0 ? (team?.colorPrimary ?? '#FFC63D') : i % 3 === 1 ? (team?.colorSecondary ?? '#FF8A2A') : '#FFFFFF', size: 6 + Math.random() * 8,
  })), [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
          className="fixed inset-y-0 left-1/2 z-[90] flex w-full max-w-[480px] -translate-x-1/2 items-center justify-center overflow-hidden bg-navy-deep/80 backdrop-blur-[2px]">
          {goal && <img src="/ui/screen-glow.png" alt="" className="pointer-events-none absolute left-1/2 top-1/2 w-[130%] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-70 animate-spinSlow" />}
          {goal && confetti.map((c, i) => (
            <motion.span key={i} initial={{ y: -40, x: `${c.x}vw`, rotate: 0, opacity: 1 }} animate={{ y: '110vh', rotate: c.rot, opacity: [1, 1, 0.6] }}
              transition={{ duration: c.dur, delay: c.delay, ease: 'easeIn' }} className="absolute top-0 rounded-sm" style={{ width: c.size, height: c.size * 0.6, background: c.color }} />
          ))}
          {/* com bloco extra, a coluna rola se não couber (celular baixo); o px-5 no lugar do mx-5 deixa a mesma largura e dá folga para o pulo da ribbon */}
          <div className={`relative flex w-full flex-col items-center text-center ${children ? 'no-scrollbar max-h-full max-w-[26.5rem] overflow-y-auto overflow-x-hidden px-5 py-4' : 'mx-5 max-w-sm'}`}>
            <motion.div initial={{ scale: 0.3, rotate: -8 }} animate={{ scale: [0.3, 1.15, 1], rotate: [-8, 3, 0] }} transition={{ duration: 0.55, ease: 'easeOut' }}
              className={`ribbon ribbon-lg ${goal ? 'ribbon-orange' : 'ribbon-blue'} w-full`}>
              {title ?? (goal ? 'GOOOOL!!' : 'ERROU!')}
            </motion.div>
            <div className="-mt-1 flex items-end gap-1">
              {[0, 1, 2].map((i) => (
                <motion.img key={i} src={goal ? '/ui/ico-stargrade_l_on.png' : '/ui/ico-stargrade_l_off.png'} alt="" initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.12, type: 'spring', stiffness: 300, damping: 14 }}
                  className={i === 1 ? 'h-20 w-20' : 'h-14 w-14'} />
              ))}
            </div>
            {team && <Shield team={team} size={64} className="mt-2" />}
            {goal && money > 0 && (
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="resbar mt-3 text-lg">
                <img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-9 w-9" alt="" /> +{fmtMoney(money)}
              </motion.div>
            )}
            {goal && levelPoints > 0 && (
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="resbar mt-3 text-lg">
                <img src="/ui/lvl-badge-blue.png" className="ico -ml-3 h-9 w-9" alt="" /> +{levelPoints} de nível
              </motion.div>
            )}
            {text && (
              <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }} className="panel mt-4 w-full text-[14px] font-extrabold leading-snug text-navy-ink">
                {text}
              </motion.div>
            )}
            {children}
            <p className="mt-5 font-display text-xs uppercase tracking-widest text-white/70">toque para continuar</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
