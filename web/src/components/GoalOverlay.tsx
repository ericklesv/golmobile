import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Shield } from './Shield';
import type { Team } from '../lib/types';
import { money as fmtMoney } from '../lib/format';

interface Props {
  open: boolean;
  goal: boolean;
  title?: string;
  text?: string | null;
  money?: number;
  team?: Team | null;
  onClose: () => void;
  autoClose?: number;
}

/** "GOOOL!!" de tela cheia — igual ao original, com narração e bandeira do time. */
export function GoalOverlay({ open, goal, title, text, money = 0, team, onClose, autoClose = 4200 }: Props) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, autoClose);
    return () => clearTimeout(t);
  }, [open]);
  const confetti = useMemo(() => Array.from({ length: 42 }, (_, i) => ({
    x: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.8 + Math.random() * 1.4, rot: Math.random() * 720 - 360,
    color: i % 3 === 0 ? (team?.colorPrimary ?? '#22E58A') : i % 3 === 1 ? (team?.colorSecondary ?? '#FFC24B') : '#EDF4F3', size: 6 + Math.random() * 8,
  })), [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-night-0/85 backdrop-blur-sm">
          {goal && confetti.map((c, i) => (
            <motion.span key={i} initial={{ y: -40, x: `${c.x}vw`, rotate: 0, opacity: 1 }} animate={{ y: '110vh', rotate: c.rot, opacity: [1, 1, 0.6] }}
              transition={{ duration: c.dur, delay: c.delay, ease: 'easeIn' }} className="absolute top-0 rounded-sm"
              style={{ width: c.size, height: c.size * 0.6, background: c.color }} />
          ))}
          {goal && team && (
            <motion.div initial={{ scaleX: 0.6, opacity: 0 }} animate={{ scaleX: 1, opacity: 0.35 }} className="absolute inset-x-0 top-[28%] h-32"
              style={{ background: `repeating-linear-gradient(180deg, ${team.colorPrimary} 0 18px, ${team.colorSecondary} 18px 36px)`, maskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)' }} />
          )}
          <div className="relative mx-6 flex max-w-sm flex-col items-center text-center">
            {team && <Shield team={team} size={64} className="mb-3 drop-shadow-lg" />}
            <motion.h1 initial={{ scale: 0.4, rotate: -6 }} animate={{ scale: [0.4, 1.25, 1], rotate: [-6, 3, 0] }} transition={{ duration: 0.6, ease: 'easeOut' }}
              className={`font-poster text-6xl uppercase leading-none drop-shadow-[0_6px_0_rgba(0,0,0,0.5)] ${goal ? 'text-turf' : 'text-card'}`}>
              {title ?? (goal ? 'GOOOOL!!' : 'ERROU!')}
            </motion.h1>
            {goal && money > 0 && (
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="mt-3 rounded-full bg-flood px-4 py-1 font-score text-lg font-bold text-night-0 shadow-flood">
                +{fmtMoney(money)}
              </motion.div>
            )}
            {text && (
              <motion.p initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }} className="mt-4 text-sm leading-relaxed text-chalk/90">
                {text}
              </motion.p>
            )}
            <p className="mt-6 text-[10px] uppercase tracking-widest text-hazedim">toque para continuar</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
