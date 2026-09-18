import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { TrailResult } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown, useCountdown } from '../components/ui';
import { toast } from '../components/Toast';
import { useCaptcha } from '../components/Captcha';
import { TrailBall, useTrailBall, type BallLeg, type Pt } from '../components/TrailBall';

// Campo vertical 300x460 (igual ao original: você sai do seu gol embaixo e sobe)
const W = 300, H = 460;
const LINES: { name: string; y: number; xs: number[]; color: string }[] = [
  { name: 'DEFESA', y: 330, xs: [55, 118, 182, 245], color: '#22E58A' },
  { name: 'MEIO-CAMPO', y: 225, xs: [75, 150, 225], color: '#FFC24B' },
  { name: 'ATAQUE', y: 120, xs: [75, 150, 225], color: '#FF5470' },
];
const START = { x: 150, y: 420 };

// Bola: passa pelo jogador driblado e para no espaço à frente da linha; no rebote, volta pro seu lado.
const BALL_R = 11;
const AHEAD = 40, BACK = 34;
const MOVE = { toPlayer: 380, ahead: 240, back: 300, shot: 460 };
const slotOf = (li: number, i: number): Pt => ({ x: LINES[li].xs[i], y: LINES[li].y });
const ahead = (p: Pt): Pt => ({ x: p.x, y: p.y - AHEAD });
const behind = (p: Pt): Pt => ({ x: p.x, y: p.y + BACK });
/** Chute no canto, longe do goleiro (que fica no meio do gol). */
const shotAt = (x: number): Pt => ({ x: 150 + (x < 150 ? -17 : 17), y: 7 });

type Cell = 'idle' | 'safe' | 'mine' | 'picked';
type Pick = { phase: number; index: number };
const NUMBER_WORD: Record<number, string> = { 2: 'Dois', 3: 'Três' };

/** Numa linha já vencida, o último jogador tentado foi o driblado; os anteriores roubaram a bola (rebote). */
function wasDribbled(revealed: Pick[], phase: number, p: Pick) {
  if (p.phase >= phase) return false;
  const inLine = revealed.filter((r) => r.phase === p.phase);
  return inLine[inLine.length - 1] === p;
}

/** Caminho da bola ao reabrir uma trilha em andamento. */
function routeOf(revealed: Pick[], phase: number): Pt[] {
  const pts: Pt[] = [START];
  for (const p of revealed) {
    const slot = slotOf(p.phase, p.index);
    pts.push(slot, wasDribbled(revealed, phase, p) ? ahead(slot) : behind(slot));
  }
  return pts;
}

export function TrailScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [phase, setPhase] = useState(me.trail.active ? me.trail.phase : 0);
  const [cells, setCells] = useState<Cell[][]>(() => LINES.map((l, li) => l.xs.map((_, i) => {
    const p = me.trail.revealed.find((r) => r.phase === li && r.index === i);
    return !p ? 'idle' : wasDribbled(me.trail.revealed, me.trail.phase, p) ? 'picked' : 'mine';
  })));
  const [route0] = useState(() => (me.trail.active ? routeOf(me.trail.revealed, me.trail.phase) : [START]));
  const ball = useTrailBall(route0, BALL_R);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TrailResult | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const active = me.trail.active || phase > 0;
  // ladrões que ainda restam na linha (o rebote revela um e a jogada continua na mesma linha)
  const thieves = (meta?.trailLines[phase]?.mines ?? 1) - (cells[phase]?.filter((c) => c === 'mine').length ?? 0);
  const rem = useCountdown(me.cooldowns.TRAIL.readyAt);
  const ready = (rem <= 0 || active) && me.cooldowns.TRAIL.unlocked;
  const needCaptcha = !!me.captchaRequired && !active; // só para começar uma trilha nova
  const captcha = useCaptcha(needCaptcha);

  async function pick(li: number, i: number) {
    if (busy || li !== phase || !ready || cells[li][i] !== 'idle' || result?.finished) return;
    if (needCaptcha && !captcha.payload) { toast('Responda a conta anti-robô antes de começar.'); return; }
    setBusy(true);
    const slot = slotOf(li, i);
    const before = ball.planned();
    // a bola sai no toque; o resultado decide o resto do trajeto
    const tapped = performance.now();
    const arrive = ball.push([{ to: slot, ms: MOVE.toPlayer, hop: 6, ease: 'out' }]);
    try {
      const r = await api.trail(i, needCaptcha ? captcha.payload : null);
      const legs: BallLeg[] = !r.mine
        ? [{ to: ahead(slot), ms: MOVE.ahead, hop: 3 }, ...(r.goal ? [{ to: shotAt(slot.x), ms: MOVE.shot, hop: 16, ease: 'in' as const, scale: 0.8 }] : [])]
        : r.rebound ? [{ to: behind(slot), ms: MOVE.back, hop: 8, ease: 'out' }]
        : [{ to: slot, ms: 1, shake: true }];
      const done = ball.push(legs);
      const wait = Math.max(0, arrive - (performance.now() - tapped) + 40);
      setTimeout(() => {
        setCells((prev) => prev.map((line, l) => l !== li ? line : line.map((c, j) => {
          if (r.lineMines) return r.lineMines[j] ? (j === i ? 'mine' : 'mine') : (j === i ? 'picked' : 'safe');
          return j === i ? (r.mine ? 'mine' : 'picked') : c;
        })));
        if (r.finished && r.goal) {
          const inNet = Math.max(0, done - wait);
          setTimeout(() => { setResult(r); setMsg('GOOOL!!!'); }, inNet);
          setTimeout(() => setOverlay(true), inNet + 800);
          return;
        }
        if (r.finished) {
          setResult(r);
          setMsg('PERDEU A BOLA!');
          setTimeout(() => setOverlay(true), 700);
          return;
        }
        if (r.rebound) setMsg('REBOTE! A bola sobrou pra você');
        else {
          setPhase(r.phase);
          setMsg(`Passou pela ${LINES[li].name.toLowerCase()}!`);
        }
        setBusy(false);
      }, wait);
      refresh();
    } catch (e) {
      ball.reset(before);
      setBusy(false);
      if (e instanceof ApiError && e.code === 'cooldown') { toast('Trilha ainda em recarga.'); refresh(); }
      else if (e instanceof ApiError && e.code === 'captcha') { toast(e.message, 'error'); captcha.refresh(); refresh(); }
      else toast((e as Error).message, 'error');
    }
  }

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 1800); return () => clearTimeout(t); }, [msg]);

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal={!!result?.goal} title={result?.goal ? 'GOOOL!!!' : 'PERDEU A BOLA!'} text={result?.text} money={result?.money} team={me.team}
        onClose={() => { setOverlay(false); nav('/'); }} />
      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-orange">TRILHA</div>
        <div className="trap trap-blue text-[12px]">{!me.cooldowns.TRAIL.unlocked ? <span className="t-red">LVL 3</span> : active ? <span className="t-gold">EM JOGO</span> : ready ? <span className={me.cooldowns.TRAIL.ball ? 't-gold' : 't-green'}>{me.cooldowns.TRAIL.ball ? `${me.cooldowns.TRAIL.ball} · VALE ${me.cooldowns.TRAIL.goals ?? 1}x` : 'PRONTO'}</span> : <Countdown readyAt={me.cooldowns.TRAIL.readyAt} />}</div>
      </div>

      <div className="relative mx-auto w-full max-w-[340px] px-3 pt-1">
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
          {/* rastro do caminho (pintado pela bola enquanto ela anda) */}
          <polyline points={[...ball.trail, ball.pose].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" />
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
          <TrailBall pose={ball.pose} r={BALL_R} />
          {msg && (
            <motion.text pointerEvents="none" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} x={W / 2} y={H / 2 + 8} textAnchor="middle" fontSize="26" fontWeight="900" fill="#fff" stroke="#000" strokeWidth="1.5" fontFamily="Anton, Impact, sans-serif" style={{ transformOrigin: `${W / 2}px ${H / 2}px` }}>
              {msg}
            </motion.text>
          )}
        </svg>
      </div>

      {ready && !result?.finished && captcha.box && <div className="relative mx-3 mt-3">{captcha.box}</div>}
      <div className="panel relative mx-3 mb-6 mt-3 text-center text-[13px] font-extrabold text-navy-ink">
        {!me.cooldowns.TRAIL.unlocked ? <span className="text-danger">A Trilha libera no nível 3 (Sub-12, 88 gols).</span>
          : !ready ? <>Recarga: <Countdown readyAt={me.cooldowns.TRAIL.readyAt} className="text-orange-deep" /> · níveis reduzem o tempo</>
          : result?.finished ? (result.goal ? 'Gol de trilha! +R$ 40' : 'A defesa levou a melhor.')
          : <>Toque em um jogador da linha <b className="text-orange-deep">{LINES[phase]?.name}</b> para driblar. {phase === LINES.length - 1 && me.items?.some((it) => it.key === 'SHIN_GUARD') ? 'Caneleira ativa: pode haver menos ladrões aqui.' : thieves > 1 ? `${NUMBER_WORD[thieves] ?? thieves} deles roubam a bola.` : 'Um deles rouba a bola.'}</>}
      </div>
    </div>
  );
}
