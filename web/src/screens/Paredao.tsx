import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Shield } from '../components/Shield';
import { toast } from '../components/Toast';
import { money as fmt } from '../lib/format';
import type { ParedaoShot, ParedaoState, ParedaoBoard } from '../lib/types';

/**
 * PAREDÃO — o minigame do goleiro (pedido do dono, 17/09/2026, a partir do "Mini Cup" do Google).
 * Você é o goleiro: as bolas vêm do fundo do campo cada vez mais rápidas e o dedo arrasta o goleiro pela
 * linha do gol. Contador de defesas seguidas no alto, faixa "NOVA MAIOR PONTUAÇÃO" quando o recorde cai e,
 * embaixo, o placar do seu time contra o adversário da rodada — a versão JogaGol do contador de países.
 *
 * **Nada de internet no meio da partida** (a mesma razão de o X1 ser por turnos): o servidor manda as bolas
 * já sorteadas em lotes de 40 e esta tela só anima; ela pede o lote seguinte com 12 bolas de antecedência.
 * No fim, manda o RASTRO DO DEDO e o servidor refaz a partida para contar as defesas — a contagem daqui é
 * só para a animação.
 *
 * O relógio é por TEMPO (performance.now), nunca por quadro: celular lento atrasa a animação, não o jogo.
 */

const CAMPO = { w: 1, h: 0.86 }; // proporção da área de jogo (gol + gramado)

/** O goleiro, de frente, com a camisa do clube. Desenho simples no traço do kit (sem emoji, sem sprite). */
function Goleiro({ x, dive, colors }: { x: number; dive: number; colors: { a: string; b: string } }) {
  return (
    <g transform={`translate(${x * 100} 0) scale(0.72)`}>
      <g transform={`rotate(${dive * 12}) translate(0 ${Math.abs(dive) * -1.4})`}>
        {/* sombra no gramado */}
        <ellipse cx={0} cy={0.6} rx={7} ry={1.4} fill="#000" opacity={0.14} />
        {/* braços abertos e luvas */}
        <rect x={-12.5} y={-17.2} width={25} height={2.8} rx={1.4} fill={colors.a} stroke="#1B2B3A" strokeWidth={0.7} />
        <circle cx={-13.2} cy={-15.8} r={2.9} fill="#F7F3E8" stroke="#1B2B3A" strokeWidth={0.8} />
        <circle cx={13.2} cy={-15.8} r={2.9} fill="#F7F3E8" stroke="#1B2B3A" strokeWidth={0.8} />
        {/* corpo com a camisa do clube */}
        <rect x={-5.8} y={-16.4} width={11.6} height={12.4} rx={2.4} fill={colors.a} stroke="#1B2B3A" strokeWidth={0.9} />
        <rect x={-1.4} y={-16.4} width={2.8} height={12.4} fill={colors.b} opacity={0.95} />
        {/* pernas */}
        <rect x={-4.8} y={-4.2} width={3.6} height={4.2} rx={1.1} fill="#2B3D52" />
        <rect x={1.2} y={-4.2} width={3.6} height={4.2} rx={1.1} fill="#2B3D52" />
        {/* cabeça */}
        <circle cx={0} cy={-19.2} r={3.3} fill="#F2A65A" stroke="#1B2B3A" strokeWidth={0.85} />
      </g>
    </g>
  );
}

export function ParedaoScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [st, setSt] = useState<ParedaoState | null>(null);
  const [board, setBoard] = useState<ParedaoBoard | null>(null);
  const [fase, setFase] = useState<'abrir' | 'jogando' | 'fim'>('abrir');
  const [placar, setPlacar] = useState(0); // defesas desta partida (só para a tela)
  const [recorde, setRecorde] = useState(false);
  const [fim, setFim] = useState<{ saves: number; levelPoints: number; goal?: { text: string } | null; best: number; record: boolean } | null>(null);
  const [bola, setBola] = useState<{ x: number; y: number; r: number } | null>(null);
  const [gk, setGk] = useState(0.5);
  const [dive, setDive] = useState(0);
  const [aviso, setAviso] = useState<'defesa' | 'gol' | null>(null);

  const campo = useRef<HTMLDivElement>(null);
  const jogo = useRef({
    t0: 0, i: 0, shots: [] as ParedaoShot[], trace: [] as [number, number][], crossings: [] as { i: number; t: number }[],
    kx: 0.5, ultimo: 0, pedindo: false, viva: false, saves: 0,
  });

  const cores = { a: me.team.colorPrimary, b: me.team.colorSecondary };

  const carregar = useCallback(() => {
    api.paredao().then((r) => { setSt(r.state); setBoard(r.scoreboard); }).catch(() => {});
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  /** Guarda onde o goleiro está, no máximo 30 vezes por segundo (é o que vai para o servidor conferir). */
  const anota = (t: number) => {
    const g = jogo.current;
    if (t - g.ultimo >= 30) { g.trace.push([Math.round(t), Number(g.kx.toFixed(4))]); g.ultimo = t; }
  };

  function mover(e: React.PointerEvent) {
    const el = campo.current;
    if (!el || !jogo.current.viva) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0.04, Math.min(0.96, (e.clientX - r.left) / r.width));
    jogo.current.kx = x;
    setGk(x);
  }

  async function começar() {
    try {
      const r = await api.paredaoStart();
      const g = jogo.current;
      Object.assign(g, { t0: performance.now(), i: 0, shots: r.shots, trace: [[0, 0.5]], crossings: [], kx: 0.5, ultimo: 0, pedindo: false, viva: true, saves: 0 });
      setSt(r.state); setBoard(r.scoreboard); setPlacar(0); setRecorde(false); setGk(0.5); setFase('jogando');
      requestAnimationFrame(loop);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  /** O laço da partida: uma bola por vez, tudo no relógio de verdade. */
  function loop() {
    const g = jogo.current;
    if (!g.viva) return;
    const t = performance.now() - g.t0;
    anota(t);
    const s = g.shots[g.i];
    if (!s) { requestAnimationFrame(loop); return; }
    const saiu = s.at - s.T;
    if (t >= saiu) {
      const p = Math.min(1, (t - saiu) / s.T);
      const x = s.from.x + (s.to.x - s.from.x) * p + (s.curve ?? 0) * Math.sin(p * Math.PI);
      const y = s.from.y + (s.to.y - s.from.y) * p;
      setBola({ x, y, r: 2 + 3.2 * p * p });
      setDive(Math.max(-1, Math.min(1, (x - g.kx) * 2.2)) * (p > 0.55 ? 1 : 0));
      if (p >= 1) {
        const alcance = (st?.keeper.reach ?? 0.115) * (s.to.y > (st?.keeper.highFrom ?? 0.62) ? (st?.keeper.highReach ?? 0.78) : 1);
        const defendeu = Math.abs(g.kx - s.to.x) <= alcance;
        g.crossings.push({ i: s.i, t: Math.round(t) });
        setBola(null); setDive(0);
        if (defendeu) {
          g.saves += 1;
          setPlacar(g.saves);
          setAviso('defesa'); setTimeout(() => setAviso(null), 450);
          if (!recorde && g.saves > (st?.best ?? 0) && (st?.best ?? 0) > 0) setRecorde(true);
          g.i += 1;
          // pede o lote seguinte bem antes de acabar — sem pausa no meio do jogo
          if (!g.pedindo && g.i >= g.shots.length - 12) {
            g.pedindo = true;
            api.paredaoMore(g.shots[g.shots.length - 1].i + 1)
              .then((r) => { g.shots = [...g.shots, ...r.shots]; g.pedindo = false; })
              .catch(() => { g.pedindo = false; });
          }
        } else {
          g.viva = false;
          setAviso('gol');
          terminar();
          return;
        }
      }
    }
    requestAnimationFrame(loop);
  }

  async function terminar() {
    const g = jogo.current;
    try {
      const r = await api.paredaoEnd({ trace: g.trace, crossings: g.crossings });
      setSt(r.state); setBoard(r.scoreboard);
      setFim({ saves: r.saves, levelPoints: r.levelPoints, goal: r.goal, best: r.best, record: r.record });
      setFase('fim');
      await refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
      setFase('abrir'); carregar();
    }
  }

  useEffect(() => () => { jogo.current.viva = false; }, []); // saiu da tela: para o laço

  const bestTxt = st?.best ? `${st.best} ${st.best === 1 ? 'defesa' : 'defesas'}` : 'sem recorde ainda';
  const total = (board?.mine?.saves ?? 0) + (board?.rival?.saves ?? 0);
  const pctMine = total ? Math.round(((board?.mine?.saves ?? 0) / total) * 100) : 50;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />

      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-green">PAREDÃO</div>
        <div className="resbar text-[12px]"><img src="/ui/ico-glove.png" className="ico -ml-3 h-8 w-8" alt="" />{st?.best ?? 0}</div>
      </div>

      {/* O campo: gol, rede, goleiro e bola. Tudo em SVG para escalar em qualquer tela. */}
      <div ref={campo} onPointerDown={mover} onPointerMove={mover} onPointerUp={() => setDive(0)}
        className="relative mx-3 touch-none select-none overflow-hidden rounded-2xl border-[3px] border-white/70 shadow-[0_4px_0_rgba(0,0,0,.18)]"
        style={{ aspectRatio: `${CAMPO.w} / ${CAMPO.h}`, background: 'linear-gradient(#8FE063 0%, #6FCB4A 55%, #5FBB3E 100%)' }}>
        <svg viewBox="0 0 100 62" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {/* listras do gramado */}
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={0} y={38 + i * 4} width={100} height={2} fill="#000" opacity={0.045} />)}
          {/* gol: trave, rede e linha */}
          <rect x={6} y={8} width={88} height={30} fill="#FFFFFF" opacity={0.14} />
          <g stroke="#FFFFFF" strokeWidth={0.35} opacity={0.5}>
            {Array.from({ length: 16 }, (_, i) => <line key={`v${i}`} x1={6 + i * 5.87} y1={8} x2={6 + i * 5.87} y2={38} />)}
            {Array.from({ length: 7 }, (_, i) => <line key={`h${i}`} x1={6} y1={8 + i * 5} x2={94} y2={8 + i * 5} />)}
          </g>
          <rect x={4.4} y={6.4} width={91.2} height={3} rx={1.5} fill="#FFFFFF" stroke="#C9D6E4" strokeWidth={0.5} />
          <rect x={4.4} y={6.4} width={3} height={33} rx={1.5} fill="#FFFFFF" stroke="#C9D6E4" strokeWidth={0.5} />
          <rect x={92.6} y={6.4} width={3} height={33} rx={1.5} fill="#FFFFFF" stroke="#C9D6E4" strokeWidth={0.5} />
          <line x1={4} y1={39} x2={96} y2={39} stroke="#FFFFFF" strokeWidth={0.7} opacity={0.9} />

          <g transform="translate(0 39)"><Goleiro x={gk} dive={dive} colors={cores} /></g>

          {bola && (
            <>
              {/* a sombra no gramado diz ONDE a bola vai cair — é ela que dá a leitura da profundidade */}
              <ellipse cx={bola.x * 88 + 6} cy={39.5} rx={bola.r * 0.85} ry={bola.r * 0.3} fill="#000" opacity={0.16} />
            <g transform={`translate(${bola.x * 88 + 6} ${39 - bola.y * 30})`}>
              <circle r={bola.r + 0.5} fill="#1B2B3A" opacity={0.18} />
              <circle r={bola.r} fill="#FFFFFF" stroke="#1B2B3A" strokeWidth={0.6} />
              {/* gomos: a bola tem de se ler como bola mesmo pequena, lá no fundo do campo */}
              <circle r={bola.r * 0.33} fill="#1B2B3A" />
              {[0, 72, 144, 216, 288].map((a) => (
                <circle key={a} r={bola.r * 0.17} fill="#1B2B3A"
                  cx={Math.cos((a * Math.PI) / 180) * bola.r * 0.66} cy={Math.sin((a * Math.PI) / 180) * bola.r * 0.66} />
              ))}
            </g>
            </>
          )}
        </svg>

        {/* contador de defesas, no canto de cima como no Mini Cup */}
        {fase === 'jogando' && (
          <motion.div key={placar} initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}
            className="absolute left-3 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-grass text-white shadow-[0_3px_0_rgba(0,0,0,.25)]">
            <span className="t-display text-[20px] leading-none">{placar}</span>
          </motion.div>
        )}

        <AnimatePresence>
          {recorde && fase === 'jogando' && (
            <motion.div initial={{ x: '100%' }} animate={{ x: '-100%' }} transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
              className="pointer-events-none absolute inset-x-0 top-[22%] whitespace-nowrap text-center">
              <span className="t-display text-[22px] text-white/85 drop-shadow-[0_2px_0_rgba(0,0,0,.35)]">NOVA MAIOR PONTUAÇÃO</span>
            </motion.div>
          )}
          {aviso && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className={`t-display t-out text-[34px] ${aviso === 'defesa' ? 'text-white' : 'text-red-500'}`}>{aviso === 'defesa' ? 'PEGOU!' : 'GOL!'}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {fase !== 'jogando' && <div className="absolute inset-0 bg-navy-deep/45" />}
      </div>

      {fase === 'jogando' && (
        <p className="relative mt-2 px-6 text-center text-[12px] font-extrabold text-white/90">
          Arraste para os lados. {st?.goalTarget ?? 10} seguidas valem o gol do dia.
        </p>
      )}

      {/* Placar coletivo: o duelo de defesas do meu time contra o adversário da rodada */}
      {board?.rival && (
        <div className="relative mx-3 mt-2 rounded-xl bg-navy-deep/55 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5"><Shield team={board.mine.team} size={22} /><span className="t-display text-[15px] text-white">{board.mine.saves.toLocaleString('pt-BR')}</span></span>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-white/70">defesas na rodada</span>
            <span className="flex min-w-0 items-center gap-1.5"><span className="t-display text-[15px] text-white">{board.rival.saves.toLocaleString('pt-BR')}</span><Shield team={board.rival.team} size={22} /></span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${pctMine}%` }} />
          </div>
        </div>
      )}

      {/* Abertura e fim de jogo */}
      {fase === 'abrir' && (
        <div className="relative mx-3 mt-3 panel text-center text-navy-ink">
          <p className="text-[13px] font-bold leading-snug">
            Você é o goleiro. Arraste para os lados e segure o máximo de bolas seguidas que conseguir — elas vêm cada vez mais rápido.
          </p>
          <p className="mt-1 text-[13px] font-bold leading-snug text-muted">
            {st?.goalTarget ?? 10} defesas seguidas valem <b className="text-grass-deep">1 gol para o {me.team.name}</b> e {fmt(1400)}. Cada defesa ainda dá {st?.pointsPerSave ?? 3} de nível, até {st?.maxPoints ?? 30}.
          </p>
          <p className="mt-1 text-[12px] font-bold text-muted">Seu recorde: {bestTxt}</p>
          {st?.finished && !st?.freePlay
            ? <p className="mt-2 text-[13px] font-extrabold text-orange-deep">Você já jogou hoje. O Paredão renova às 22h.</p>
            : <button onClick={começar} className="btn btn-green btn-lg mt-3 w-full">Entrar no gol</button>}
        </div>
      )}

      {fase === 'fim' && fim && (
        <div className="relative mx-3 mt-3 panel text-center text-navy-ink">
          <div className="t-display text-[28px] leading-none text-grass-deep">{fim.saves}</div>
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-muted">{fim.saves === 1 ? 'defesa' : 'defesas seguidas'}</div>
          {fim.record && <div className="mt-1 t-display text-[15px] text-gold-deep">Recorde novo!</div>}
          {fim.goal
            ? <p className="mt-2 text-[13px] font-bold leading-snug text-navy-ink">{fim.goal.text}</p>
            : <p className="mt-2 text-[13px] font-bold leading-snug text-muted">Faltaram {Math.max(0, (st?.goalTarget ?? 10) - fim.saves)} para o gol do dia. Amanhã tem mais.</p>}
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
