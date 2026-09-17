import type { PartyStatus } from '../lib/types';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { GoalOverlay } from '../components/GoalOverlay';
import { toast } from '../components/Toast';
import { money as fmt } from '../lib/format';

const PREMIOS_DEFAULT = [300, 0, 0, 800, 0, 1500, 0, 0];

/**
 * Roleta do Party GoL: aro/roda do pack (8 fatias) com o valor de cada casa por cima.
 * As três casas que pagam valem DIFERENTE (PARTY_PRIZES em api/src/lib/rules.js; dono, 17/09/2026:
 * "não é ganhou levou 1.500 — ele tem chance de estourar"), então a fatia mostra quanto ela paga.
 */
export function PartyScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const premios = meta?.partyPrizes ?? PREMIOS_DEFAULT;
  const bet = meta?.money.PARTY_BET ?? 100;
  const maior = Math.max(...premios);
  const pagam = premios.filter((p) => p > 0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ win: boolean; goal: boolean; prize: number } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [rot, setRot] = useState(0);
  const [st, setSt] = useState<PartyStatus | null>(null); // giros de hoje (5 comum, 10 VIP)
  useEffect(() => { api.partyStatus().then(setSt).catch(() => {}); }, []);
  const ctrl = useAnimation();
  const n = premios.length;
  const step = 360 / n;

  async function spin() {
    if (spinning) return;
    if (st && st.left <= 0) { toast(st.vipMax > st.max ? `Você já usou os ${st.max} giros de hoje. VIP tem ${st.vipMax} por dia.` : `Você já usou os ${st.max} giros de hoje. A roleta volta à meia-noite.`, 'error'); return; }
    if (me.money < bet) { toast(`Você precisa de ${fmt(bet)} para apostar.`, 'error'); return; }
    setSpinning(true);
    setResult(null);
    try {
      const r = await api.party();
      // a roda do pack tem a primeira fatia centrada no topo; gira até a fatia sorteada ficar sob a seta
      // ângulo ABSOLUTO em que a fatia sorteada fica sob a seta (fatia 0 centrada no topo,
      // fatia i centrada em i*step no sentido horário) + 5 voltas a partir do giro atual
      const finalAbs = (360 - r.segment * step) % 360;
      const to = Math.ceil(rot / 360) * 360 + 360 * 4 + finalAbs;
      await ctrl.start({ rotate: [rot, to], transition: { duration: 3.8, ease: [0.15, 0.85, 0.25, 1] } });
      setRot(to);
      setResult({ win: r.win, goal: r.goal, prize: r.prize });
      setSt((s) => (s ? { ...s, spins: r.spins, max: r.max, left: r.left } : s));
      await refresh();
      setTimeout(() => setOverlay(true), 250);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setSpinning(false); }
  }

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal={!!result?.win} title={result?.win ? (result.goal ? 'GOOOL!!' : result.prize === maior ? 'ESTOUROU!' : 'ACERTOU!') : 'ERROU!'} text={result?.win ? (result.goal ? `Você caiu na casa de ${fmt(result.prize)} e ainda marcou 1 gol pro ${me.team.name}!` : `Você caiu na casa de ${fmt(result.prize)}! (o gol da roleta é só na primeira vitória do dia)`) : `Perdeu a aposta de ${fmt(bet)}. Tenta de novo?`} money={result?.prize ?? 0} team={me.team} onClose={() => setOverlay(false)} autoClose={3000} />
      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-yellow">PARTY GOL</div>
        <div className="resbar"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-8 w-8" alt="" />{fmt(me.money)}</div>
      </div>
      <p className="relative px-6 text-center text-[13px] font-extrabold text-white">Aposte <span className="t-gold t-display">{fmt(bet)}</span> e gire: {pagam.length} das {n} casas pagam, cada uma o seu valor — <span className="t-green t-display">{pagam.map((p) => fmt(p)).join(' · ')}</span>. Nas outras, perde a aposta. A 1ª vitória do dia ainda vale <span className="t-gold t-display">1 gol</span>. Só dinheiro virtual!</p>
      {st && (
        <p className="relative mt-1 text-center text-[13px] font-extrabold text-white">
          Giros hoje: <span className={`t-display ${st.left > 0 ? 't-gold' : 't-red'}`}>{st.spins}/{st.max}</span>
          {st.vipMax > st.max && <span className="text-white/80"> · VIP tem {st.vipMax} por dia</span>}
        </p>
      )}

      <div className="relative mx-auto mt-4 w-[320px]">
        <img src="/ui/roulette-bg.png" alt="" className="absolute inset-0 h-full w-full" />
        <div className="relative m-[7%]">
          <motion.div animate={ctrl} initial={{ rotate: 0 }} className="relative">
            <img src="/ui/roulette-wheel.png" alt="" className="h-full w-full" />
            {premios.map((p, i) => (
              <div key={i} className="absolute left-1/2 top-1/2 flex justify-center" style={{ width: 0, height: 0, transform: `rotate(${i * step}deg)` }}>
                <span className={`t-display absolute -translate-x-1/2 whitespace-nowrap ${p > 0 ? `t-gold ${p === maior ? 'text-[17px]' : 'text-[15px]'}` : 't-out text-[15px]'}`} style={{ top: '-42%', left: '50%', transform: 'translate(-50%, -110px)' }}>{p > 0 ? fmt(p) : 'ERROU'}</span>
              </div>
            ))}
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
