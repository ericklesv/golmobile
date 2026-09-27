import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KickArrowButton } from './KickArrows';
import { somaChute, demo } from '../lib/demo';
import { track } from '../lib/track';

/**
 * Pênalti jogável da tela de entrada — chutar ANTES de criar conta (27/09/2026; o porquê está em lib/demo.ts).
 *
 * Regras que esta tela respeita:
 *  - **Sem three.js.** A cena 3D do pênalti de verdade são ~1 MB, separados de propósito em 25/09 para a página
 *    inicial abrir leve (SEO). Aqui é SVG desenhado à mão + dois elementos animados: zero download a mais.
 *  - **Nada de `motion.g` com x/y dentro do `<svg>`** (a bola da Trilha ficou presa no canto 0,0 assim): o gol é
 *    um SVG de fundo e a bola e o goleiro são `<div>` por cima, posicionados em % e animados pelo framer-motion.
 *  - As direções e as setas são as MESMAS do pênalti de verdade (screens/Penalty.tsx, components/KickArrows.tsx):
 *    quem cria a conta encontra a interface que já aprendeu aqui.
 *  - **O gol daqui não vale no jogo** e o texto diz isso. Dar gol de verdade a quem se cadastra mexeria na
 *    artilharia e no placar da rodada — isso é decisão do dono, não desta tela.
 */
type Dir = 'left' | 'up' | 'right';
type Fase = 'parado' | 'voando' | 'gol' | 'defesa';

const DIRS: Dir[] = ['left', 'up', 'right'];
/** Onde a bola termina (% do quadro). O meio ("up") é mais alto: é o chute por cima do goleiro. */
const ALVO: Record<Dir, { x: number; y: number }> = {
  left: { x: 21, y: 32 },
  up: { x: 50, y: 24 },
  right: { x: 79, y: 32 },
};
/** Para onde o goleiro vai. No meio ele não sai do lugar — sobe as mãos. */
const GOLEIRO: Record<Dir, { x: number; y: number; rot: number }> = {
  left: { x: 25, y: 46, rot: -64 },
  up: { x: 50, y: 44, rot: 0 },
  right: { x: 75, y: 46, rot: 64 },
};
const VOO_MS = 780;

function Campo() {
  const malha = [];
  for (let x = 59; x < 256; x += 13) malha.push(<line key={'v' + x} x1={x} y1="47" x2={x} y2="137" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.7" />);
  for (let y = 58; y < 137; y += 11) malha.push(<line key={'h' + y} x1="47" y1={y} x2="256" y2={y} stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.7" />);
  return (
    <svg viewBox="0 0 300 200" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="dp-ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fc8f5" /><stop offset="1" stopColor="#bdeaff" /></linearGradient>
        <linearGradient id="dp-grama" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f9f3c" /><stop offset="1" stopColor="#2b7a2b" /></linearGradient>
        <linearGradient id="dp-rede" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c2740" stopOpacity="0.5" /><stop offset="1" stopColor="#0c2740" stopOpacity="0.26" /></linearGradient>
      </defs>
      <rect width="300" height="200" fill="url(#dp-ceu)" />
      {/* arquibancada: só faixas de torcida, é fundo */}
      <rect y="6" width="300" height="38" fill="#1b3f6b" />
      <rect y="6" width="300" height="13" fill="#14335f" />
      {Array.from({ length: 30 }, (_, i) => (
        <circle key={i} cx={6 + i * 10} cy={i % 2 ? 28 : 35} r="3.2" fill={i % 3 ? '#f2c200' : '#ff7a2f'} fillOpacity="0.7" />
      ))}
      <rect y="44" width="300" height="156" fill="url(#dp-grama)" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} y={44 + i * 26} width="300" height="13" fill="#ffffff" fillOpacity="0.05" />
      ))}
      {/* rede */}
      <rect x="47" y="47" width="209" height="90" fill="url(#dp-rede)" />
      {malha}
      {/* trave */}
      <rect x="38" y="38" width="9" height="101" rx="4" fill="#ffffff" />
      <rect x="256" y="38" width="9" height="101" rx="4" fill="#ffffff" />
      <rect x="38" y="38" width="227" height="9" rx="4" fill="#ffffff" />
      {/* grande área e marca do pênalti */}
      <path d="M8 184 L8 145 L294 145 L294 184" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2.4" />
      <circle cx="151" cy="172" r="3" fill="#ffffff" fillOpacity="0.9" />
    </svg>
  );
}

/** Bola de futebol clássica. O `/ui/ico-ball.png` do kit é um ícone de menu, não serve como bola em campo. */
export function Bola({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={`h-full w-full ${className}`} aria-hidden>
      <circle cx="20" cy="20" r="18" fill="#ffffff" stroke="#12324f" strokeWidth="2.6" />
      <path d="M20 9.2 L28.4 15.3 L25.2 25.2 L14.8 25.2 L11.6 15.3 Z" fill="#12324f" />
      <path d="M20 9.2 L20 2.4 M28.4 15.3 L34.8 11.4 M25.2 25.2 L29.4 32.9 M14.8 25.2 L10.6 32.9 M11.6 15.3 L5.2 11.4"
        stroke="#12324f" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}

/** Goleiro de uniforme clássico — as mesmas cores do goleiro 3D (GK_KIT em screens/Penalty.tsx). */
function Goleiro() {
  return (
    <svg viewBox="0 0 60 80" className="h-full w-full drop-shadow-[0_3px_5px_rgba(0,0,0,0.45)]" aria-hidden>
      <rect x="4" y="26" width="52" height="13" rx="6" fill="#f2c200" stroke="#14335F" strokeWidth="3" />
      <circle cx="8" cy="32" r="8" fill="#e8e8e8" stroke="#14335F" strokeWidth="3" />
      <circle cx="52" cy="32" r="8" fill="#e8e8e8" stroke="#14335F" strokeWidth="3" />
      <rect x="20" y="24" width="20" height="31" rx="8" fill="#f2c200" stroke="#14335F" strokeWidth="3" />
      <circle cx="30" cy="16" r="10" fill="#f7c9a0" stroke="#14335F" strokeWidth="3" />
      <rect x="22" y="53" width="7" height="22" rx="3.5" fill="#14335F" />
      <rect x="31" y="53" width="7" height="22" rx="3.5" fill="#14335F" />
    </svg>
  );
}

export function DemoPenalti({ onGol }: { onGol?: () => void }) {
  const [fase, setFase] = useState<Fase>('parado');
  const [dir, setDir] = useState<Dir>('up');
  const [gk, setGk] = useState<Dir>('up');
  const [gols, setGols] = useState(() => demo()?.gols ?? 0);
  const [chutes, setChutes] = useState(() => demo()?.chutes ?? 0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  function chutar(d: Dir) {
    if (fase === 'voando') return;
    // o PRIMEIRO chute do aparelho é gol (o goleiro vai para um canto diferente): é a recepção de quem acabou
    // de clicar no anúncio. Do segundo em diante o goleiro sorteia de verdade — 1 em 3 de defesa.
    const g = chutes === 0
      ? DIRS.filter((x) => x !== d)[Math.floor(Math.random() * 2)]
      : DIRS[Math.floor(Math.random() * 3)];
    const foiGol = g !== d;
    setDir(d); setGk(g); setFase('voando');
    setChutes((n) => n + 1);
    somaChute(foiGol);
    track('demo.chutou', { dir: d, gol: foiGol, n: chutes + 1 });
    timers.current.push(window.setTimeout(() => {
      setFase(foiGol ? 'gol' : 'defesa');
      if (foiGol) { setGols((n) => n + 1); onGol?.(); }
      else timers.current.push(window.setTimeout(() => setFase('parado'), 1500));
    }, VOO_MS));
  }

  const voando = fase !== 'parado';
  const bola = voando ? ALVO[dir] : { x: 50, y: 86 };
  const gkPos = voando ? GOLEIRO[gk] : { x: 50, y: 50, rot: 0 };

  return (
    <div className="relative mt-4">
      <div className="mb-2 flex justify-center">
        <div className="ribbon ribbon-orange">{gols > 0 ? `VOCÊ FEZ ${gols} ${gols === 1 ? 'GOL' : 'GOLS'}` : 'CHUTE AGORA — SEM CADASTRO'}</div>
      </div>

      <div className="panel overflow-hidden p-0">
        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-t-[14px]">
          <Campo />

          <motion.div
            className="absolute"
            style={{ width: '20%', height: '35%', marginLeft: '-10%', marginTop: '-17.5%' }}
            animate={{ left: `${gkPos.x}%`, top: `${gkPos.y}%`, rotate: gkPos.rot, scale: voando && gk === 'up' ? 1.1 : 1 }}
            transition={{ duration: 0.34, delay: voando ? 0.14 : 0, ease: 'easeOut' }}
          >
            <Goleiro />
          </motion.div>

          <motion.div
            className="absolute drop-shadow-[0_2px_5px_rgba(0,0,0,0.45)]"
            style={{ width: '8.5%', aspectRatio: '1', marginLeft: '-4.25%', marginTop: '-4.25%' }}
            animate={{ left: `${bola.x}%`, top: `${bola.y}%`, scale: voando ? 0.66 : 1, rotate: voando ? 420 : 0 }}
            transition={{ duration: voando ? VOO_MS / 1000 : 0.25, ease: voando ? 'easeOut' : 'easeInOut' }}
          >
            <Bola />
          </motion.div>

          {fase === 'gol' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-navy/30">
              {/* só a comemoração aqui: a bola no fundo da rede continua visível. A explicação vai abaixo do painel */}
              <motion.div initial={{ scale: 0.45, rotate: -8 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 14 }} className="t-display t-out t-green text-6xl">GOL!</motion.div>
            </motion.div>
          )}
          {fase === 'defesa' && (
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-navy/45">
              <div className="t-display t-out text-3xl">DEFENDEU!</div>
              <div className="t-display t-out text-[12px]">Escolha outro canto</div>
            </motion.div>
          )}
        </div>

        <div className="flex items-end justify-around px-2 py-3">
          {DIRS.map((d) => (
            <KickArrowButton key={d} dir={d} onClick={() => chutar(d)} disabled={fase === 'voando'}
              label={d === 'left' ? 'esquerda' : d === 'up' ? 'meio' : 'direita'} />
          ))}
        </div>
      </div>

      {gols > 0 ? (
        <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-3 flex flex-col gap-2">
          <Link to="/cadastro" onClick={() => track('demo.cta', { gols })} className="btn btn-orange btn-lg w-full">Quero que meus gols valham</Link>
          <p className="t-display t-out text-center text-[11px] leading-tight">Aqui foi treino. Com a sua conta, cada gol soma no placar do seu clube na rodada — é grátis e leva menos de um minuto.</p>
        </motion.div>
      ) : (
        <p className="t-display t-out mt-2 text-center text-[12px] leading-tight">Toque numa seta e cobre o pênalti. Não precisa de conta para experimentar.</p>
      )}
    </div>
  );
}
