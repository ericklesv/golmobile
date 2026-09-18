import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Shield } from '../components/Shield';
import { toast } from '../components/Toast';
import { Spinner } from '../components/ui';
import { money as fmt } from '../lib/format';
import { sound } from '../lib/sound';
import { ease, clamp01, bounceY } from '../scenes/common';
import { StadiumModel, GoalModel, BallModel, KeeperModel, SceneLights, preloadModels, type KeeperHandle, type KitColors } from '../scenes/models';
import type { GoleadaState, GoleadaBoard } from '../lib/types';

/**
 * GOLEADA — porte do "Mini Cup" do Google (dono, 17/09/2026). Você é o batedor: **puxa o dedo a partir da
 * bola, como na Falta PRO** (dono, 18/09/2026: "é fazer o movimento do chute assim como no falta pro"). A
 * direção manda onde, a VELOCIDADE do puxão manda a força e o ARCO do dedo põe efeito — a bola sai aberta e
 * fecha na mira, enganando o goleiro. Não há alvo desenhado: o gesto é a mira.
 *
 * O goleiro **anda de trave a trave sem parar** e fica mais rápido quanto mais a série dura ("a velocidade do
 * goleiro tem que ir aumentando conforme o tempo que você tá com o jogo aberto"); no máximo, ele fecha o gol.
 * Fez o gol, vem outra bola; ele pegou ou você mandou fora, acabou a série.
 *
 * VISUAL (dono, 18/09/2026: "você não consegue melhorar o visual? Os assets, animação e tal"): é a MESMA cena
 * 3D do pênalti e da falta — estádio com torcida, trave com rede, goleiro vestindo o uniforme do adversário
 * da rodada e a bola Trionda. O HUD é fino, mora nos cantos e nunca cobre a boca do gol.
 *
 * **Sem falar com o servidor no meio da série**: o servidor manda só a FASE da ronda e esta tela roda as
 * mesmas contas de lib/goleada.js para animar. No fim ela manda os chutes e o servidor refaz a série — quem
 * conta os gols é ele.
 */

const GOL_W = 7.32, GOL_H = 2.44; // trave de verdade, em metros (o mesmo modelo 3D do pênalti)
const worldX = (x01: number) => (x01 - 0.5) * GOL_W;
const worldY = (y01: number) => 0.21 + y01 * (GOL_H - 0.3);
const BOLA_Z = 11; // de onde se bate: a marca do pênalti, para a moldura ser a mesma das outras telas

type Aim = { x: number; y: number; power: number; spin: number };
type Voo = { aim: Aim; lido: number; kx: number; from: number; T: number; why: 'gol' | 'defendeu' | 'fora'; t0: number; alto: boolean };
type Estado = {
  t0: number; phase: number; viva: boolean; gols: number; liberado: number;
  voo: Voo | null; pts: null | { x: number; y: number; t: number }[];
  shots: { i: number; x: number; y: number; power: number; spin: number; t: number }[];
};

/** A cena, igual à do pênalti. Lê o jogo por REF: nenhum re-render do React por quadro. */
function Cena({ jogo, st, kit }: { jogo: React.MutableRefObject<Estado>; st: GoleadaState; kit: KitColors }) {
  const bola = useRef<THREE.Group>(null);
  const goleiro = useRef<THREE.Group>(null);
  const gk = useRef<KeeperHandle>(null);
  const mergulhou = useRef('');

  // as mesmas contas de lib/goleada.js (o servidor refaz tudo no fim; aqui é só animação)
  const entre = (a: number, b: number, f: number) => a + (b - a) * f;
  const dureza = (t: number) => Math.min(1, Math.max(0, t) / st.ramp);
  const reacao = (t: number) => entre(st.keeper.reactFirst, st.keeper.reactLast, dureza(t));
  const ronda = (t: number) => {
    const P0 = st.keeper.periodFirst, P1 = st.keeper.periodLast, R = st.ramp, b = (P1 - P0) / R;
    const ms = Math.max(0, t);
    const ang = ms <= R ? (2 * Math.PI * Math.log(1 + (b * ms) / P0)) / b
      : (2 * Math.PI * Math.log(P1 / P0)) / b + (2 * Math.PI * (ms - R)) / P1;
    return 0.5 + st.keeper.amp * Math.sin(ang + jogo.current.phase);
  };

  useFrame(({ camera }) => {
    const b = bola.current, k = goleiro.current;
    if (!b || !k) return;
    const g = jogo.current;
    const t = performance.now() - g.t0;
    const v = g.voo;

    if (!v) {
      const x01 = g.viva ? ronda(t) : 0.5;
      k.position.set(worldX(x01), 0, 0.4);
      k.scale.x = 1; // desfaz o espelho do mergulho anterior
      b.position.set(0, 0.21, BOLA_Z);
      b.rotation.set(0, 0, 0);
      // os clipes dive/save_low TERMINAM deitados e seguram o último quadro: sem isto ele
      // ficava estatelado no gramado a série inteira (dono, 18/09/2026)
      if (mergulhou.current) { mergulhou.current = ''; gk.current?.pose('idle'); }
      camera.position.lerp(new THREE.Vector3(0, 1.75, 15.5), 0.08);
      camera.lookAt(0, 1.3, 0);
      return;
    }

    const e = performance.now() - v.t0;
    const p = clamp01(e / v.T);
    const react = reacao(t - e);
    if (e < react) {
      k.position.x = worldX(ronda(t)); // ainda não viu a bola: segue na ronda
    } else {
      const destino = worldX(v.kx), saida = worldX(v.from);
      const lado = Math.sign(destino - saida) || 1;
      if (mergulhou.current !== String(v.t0)) {
        mergulhou.current = String(v.t0);
        const longe = Math.abs(v.kx - v.from) > 0.05;
        k.scale.x = lado; // o clipe voa sempre para +x: espelha quando a bola vai para a esquerda
        gk.current?.pose(longe ? (v.alto ? 'dive' : 'save_low') : 'jump');
      }
      // o clipe do mergulho já leva o corpo ~0,9 m para o lado; o grupo completa o alcance
      const q = ease.out(clamp01((e - react) / Math.max(1, v.T - react)));
      k.position.x = saida + (destino - lado * 0.9 - saida) * q;
    }

    const alvoX = worldX(v.aim.x), alvoY = worldY(v.aim.y);
    if (p < 1) {
      const arco = Math.sin(p * Math.PI) * v.aim.spin * 0.12; // com efeito ela sai aberta e fecha na mira
      b.position.x = worldX(v.aim.x + (v.lido - v.aim.x) * (1 - p) + arco);
      b.position.z = BOLA_Z * (1 - p);
      b.position.y = 0.21 + (alvoY - 0.21) * p + Math.sin(p * Math.PI) * 0.35;
      b.rotation.x -= 0.3;
      b.rotation.z -= v.aim.spin * 0.08;
    } else {
      const t2 = (e - v.T) / 1000;
      if (v.why === 'gol') {
        // estufa a rede e a bola cai dentro do gol
        if (t2 < 0.12) { b.position.set(alvoX, alvoY, -1.35 * ease.out(t2 / 0.12)); b.rotation.x -= 0.4; }
        else {
          const t3 = t2 - 0.12;
          b.position.x = alvoX * (1 - 0.08 * clamp01(t3 / 1.2));
          b.position.z = -1.35 + 0.75 * ease.out(clamp01(t3 / 0.5));
          b.position.y = bounceY(alvoY, t3);
          b.rotation.x -= 0.12;
        }
      } else if (v.why === 'fora') {
        b.position.x = alvoX + (Math.sign(alvoX) || 1) * 1.6 * ease.out(clamp01(t2 / 0.6));
        b.position.z = -1.5 - 6 * t2;
        b.position.y = alvoY + 0.4 * t2;
        b.rotation.x -= 0.25;
      } else {
        // espalmada: bate na luva e volta quicando para o campo
        const d = Math.min(t2, 1.6);
        b.position.x = alvoX - (Math.sign(alvoX) || 1) * 0.8 * d;
        b.position.z = 0.4 + 5 * d - 0.6 * d * d;
        b.position.y = bounceY(alvoY, t2, 0.21, 9, 0.5);
        b.rotation.x -= 0.12;
      }
    }
    camera.position.lerp(new THREE.Vector3(alvoX * 0.18, 1.85, 14.5), 0.05);
    camera.lookAt(alvoX * 0.35, 1.25, 0);
  });

  return (
    <>
      <SceneLights />
      <StadiumModel />
      <GoalModel />
      <group ref={goleiro} position={[0, 0, 0.4]}>
        <KeeperModel ref={gk} color="#f2c200" kit={kit} speed={7} />
      </group>
      <group ref={bola}><BallModel /></group>
    </>
  );
}

const GK_KIT: KitColors = { primary: '#f2c200', secondary: '#14335F', gloves: '#e8e8e8' };

export function GoleadaScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [st, setSt] = useState<GoleadaState | null>(null);
  const [board, setBoard] = useState<GoleadaBoard | null>(null);
  const [fase, setFase] = useState<'abrir' | 'jogando' | 'fim'>('abrir');
  const [gols, setGols] = useState(0);
  const [recorde, setRecorde] = useState(false);
  const [aperto, setAperto] = useState(0);
  const [aviso, setAviso] = useState<'gol' | 'defendeu' | 'fora' | null>(null);
  const [rastro, setRastro] = useState<{ x: number; y: number }[]>([]);
  const [fim, setFim] = useState<{ goals: number; levelPoints: number; goal?: { text: string } | null; best: number; record: boolean; why: string | null } | null>(null);
  const [kit, setKit] = useState<KitColors | null>(null);

  const campo = useRef<HTMLDivElement>(null);
  const jogo = useRef<Estado>({ t0: 0, phase: 0, viva: false, gols: 0, liberado: 0, voo: null, pts: null, shots: [] });

  useEffect(() => { preloadModels(); }, []);
  const carregar = useCallback(() => {
    api.goleada().then((r) => { setSt(r.state); setBoard(r.scoreboard); }).catch(() => {});
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  // o goleiro veste o uniforme do adversário da rodada, como no pênalti e na falta
  useEffect(() => {
    const t = board?.rival?.team;
    if (t) setKit({ primary: t.colorPrimary, secondary: t.colorSecondary, tertiary: t.colorTertiary ?? null, design: t.kitDesign ?? null, gloves: '#e8e8e8', badge: t.slug });
  }, [board?.rival?.team]);

  // ── as contas do jogo (as mesmas de lib/goleada.js) ─────────────────────────
  const entre = (a: number, b: number, f: number) => a + (b - a) * f;
  const dureza = (t: number) => Math.min(1, Math.max(0, t) / (st?.ramp ?? 100_000));
  const reacao = (t: number) => entre(st!.keeper.reactFirst, st!.keeper.reactLast, dureza(t));
  const mergulho = (t: number) => entre(st!.keeper.speedFirst, st!.keeper.speedLast, dureza(t));
  const tempoDeVoo = (power: number, t: number) =>
    Math.round(entre(st!.shot.first, st!.shot.last, dureza(t)) * (1 + st!.shot.powerCut * (0.5 - Math.max(0, Math.min(1, power)))));
  function goleiroEm(t: number) {
    const P0 = st!.keeper.periodFirst, P1 = st!.keeper.periodLast, R = st!.ramp, b = (P1 - P0) / R;
    const ms = Math.max(0, t);
    const ang = ms <= R ? (2 * Math.PI * Math.log(1 + (b * ms) / P0)) / b
      : (2 * Math.PI * Math.log(P1 / P0)) / b + (2 * Math.PI * (ms - R)) / P1;
    return 0.5 + st!.keeper.amp * Math.sin(ang + jogo.current.phase);
  }
  const alcance = (y: number) => st!.keeper.reach * (y > st!.keeper.highFrom ? st!.keeper.highReach : 1);

  // ── o puxão do dedo (leitura da Falta PRO: direção, velocidade e arco) ──────
  const ponto = (e: React.PointerEvent) => {
    const r = campo.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  };
  function pegarBola(e: React.PointerEvent) {
    const g = jogo.current;
    if (!g.viva || g.voo || !st) return;
    if (performance.now() - g.t0 < g.liberado) return;
    g.pts = [ponto(e)];
    setRastro([{ x: g.pts[0].x, y: g.pts[0].y }]);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function puxando(e: React.PointerEvent) {
    const g = jogo.current;
    if (!g.pts) return;
    const p = ponto(e);
    const ult = g.pts[g.pts.length - 1];
    if (Math.hypot(p.x - ult.x, p.y - ult.y) < 2) return;
    g.pts.push(p);
    setRastro((r) => [...r, { x: p.x, y: p.y }].slice(-28));
  }
  function soltar() {
    const g = jogo.current;
    const pts = g.pts;
    g.pts = null;
    setRastro([]);
    if (!pts || !g.viva || g.voo || !st) return;
    const gesto = lerGesto(pts, campo.current!.getBoundingClientRect());
    if (!gesto) return; // puxão curto demais: nem conta como chute
    chutar(gesto, performance.now() - g.t0);
  }
  /** Resume o puxão em { x, y, power, spin } — a mesma leitura da Falta PRO, na boca do gol. */
  function lerGesto(pts: { x: number; y: number; t: number }[], r: DOMRect) {
    if (pts.length < 3) return null;
    const a = pts[0], z = pts[pts.length - 1];
    const dur = z.t - a.t, dx = z.x - a.x, dy = z.y - a.y;
    const L = Math.hypot(dx, dy);
    if (dur < 30 || L < r.height * 0.07 || dy > -r.height * 0.03) return null;
    let caminho = 0;
    for (let i = 1; i < pts.length; i++) caminho += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const lim = (v: number, p: number, q: number) => Math.min(q, Math.max(p, v));
    const power = lim(caminho / dur / (r.height * 0.0042), 0.15, 1); // força = VELOCIDADE do gesto
    const x = 0.5 + lim(dx / (r.width * 0.34), -1, 1) * 0.5;
    const y = lim(-dy / (r.height * 0.5), 0, 1);
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    let dev = 0;
    for (const p of pts) dev += (p.x - a.x) * nx + (p.y - a.y) * ny;
    dev /= pts.length;
    const spin = lim(-dev / (0.12 * L), -1, 1);
    return { x, y, power, spin };
  }

  /** Bate: decide com a mesma conta do servidor e entrega o voo para a cena animar. */
  function chutar(aim: Aim, t: number) {
    const g = jogo.current;
    const T = tempoDeVoo(aim.power, t);
    const from = goleiroEm(t + reacao(t));
    const fora = aim.x < st!.aim.margin || aim.x > 1 - st!.aim.margin || aim.y > 1 - st!.aim.top;
    const lido = aim.x - Math.max(-1, Math.min(1, aim.spin)) * st!.spinEdge; // ele lê a SAÍDA da bola
    const anda = mergulho(t) * (Math.max(0, T - reacao(t)) / 1000);
    const kx = fora ? from : from + Math.max(-anda, Math.min(anda, lido - from));
    const pegou = !fora && Math.abs(kx - aim.x) <= alcance(aim.y);
    const why: 'gol' | 'defendeu' | 'fora' = fora ? 'fora' : pegou ? 'defendeu' : 'gol';

    g.voo = { aim, lido, kx, from, T, why, t0: performance.now(), alto: aim.y > 0.45 };
    g.shots.push({ i: g.shots.length + 1, x: +aim.x.toFixed(4), y: +aim.y.toFixed(4), power: +aim.power.toFixed(3), spin: +aim.spin.toFixed(3), t: Math.round(t) });

    window.setTimeout(() => {
      setAviso(why);
      if (why === 'gol') {
        sound.play('goal');
        g.gols += 1;
        setGols(g.gols);
        if (!recorde && g.gols > (st?.best ?? 0) && (st?.best ?? 0) > 0) setRecorde(true);
      } else sound.play('error');
      window.setTimeout(() => {
        setAviso(null);
        if (why === 'gol') {
          g.voo = null; // a bola volta para o pé
          g.liberado = performance.now() - g.t0 + 120;
        } else {
          g.viva = false;
          terminar();
        }
      }, why === 'gol' ? 700 : 1100);
    }, T + 80);
  }

  async function começar() {
    try {
      const r = await api.goleadaStart();
      const g = jogo.current;
      Object.assign(g, { t0: performance.now(), phase: r.state.phase ?? 0, viva: true, gols: 0, liberado: 700, voo: null, pts: null, shots: [] });
      setSt(r.state); setBoard(r.scoreboard); setGols(0); setRecorde(false); setAperto(0); setAviso(null); setFase('jogando');
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

  // o relógio do HUD (o quanto o goleiro já acelerou): 4x por segundo, não por quadro
  useEffect(() => {
    if (fase !== 'jogando') return;
    const iv = window.setInterval(() => setAperto(dureza(performance.now() - jogo.current.t0)), 250);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, st?.ramp]);
  useEffect(() => () => { jogo.current.viva = false; }, []);

  const total = (board?.mine?.goals ?? 0) + (board?.rival?.goals ?? 0);
  const pctMine = total ? Math.round(((board?.mine?.goals ?? 0) / total) * 100) : 50;
  const jogando = fase === 'jogando';

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-green">GOLEADA</div>
        <div className="trap trap-blue text-[12px] tabular-nums">recorde {st?.best ?? 0}</div>
      </div>

      {/* A cena manda: o HUD encosta nos cantos e nunca cobre a boca do gol. */}
      <div ref={campo} className={`no-drag relative w-full touch-none select-none ${jogando ? 'h-[74vh]' : 'h-[60vh]'}`}
        onPointerDown={pegarBola} onPointerMove={puxando} onPointerUp={soltar} onPointerCancel={soltar}>
        {st ? (
          <Canvas shadows camera={{ position: [0, 1.75, 15.5], fov: 50 }} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ background: 'linear-gradient(#46b4ff, #1f7ae6)' }}>
            <Suspense fallback={null}><Cena jogo={jogo} st={st} kit={kit ?? GK_KIT} /></Suspense>
          </Canvas>
        ) : <div className="flex h-full items-center justify-center"><Spinner /></div>}

        {jogando && (
          <>
            <motion.div key={gols} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 13 }}
              className="pointer-events-none absolute left-3 flex h-12 w-12 items-center justify-center rounded-full bg-grass/95 shadow-[0_3px_0_rgba(0,0,0,.3)]"
              style={{ top: 'calc(var(--sat) + 68px)' }}>
              <span className="t-display text-[22px] leading-none text-white">{gols}</span>
            </motion.div>
            {/* o quanto o goleiro já acelerou — a pastilha escura garante leitura sobre a torcida */}
            <div className="pointer-events-none absolute left-2 flex items-center gap-1 rounded-full bg-navy-deep/65 px-1.5 py-1"
              style={{ top: 'calc(var(--sat) + 124px)' }} title="Velocidade do goleiro">
              <img src="/ui/ico-glove.png" className="h-3.5 w-3.5" alt="" />
              <div className="h-1.5 w-10 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-orange-deep transition-[width] duration-300" style={{ width: `${Math.round(aperto * 100)}%` }} />
              </div>
            </div>
          </>
        )}

        {/* o rastro do dedo: ouro com risco tinta, o mesmo gesto da Falta PRO */}
        {rastro.length > 1 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <polyline points={rastro.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#FFC63D" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            <polyline points={rastro.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#14335F" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
          </svg>
        )}
        {/* aro brilhante sob a bola: é daqui que se puxa (a mesma dica da Falta PRO) */}
        {jogando && !gols && !rastro.length && !aviso && (
          <div className="pointer-events-none absolute left-1/2 top-[57%] -translate-x-1/2 -translate-y-1/2">
            <img src="/ui/glow-circle.png" className="h-24 w-24 animate-pulse opacity-70" alt="" />
            <img src="/ui/pi-next01.png" className="absolute left-1/2 top-0 h-6 w-6 -translate-x-1/2 -translate-y-6 -rotate-90 animate-pulse" alt="" />
          </div>
        )}

        <AnimatePresence>
          {aviso && (
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className={`t-display t-out rounded-2xl bg-navy-deep/70 px-5 py-1 text-[40px] ${aviso === 'gol' ? 't-gold' : 't-red'}`}>
                {aviso === 'gol' ? 'GOL!' : aviso === 'defendeu' ? 'DEFENDEU!' : 'FORA!'}
              </span>
            </motion.div>
          )}
          {recorde && jogando && !aviso && (
            <motion.div initial={{ x: '100%' }} animate={{ x: '-100%' }} transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
              className="pointer-events-none absolute inset-x-0 top-[18%] whitespace-nowrap text-center">
              <span className="t-display t-out text-[20px] text-white">NOVA MAIOR PONTUAÇÃO</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative flex flex-1 flex-col justify-start gap-2 px-3 pb-6 pt-2">
        <div className="stadium-bg" />

        {board?.rival && (
          <div className="relative rounded-xl bg-navy-deep/55 px-3 py-2">
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

        {jogando && (
          <p className="relative px-3 text-center text-[12px] font-extrabold leading-snug text-white/90">
            Puxe o dedo a partir da bola. Mais rápido, mais forte; em arco, a bola faz efeito.
          </p>
        )}

        {fase === 'abrir' && (
          <div className="panel relative text-center text-navy-ink">
            <p className="text-[13px] font-bold leading-snug">
              Puxe o dedo a partir da bola, como na Falta PRO: a direção diz onde, a velocidade do puxão diz a força e o arco põe efeito.
              O goleiro {board?.rival ? `do ${board.rival.team.name}` : 'adversário'} anda de trave a trave e acelera a cada segundo de jogo.
            </p>
            <p className="mt-1 text-[13px] font-bold leading-snug text-muted">
              {st?.goalTarget ?? 10} gols seguidos valem <b className="text-grass-deep">1 gol para o {me.team.name}</b> e {fmt(1400)}. Cada gol dá {st?.pointsPerGoal ?? 3} de nível, até {st?.maxPoints ?? 30}. Na trave ou por cima, acabou.
            </p>
            <p className="mt-1 text-[12px] font-bold text-muted">Seu recorde: {st?.best ? `${st.best} ${st.best === 1 ? 'gol' : 'gols'} seguidos` : 'sem recorde ainda'}</p>
            {st?.finished && !st?.freePlay
              ? <p className="mt-2 text-[13px] font-extrabold text-orange-deep">Você já jogou hoje. A Goleada renova às 22h.</p>
              : <button onClick={começar} className="btn btn-green btn-lg mt-3 w-full">Bater a primeira</button>}
          </div>
        )}

        {fase === 'fim' && fim && (
          <div className="panel relative text-center text-navy-ink">
            <div className="t-display text-[30px] leading-none text-grass-deep">{fim.goals}</div>
            <div className="text-[12px] font-extrabold uppercase tracking-wide text-muted">{fim.goals === 1 ? 'gol' : 'gols seguidos'}</div>
            {fim.record && <div className="t-display mt-1 text-[15px] text-gold-deep">Recorde novo!</div>}
            <p className="mt-1 text-[12px] font-bold text-muted">{fim.why === 'fora' ? 'A última foi para fora.' : 'O goleiro pegou a última.'}</p>
            {fim.goal
              ? <p className="mt-2 text-[13px] font-bold leading-snug">{fim.goal.text}</p>
              : <p className="mt-2 text-[13px] font-bold leading-snug text-muted">Faltaram {Math.max(0, (st?.goalTarget ?? 10) - fim.goals)} para o gol do dia. Amanhã tem mais.</p>}
            <p className="mt-1 text-[12px] font-bold text-muted">+{fim.levelPoints} de nível · recorde: {fim.best}</p>
            <div className="mt-3 flex gap-2">
              {st?.freePlay && <button onClick={começar} className="btn btn-green btn-md flex-1">Jogar de novo</button>}
              <button onClick={() => nav('/')} className="btn btn-blue btn-md flex-1">Voltar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
