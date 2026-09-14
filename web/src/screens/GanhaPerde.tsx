import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig, useAnimation, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { GanhaPerdeSpin, GanhaPerdeState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';
import { money as fmt } from '../lib/format';

/**
 * Ganha ou Perde — roleta de duas fatias (pedido do dono, 14/09/2026). A seta fica à ESQUERDA, apontando
 * para a roda. A fatia GANHA é desenhada centrada no topo da roda e, parada, a roda fica girada 270° (o
 * GANHA embaixo da seta). Antes de girar, o jogador escolhe a chance (+5% pagando; a parte comprada
 * aparece listrada). O sorteio é do servidor: `at` diz onde a seta parou (% do círculo a partir do
 * começo do GANHA) e a tela só anima até lá. Caiu no GANHA = gol e a roda volta, com a base 5% menor.
 */

const REST = 270; // rotação parada: o centro do GANHA embaixo da seta (esquerda)
const R = 92; // raio das fatias (viewBox -104..104)

/** Ângulo (graus, horário a partir do topo da roda) do ponto `at` (%) contado do começo do GANHA. */
const landAngle = (at: number, chance: number) => (at - chance / 2) * 3.6;

/** Fatia centrada no topo, com `deg` graus de abertura. */
function sector(deg: number) {
  const a = Math.min(deg, 359.99) / 2;
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = R * Math.sin(rad(-a)), y1 = -R * Math.cos(rad(-a));
  const x2 = R * Math.sin(rad(a)), y2 = -R * Math.cos(rad(a));
  return `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${deg > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

export function GanhaPerdeScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [game, setGame] = useState<GanhaPerdeState | null>(null);
  const [chance, setChance] = useState(50);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<'win' | 'lose' | null>(null);
  const [goalText, setGoalText] = useState<string | null>(null);
  const pending = useRef<GanhaPerdeSpin | null>(null);
  const rot = useRef(REST);
  const ctrl = useAnimation();
  // tamanho das fatias animado: a GANHA cresce/encolhe na hora em que o jogador mexe na chance
  const chanceMv = useSpring(50, { stiffness: 240, damping: 26 });
  const baseMv = useSpring(50, { stiffness: 240, damping: 26 });

  function show(st: GanhaPerdeState, jump = false) {
    setGame(st);
    const c = st.finished && st.last ? st.last.chance : st.base;
    setChance(c);
    if (jump) { chanceMv.jump(c); baseMv.jump(st.base); } // a derrota não mexe na base: é a da última girada
  }

  useEffect(() => {
    api.ganhaPerde().then((r) => {
      show(r.state, true);
      // já perdeu hoje: a roda fica parada onde a seta caiu
      if (r.state.finished && r.state.last) {
        rot.current = REST - landAngle(r.state.last.at, r.state.last.chance);
        ctrl.set({ rotate: rot.current });
        setFlash('lose');
      } else ctrl.set({ rotate: REST });
    }).catch((e) => toast((e as Error).message, 'error'));
  }, []);
  useEffect(() => { chanceMv.set(chance); }, [chance]);
  useEffect(() => { if (game) baseMv.set(game.base); }, [game?.base]);

  const options = game?.options ?? [];
  const priceOf = (c: number) => options.find((o) => o.chance === c)?.price ?? 0;
  const price = priceOf(chance);
  const step = game?.step ?? 5;
  const max = game?.max ?? 75;
  const nextPrice = chance + step <= max ? priceOf(chance + step) : null;
  const canUp = nextPrice !== null && nextPrice <= me.money;
  const canDown = !!game && chance - step >= game.base;
  const canSpin = !!game && !game.finished && !busy && !flash && price <= me.money;

  function change(dir: 1 | -1) {
    if (busy || flash || !game) return;
    if (dir > 0 && !canUp) { if (nextPrice !== null) toast(`Você precisa de ${fmt(nextPrice)} para girar com ${chance + step}%.`, 'error'); return; }
    if (dir < 0 && !canDown) return;
    sound.play('tap');
    setChance(chance + dir * step);
  }

  async function spin() {
    if (!canSpin || !game) return;
    setBusy(true);
    sound.play('tap');
    try {
      const r = await api.ganhaPerdeSpin(chance, game.spins);
      pending.current = r;
      // gira 4 voltas + o que falta para o ponto sorteado parar embaixo da seta
      const target = REST - landAngle(r.at, r.chance);
      const from = rot.current;
      const to = from + 360 * 4 + ((((target - from) % 360) + 360) % 360);
      await ctrl.start({ rotate: [from, to], transition: { duration: 4, ease: [0.12, 0.8, 0.22, 1] } });
      rot.current = to;
      setFlash(r.win ? 'win' : 'lose');
      refresh();
      if (r.win && r.goal) {
        setTimeout(() => setGoalText(r.goal!.text), 800);
      } else {
        sound.play('error');
        setTimeout(() => { setGame(r.state); setBusy(false); }, 700);
        return;
      }
    } catch (e) {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'locked') nav('/', { replace: true });
      if (e instanceof ApiError && (e.code === 'finished' || e.code === 'bad-chance' || e.code === 'no-money' || e.code === 'stale')) {
        refresh();
        api.ganhaPerde().then((x) => show(x.state)).catch(() => {});
      }
      setBusy(false);
    }
  }

  /** Fechou o gol: a roda volta para a posição de começo e a GANHA encolhe para a nova base. */
  async function closeGoal() {
    const r = pending.current;
    if (!r) return; // o fechamento automático e o toque podem chegar juntos
    pending.current = null;
    setGoalText(null);
    setFlash(null);
    const from = rot.current;
    const to = from + ((((REST - from) % 360) + 360) % 360);
    await ctrl.start({ rotate: [from, to], transition: { duration: 0.8, ease: [0.3, 0.7, 0.4, 1] } });
    rot.current = to;
    show(r.state);
    setBusy(false);
  }

  const team = me.team;
  const last = game?.last ?? null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-frame relative flex min-h-full flex-col">
        <div className="stadium-bg" />
        <GoalOverlay open={!!goalText} goal title="GOOOL!!!" text={goalText ?? undefined} levelPoints={game?.pointsPerHit ?? 5} team={team} onClose={closeGoal} />

        <div className="relative flex items-center justify-between gap-2 px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
          <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12 shrink-0" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
          <div className="ribbon ribbon-yellow text-[16px]">GANHA OU PERDE</div>
          <div className="w-12 shrink-0" />
        </div>

        <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
          {game && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
              <span className="trap trap-green tabular-nums">{game.goals} {game.goals === 1 ? 'gol hoje' : 'gols hoje'}</span>
              {!game.finished && <span className="trap trap-blue tabular-nums">De graça: {game.base}%</span>}
              <span className="resbar ml-3 tabular-nums"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-8 w-8" alt="" />{fmt(me.money)}</span>
            </div>
          )}

          {/* ── a roda ── */}
          <div className="relative mx-auto mt-3 aspect-square w-[min(300px,80vw)]">
            <img src="/ui/roulette-bg.png" alt="" className="absolute inset-0 h-full w-full" />
            <motion.div animate={ctrl} initial={{ rotate: REST }} className="absolute inset-[6%]">
              <WheelSvg chance={chanceMv} base={baseMv} value={chance} />
            </motion.div>
            {/* seta lateral (a do kit aponta para baixo: girada para apontar para a direita) */}
            <div className="pointer-events-none absolute left-[-7%] top-1/2 flex h-[13%] w-[21%] -translate-y-1/2 items-center justify-center">
              <img src="/ui/roulette-arrow.png" alt="" className="h-[160%] max-w-none -rotate-90 drop-shadow-[0_2px_0_rgba(0,0,0,0.25)]" style={{ aspectRatio: '94 / 151' }} />
            </div>
            <button onClick={spin} disabled={!canSpin} aria-label={price ? `Girar por ${fmt(price)}` : 'Girar'}
              className="absolute left-1/2 top-1/2 flex h-[27%] w-[27%] -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-transform active:scale-95 disabled:cursor-default">
              <img src="/ui/roulette-spin.png" alt="" className={`absolute inset-0 h-full w-full object-contain ${game?.finished ? 'grayscale-[0.7]' : ''}`} />
              <span className="t-display t-out relative -mt-[6%] text-[17px]">GIRAR</span>
            </button>
            <AnimatePresence>
              {flash && (
                <motion.div key={flash} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                  className="pointer-events-none absolute inset-x-0 -bottom-3 flex justify-center">
                  <span className={`t-display text-[40px] leading-none ${flash === 'win' ? 't-green' : 't-red'}`}>{flash === 'win' ? 'GANHA!' : 'PERDE'}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!game ? null : game.finished ? (
            <div className="panel mt-6 text-center text-navy-ink">
              <div className="t-display text-[22px]">{game.goals > 0 ? `${game.goals} ${game.goals === 1 ? 'gol' : 'gols'} do ${team.name}!` : 'Caiu no PERDE'}</div>
              <p className="mt-1 text-[14px] font-extrabold leading-snug">
                {game.goals > 0
                  ? `Você caiu no GANHA ${game.wins} ${game.wins === 1 ? 'vez' : 'vezes'} (+${game.points} de nível) e parou no PERDE${last ? ` com ${last.chance}% de GANHA` : ''}.`
                  : `A seta parou no PERDE${last ? ` com ${last.chance}% de GANHA` : ''}.`}
              </p>
              {game.spent > 0 && <p className="mt-1 text-[13px] font-extrabold">Você gastou {fmt(game.spent)} aumentando a chance.</p>}
              <p className="mt-2 text-[13px] font-bold text-muted">A roleta volta em <Countdown readyAt={game.nextAt} className="text-orange-deep" />.</p>
              <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-4 w-full">Voltar ao jogo</button>
            </div>
          ) : (
            <>
              <div className="panel-navy mt-6 px-2 pb-2 pt-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => change(-1)} disabled={!canDown || busy || !!flash} className="btn btn-red btn-md w-[76px] shrink-0" aria-label={`Diminuir para ${chance - step}%`}>−5%</button>
                  <div className="min-w-0 text-center">
                    <div className="t-display t-green text-[40px] leading-none tabular-nums">{chance}%</div>
                    <div className="mt-0.5 text-[12px] font-extrabold text-white/80">de chance de GANHA</div>
                  </div>
                  <button onClick={() => change(1)} disabled={nextPrice === null || busy || !!flash} className={`btn btn-green btn-md w-[76px] shrink-0 ${nextPrice !== null && !canUp ? 'opacity-60' : ''}`} aria-label={`Aumentar para ${chance + step}%`}>+5%</button>
                </div>
                <p className="mt-2 text-center text-[12px] font-extrabold leading-snug text-white/80">
                  {nextPrice === null ? `Chance máxima: ${max}%.` : `Mais 5% custam ${fmt(nextPrice - price)}${canUp ? '' : ' (falta dinheiro)'}.`}
                </p>
              </div>

              <button onClick={spin} disabled={!canSpin} className="btn btn-green btn-lg mt-3 w-full">
                {busy ? 'Girando…' : price > 0 ? `Girar por ${fmt(price)}` : 'Girar de graça'}
              </button>

              <p className="t-out mt-3 px-2 text-center text-[12px] font-extrabold leading-snug">
                Caiu no GANHA: gol do {team.name}, +{game.pointsPerHit} de nível e você gira de novo, mas a chance de graça cai 5%. Caiu no PERDE: acabou por hoje. Pagar só aumenta a chance, até {max}%.
              </p>
            </>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}

/**
 * A roda: PERDE (vermelho) por baixo, a GANHA inteira listrada (parte comprada) e, por cima, a GANHA
 * de graça lisa. Rótulos na direção do raio, para ficarem de pé quando a fatia está sob a seta.
 */
function WheelSvg({ chance, base, value }: { chance: MotionValue<number>; base: MotionValue<number>; value: number }) {
  const dGain = useTransform(chance, (c) => sector(c * 3.6));
  const dBase = useTransform([chance, base], (v: number[]) => sector(Math.min(v[0], v[1]) * 3.6));
  const small = value < 20;
  return (
    <svg viewBox="-104 -104 208 208" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="gp-red" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0.25" stopColor="#FF7A63" /><stop offset="1" stopColor="#D5302C" />
        </radialGradient>
        <radialGradient id="gp-green" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0.25" stopColor="#7BE85B" /><stop offset="1" stopColor="#2BA83A" />
        </radialGradient>
        <pattern id="gp-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <rect width="9" height="9" fill="#3FBF3A" /><rect width="4" height="9" fill="#FFD54A" />
        </pattern>
      </defs>
      <circle r="101" fill="#14335F" />
      <circle r={R} fill="url(#gp-red)" />
      <motion.path d={dGain} fill="url(#gp-hatch)" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      <motion.path d={dBase} fill="url(#gp-green)" />
      <motion.path d={dGain} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      {/* tachas do aro: mostram a roda girando */}
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * 22.5 * Math.PI) / 180;
        return <circle key={i} cx={97 * Math.sin(a)} cy={-97 * Math.cos(a)} r="2.6" fill="#fff" opacity="0.9" />;
      })}
      <circle r={R} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="3" />
      {/* rótulos: na direção do raio (de pé com a fatia na esquerda/direita) */}
      <g transform="translate(0 -60) rotate(90)" fontFamily="'Lilita One', Impact, sans-serif" textAnchor="middle" fill="#fff" stroke="#145a1a" strokeWidth="3.2" paintOrder="stroke" strokeLinejoin="round">
        {small ? (
          <text y="5" fontSize="15">{value}%</text>
        ) : (
          <>
            <text y="1" fontSize="18">GANHA</text>
            <text y="18" fontSize="13">{value}%</text>
          </>
        )}
      </g>
      <g transform="translate(0 58) rotate(90)" fontFamily="'Lilita One', Impact, sans-serif" textAnchor="middle" fill="#fff" stroke="#6a1010" strokeWidth="3.2" paintOrder="stroke" strokeLinejoin="round">
        <text y="1" fontSize="18">PERDE</text>
        <text y="18" fontSize="13">{100 - value}%</text>
      </g>
    </svg>
  );
}
