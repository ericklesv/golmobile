import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Shield } from '../components/Shield';
import { toast } from '../components/Toast';
import { money as fmt } from '../lib/format';
import type { GoleadaKeeper, GoleadaState, GoleadaBoard } from '../lib/types';

/**
 * GOLEADA — porte do "Mini Cup" do Google (dono, 17/09/2026; ele corrigiu a leitura do vídeo: "no minicup
 * você é o jogador e não o goleiro"). A bola fica grande no seu pé; você puxa o dedo na direção do gol e
 * solta para chutar. O goleiro adversário reage mais rápido a cada gol; ele pegou ou você mandou fora,
 * acabou a série.
 *
 * Identidade do JogaGol: o goleiro veste o uniforme do ADVERSÁRIO DA RODADA (como no pênalti e na falta) e
 * cada gol soma no placar do seu time contra ele — é o contador de países do Google, à nossa moda.
 *
 * **Sem falar com o servidor no meio da série** (a mesma razão de o X1 ser por turnos): os goleiros vêm
 * prontos em lotes de 40 e a tela roda a MESMA conta do servidor (`decide`, igual ao shoot() de
 * lib/goleada.js) só para animar. No fim ela manda os chutes e o servidor refaz tudo: quem conta é ele.
 */

/** Boca do gol na tela (viewBox 100×100): x de 18 a 82, y de 36 (rasteiro) a 12 (travessão). */
const GOL = { x0: 18, x1: 82, yBase: 36, yTop: 12 };
const telaX = (x: number) => GOL.x0 + x * (GOL.x1 - GOL.x0);
const telaY = (y: number) => GOL.yBase - y * (GOL.yBase - GOL.yTop);
const BOLA = { x: 50, y: 86, r: 7 };

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
  const [mira, setMira] = useState<{ x: number; y: number; power: number } | null>(null); // guia enquanto puxa o dedo
  const [voo, setVoo] = useState<{ x: number; y: number; r: number } | null>(null);
  const [gkX, setGkX] = useState(0.5);
  const [aviso, setAviso] = useState<'gol' | 'defendeu' | 'fora' | null>(null);
  const [gk, setGk] = useState<GoleadaKeeper | null>(null);

  const campo = useRef<HTMLDivElement>(null);
  const jogo = useRef({
    seed: '', i: 0, keepers: [] as GoleadaKeeper[], shots: [] as { i: number; x: number; y: number; power: number }[],
    viva: false, gols: 0, pedindo: false, puxando: null as null | { x: number; y: number },
  });

  const rivalCores = board?.rival?.team
    ? { a: board.rival.team.colorPrimary, b: board.rival.team.colorSecondary }
    : { a: '#FFC63D', b: '#E8503A' };

  const carregar = useCallback(() => {
    api.goleada().then((r) => { setSt(r.state); setBoard(r.scoreboard); }).catch(() => {});
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  /** A mesma conta do servidor (lib/goleada.js → shoot): sem isso a tela teria de perguntar a cada chute. */
  function decide(k: GoleadaKeeper, aim: { x: number; y: number; power: number }) {
    const c = st!;
    const T = Math.round(c.shot.slow + (c.shot.fast - c.shot.slow) * Math.max(0, Math.min(1, aim.power)));
    if (aim.x < c.aim.margin || aim.x > 1 - c.aim.margin || aim.y < 0 || aim.y > 1 - c.aim.top) return { goal: false, why: 'fora' as const, T, kx: 0.5 };
    const partida = 0.5 + k.lean * c.keeper.leanHelp * 0.5;
    const anda = (k.speed * Math.max(0, T - k.react)) / 1000;
    const kx = partida + Math.max(-anda, Math.min(anda, aim.x - partida));
    const alcance = c.keeper.reach * (aim.y > c.keeper.highFrom ? c.keeper.highReach : 1);
    const pegou = Math.abs(kx - aim.x) <= alcance;
    return { goal: !pegou, why: pegou ? ('defendeu' as const) : ('gol' as const), T, kx };
  }

  /** Onde o dedo está, em medidas do campo (0..1 na largura, 0..1 na altura de baixo para cima). */
  function ponto(e: React.PointerEvent) {
    const r = campo.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  }

  function puxar(e: React.PointerEvent) {
    if (!jogo.current.viva || voo) return;
    jogo.current.puxando = ponto(e);
    setMira({ x: 0.5, y: 0.35, power: 0.5 });
  }
  function arrastar(e: React.PointerEvent) {
    const p0 = jogo.current.puxando;
    if (!p0 || !jogo.current.viva || voo) return;
    const p = ponto(e);
    const dx = p.x - p0.x, dy = p.y - p0.y;
    // o dedo aponta para onde a bola vai: o quanto ele sobe é a altura, e o tamanho do puxão é a força
    const x = Math.max(0, Math.min(1, 0.5 + dx * 2.2));
    const y = Math.max(0, Math.min(1, dy * 2.4));
    const power = Math.max(0.15, Math.min(1, Math.hypot(dx, dy) * 2.6));
    setMira({ x, y, power });
  }
  function soltar() {
    const g = jogo.current;
    if (!g.puxando || !g.viva || !mira || voo) { g.puxando = null; return; }
    g.puxando = null;
    chutar(mira);
  }

  async function começar() {
    try {
      const r = await api.goleadaStart();
      const g = jogo.current;
      Object.assign(g, { i: 0, keepers: r.keepers, shots: [], viva: true, gols: 0, pedindo: false, puxando: null });
      setSt(r.state); setBoard(r.scoreboard); setGols(0); setRecorde(false); setGk(r.keepers[0]); setGkX(0.5); setVoo(null); setMira(null); setFase('jogando');
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  /** Chuta: anima o voo (tempo real, não por quadro) e resolve com a mesma conta do servidor. */
  function chutar(aim: { x: number; y: number; power: number }) {
    const g = jogo.current;
    const k = g.keepers[g.i];
    if (!k) return;
    const r = decide(k, aim);
    g.shots.push({ i: k.i, x: Number(aim.x.toFixed(4)), y: Number(aim.y.toFixed(4)), power: Number(aim.power.toFixed(3)) });
    setMira(null);
    const t0 = performance.now();
    const passo = () => {
      const p = Math.min(1, (performance.now() - t0) / r.T);
      setVoo({ x: aim.x, y: aim.y, r: BOLA.r + (2.1 - BOLA.r) * p });
      // o goleiro só sai do lugar depois da reação dele
      const react = Math.min(1, Math.max(0, (p * r.T - k.react) / Math.max(1, r.T - k.react)));
      setGkX(0.5 + k.lean * (st?.keeper.leanHelp ?? 0.45) * 0.5 + (r.kx - (0.5 + k.lean * (st?.keeper.leanHelp ?? 0.45) * 0.5)) * react);
      if (p < 1) { requestAnimationFrame(passo); return; }
      setVoo(null);
      setAviso(r.why);
      setTimeout(() => setAviso(null), 700);
      if (r.goal) {
        g.gols += 1; setGols(g.gols);
        if (!recorde && g.gols > (st?.best ?? 0) && (st?.best ?? 0) > 0) setRecorde(true);
        g.i += 1;
        setGk(g.keepers[g.i] ?? null);
        setGkX(0.5);
        if (!g.pedindo && g.i >= g.keepers.length - 12) {
          g.pedindo = true;
          api.goleadaMore(g.keepers[g.keepers.length - 1].i + 1)
            .then((res) => { g.keepers = [...g.keepers, ...res.keepers]; g.pedindo = false; })
            .catch(() => { g.pedindo = false; });
        }
      } else {
        g.viva = false;
        terminar();
      }
    };
    requestAnimationFrame(passo);
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
  const alvo = mira ?? null;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />

      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-green">GOLEADA</div>
        <div className="resbar text-[12px]"><img src="/ui/ico-ball.png" className="ico -ml-3 h-8 w-8" alt="" />{st?.best ?? 0}</div>
      </div>

      <div ref={campo} onPointerDown={puxar} onPointerMove={arrastar} onPointerUp={soltar} onPointerCancel={soltar}
        className="relative mx-3 touch-none select-none overflow-hidden rounded-2xl border-[3px] border-white/70 shadow-[0_4px_0_rgba(0,0,0,.18)]"
        style={{ aspectRatio: '1 / 1', background: 'linear-gradient(#9AE86B 0%, #7FD455 35%, #63C244 100%)' }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {/* gramado em perspectiva: faixas mais largas conforme chegam perto */}
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={0} y={40 + i * i * 2.4 + i * 6} width={100} height={3 + i} fill="#000" opacity={0.04} />)}
          {/* grande área */}
          <path d="M28 36 L14 62 L86 62 L72 36 Z" fill="none" stroke="#FFFFFF" strokeWidth={0.7} opacity={0.5} />
          {/* gol: rede e traves */}
          <rect x={GOL.x0} y={GOL.yTop} width={GOL.x1 - GOL.x0} height={GOL.yBase - GOL.yTop} fill="#FFFFFF" opacity={0.16} />
          <g stroke="#FFFFFF" strokeWidth={0.28} opacity={0.55}>
            {Array.from({ length: 13 }, (_, i) => <line key={`v${i}`} x1={GOL.x0 + i * 5.33} y1={GOL.yTop} x2={GOL.x0 + i * 5.33} y2={GOL.yBase} />)}
            {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1={GOL.x0} y1={GOL.yTop + i * 6} x2={GOL.x1} y2={GOL.yTop + i * 6} />)}
          </g>
          <rect x={GOL.x0 - 1.4} y={GOL.yTop - 1.4} width={GOL.x1 - GOL.x0 + 2.8} height={2} rx={1} fill="#FFFFFF" />
          <rect x={GOL.x0 - 1.4} y={GOL.yTop - 1.4} width={2} height={GOL.yBase - GOL.yTop + 1.4} rx={1} fill="#FFFFFF" />
          <rect x={GOL.x1 - 0.6} y={GOL.yTop - 1.4} width={2} height={GOL.yBase - GOL.yTop + 1.4} rx={1} fill="#FFFFFF" />

          {/* goleiro adversário, pequeno (está longe), com o uniforme do time da rodada */}
          <g transform={`translate(${telaX(gkX)} ${GOL.yBase}) scale(0.42)`}>
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

          {/* guia da mira enquanto o dedo puxa */}
          {alvo && !voo && (() => {
            // mira fora da boca do gol fica vermelha: o jogador aprende a margem sem levar susto
            const dentro = st ? alvo.x >= st.aim.margin && alvo.x <= 1 - st.aim.margin && alvo.y <= 1 - st.aim.top : true;
            const cor = dentro ? '#FFC63D' : '#E8503A';
            return (
              <g opacity={0.9}>
                <line x1={BOLA.x} y1={BOLA.y} x2={telaX(alvo.x)} y2={telaY(alvo.y)} stroke="#FFFFFF" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.75} />
                <circle cx={telaX(alvo.x)} cy={telaY(alvo.y)} r={3.2} fill="none" stroke={cor} strokeWidth={1.2} />
                <circle cx={telaX(alvo.x)} cy={telaY(alvo.y)} r={1} fill={cor} />
              </g>
            );
          })()}

          {/* a bola: parada no seu pé (grande) ou voando (encolhendo até o gol) */}
          {(() => {
            const b = voo ? { cx: telaX(voo.x), cy: telaY(voo.y), r: voo.r } : { cx: BOLA.x, cy: BOLA.y, r: BOLA.r };
            return (
              <g>
                <ellipse cx={b.cx} cy={voo ? telaY(0) + 2 : BOLA.y + b.r * 0.9} rx={b.r * 0.85} ry={b.r * 0.28} fill="#000" opacity={0.15} />
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
        {fase === 'jogando' && mira && (
          <div className="absolute bottom-2 left-1/2 h-2 w-24 -translate-x-1/2 overflow-hidden rounded-full bg-white/30">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round(mira.power * 100)}%` }} />
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
          {gk?.lean ? `O goleiro caiu para a ${gk.lean < 0 ? 'esquerda' : 'direita'} — chute no outro canto.` : 'Puxe o dedo na direção do gol e solte. Quanto maior o puxão, mais forte.'}
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
            A bola está no seu pé. Puxe o dedo na direção do gol e solte para chutar — o goleiro {board?.rival ? `do ${board.rival.team.name}` : 'adversário'} fica mais rápido a cada gol.
          </p>
          <p className="mt-1 text-[13px] font-bold leading-snug text-muted">
            {st?.goalTarget ?? 10} gols seguidos valem <b className="text-grass-deep">1 gol para o {me.team.name}</b> e {fmt(1400)}. Cada gol ainda dá {st?.pointsPerGoal ?? 3} de nível, até {st?.maxPoints ?? 30}.
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
