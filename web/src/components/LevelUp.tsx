import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import type { Meta } from '../lib/types';
import { sound } from '../lib/sound';

/**
 * Janela de "subiu de nível" (pedido do dono, 13/09/2026). Vigia `me.level.lvl`: o último nível que
 * o jogador já viu fica no aparelho (localStorage, por conta). Subiu — por gol, chute automático ou
 * pontos de minigame, até com o app fechado — aparece uma vez: parabéns + o que o nível libera
 * ("LIBERADO X! JOGAR AGORA" para minigame; "Nova habilidade" para o resto). Primeira vez no
 * aparelho só anota o nível (não mostra janela de níveis antigos).
 */

type Pop = { from: number; to: number; name: string; unlocks: NonNullable<Meta['minigames']>; skills: string[] };

const KEY = (id: number) => `brgol.nivelVisto.${id}`;
const readSeen = (id: number) => { try { const v = localStorage.getItem(KEY(id)); return v === null ? null : Number(v); } catch { return null; } };
const writeSeen = (id: number, lvl: number) => { try { localStorage.setItem(KEY(id), String(lvl)); } catch {} };

function build(from: number, to: number, meta: Meta | null): Pop {
  const levels = meta?.levels ?? [];
  const unlocks = (meta?.minigames ?? []).filter((g) => g.unlock > from && g.unlock <= to).sort((a, b) => a.unlock - b.unlock);
  // "Libera o Party GoL" etc. já aparece como LIBERADO; o resto vira "nova habilidade" (sem repetir)
  const skills = [...new Set(levels.filter((l) => l.lvl > from && l.lvl <= to && l.skill && !/^libera/i.test(l.skill)).map((l) => l.skill!))];
  return { from, to, name: levels.find((l) => l.lvl === to)?.name ?? `Nível ${to}`, unlocks, skills };
}

export function LevelUpWatcher() {
  const me = useAuth((s) => s.me);
  const nav = useNavigate();
  const [pop, setPop] = useState<Pop | null>(null);
  const tutorial = !!me?.tutorial?.pending;
  const id = me?.id, lvl = me?.level.lvl;

  useEffect(() => {
    if (tutorial) return; // o tutorial de boas-vindas vem primeiro; o nível novo aparece depois dele
    if (id === undefined || lvl === undefined) return;
    const seen = readSeen(id);
    if (seen === null || !Number.isFinite(seen) || lvl < seen) { writeSeen(id, lvl); return; } // 1ª vez no aparelho (ou nível voltou): só anota
    if (lvl === seen) return;
    // espera um pouco (a comemoração do gol vem antes) e só marca o nível como visto quando a janela
    // aparece: fechou o app antes, ela aparece na próxima visita; subiu de novo nesse meio, junta tudo
    const t = window.setTimeout(() => {
      writeSeen(id, lvl);
      setPop((prev) => build(Math.min(seen, prev?.from ?? seen), lvl, useAuth.getState().meta));
    }, 1200);
    return () => window.clearTimeout(t);
  }, [id, lvl, tutorial]);
  useEffect(() => { if (pop) sound.play('goal'); }, [pop?.to]);

  const team = me?.team;
  const confetti = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    x: Math.random() * 100, delay: Math.random() * 0.5, dur: 1.8 + Math.random() * 1.2, rot: Math.random() * 720 - 360,
    color: i % 3 === 0 ? (team?.colorPrimary ?? '#FFC63D') : i % 3 === 1 ? '#FFC63D' : '#FFFFFF', size: 6 + Math.random() * 8,
  })), [pop?.to]);

  const close = () => setPop(null);
  const play = (route: string) => { setPop(null); nav(route); };

  return (
    <AnimatePresence>
      {pop && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="lvlup-title"
          className="fixed inset-y-0 left-1/2 z-[95] flex w-full max-w-[480px] -translate-x-1/2 flex-col overflow-y-auto overflow-x-hidden bg-navy-deep/85 backdrop-blur-[2px]">
          <img src="/ui/screen-glow.png" alt="" className="pointer-events-none absolute left-1/2 top-[38%] w-[130%] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-70 animate-spinSlow" />
          {confetti.map((c, i) => (
            <motion.span key={i} initial={{ y: -40, x: `${c.x}vw`, rotate: 0, opacity: 1 }} animate={{ y: '110vh', rotate: c.rot, opacity: [1, 1, 0.6] }}
              transition={{ duration: c.dur, delay: c.delay, ease: 'easeIn' }} className="pointer-events-none absolute top-0 rounded-sm" style={{ width: c.size, height: c.size * 0.6, background: c.color }} />
          ))}
          {/* m-auto: centraliza quando cabe e deixa rolar quando não cabe (vários jogos liberados de uma vez) */}
          <div className="relative m-auto flex w-full max-w-sm flex-col items-center px-5 py-6 text-center">
            <motion.div initial={{ scale: 0.3, rotate: -8 }} animate={{ scale: [0.3, 1.15, 1], rotate: [-8, 3, 0] }} transition={{ duration: 0.55, ease: 'easeOut' }}
              id="lvlup-title" className="ribbon ribbon-lg ribbon-yellow w-full">SUBIU DE NÍVEL!</motion.div>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 13 }} className="relative mt-2">
              <img src="/ui/lvl-badge-yellow.png" alt="" className={`${pop.unlocks.length > 1 ? 'h-24 w-24' : 'h-32 w-32'} drop-shadow-lg`} />
              <span className={`t-display t-out absolute inset-0 flex items-center justify-center pb-2 leading-none ${pop.unlocks.length > 1 ? 'text-[40px]' : 'text-[52px]'}`}>{pop.to}</span>
            </motion.div>
            <div className="t-display t-out mt-1 text-[26px] leading-tight">{pop.name}</div>
            <p className="mt-0.5 text-[13px] font-extrabold text-white/85">Parabéns, craque! Você chegou ao nível {pop.to}.</p>

            {pop.unlocks.map((g, i) => (
              <motion.div key={g.id} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.65 + i * 0.12 }}
                className="card-purple mt-4 flex w-full items-center gap-3 text-left" style={{ borderRadius: 18 }}>
                <img src={g.icon} alt="" className="h-14 w-14 shrink-0 object-contain drop-shadow" />
                <div className="min-w-0 flex-1">
                  <div className="t-display text-[19px] leading-tight text-white">LIBERADO {g.name.toUpperCase()}!</div>
                  <button onClick={() => play(g.route)} className="btn btn-green btn-md mt-2 w-full">JOGAR AGORA</button>
                </div>
              </motion.div>
            ))}

            {pop.skills.length > 0 && (
              <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.75 }} className="panel mt-4 w-full text-navy-ink">
                <div className="t-display text-[15px] text-orange-deep">{pop.skills.length === 1 ? 'Nova habilidade' : 'Novas habilidades'}</div>
                <ul className="mt-0.5 text-[14px] font-extrabold leading-snug">{pop.skills.map((s) => <li key={s}>{s}</li>)}</ul>
              </motion.div>
            )}

            <button onClick={close} className={`btn ${pop.unlocks.length ? 'btn-blue btn-md' : 'btn-orange btn-lg'} mt-4 w-full`}>{pop.unlocks.length ? 'Depois' : 'Continuar'}</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
