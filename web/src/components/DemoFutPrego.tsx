import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import type { DemoPregoPartida, DemoPregoJogada, DemoPregoGks } from '../lib/types';
import { PregoBoard, PregoBall, type PregoBoardData } from './PregoBoard';
import { sound } from '../lib/sound';
import { somaChute, demo } from '../lib/demo';
import { track } from '../lib/track';

/**
 * FutPrego jogável da tela de entrada — o peteleco que dá para dar SEM criar conta (dono, 27/09/2026: "vamos
 * colocar um futprego, porém com um mapa mais aberto e que o usuário consiga até fazer gol de primeira se acertar
 * bem; também, contra um bot ruim"). O porquê de existir uma demonstração está em `lib/demo.ts`.
 *
 * **É o FutPrego de verdade**: a mesma tábua de `components/PregoBoard.tsx` que o X1 desenha, a mesma física
 * (`api/src/lib/futprego.js` por `/api/demo/futprego`) e o MESMO gesto do jogo — estilingue: arrasta e a bola vai
 * para o lado contrário, com a linha marrom do puxão e a tracejada branca da direção. Quem migrar daqui para o X1
 * não reaprende nada.
 *
 * O que muda: a tábua é ABERTA e só desta tela (`TABUA_ABERTA` em `routes/demo.js`, conferida por
 * `scripts/demo-tabua-balance.js`: o tiro reto no gol entra e 10,6% das miras dão gol de primeira), o adversário é
 * um bot ruim de propósito, e **o primeiro gol seu encerra** e abre o convite. Nada disso conta para o jogo.
 *
 * **Celular:** o arrasto aqui NÃO pode rolar a página. Por isso a tábua leva `no-drag` (a rolagem por arraste do PC
 * é global, `lib/dragScroll.ts`, e só respeita essa classe), `touch-none` (vem do PregoBoard) e `preventDefault` em
 * todo movimento com o dedo apoiado. Foi exatamente o que faltou na versão anterior desta tela.
 */
type Fase = 'jogando' | 'animando' | 'convite';
type Aim = { sx: number; sy: number; power: number };

const MAX_PULL = 120; // o mesmo do X1 (screens/X1.tsx): arrasto em unidades da tábua para a força máxima
const powerColor = (p: number) => (p > 0.8 ? '#F0413E' : p > 0.45 ? '#FFC63D' : '#7DFF5C');
const EU = { primary: '#2EA8FF', secondary: '#123C8A' };
const BOT = { primary: '#F0413E', secondary: '#7A1F1D' };

/** O goleiro na boca do gol: peça redonda na cor do time, maior que os pregos. Bate na bola como um prego. */
function Goleiro({ gk, cor }: { gk: { x: number; y: number; r: number }; cor: { primary: string; secondary: string } }) {
  return (
    <g transform={`translate(${gk.x} ${gk.y})`} pointerEvents="none">
      <ellipse cx="1.4" cy="2.2" rx={gk.r} ry={gk.r * 0.8} fill="#000" opacity="0.28" />
      <circle r={gk.r} fill={cor.primary} stroke={cor.secondary} strokeWidth="2.4" />
      <circle r={gk.r} fill="url(#fp-metal)" />
      <circle r={gk.r * 0.42} fill={cor.secondary} opacity="0.9" />
    </g>
  );
}

export function DemoFutPrego({ onGol }: { onGol?: () => void }) {
  const [jogo, setJogo] = useState<DemoPregoPartida | null>(null);
  const [bola, setBola] = useState({ x: 150, y: 230 });
  const [gks, setGks] = useState<DemoPregoGks | null>(null);
  const [aim, setAim] = useState<Aim | null>(null);
  const [fase, setFase] = useState<Fase>('jogando');
  const [golsBot, setGolsBot] = useState(0);
  const [aviso, setAviso] = useState<{ texto: string; bom: boolean } | null>(null);
  const [erroRede, setErroRede] = useState(false);
  const arrasto = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const raf = useRef(0);
  const vivo = useRef(true);
  // o `vivo` precisa voltar a true ao montar: o StrictMode do dev monta, desmonta e monta de novo, e só com o
  // cleanup a tela ficava marcada como morta e descartava toda resposta do servidor.
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; cancelAnimationFrame(raf.current); }; }, []);

  function novaPartida() {
    api.demoPrego()
      .then((p) => { if (!vivo.current) return; setJogo(p); setBola(p.ball); setGks(p.keepers); setGolsBot(p.golsBot); setErroRede(false); setFase('jogando'); })
      .catch(() => { if (vivo.current) setErroRede(true); });
  }
  useEffect(() => { novaPartida(); }, []);

  /** Ponto do dedo em coordenadas da tábua (o SVG faz a conta com a própria matriz). */
  function naTabua(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current!, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }
  function miraDe(e: React.PointerEvent<SVGSVGElement>): Aim | null {
    if (!arrasto.current) return null;
    const p = naTabua(e);
    const dx = p.x - arrasto.current.x, dy = p.y - arrasto.current.y;
    const len = Math.hypot(dx, dy);
    if (len < 4) return null;
    return { sx: -dx / len, sy: -dy / len, power: Math.min(1, len / MAX_PULL) }; // estilingue, como no X1
  }
  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (fase !== 'jogando' || !jogo) return;
    e.preventDefault(); // sem isto o dedo arrasta a PÁGINA junto com a mira
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = naTabua(e);
    setAim(null);
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!arrasto.current) return;
    e.preventDefault();
    setAim(miraDe(e));
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    if (!arrasto.current) return;
    e.preventDefault();
    const a = miraDe(e) ?? aim;
    arrasto.current = null;
    setAim(null);
    if (a && a.power >= 0.06) petelecar(a);
  }

  /** Anima uma sequência de quadros (30 por segundo, como o servidor manda) e chama `depois`. */
  function animar(frames: number[][], depois: () => void) {
    const t0 = performance.now();
    const passo = () => {
      if (!vivo.current) return;
      const k = Math.floor((performance.now() - t0) / (1000 / 30));
      if (k >= frames.length) { const f = frames[frames.length - 1]; setBola({ x: f[0], y: f[1] }); depois(); return; }
      setBola({ x: frames[k][0], y: frames[k][1] });
      raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
  }

  async function petelecar(a: Aim) {
    if (!jogo) return;
    setFase('animando');
    sound.play('tap');
    try {
      const r = await api.demoPregoFlick({ id: jogo.id, dx: a.sx, dy: a.sy, power: a.power });
      if (!vivo.current) return;
      somaChute(r.meu.goal === 'top');
      track('demo.chutou', { gol: r.meu.goal === 'top', res: r.meu.goal ?? 'nada' });
      setGks(r.keepersMeu);
      animar(r.meu.frames, () => {
        if (r.meu.goal === 'top') { // GOL: é o que a demonstração queria
          sound.play('goal');
          setAviso({ texto: 'GOLAÇO!', bom: true });
          window.setTimeout(() => { if (vivo.current) { setAviso(null); setFase('convite'); onGol?.(); } }, 1200);
          return;
        }
        if (r.meu.goal === 'bottom') { sound.play('error'); setAviso({ texto: 'GOL CONTRA!', bom: false }); }
        depoisDoMeu(r);
      });
    } catch {
      if (!vivo.current) return;
      setFase('jogando');
      novaPartida();
    }
  }

  function depoisDoMeu(r: DemoPregoJogada) {
    window.setTimeout(() => {
      if (!vivo.current || !r.bot) return;
      setAviso(null);
      setGks(r.keepersBot);
      animar(r.bot.frames, () => {
        if (r.bot?.goal === 'top') { // gol contra do bot: o gol é seu
          sound.play('goal');
          setAviso({ texto: 'GOLAÇO!', bom: true });
          window.setTimeout(() => { if (vivo.current) { setAviso(null); setFase('convite'); onGol?.(); } }, 1200);
          return;
        }
        if (r.bot?.goal === 'bottom') { sound.play('error'); setAviso({ texto: 'O BOT MARCOU!', bom: false }); }
        setGolsBot(r.golsBot);
        setGks(r.keepers);
        window.setTimeout(() => { if (vivo.current) { setAviso(null); setFase('jogando'); } }, r.bot?.goal ? 1100 : 120);
      });
    }, r.meu.goal ? 900 : 120);
  }

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
          <p className="mt-2 text-[14px] font-extrabold leading-snug">Escolha seu time e jogue contra <b>adversários reais</b>: no X1 este mesmo FutPrego é ao vivo, contra outros jogadores, valendo gol para o seu clube.</p>
          <Link to="/cadastro" onClick={() => track('demo.cta', { gols: demo()?.gols ?? 1 })} className="btn btn-orange btn-lg mt-4 w-full">Escolher meu time</Link>
          <button onClick={novaPartida} className="btn btn-gray btn-sm mt-2 w-full no-drag">Jogar de novo</button>
        </div>
      </motion.div>
    );
  }

  const podeMirar = fase === 'jogando';
  return (
    <div className="relative mt-4">
      <div className="mb-2 flex justify-center">
        <div className="ribbon ribbon-orange">CHUTE AGORA — SEM CADASTRO</div>
      </div>

      {erroRede || !jogo ? (
        <div className="panel flex h-[40vh] items-center justify-center">
          <span className="t-display text-[15px] text-navy-ink">{erroRede ? 'Não deu para carregar a partida.' : 'Montando a tábua…'}</span>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-center gap-3">
            <span className="trap trap-blue text-[13px]">VOCÊ 0</span>
            <span className="t-display t-out text-[13px]">×</span>
            <span className="trap trap-orange text-[13px]">{golsBot} BOT</span>
          </div>

          <div className="relative mx-auto h-[46vh] min-h-[260px] max-h-[420px] max-w-[380px]">
            <PregoBoard
              ref={svgRef}
              board={jogo.board as PregoBoardData}
              paint={[EU, BOT]}
              className="no-drag h-full w-full"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              ball={<>
                {gks && <Goleiro gk={gks.top} cor={BOT} />}
                {gks && <Goleiro gk={gks.bottom} cor={EU} />}
                <g transform={`translate(${bola.x} ${bola.y})`}><PregoBall r={jogo.board.ball} /></g>
              </>}
              overlay={aim && podeMirar ? (
                <g pointerEvents="none">
                  <line x1={bola.x} y1={bola.y} x2={bola.x - aim.sx * aim.power * 38} y2={bola.y - aim.sy * aim.power * 38} stroke="#5B3A1A" strokeWidth="3" strokeLinecap="round" />
                  <line x1={bola.x} y1={bola.y} x2={bola.x + aim.sx * (26 + aim.power * 110)} y2={bola.y + aim.sy * (26 + aim.power * 110)} stroke="#FFFFFF" strokeWidth="2.6" strokeDasharray="2 6" strokeLinecap="round" />
                  <circle cx={bola.x} cy={bola.y} r={jogo.board.ball + 5} fill="none" stroke={powerColor(aim.power)} strokeWidth="2.5" />
                </g>
              ) : null}
            />
            {aviso && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className={`t-display t-out rounded-2xl bg-navy-deep/70 px-5 py-1 text-[34px] ${aviso.bom ? 't-gold' : 't-red'}`}>{aviso.texto}</span>
              </motion.div>
            )}
          </div>

          <div className="panel mt-3 text-center text-navy-ink">
            <p className="t-display text-[16px]">{aim ? `Força ${Math.round(aim.power * 100)}%` : podeMirar ? 'Puxe e solte para dar o peteleco' : 'A bola está rolando…'}</p>
            <p className="mt-1 text-[12px] font-bold text-muted">Arraste para trás: a bola vai para o lado contrário. Você ataca o gol de cima — faça 1 gol e veja o que ele vale.</p>
            <p className="mt-1 text-[13px] font-extrabold text-navy-ink">Escolha seu time e jogue contra adversários reais.</p>
          </div>
        </>
      )}
    </div>
  );
}
