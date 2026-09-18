import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Shield } from '../components/Shield';
import { toast } from '../components/Toast';
import { money as fmt } from '../lib/format';
import type { GoleadaState, GoleadaBoard } from '../lib/types';

/**
 * GOLEADA — porte do "Mini Cup" do Google (dono, 17/09/2026). Você é o batedor: **toca no canto do gol e a
 * bola sai na hora** — sem mira, sem barra de força (feedback do dono jogando: "o chute tem que ser mais
 * rápido sem mira"). O goleiro **anda de uma trave à outra o tempo todo** e vai ficando mais rápido quanto
 * mais a série dura ("a velocidade do goleiro tem que ir aumentando conforme o tempo que você tá com o jogo
 * aberto"). O jogo é de TIMING: espere ele sair do canto que você quer e toque lá.
 *
 * Identidade do JogaGol: o goleiro veste o uniforme do ADVERSÁRIO DA RODADA (como no pênalti e na falta) e
 * cada gol soma no placar do seu time contra ele — o contador de países do Google, à nossa moda.
 *
 * **Sem falar com o servidor no meio da série**: o servidor manda só a FASE da ronda e esta tela roda a
 * mesma conta dele (as funções abaixo são as de lib/goleada.js) para animar. No fim ela manda os toques e o
 * servidor refaz a série: quem conta os gols é ele.
 */

/** Boca do gol na tela (viewBox 100×100): x de 16 a 84, y de 38 (rasteiro) a 12 (travessão). */
const GOL = { x0: 16, x1: 84, yBase: 38, yTop: 12 };
const telaX = (x: number) => GOL.x0 + x * (GOL.x1 - GOL.x0);
const telaY = (y: number) => GOL.yBase - y * (GOL.yBase - GOL.yTop);
const BOLA = { x: 50, y: 88, r: 6.5 };

export function GoleadaScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [st, setSt] = useState<GoleadaState | null>(null);
  const [board, setBoard] = useState<GoleadaBoard | null>(null);
  const [fase, setFase] = useState<'abrir' | 'jogando' | 'fim'>('abrir');
  const [gols, setGols] = useState(0);
  const [recorde, setRecorde] = useState(false);
  const [fim, setFim] = useState<{ goals: number; levelPoints: number; goal?: { text: string } | null; best: number; record: boolean; why: string | null } | null>(null);
  const [voo, setVoo] = useState<{ x: number; y: number; r: number } | null>(null);
  const [gkX, setGkX] = useState(0.5);
  const [aviso, setAviso] = useState<'gol' | 'defendeu' | 'fora' | null>(null);
  const [aperto, setAperto] = useState(0); // 0..1: o quanto o goleiro já acelerou

  const campo = useRef<HTMLDivElement>(null);
  const jogo = useRef({
    t0: 0, phase: 0, viva: false, gols: 0, liberado: 0, voando: false,
    shots: [] as { i: number; x: number; y: number; t: number }[],
  });

  const rivalCores = board?.rival?.team
    ? { a: board.rival.team.colorPrimary, b: board.rival.team.colorSecondary }
    : { a: '#FFC63D', b: '#E8503A' };

  const carregar = useCallback(() => {
    api.goleada().then((r) => { setSt(r.state); setBoard(r.scoreboard); }).catch(() => {});
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // ── as mesmas contas do servidor (lib/goleada.js), para a tela animar sozinha
  const entre = (a: number, b: number, f: number) => a + (b - a) * f;
  const dureza = (t: number) => Math.min(1, Math.max(0, t) / (st?.ramp ?? 100_000));
  const reacao = (t: number) => entre(st!.keeper.reactFirst, st!.keeper.reactLast, dureza(t));
  const mergulho = (t: number) => entre(st!.keeper.speedFirst, st!.keeper.speedLast, dureza(t));
  const tempoDeVoo = (t: number) => Math.round(entre(st!.shot.first, st!.shot.last, dureza(t)));
  function anguloDaRonda(t: number) {
    const P0 = st!.keeper.periodFirst, P1 = st!.keeper.periodLast, R = st?.ramp ?? 100_000;
    const ms = Math.max(0, t), b = (P1 - P0) / R;
    if (ms <= R) return (2 * Math.PI * Math.log(1 + (b * ms) / P0)) / b;
    return (2 * Math.PI * Math.log(P1 / P0)) / b + (2 * Math.PI * (ms - R)) / P1;
  }
  const goleiroEm = (t: number) => 0.5 + st!.keeper.amp * Math.sin(anguloDaRonda(t) + jogo.current.phase);
  const alcance = (y: number) => st!.keeper.reach * (y > st!.keeper.highFrom ? st!.keeper.highReach : 1);

  /** A ronda: o goleiro nunca para, mesmo enquanto o jogador pensa. */
  function ronda() {
    const g = jogo.current;
    if (!g.viva) return;
    const t = performance.now() - g.t0;
    if (!g.voando) setGkX(goleiroEm(t));
    setAperto(dureza(t));
    requestAnimationFrame(ronda);
  }

  /** Um toque no campo = um chute naquele ponto. Sem mira, sem força: é tocar e a bola sai. */
  function tocar(e: React.PointerEvent) {
    const g = jogo.current;
    if (!g.viva || g.voando || !st) return;
    const t = performance.now() - g.t0;
    if (t < g.liberado) return; // a bola ainda está voltando para o pé
    const r = campo.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    // o toque vira um ponto na boca do gol (fora dela, é bola fora — e o jogo cobra isso)
    const x = (px - GOL.x0) / (GOL.x1 - GOL.x0);
    const y = (GOL.yBase - py) / (GOL.yBase - GOL.yTop);
    chutar({ x: Math.max(-0.2, Math.min(1.2, x)), y: Math.max(0, Math.min(1.2, y)) }, t);
  }

  function chutar(aim: { x: number; y: number }, t: number) {
    const g = jogo.current;
    const T = tempoDeVoo(t);
    const saiuDaRonda = goleiroEm(t + reacao(t));
    const fora = aim.x < st!.aim.margin || aim.x > 1 - st!.aim.margin || aim.y > 1 - st!.aim.top;
    const sobra = Math.max(0, T - reacao(t)) / 1000;
    const anda = mergulho(t) * sobra;
    const kx = fora ? saiuDaRonda : saiuDaRonda + Math.max(-anda, Math.min(anda, aim.x - saiuDaRonda));
    const pegou = !fora && Math.abs(kx - aim.x) <= alcance(aim.y);
    const why: 'gol' | 'defendeu' | 'fora' = fora ? 'fora' : pegou ? 'defendeu' : 'gol';

    g.voando = true;
    g.shots.push({ i: g.shots.length + 1, x: Number(aim.x.toFixed(4)), y: Number(aim.y.toFixed(4)), t: Math.round(t) });
    const inicio = performance.now();
    const passo = () => {
      const p = Math.min(1, (performance.now() - inicio) / T);
      setVoo({ x: aim.x, y: aim.y, r: BOLA.r + (2 - BOLA.r) * p });
      // ele só larga a ronda depois de reagir; daí mergulha no ponto de chegada
      const tt = t + p * T;
      const reagiu = Math.max(0, (p * T - reacao(t)) / Math.max(1, T - reacao(t)));
      setGkX(reagiu <= 0 ? goleiroEm(tt) : saiuDaRonda + (kx - saiuDaRonda) * Math.min(1, reagiu));
      if (p < 1) { requestAnimationFrame(passo); return; }
      setVoo(null);
      g.voando = false;
      setAviso(why);
      setTimeout(() => setAviso(null), 650);
      if (why === 'gol') {
        g.gols += 1; setGols(g.gols);
        if (!recorde && g.gols > (st?.best ?? 0) && (st?.best ?? 0) > 0) setRecorde(true);
        g.liberado = t + T + (st?.gap ?? 360);
      } else {
        g.viva = false;
        terminar();
      }
    };
    requestAnimationFrame(passo);
  }

  async function começar() {
    try {
      const r = await api.goleadaStart();
      const g = jogo.current;
      Object.assign(g, { t0: performance.now(), phase: r.state.phase ?? 0, viva: true, gols: 0, liberado: 0, voando: false, shots: [] });
      setSt(r.state); setBoard(r.scoreboard); setGols(0); setRecorde(false); setVoo(null); setAperto(0); setFase('jogando');
      requestAnimationFrame(ronda);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function terminar() {
    try {
      const r = await api.goleadaEnd({ shots: jogo.current.shots });
      setSt(r.state); setBoard(r.scoreboard);
      setFim({ goals: r.goals, levelPoints: r.levelPoints, goal: r.goal, best: r.best, record: r.record, why: r.why });
      setFase('fim');
      await refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
      setFase('abrir'); carregar();
    }
  }

  useEffect(() => () => { jogo.current.viva = false; }, []);

  const total = (board?.mine?.goals ?? 0) + (board?.rival?.goals ?? 0);
  const pctMine = total ? Math.round(((board?.mine?.goals ?? 0) / total) * 100) : 50;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />

      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-green">GOLEADA</div>
        <div className="resbar text-[12px]"><img src="/ui/ico-ball.png" className="ico -ml-3 h-8 w-8" alt="" />{st?.best ?? 0}</div>
      </div>

      <div ref={campo} onPointerDown={tocar}
        className="relative mx-3 cursor-crosshair touch-none select-none overflow-hidden rounded-2xl border-[3px] border-white/70 shadow-[0_4px_0_rgba(0,0,0,.18)]"
        style={{ aspectRatio: '1 / 1', background: 'linear-gradient(#9AE86B 0%, #7FD455 35%, #63C244 100%)' }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={0} y={42 + i * i * 2.4 + i * 6} width={100} height={3 + i} fill="#000" opacity={0.04} />)}
          <path d="M26 38 L10 66 L90 66 L74 38 Z" fill="none" stroke="#FFFFFF" strokeWidth={0.7} opacity={0.45} />

          <rect x={GOL.x0} y={GOL.yTop} width={GOL.x1 - GOL.x0} height={GOL.yBase - GOL.yTop} fill="#FFFFFF" opacity={0.16} />
          <g stroke="#FFFFFF" strokeWidth={0.28} opacity={0.55}>
            {Array.from({ length: 14 }, (_, i) => <line key={`v${i}`} x1={GOL.x0 + i * 5.23} y1={GOL.yTop} x2={GOL.x0 + i * 5.23} y2={GOL.yBase} />)}
            {Array.from({ length: 6 }, (_, i) => <line key={`h${i}`} x1={GOL.x0} y1={GOL.yTop + i * 5.2} x2={GOL.x1} y2={GOL.yTop + i * 5.2} />)}
          </g>
          <rect x={GOL.x0 - 1.4} y={GOL.yTop - 1.4} width={GOL.x1 - GOL.x0 + 2.8} height={2} rx={1} fill="#FFFFFF" />
          <rect x={GOL.x0 - 1.4} y={GOL.yTop - 1.4} width={2} height={GOL.yBase - GOL.yTop + 1.4} rx={1} fill="#FFFFFF" />
          <rect x={GOL.x1 - 0.6} y={GOL.yTop - 1.4} width={2} height={GOL.yBase - GOL.yTop + 1.4} rx={1} fill="#FFFFFF" />

          {/* goleiro do adversário da rodada, sempre em movimento */}
          <g transform={`translate(${telaX(gkX)} ${GOL.yBase}) scale(0.44)`}>
            <ellipse cx={0} cy={1.5} rx={9} ry={2} fill="#000" opacity={0.15} />
            <rect x={-15} y={-20} width={30} height={3.4} rx={1.7} fill={rivalCores.a} stroke="#1B2B3A" strokeWidth={0.9} />
            <circle cx={-15.5} cy={-18.4} r={3.4} fill="#F7F3E8" stroke="#1B2B3A" strokeWidth={0.9} />
            <circle cx={15.5} cy={-18.4} r={3.4} fill="#F7F3E8" stroke="#1B2B3A" strokeWidth={0.9} />
            <rect x={-7} y={-19} width={14} height={15} rx={3} fill={rivalCores.a} stroke="#1B2B3A" strokeWidth={1} />
            <rect x={-1.8} y={-19} width={3.6} height={15} fill={rivalCores.b} opacity={0.95} />
            <rect x={-5.6} y={-5} width={4.4} height={5} rx={1.4} fill="#2B3D52" />
            <rect x={1.2} y={-5} width={4.4} height={5} rx={1.4} fill="#2B3D52" />
            <circle cx={0} cy={-22.6} r={4} fill="#F2A65A" stroke="#1B2B3A" strokeWidth={1} />
          </g>

          {(() => {
            const b = voo ? { cx: telaX(voo.x), cy: telaY(voo.y), r: voo.r } : { cx: BOLA.x, cy: BOLA.y, r: BOLA.r };
            return (
              <g>
                <ellipse cx={b.cx} cy={voo ? GOL.yBase + 1.5 : BOLA.y + b.r * 0.9} rx={b.r * 0.85} ry={b.r * 0.28} fill="#000" opacity={0.15} />
                <circle cx={b.cx} cy={b.cy} r={b.r} fill="#FFFFFF" stroke="#1B2B3A" strokeWidth={0.6} />
                <circle cx={b.cx} cy={b.cy} r={b.r * 0.32} fill="#1B2B3A" />
                {[0, 72, 144, 216, 288].map((a) => (
                  <circle key={a} r={b.r * 0.16} fill="#1B2B3A"
                    cx={b.cx + Math.cos((a * Math.PI) / 180) * b.r * 0.64} cy={b.cy + Math.sin((a * Math.PI) / 180) * b.r * 0.64} />
                ))}
              </g>
            );
          })()}
        </svg>

        {fase === 'jogando' && (
          <motion.div key={gols} initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}
            className="absolute left-3 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-grass text-white shadow-[0_3px_0_rgba(0,0,0,.25)]">
            <span className="t-display text-[20px] leading-none">{gols}</span>
          </motion.div>
        )}
        {/* o quanto o goleiro já acelerou: sobe sozinho com o relógio */}
        {fase === 'jogando' && (
          <div className="absolute right-3 top-3 h-2 w-20 overflow-hidden rounded-full bg-white/30" title="Velocidade do goleiro">
            <div className="h-full rounded-full bg-orange-deep transition-[width] duration-500" style={{ width: `${Math.round(aperto * 100)}%` }} />
          </div>
        )}

        <AnimatePresence>
          {recorde && fase === 'jogando' && (
            <motion.div initial={{ x: '100%' }} animate={{ x: '-100%' }} transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
              className="pointer-events-none absolute inset-x-0 top-[6%] whitespace-nowrap text-center">
              <span className="t-display text-[20px] text-white/85 drop-shadow-[0_2px_0_rgba(0,0,0,.35)]">NOVA MAIOR PONTUAÇÃO</span>
            </motion.div>
          )}
          {aviso && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className={`t-display t-out text-[34px] ${aviso === 'gol' ? 'text-white' : 'text-red-500'}`}>
                {aviso === 'gol' ? 'GOL!' : aviso === 'defendeu' ? 'DEFENDEU!' : 'FORA!'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {fase !== 'jogando' && <div className="absolute inset-0 bg-navy-deep/45" />}
      </div>

      {fase === 'jogando' && (
        <p className="relative mt-2 px-6 text-center text-[12px] font-extrabold text-white/90">
          Toque no canto onde quer chutar. O goleiro não para — espere ele sair de lá.
        </p>
      )}

      {board?.rival && (
        <div className="relative mx-3 mt-2 rounded-xl bg-navy-deep/55 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5"><Shield team={board.mine.team} size={22} /><span className="t-display text-[15px] text-white">{board.mine.goals.toLocaleString('pt-BR')}</span></span>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-white/70">gols na rodada</span>
            <span className="flex min-w-0 items-center gap-1.5"><span className="t-display text-[15px] text-white">{board.rival.goals.toLocaleString('pt-BR')}</span><Shield team={board.rival.team} size={22} /></span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${pctMine}%` }} />
          </div>
        </div>
      )}

      {fase === 'abrir' && (
        <div className="relative mx-3 mt-3 panel text-center text-navy-ink">
          <p className="text-[13px] font-bold leading-snug">
            Toque no canto do gol e a bola sai na hora. O goleiro {board?.rival ? `do ${board.rival.team.name}` : 'adversário'} vai de uma trave à outra sem parar — e fica mais rápido a cada segundo de jogo.
          </p>
          <p className="mt-1 text-[13px] font-bold leading-snug text-muted">
            {st?.goalTarget ?? 10} gols seguidos valem <b className="text-grass-deep">1 gol para o {me.team.name}</b> e {fmt(1400)}. Cada gol ainda dá {st?.pointsPerGoal ?? 3} de nível, até {st?.maxPoints ?? 30}. Bola na trave ou por cima acaba a série.
          </p>
          <p className="mt-1 text-[12px] font-bold text-muted">Seu recorde: {st?.best ? `${st.best} ${st.best === 1 ? 'gol' : 'gols'} seguidos` : 'sem recorde ainda'}</p>
          {st?.finished && !st?.freePlay
            ? <p className="mt-2 text-[13px] font-extrabold text-orange-deep">Você já jogou hoje. A Goleada renova às 22h.</p>
            : <button onClick={começar} className="btn btn-green btn-lg mt-3 w-full">Bater a primeira</button>}
        </div>
      )}

      {fase === 'fim' && fim && (
        <div className="relative mx-3 mt-3 panel text-center text-navy-ink">
          <div className="t-display text-[28px] leading-none text-grass-deep">{fim.goals}</div>
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-muted">{fim.goals === 1 ? 'gol' : 'gols seguidos'}</div>
          {fim.record && <div className="mt-1 t-display text-[15px] text-gold-deep">Recorde novo!</div>}
          <p className="mt-1 text-[12px] font-bold text-muted">{fim.why === 'fora' ? 'A última foi para fora.' : 'O goleiro pegou a última.'}</p>
          {fim.goal
            ? <p className="mt-2 text-[13px] font-bold leading-snug text-navy-ink">{fim.goal.text}</p>
            : <p className="mt-2 text-[13px] font-bold leading-snug text-muted">Faltaram {Math.max(0, (st?.goalTarget ?? 10) - fim.goals)} para o gol do dia. Amanhã tem mais.</p>}
          <p className="mt-1 text-[12px] font-bold text-muted">+{fim.levelPoints} de nível · recorde: {fim.best}</p>
          <div className="mt-3 flex gap-2">
            {st?.freePlay && <button onClick={começar} className="btn btn-green btn-md flex-1">Jogar de novo</button>}
            <button onClick={() => nav('/')} className="btn btn-blue btn-md flex-1">Voltar</button>
          </div>
        </div>
      )}
      <div className="h-6" />
    </div>
  );
}
