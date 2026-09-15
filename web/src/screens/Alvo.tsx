import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { AlvoKind, AlvoPiece, AlvoState } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';

/**
 * Alvo no Gol — batalha naval no gol. A grade (6 x 4) esconde goleiro, zagueiros e cones em
 * posições que só o servidor conhece; cada toque numa casa é um POST shot e a resposta diz
 * vazio / acertou / derrubou. As casas de uma peça só chegam quando ela caiu (ou no fim,
 * para revelar o gol). Derrubar tudo = gol + 30 de nível; 8 casas = gol; 2 por casa.
 */
const FLASH_MS = 700;

const PIECE_LABEL: Record<AlvoKind, string> = { goleiro: 'o goleiro', zagueiro: 'um zagueiro', cone: 'um cone' };

/** Ícone da peça: luva e boneco vêm do pack; o cone é um traço simples no mesmo estilo. */
function PieceIcon({ kind, className = 'h-6 w-6' }: { kind: AlvoKind; className?: string }) {
  if (kind === 'goleiro') return <img src="/ui/ico-glove.png" alt="" className={`${className} object-contain drop-shadow`} />;
  if (kind === 'zagueiro') return <img src="/ui/ico-member.png" alt="" className={`${className} object-contain drop-shadow`} />;
  return (
    <svg viewBox="0 0 24 24" className={`${className} drop-shadow`} aria-hidden>
      <path d="M9 4h6l3 15H6z" fill="#ff8a2a" stroke="#7a3a00" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.3 9.5h7.4M7.4 14h9.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="18.5" width="18" height="3" rx="1.2" fill="#ff8a2a" stroke="#7a3a00" strokeWidth="1.6" />
    </svg>
  );
}

type Flash = { index: number; kind: 'miss' | 'hit' | 'sunk'; text: string };

export function AlvoScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [game, setGame] = useState<AlvoState | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const flashTimer = useRef<number | null>(null);

  function load() {
    api.alvo().then((r) => setGame(r.state)).catch((e) => {
      toast((e as Error).message, 'error');
      if (e instanceof ApiError && e.code === 'locked') nav('/', { replace: true });
    });
  }
  useEffect(() => { load(); return () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }; }, []);

  const finished = !!game?.finished;
  const cols = game?.cols ?? 6;
  const rows = game?.rows ?? 4;
  const cells = cols * rows;
  const shotAt = new Map((game?.shots ?? []).map((s) => [s.index, s]));
  // casa -> peça, só do que o servidor já revelou (peça derrubada ou fim de jogo)
  const pieceAt = new Map<number, AlvoPiece>();
  for (const p of game?.pieces ?? []) for (const c of p.cells ?? []) pieceAt.set(c, p);

  function showFlash(f: Flash) {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlash(f);
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
  }

  async function shoot(index: number) {
    if (!game || busy || finished || shotAt.has(index)) return;
    setBusy(true);
    sound.play('tap');
    try {
      const r = await api.alvoShot(index, game.day);
      setGame(r.state);
      if (r.sunk) { sound.play('coin'); showFlash({ index, kind: 'sunk', text: `Caiu ${PIECE_LABEL[r.sunk.kind]}!` }); }
      else if (r.hit) { sound.play('pop'); showFlash({ index, kind: 'hit', text: 'Acertou!' }); }
      else { sound.play('error'); showFlash({ index, kind: 'miss', text: 'Vazio' }); }
      if (r.state.finished) finish(r.state);
    } catch (e) {
      if (e instanceof ApiError && ['day-changed', 'finished', 'repeated'].includes(e.code)) { toast(e.message); load(); }
      else toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  function finish(s: AlvoState) {
    refresh();
    if (s.reward?.goal) window.setTimeout(() => setOverlay(true), 900);
  }

  const hits = game?.hits ?? 0;
  const occupied = game?.occupied ?? 10;
  const goalAt = game?.goalAt ?? 8;
  const shotsLeft = game?.shotsLeft ?? 14;
  const pointsNow = game ? (game.reward ? game.reward.levelPoints : hits * game.pointsPerHit) : 0;
  const missing = Math.max(0, goalAt - hits);

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal title="GOOOL!!!" text={game?.reward?.text ?? undefined} levelPoints={game?.reward?.levelPoints} team={me.team} onClose={() => setOverlay(false)} />

      <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-orange text-[17px]"><img src="/ui/ico-target.png" className="mr-1.5 h-6 w-6" alt="" />ALVO NO GOL</div>
        <div className={`trap ${shotsLeft <= 3 && !finished ? 'trap-orange' : 'trap-blue'} text-[13px] tabular-nums`}>{game ? `${shotsLeft} ${shotsLeft === 1 ? 'chute' : 'chutes'}` : '…'}</div>
      </div>

      <div className="panel-navy relative mx-3 mt-1 flex items-center justify-between py-2">
        <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-extrabold uppercase text-white/75">acertos</span><span className={`t-display text-[22px] ${hits >= goalAt ? 't-green' : 't-out'}`}>{hits}/{occupied}</span></div>
        <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-extrabold uppercase text-white/75">derrubados</span><span className="t-display t-out text-[22px]">{game?.sunkCount ?? 0}/{game?.pieces.length ?? 6}</span></div>
        <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-extrabold uppercase text-white/75">gol com</span><span className="t-display t-gold text-[22px]">{goalAt}</span></div>
        <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-extrabold uppercase text-white/75">vale</span><span className="t-display t-green text-[22px]">+{pointsNow}</span></div>
      </div>

      {/* O gol: traves brancas e rede; a grade é o alvo */}
      <div className="relative mx-3 mt-3 select-none">
        <div className="rounded-t-md border-[10px] border-b-0 border-white p-2 pb-3 shadow-[0_6px_0_rgba(0,0,0,0.25)]" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 14px), repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 14px), linear-gradient(180deg, rgba(10,40,90,0.55), rgba(10,40,90,0.75))' }}>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cells }, (_, i) => {
              const shot = shotAt.get(i);
              const piece = pieceAt.get(i);
              const isFlash = flash?.index === i;
              let cls = 'item-blue';
              let inner: React.ReactNode = null;
              if (shot?.hit) {
                cls = 'item-green';
                inner = piece ? <PieceIcon kind={piece.kind} className="h-7 w-7" /> : <img src="/ui/pi-boom.png" alt="" className="h-5 w-5 brightness-0 invert" />;
              } else if (shot) {
                cls = 'item-yellow hue-wrong opacity-80';
                inner = <img src="/ui/pi-close.png" alt="" className="h-4 w-4 opacity-90" />;
              } else if (finished && piece) {
                // revelação: peça que ficou em pé
                cls = 'item-empty opacity-90';
                inner = <PieceIcon kind={piece.kind} className="h-7 w-7 opacity-70" />;
              }
              const disabled = !game || finished || busy || !!shot;
              return (
                <motion.button key={i} onClick={() => shoot(i)} disabled={disabled} aria-label={`casa ${Math.floor(i / cols) + 1}-${(i % cols) + 1}`}
                  animate={isFlash && flash?.kind !== 'miss' ? { scale: [1, 1.18, 1] } : isFlash ? { x: [0, -4, 4, -3, 0] } : { scale: 1, x: 0 }} transition={{ duration: 0.35 }}
                  className={`no-drag ${cls} flex aspect-square w-full items-center justify-center ${!shot && !finished ? 'active:brightness-110' : ''}`}>
                  {inner}
                </motion.button>
              );
            })}
          </div>
        </div>
        <div className="h-[6px] bg-white/90" />
        <AnimatePresence>
          {flash && (
            <motion.div key={`${flash.index}-${flash.kind}`} initial={{ opacity: 0, y: 8, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}
              className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
              <span className={`t-display text-[28px] ${flash.kind === 'miss' ? 't-red' : flash.kind === 'sunk' ? 't-gold' : 't-green'}`}>{flash.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Peças escondidas: o que já caiu e o que ainda está em pé */}
      <div className="relative mx-3 mt-2 flex flex-wrap justify-center gap-1.5">
        {(game?.pieces ?? []).map((p) => (
          <div key={p.id} className={`${p.sunk ? 'pill-white' : 'pill-blue'} flex items-center gap-1 px-1 py-0 text-[11px] font-extrabold ${p.sunk ? 'text-grass-deep line-through' : 'text-white'}`}>
            <PieceIcon kind={p.kind} className="h-4 w-4" />
            <span>{p.name}</span>
            <span className="flex gap-[2px]">{Array.from({ length: p.size }, (_, k) => <span key={k} className={`inline-block h-2 w-2 rounded-[2px] ${p.sunk ? 'bg-grass-deep' : 'bg-white/80'}`} />)}</span>
          </div>
        ))}
      </div>

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 16px)' }}>
        {!game ? null : finished ? (
          <div className="panel mt-3 text-navy-ink">
            <div className={`t-display text-center text-[22px] ${game.reward?.goal ? 'text-grass-deep' : ''}`}>
              {game.reward?.allSunk ? `Derrubou tudo! Gol do ${me.team.name}!` : game.reward?.goal ? `Gol do ${me.team.name}!` : `Faltou ${missing} ${missing === 1 ? 'casa' : 'casas'} para o gol`}
            </div>
            <p className="mt-0.5 text-center text-[14px] font-extrabold">
              {hits} de {occupied} casas · {game.sunkCount} de {game.pieces.length} derrubados · +{game.reward?.levelPoints ?? 0} de nível
            </p>
            {!game.reward?.allSunk && <p className="mt-1 text-center text-[12px] font-extrabold text-muted">As peças que ficaram em pé aparecem no gol.</p>}
            <p className="mt-3 text-center text-[13px] font-extrabold text-muted">Gol novo em <Countdown readyAt={game.nextAt} className="text-orange-deep" /></p>
            <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-3 w-full">Voltar ao jogo</button>
          </div>
        ) : (
          <p className="mt-3 text-center text-[12px] font-extrabold text-white/90">
            Goleiro (3 casas), 2 zagueiros (2) e 3 cones (1) estão escondidos no gol, em linha ou coluna. Você tem {game.maxShots} chutes: toque numa casa para chutar. Cada casa acertada vale +{game.pointsPerHit} de nível; com {goalAt} é gol do {me.team.name}, e derrubar tudo vale +{game.sinkAllPoints}.
          </p>
        )}
      </div>
    </div>
  );
}
