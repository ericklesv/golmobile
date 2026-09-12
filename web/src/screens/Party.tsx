import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { GoalOverlay } from '../components/GoalOverlay';
import { toast } from '../components/Toast';
import { money as fmt } from '../lib/format';

const SEGS_DEFAULT = ['GOL', 'ERROU', 'ERROU', 'GOL', 'ERROU', 'ERROU', 'GOL', 'ERROU', 'ERROU'];

function polar(cx: number, cy: number, r: number, a: number) {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

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
      // gira até o segmento sorteado ficar sob o ponteiro (topo)
      const target = 360 * 5 + (360 - (r.segment * step + step / 2));
      const from = rot % 360;
      await ctrl.start({ rotate: [from, from + target], transition: { duration: 3.6, ease: [0.15, 0.85, 0.25, 1] } });
      setRot(from + target);
      setResult({ win: r.win, prize: r.prize });
      await refresh();
      setTimeout(() => setOverlay(true), 250);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setSpinning(false); }
  }

  const R = 140, C = 150;
  return (
    <div className="app-frame relative flex min-h-full flex-col bg-night-0">
      <GoalOverlay open={overlay} goal={!!result?.win} title={result?.win ? 'GOOOL!!' : 'ERROU!'} text={result?.win ? `Você acertou no Party GoL e faturou ${fmt(prize)}!` : `Perdeu a aposta de ${fmt(bet)}. Tenta de novo?`} money={result?.prize ?? 0} team={me.team} onClose={() => setOverlay(false)} autoClose={3000} />
      <div className="flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="rounded-full bg-night-2 p-2 text-chalk"><ArrowLeft className="h-5 w-5" /></button>
        <div className="font-poster text-lg tracking-wide text-flood">PARTY GOL</div>
        <div className="rounded-full bg-night-2 px-3 py-1 font-score text-sm font-bold text-flood">{fmt(me.money)}</div>
      </div>
      <p className="px-6 text-center text-xs text-haze">O cassino do BRGOL. Aposta de <b className="text-chalk">{fmt(bet)}</b>, acertou leva <b className="text-turf">{fmt(prize)}</b>. Só dinheiro virtual!</p>

      <div className="relative mx-auto mt-4 w-[300px]">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-2 text-3xl drop-shadow">🔻</div>
        <motion.svg viewBox="0 0 300 300" className="w-full drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]" animate={ctrl} initial={{ rotate: 0 }} style={{ originX: '50%', originY: '50%' }}>
          {segs.map((s, i) => {
            const a0 = (i * step - 90) * (Math.PI / 180), a1 = ((i + 1) * step - 90) * (Math.PI / 180);
            const [x0, y0] = polar(C, C, R, a0), [x1, y1] = polar(C, C, R, a1);
            const [tx, ty] = polar(C, C, R * 0.68, (a0 + a1) / 2);
            const win = s === 'GOL';
            return (
              <g key={i}>
                <path d={`M${C},${C} L${x0},${y0} A${R},${R} 0 0,1 ${x1},${y1} Z`} fill={win ? '#22E58A' : i % 2 ? '#FF5470' : '#E11D48'} stroke="#04101B" strokeWidth="2" />
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="900" fill={win ? '#04101B' : '#fff'} fontFamily="Anton, Impact, sans-serif" transform={`rotate(${(i + 0.5) * step} ${tx} ${ty})`}>{s}</text>
              </g>
            );
          })}
          <circle cx={C} cy={C} r={R} fill="none" stroke="#FFC24B" strokeWidth="6" />
          <circle cx={C} cy={C} r="26" fill="#04101B" stroke="#FFC24B" strokeWidth="4" />
          <text x={C} y={C + 6} textAnchor="middle" fontSize="18">⚽</text>
        </motion.svg>
      </div>

      <div className="mt-6 px-6">
        <button onClick={spin} disabled={spinning} className="btn-flood w-full py-4 text-lg">{spinning ? 'Girando…' : `Chutar por ${fmt(bet)}`}</button>
        <p className="mt-3 text-center text-[11px] text-hazedim">Acertos: {me.stats.party.wins} / {me.stats.party.tries}</p>
      </div>
    </div>
  );
}
