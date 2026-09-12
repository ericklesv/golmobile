import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { TrailResult } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown, useCountdown } from '../components/ui';
import { toast } from '../components/Toast';

// Campo vertical 300x460 (igual ao original: você sai do seu gol embaixo e sobe)
const W = 300, H = 460;
const LINES: { name: string; y: number; xs: number[]; color: string }[] = [
  { name: 'DEFESA', y: 330, xs: [55, 118, 182, 245], color: '#22E58A' },
  { name: 'MEIO-CAMPO', y: 225, xs: [75, 150, 225], color: '#FFC24B' },
  { name: 'ATAQUE', y: 120, xs: [75, 150, 225], color: '#FF5470' },
];
const START = { x: 150, y: 420 };
const GOAL = { x: 150, y: 28 };

type Cell = 'idle' | 'safe' | 'mine' | 'picked';

export function TrailScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [phase, setPhase] = useState(me.trail.active ? me.trail.phase : 0);
  const [cells, setCells] = useState<Cell[][]>(() => LINES.map((l, li) => l.xs.map((_, i) => (me.trail.revealed.some((r) => r.phase === li && r.index === i) ? 'picked' : 'idle'))));
  const [ball, setBall] = useState(() => {
    const last = [...me.trail.revealed].filter((r) => r.phase === (me.trail.active ? me.trail.phase - 1 : -1)).pop();
    return last ? { x: LINES[last.phase].xs[last.index], y: LINES[last.phase].y } : START;
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TrailResult | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const active = me.trail.active || phase > 0;
  const rem = useCountdown(me.cooldowns.TRAIL.readyAt);
  const ready = (rem <= 0 || active) && me.cooldowns.TRAIL.unlocked;

  async function pick(li: number, i: number) {
    if (busy || li !== phase || !ready || cells[li][i] !== 'idle' || result?.finished) return;
    setBusy(true);
    try {
      const r = await api.trail(i);
      setBall({ x: LINES[li].xs[i], y: LINES[li].y });
      setTimeout(() => {
        setCells((prev) => prev.map((line, l) => l !== li ? line : line.map((c, j) => {
          if (r.lineMines) return r.lineMines[j] ? (j === i ? 'mine' : 'mine') : (j === i ? 'picked' : 'safe');
          return j === i ? (r.mine ? 'mine' : 'picked') : c;
        })));
        if (r.finished) {
          setResult(r);
          if (!r.goal) setMsg('PERDEU A BOLA!');
          else { setBall(GOAL); setMsg('GOOOL!!!'); }
          setTimeout(() => setOverlay(true), r.goal ? 900 : 600);
        } else if (r.rebound) {
          setMsg('REBOTE! A bola sobrou pra você');
          setBall((b) => ({ x: b.x, y: b.y + 30 }));
        } else {
          setPhase(r.phase);
          setMsg(`Passou pela ${LINES[li].name.toLowerCase()}!`);
        }
        setBusy(false);
      }, 450);
      refresh();
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === 'cooldown') { toast('Trilha ainda em recarga.'); refresh(); }
      else toast((e as Error).message, 'error');
    }
  }

  const path = useMemo(() => {
    const pts = [START, ...me.trail.revealed.map((r) => ({ x: LINES[r.phase].xs[r.index], y: LINES[r.phase].y }))];
    return pts;
  }, [me.trail.revealed]);

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 1800); return () => clearTimeout(t); }, [msg]);

  return (
    <div className="app-frame relative flex min-h-full flex-col bg-night-0">
      <GoalOverlay open={overlay} goal={!!result?.goal} title={result?.goal ? 'GOOOL!!!' : 'PERDEU A BOLA!'} text={result?.text} money={result?.money} team={me.team}
        onClose={() => { setOverlay(false); nav('/'); }} />
      <div className="flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="rounded-full bg-night-2 p-2 text-chalk"><ArrowLeft className="h-5 w-5" /></button>
        <div className="font-poster text-lg tracking-wide text-orange-400">TRILHA</div>
        <div className="rounded-full bg-night-2 px-3 py-1 text-xs text-chalk">{!me.cooldowns.TRAIL.unlocked ? <span className="text-card">LVL 3</span> : active ? <span className="text-orange-400">EM JOGO</span> : ready ? <span className="text-turf">PRONTO</span> : <Countdown readyAt={me.cooldowns.TRAIL.readyAt} />}</div>
      </div>

      <div className="relative mx-auto w-full max-w-[340px] px-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <defs>
            <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#25a75b" /><stop offset="1" stopColor="#187a42" /></linearGradient>
            <pattern id="stripes" width="300" height="46" patternUnits="userSpaceOnUse"><rect width="300" height="23" fill="rgba(255,255,255,0.05)" /></pattern>
          </defs>
          <rect x="0" y="0" width={W} height={H} rx="10" fill="url(#grass)" />
          <rect x="0" y="0" width={W} height={H} rx="10" fill="url(#stripes)" />
          <g stroke="rgba(255,255,255,0.8)" strokeWidth="2" fill="none">
            <rect x="8" y="8" width={W - 16} height={H - 16} rx="4" />
            <line x1="8" y1={H / 2} x2={W - 8} y2={H / 2} />
            <circle cx={W / 2} cy={H / 2} r="38" />
            <rect x="75" y="8" width="150" height="55" />
            <rect x="75" y={H - 63} width="150" height="55" />
            <rect x="118" y="8" width="64" height="20" />
            <rect x="118" y={H - 28} width="64" height="20" />
          </g>
          {/* gol adversário */}
          <rect x="120" y="0" width="60" height="9" fill="rgba(255,255,255,0.35)" stroke="#fff" strokeWidth="2" />
          {/* rastro do caminho */}
          <polyline points={[...path, ball].map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" />
          {/* linhas de jogadores */}
          {LINES.map((line, li) => (
            <g key={line.name}>
              <text x="14" y={line.y - 26} fontSize="9" fontWeight="700" fill={li === phase && !result?.finished ? line.color : 'rgba(255,255,255,0.45)'} letterSpacing="1">{line.name}</text>
              {line.xs.map((x, i) => {
                const st = cells[li][i];
                const clickable = li === phase && ready && st === 'idle' && !busy && !result?.finished;
                const fill = st === 'mine' ? '#FF5470' : st === 'picked' ? '#EDF4F3' : st === 'safe' ? 'rgba(237,244,243,0.35)' : li === phase ? '#e11d48' : '#9f1239';
                return (
                  <g key={i} onClick={() => pick(li, i)} style={{ cursor: clickable ? 'pointer' : 'default' }}>
                    {clickable && <circle cx={x} cy={line.y} r="20" fill="none" stroke={line.color} strokeWidth="2" className="animate-ping" style={{ transformOrigin: `${x}px ${line.y}px` }} />}
                    <circle cx={x} cy={line.y} r="14" fill={fill} stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
                    <circle cx={x} cy={line.y - 4} r="4" fill="rgba(0,0,0,0.25)" />
                    {st === 'mine' && <text x={x} y={line.y + 5} textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff">✕</text>}
                    {st === 'picked' && <text x={x} y={line.y + 5} textAnchor="middle" fontSize="12" fontWeight="900" fill="#0A1B2B">✓</text>}
                  </g>
                );
              })}
            </g>
          ))}
          {/* goleiro adversário e meu goleiro */}
          <circle cx={150} cy={22} r="10" fill="#111827" stroke="#22E58A" strokeWidth="2" />
          <circle cx={150} cy={H - 20} r="9" fill={me.team.colorPrimary} stroke={me.team.colorSecondary} strokeWidth="2" />
          {/* bola */}
          <motion.g animate={{ x: ball.x, y: ball.y }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
            <circle r="9" fill="#fff" stroke="#111" strokeWidth="2" />
            <circle r="3" fill="#111" />
          </motion.g>
          {msg && (
            <motion.text initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} x={W / 2} y={H / 2 + 8} textAnchor="middle" fontSize="26" fontWeight="900" fill="#fff" stroke="#000" strokeWidth="1.5" fontFamily="Anton, Impact, sans-serif" style={{ transformOrigin: `${W / 2}px ${H / 2}px` }}>
              {msg}
            </motion.text>
          )}
        </svg>
      </div>

      <div className="px-4 pb-6 pt-3 text-center text-xs text-haze">
        {!me.cooldowns.TRAIL.unlocked ? <span className="text-card">A Trilha libera no nível 3 (Sub-12, 88 gols).</span>
          : !ready ? <>Recarga: <Countdown readyAt={me.cooldowns.TRAIL.readyAt} className="text-chalk" /> · níveis reduzem o tempo</>
          : result?.finished ? (result.goal ? 'Gol de trilha! +R$ 40' : 'A defesa levou a melhor.')
          : <>Toque em um jogador da linha <b className="text-chalk">{LINES[phase]?.name}</b> para driblar. Um deles rouba a bola.</>}
      </div>
    </div>
  );
}
