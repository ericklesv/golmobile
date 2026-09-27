import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import type { DemoHattrickResult, DemoHattrickShot } from '../lib/types';
import { sound } from '../lib/sound';
import { somaChute, demo } from '../lib/demo';
import { track } from '../lib/track';
import { VB, TOUCH_R, MAX_DRAG, RESULT_TEXT, Pitch, Keeper, FieldBall, AimArrow, Hud, StrikeScene, ballAt, keeperAt, type Aim } from './hattrickView';

/**
 * O chute de longe jogável da tela de entrada — o Hat Trick, SEM criar conta (dono, 27/09/2026: "algo mais
 * interativo como o Hat Trick, porém deixe apenas 1 gol; se o usuário fizer o gol, vá para a tela de 'faça seus
 * gols contarem'"). O porquê de existir uma demonstração está em `lib/demo.ts`.
 *
 * **É o Hat Trick de verdade**: a mesma vista de `components/hattrickView.tsx` que `screens/Hattrick.tsx` desenha
 * (campo em metros, goleiro, mira em estilingue, a tela da batida) e a mesma física no servidor
 * (`api/src/lib/hattrick.js`, por `/api/demo/hattrick`). O resultado NUNCA sai do cliente: o goleiro daquele lance
 * fica no servidor, como manda a casa.
 *
 * O que muda em relação ao jogo: não há vidas nem partida do dia — errou, vem outro lance na hora; e **o primeiro
 * gol encerra a demonstração** e abre o convite para criar a conta. O gol daqui não conta para ninguém.
 */
type Fase = 'mira' | 'batida' | 'voo' | 'convite';
type Voo = { res: DemoHattrickResult; t0: number; dur: number };

export function DemoHatTrick({ onGol }: { onGol?: () => void }) {
  const [shot, setShot] = useState<DemoHattrickShot | null>(null);
  const [fase, setFase] = useState<Fase>('mira');
  const [aim, setAim] = useState<Aim | null>(null);
  const [voo, setVoo] = useState<Voo | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; bom: boolean } | null>(null);
  const [dica, setDica] = useState<string | null>(null);
  const [erroRede, setErroRede] = useState(false);
  const [chutes, setChutes] = useState(() => demo()?.chutes ?? 0);
  const [, setTick] = useState(0);
  const travada = useRef<Aim | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrastando = useRef(false);
  const vivo = useRef(true);
  // o `vivo` PRECISA voltar a true ao montar: o StrictMode do dev monta, desmonta e monta de novo, e sem isto o
  // cleanup da primeira vez deixava tudo marcado como morto — a tela ficava presa em "Preparando o chute…" para
  // sempre, porque toda resposta do servidor era descartada.
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  function novoLance() {
    api.demoHattrick()
      .then((s) => { if (vivo.current) { setShot(s); setErroRede(false); } })
      .catch(() => { if (vivo.current) setErroRede(true); });
  }
  useEffect(() => { novoLance(); }, []);

  // relógio do voo: redesenha a cada quadro enquanto a bola anda
  useEffect(() => {
    if (!voo) return;
    let raf = 0;
    const loop = () => {
      setTick((n) => n + 1);
      if (performance.now() - voo.t0 < voo.dur * 1000) raf = requestAnimationFrame(loop);
      else terminaVoo(voo.res);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [voo]);

  // ── mira (estilingue), igual à do jogo ────────────────────────────────────
  function paraOCampo(e: RPointerEvent) {
    const svg = svgRef.current!, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }
  function onDown(e: RPointerEvent<SVGSVGElement>) {
    if (fase !== 'mira' || !shot) return;
    const p = paraOCampo(e);
    if (Math.hypot(p.x - shot.ball.x, p.y - shot.ball.y) > TOUCH_R) { setDica('Toque NA BOLA e puxe pra trás.'); return; }
    arrastando.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDica(null);
    setAim({ dirX: 0, dirY: -1, power: 0, valid: false, drag: { x: 0, y: 0 } });
  }
  function onMove(e: RPointerEvent<SVGSVGElement>) {
    if (!arrastando.current || !shot) return;
    const p = paraOCampo(e);
    const dx = p.x - shot.ball.x, dy = p.y - shot.ball.y, len = Math.hypot(dx, dy);
    const power = Math.min(1, len / MAX_DRAG);
    const dirX = len ? -dx / len : 0, dirY = len ? -dy / len : -1; // a bola vai para o lado oposto ao puxão
    setAim({ dirX, dirY, power, valid: power >= 0.1 && dirY < -0.05, drag: { x: dx, y: dy } });
  }
  function onUp() {
    if (!arrastando.current) return;
    arrastando.current = false;
    const a = aim;
    setAim(null);
    if (!a) return;
    if (a.power < 0.1) { setDica('Puxe mais para dar força.'); return; }
    if (!a.valid) { setDica('Puxe para trás, para o lado contrário do gol.'); return; }
    travada.current = a;
    setFase('batida');
  }

  // ── batida → chute ────────────────────────────────────────────────────────
  async function chutar(strike: { sx: number; sy: number } | null) {
    const a = travada.current;
    if (!a || !shot) return;
    try {
      const res = await api.demoHattrickShoot({ id: shot.id, dirX: a.dirX, dirY: a.dirY, power: a.power, strike });
      if (!vivo.current) return;
      sound.play('tap');
      setChutes((n) => n + 1);
      somaChute(res.result === 'goal');
      track('demo.chutou', { gol: res.result === 'goal', res: res.result, n: chutes + 1 });
      if (res.result === 'whiff') { setFase('mira'); terminaVoo(res); return; }
      setFase('voo');
      setVoo({ res, t0: performance.now(), dur: res.flight.T + 0.65 });
    } catch {
      if (!vivo.current) return;
      setFase('mira');
      setDica('Não deu para chutar agora. Tente de novo.');
      novoLance();
    }
  }

  function terminaVoo(res: DemoHattrickResult) {
    const gol = res.result === 'goal';
    sound.play(gol ? 'goal' : 'error');
    setAviso({ texto: RESULT_TEXT[res.result], bom: gol });
    window.setTimeout(() => {
      if (!vivo.current) return;
      setAviso(null);
      setVoo(null);
      if (gol) { setFase('convite'); onGol?.(); return; } // 1 gol basta: é o convite que interessa
      setFase('mira');
      novoLance(); // errou, vem outro lance na hora — sem vidas, sem espera
    }, 1300);
  }

  // ── desenho ───────────────────────────────────────────────────────────────
  const t = voo ? (performance.now() - voo.t0) / 1000 : 0;
  const bola = voo ? ballAt(voo.res, t) : shot ? { x: shot.ball.x, y: shot.ball.y, z: 0 } : null;
  const goleiroX = voo ? keeperAt(voo.res.flight, t) : 0;

  if (fase === 'convite') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative mt-4">
        <div className="mb-2 flex justify-center"><div className="ribbon ribbon-green text-[18px]">GOLAÇO!</div></div>
        <div className="panel text-center text-navy-ink">
          <div className="t-display text-[22px] leading-tight">Faça seus gols contarem</div>
          <p className="mt-2 text-[14px] font-extrabold leading-snug">
            Crie sua conta grátis: cada gol seu entra na <b>artilharia</b> e soma no <b>placar do seu time</b> na
            disputa online da rodada, que fecha todo dia às 19h.
          </p>
          <p className="mt-1 text-[12px] font-bold text-muted">Escolha um dos 48 clubes e jogue pela Série A, B ou C.</p>
          <Link to="/cadastro" onClick={() => track('demo.cta', { gols: demo()?.gols ?? 1 })} className="btn btn-orange btn-lg mt-4 w-full">Escolher meu time</Link>
          <button onClick={() => { setFase('mira'); novoLance(); }} className="btn btn-gray btn-sm mt-2 w-full">Chutar de novo</button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="relative mt-4">
      <div className="mb-2 flex justify-center">
        <div className="ribbon ribbon-orange">CHUTE AGORA — SEM CADASTRO</div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border-4 border-navy-deep shadow-lg">
        {erroRede || !shot ? (
          <div className="flex aspect-square w-full items-center justify-center bg-[#1c8a4c]">
            <span className="t-display t-out text-[15px]">{erroRede ? 'Não deu para carregar o chute.' : 'Preparando o chute…'}</span>
          </div>
        ) : (
          <>
            <svg ref={svgRef} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="block w-full touch-none select-none"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              role="img" aria-label="Campo: toque na bola e puxe pra trás para chutar">
              <Pitch />
              <Keeper x={goleiroX} lean={voo?.res.flight.keeper ? Math.max(-1, Math.min(1, goleiroX / 3)) : 0} />
              {bola && <FieldBall x={bola.x} y={bola.y} z={bola.z} spin={t * 900} />}
              {aim && <AimArrow from={shot.ball} aim={aim} />}
              {fase === 'mira' && !aim && !voo && !aviso && (
                <circle cx={shot.ball.x} cy={shot.ball.y} r={2.2} fill="none" stroke="#FFC63D" strokeWidth="0.3"
                  className="animate-ping" style={{ transformOrigin: 'center', transformBox: 'fill-box' }} />
              )}
            </svg>
            <Hud wind={shot.wind} />
            {aviso && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className={`t-display t-out rounded-2xl bg-navy-deep/70 px-5 py-1 text-[42px] ${aviso.bom ? 't-gold' : 't-red'}`}>{aviso.texto}</span>
              </motion.div>
            )}
            {fase === 'batida' && <StrikeScene onDone={(s) => { setFase('voo'); chutar(s); }} />}
          </>
        )}
      </div>

      <div className="panel mt-3 text-center text-navy-ink">
        {aim ? (
          <p className="t-display text-[18px]">{aim.valid ? `Força ${Math.round(aim.power * 100)}%` : 'Puxe pra trás, longe do gol'}</p>
        ) : (
          <p className="text-[14px] font-extrabold leading-snug">{dica ?? 'Toque na bola e puxe pra trás: a seta mostra a direção e a força. Depois, toque em cima da bola que passa.'}</p>
        )}
        <p className="mt-1 text-[12px] font-bold text-muted">Faça 1 gol para ver o que ele vale. Não precisa de conta para experimentar.</p>
      </div>
    </div>
  );
}
