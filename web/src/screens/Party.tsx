import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { GoalOverlay } from '../components/GoalOverlay';
import { toast } from '../components/Toast';
import { money as fmt } from '../lib/format';

const SEGS_DEFAULT = ['GOL', 'ERROU', 'ERROU', 'GOL', 'ERROU', 'GOL', 'ERROU', 'ERROU'];

/** Roleta do Party GoL: aro/roda do pack (8 fatias) com rótulos GOL/ERROU por cima. */
export function PartyScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const segs = meta?.partySegments ?? SEGS_DEFAULT;
  const bet = meta?.money.PARTY_BET ?? 50;
  const prize = meta?.money.PARTY_PRIZE ?? 150;
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ win: boolean; prize: number } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [rot, setRot] = useState(0);
  const ctrl = useAnimation();
  const n = segs.length;
  const step = 360 / n;

  async function spin() {
    if (spinning) return;
    if (me.money < bet) { toast(`Você precisa de ${fmt(bet)} para apostar.`, 'error'); return; }
    setSpinning(true);
    setResult(null);
    try {
      const r = await api.party();
      // a roda do pack tem a primeira fatia centrada no topo; gira até a fatia sorteada ficar sob a seta
      const target = 360 * 5 + (360 - r.segment * step);
      const from = rot % 360;
      await ctrl.start({ rotate: [from, from + target], transition: { duration: 3.8, ease: [0.15, 0.85, 0.25, 1] } });
      setRot(from + target);
      setResult({ win: r.win, prize: r.prize });
      await refresh();
      setTimeout(() => setOverlay(true), 250);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setSpinning(false); }
  }

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal={!!result?.win} title={result?.win ? 'GOOOL!!' : 'ERROU!'} text={result?.win ? `Você acertou no Party GoL e faturou ${fmt(prize)}!` : `Perdeu a aposta de ${fmt(bet)}. Tenta de novo?`} money={result?.prize ?? 0} team={me.team} onClose={() => setOverlay(false)} autoClose={3000} />
      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-yellow">PARTY GOL</div>
        <div className="resbar"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-8 w-8" alt="" />{fmt(me.money)}</div>
      </div>
      <p className="relative px-6 text-center text-[13px] font-extrabold text-white">O cassino do BRGOL. Aposta de <span className="t-gold t-display">{fmt(bet)}</span>, acertou leva <span className="t-green t-display">{fmt(prize)}</span>. Só dinheiro virtual!</p>

      <div className="relative mx-auto mt-4 w-[320px]">
        <img src="/ui/roulette-bg.png" alt="" className="absolute inset-0 h-full w-full" />
        <div className="relative m-[7%]">
          <motion.div animate={ctrl} initial={{ rotate: 0 }} className="relative">
            <img src="/ui/roulette-wheel.png" alt="" className="h-full w-full" />
            {segs.map((s, i) => {
              const a = i * step;
              return (
                <div key={i} className="absolute left-1/2 top-1/2 flex justify-center" style={{ width: 0, height: 0, transform: `rotate(${a}deg)` }}>
                  <span className={`t-display absolute -translate-x-1/2 whitespace-nowrap text-[17px] ${s === 'GOL' ? 't-gold' : 't-out'}`} style={{ top: '-42%', left: '50%', transform: 'translate(-50%, -110px)' }}>{s === 'GOL' ? 'GOL' : 'ERROU'}</span>
                </div>
              );
            })}
          </motion.div>
        </div>
        <img src="/ui/roulette-arrow.png" alt="" className="absolute left-1/2 top-[3%] h-12 -translate-x-1/2" />
        <button onClick={spin} disabled={spinning} className="absolute left-1/2 top-1/2 h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 active:scale-95 disabled:opacity-80">
          <img src="/ui/roulette-spin.png" alt="girar" className="h-full w-full object-contain" />
        </button>
      </div>

      <div className="relative mt-5 px-6">
        <button onClick={spin} disabled={spinning} className="btn btn-orange btn-lg w-full">{spinning ? 'Girando…' : `Chutar por ${fmt(bet)}`}</button>
        <p className="t-display t-out mt-3 text-center text-[12px]">Acertos: {me.stats.party.wins} / {me.stats.party.tries}</p>
      </div>
    </div>
  );
}
