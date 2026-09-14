import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { PassDay, PassReward, PassState } from '../lib/types';
import { Countdown } from './ui';
import { toast } from './Toast';
import { sound } from '../lib/sound';

/**
 * Presença da Semana — login diário (api/src/services/pass.js). A cartela abre sozinha uma vez por dia
 * (no aparelho) enquanto o prêmio do dia não foi resgatado; a Home mostra um cartão até resgatar.
 * Todo dia dá XP; o 7º dia dá VIP (ativa na hora). Depois do resgate, o refresh do /me faz a janela de
 * "subiu de nível" (LevelUp.tsx, z-95, por cima desta) aparecer quando o XP sobe o jogador de nível.
 */

type PassStore = { st: PassState | null; open: boolean; load: () => Promise<void>; show: () => void; hide: () => void };
export const usePass = create<PassStore>((set) => ({
  st: null, open: false,
  load: async () => { try { set({ st: await api.pass() }); } catch {} },
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

const SEEN = (id: number, day: number) => `brgol.passeVisto.${id}.${day}`;
const seenToday = (id: number, day: number) => { try { return localStorage.getItem(SEEN(id, day)) === '1'; } catch { return false; } };
const markSeen = (id: number, day: number) => { try { localStorage.setItem(SEEN(id, day), '1'); } catch {} };
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

/** O prêmio extra do dia (além do XP), em poucas palavras, com o ícone da loja. */
function extraOf(d: PassReward): { icon: string; text: string } | null {
  if (d.vip) return { icon: '/ui/ico-crown_silver.png', text: `${d.vip} VIP` };
  if (d.item) return { icon: `/ui/${d.item.icon}.png`, text: d.item.key === 'ENERGY' ? `Energia nv ${d.item.level}` : d.item.name };
  if (d.dexterity) return { icon: '/ui/ico-badge_best.png', text: `+${d.dexterity} destreza` };
  if (d.money) return { icon: '/ui/ico-coin01_s.png', text: brl(d.money) };
  return null;
}

/** Monta a cartela ao entrar: carrega o estado e abre sozinha 1x por dia se o prêmio estiver esperando. */
export function PassWatcher() {
  const me = useAuth((s) => s.me);
  const now = useAuth((s) => s.now);
  const { st, open, load, show } = usePass();
  const id = me?.id;

  useEffect(() => { if (id !== undefined) load(); }, [id]);
  // voltou para o app depois da meia-noite: recarrega (o dia virou)
  useEffect(() => {
    const vis = () => { const s = usePass.getState().st; if (document.visibilityState === 'visible' && (!s || now() >= s.nextAt)) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);
  useEffect(() => {
    if (!st || id === undefined || st.claimed || open || seenToday(id, st.today)) return;
    const t = window.setTimeout(() => { markSeen(id, st.today); show(); }, 1500);
    return () => window.clearTimeout(t);
  }, [st?.today, st?.claimed, id]);

  return <AnimatePresence>{open && st && <PassSheet key="passe" />}</AnimatePresence>;
}

/** Cartão da Home enquanto o prêmio do dia não foi resgatado. */
export function PassCard() {
  const st = usePass((s) => s.st);
  const show = usePass((s) => s.show);
  if (!st || st.claimed) return null;
  const d = st.days[st.step - 1];
  return (
    <button onClick={show} className="card-green flex w-full items-center gap-3 text-left" style={{ borderRadius: 18 }}>
      <span className="relative shrink-0">
        <img src="/ui/lvl-badge-yellow.png" alt="" className="h-11 w-11" />
        <span className="t-display t-out absolute inset-0 flex items-center justify-center pb-1 text-[15px]">{st.step}</span>
      </span>
      <span className="min-w-0 flex-1 text-[13px] font-extrabold leading-snug text-white">
        Presença da Semana: o prêmio do dia {st.step} está esperando. <span className="t-gold">+{d.xp} XP</span>
      </span>
      <span className="btn btn-yellow btn-sm shrink-0">Resgatar</span>
    </button>
  );
}

function Slot({ d, today, justDone }: { d: PassDay; today: boolean; justDone: boolean }) {
  const extra = extraOf(d);
  const frame = d.done ? 'item-green' : today ? 'item-yellow' : 'item-blue';
  return (
    <motion.div animate={today && !d.done ? { scale: [1, 1.05, 1] } : undefined} transition={today ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
      className={`${frame} relative flex flex-col items-center pb-1 pt-0.5 text-center ${!d.done && !today ? 'opacity-85' : ''}`}>
      <span className="t-display text-[11px] text-white">{today && !d.done ? `Hoje · dia ${d.step}` : `Dia ${d.step}`}</span>
      <span className="t-display t-out leading-none"><span className="text-[26px]">+{d.xp}</span><span className="text-[12px]"> XP</span></span>
      {extra && <span className="mt-0.5 flex items-center gap-0.5 text-[10px] font-extrabold leading-tight text-white"><img src={extra.icon} alt="" className="h-4 w-4 object-contain" />{extra.text}</span>}
      {d.done && (
        <motion.img src="/ui/check-green.png" alt="resgatado" initial={justDone ? { scale: 2.4, opacity: 0, rotate: -25 } : false} animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ type: 'spring', stiffness: 320, damping: 14 }} className="absolute -right-2 -top-3 h-9 w-9 drop-shadow" />
      )}
    </motion.div>
  );
}

/** A cartela: 6 casas + a faixa do 7º dia (VIP), o botão de resgatar e, depois, o que entrou. */
function PassSheet() {
  const { st, hide } = usePass();
  const refresh = useAuth((s) => s.refresh);
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<(PassReward & { step: number }) | null>(null);
  if (!st) return null;
  const d7 = st.days[6];
  const todayStep = st.claimed ? 0 : st.step;

  async function claim() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.passClaim();
      usePass.setState({ st: r.state });
      setGot(r.reward);
      sound.play(r.reward.vip ? 'goal' : 'coin');
    } catch (e) { toast((e as Error).message, 'error'); usePass.getState().load(); }
    finally { setBusy(false); }
  }
  // fecha e atualiza o /me: se o XP subiu de nível, a janela de "subiu de nível" aparece por cima
  const close = () => { hide(); if (got) refresh(); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="passe-title"
      className="fixed inset-y-0 left-1/2 z-[93] flex w-full max-w-[480px] -translate-x-1/2 flex-col overflow-y-auto bg-navy-deep/85 backdrop-blur-[2px]">
      <div className="relative m-auto w-full max-w-sm px-4 py-6">
        <div className="relative pt-7">
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center"><div id="passe-title" className="ribbon ribbon-green text-[18px]">PRESENÇA DA SEMANA</div></div>
          <div className="panel-navy pt-8">
            <p className="text-center text-[12px] font-extrabold leading-snug text-white/90">Entre todo dia e ganhe XP. Pulou um dia, a semana volta ao dia 1.</p>
            {st.week >= 2 && <div className="mt-1 flex justify-center"><span className="trap trap-orange text-[10px] uppercase">{st.week}ª semana seguida · 7º dia vale {st.streakVip} VIP</span></div>}
            {st.broken && !st.claimed && <p className="mt-2 rounded-xl bg-gold/25 px-2 py-1 text-center text-[12px] font-extrabold text-white">Você pulou um dia: a semana recomeçou do dia 1.</p>}

            <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3">
              {st.days.slice(0, 6).map((d) => <Slot key={d.step} d={d} today={d.step === todayStep} justDone={!!got && got.step === d.step} />)}
            </div>

            {/* 7º dia: a faixa dourada do VIP */}
            <motion.div animate={todayStep === 7 ? { scale: [1, 1.03, 1] } : undefined} transition={todayStep === 7 ? { duration: 1.4, repeat: Infinity } : undefined}
              className={`${d7.done ? 'item-green' : 'item-yellow'} relative mt-3 flex items-center gap-3 px-2 py-1`}>
              <img src="/ui/ico-crown_silver.png" alt="" className="h-14 w-14 shrink-0 drop-shadow" />
              <div className="min-w-0 flex-1 text-left">
                <div className="t-display text-[12px] text-white">{todayStep === 7 ? 'Hoje · dia 7' : 'Dia 7'}</div>
                <div className="t-display t-out text-[22px] leading-none">{d7.vip} VIP <span className="text-[15px]">de presente</span></div>
                <div className="text-[11px] font-extrabold text-white">+{d7.xp} XP e {brl(d7.money)} · o VIP liga na hora</div>
              </div>
              {d7.done && <motion.img src="/ui/check-green.png" alt="resgatado" initial={got?.step === 7 ? { scale: 2.4, opacity: 0 } : false} animate={{ scale: 1, opacity: 1, rotate: -8 }} className="absolute -right-2 -top-3 h-10 w-10 drop-shadow" />}
            </motion.div>

            {got ? (
              <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-4 rounded-2xl bg-white/10 p-3 text-center">
                <div className="t-display t-gold text-[40px] leading-none">+{got.xp} XP</div>
                {got.xp > got.baseXp && <span className="trap trap-green mt-1 text-[10px] uppercase">dobro por ser VIP</span>}
                <ul className="mt-1 text-[13px] font-extrabold text-white">
                  {got.money > 0 && <li>{brl(got.money)} na conta</li>}
                  {got.item && <li>{got.item.key === 'ENERGY' ? `Energia do chute nível ${got.item.level} ativa` : `${got.item.name} ativo`} por {got.item.hours} h</li>}
                  {got.dexterity > 0 && <li>{got.dexterityAsMoney ? `Destreza já no máximo: ${brl(got.dexterityAsMoney)}` : `+${got.dexterity} ponto de destreza`}</li>}
                  {got.vip > 0 && <li className="t-gold">VIP ativo por {got.vip * 24} h!</li>}
                </ul>
                <p className="mt-2 text-[12px] font-bold text-white/80">Próximo prêmio em <Countdown readyAt={st.nextAt} className="t-gold" /></p>
                <button onClick={close} className="btn btn-orange btn-lg mt-3 w-full">Continuar</button>
              </motion.div>
            ) : st.claimed ? (
              <div className="mt-4 text-center">
                <p className="text-[13px] font-extrabold text-white">Prêmio de hoje resgatado. O próximo sai em <Countdown readyAt={st.nextAt} className="t-gold" /></p>
                <button onClick={close} className="btn btn-blue btn-md mt-3 w-full">Fechar</button>
              </div>
            ) : (
              <div className="mt-4">
                <button onClick={claim} disabled={busy} className="btn btn-green btn-lg w-full">{busy ? 'Resgatando…' : `Resgatar dia ${st.step}`}</button>
                <button onClick={close} className="btn btn-blue btn-sm mt-2 w-full">Depois</button>
              </div>
            )}

            <p className="mt-3 text-center text-[11px] font-bold text-white/75">
              {st.vip ? 'Você é VIP: todo XP da Presença vem em dobro.' : <>VIP ganha o dobro de XP na Presença. <Link to="/vip" onClick={close} className="t-gold t-display">Ver VIP</Link></>}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
