import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import type { MemoriaState, Team } from '../lib/types';
import { Shield, crestUrl } from '../components/Shield';
import { GoalOverlay } from '../components/GoalOverlay';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';

/**
 * Memória dos Escudos — 16 cartas (8 pares) sorteadas por jogador/dia. O baralho fica no
 * servidor: cada virada é um POST e a carta só aparece na resposta. Fechar em até
 * `goalAtMoves` jogadas = 1 gol; pontos de nível pela tabela (menos jogadas, mais pontos).
 */
const HIDE_MS = 900;

type Face = { team: Team | null; up: boolean; matched: boolean };

export function MemoriaScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [game, setGame] = useState<MemoriaState | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const hideTimer = useRef<number | null>(null);

  const fromState = (s: MemoriaState) => s.cards.map((c) => ({ team: c.team, up: !!c.team, matched: c.matched || s.finished }));

  useEffect(() => {
    api.memoria().then((s) => { setGame(s); setFaces(fromState(s)); }).catch((e) => {
      toast((e as Error).message, 'error');
      nav('/', { replace: true });
    });
    return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, []);

  // pré-carrega todos os escudos: a carta vira e o escudo já está lá
  useEffect(() => { for (const t of meta?.teams ?? []) { const im = new Image(); im.src = crestUrl(t.slug); } }, [meta]);

  async function flip(i: number) {
    if (!game || busy || game.finished) return;
    const f = faces[i];
    if (f.matched || f.up) return;
    // duas viradas ainda visíveis de uma jogada errada: esconde já e segue
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; setFaces((p) => p.map((x) => (x.matched ? x : { ...x, up: false, team: null }))); }
    setBusy(true);
    sound.play('tap');
    try {
      const r = await api.memoriaFlip(i, game.day);
      setGame(r.state);
      setFaces((prev) => {
        const next = prev.map((x) => ({ ...x }));
        for (const c of r.revealed) { next[c.i] = { team: c.team, up: true, matched: r.match === true || next[c.i].matched }; }
        return next;
      });
      if (r.match === true) sound.play('pop');
      if (r.match === false) {
        sound.play('error');
        const idx = r.revealed.map((c) => c.i);
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = null;
          setFaces((p) => p.map((x, k) => (idx.includes(k) ? { ...x, up: false, team: null } : x)));
        }, HIDE_MS);
      }
      if (r.reward) {
        setFaces(fromState(r.state));
        if (r.reward.goal) setOverlay(true); else sound.play('coin');
        refresh();
      }
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'day-changed' || e.code === 'finished')) { toast((e as Error).message); api.memoria().then((s) => { setGame(s); setFaces(fromState(s)); }).catch(() => {}); }
      else toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  const moves = game?.moves ?? 0;
  const goalAt = game?.goalAtMoves ?? 14;
  const pts = game ? (game.levelPoints.find(([max]) => max === null || moves <= max)?.[1] ?? 5) : 30;
  const finished = !!game?.finished;

  return (
    <div className="app-frame relative flex min-h-full flex-col gap-3 px-3 pb-6" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal title="GOOOL!!!" text={game?.reward?.text ?? undefined} levelPoints={game?.reward?.levelPoints} team={me.team} onClose={() => setOverlay(false)} />

      <div className="relative flex items-center justify-between">
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-blue text-[17px]">MEMÓRIA DOS ESCUDOS</div>
        <div className="w-12" />
      </div>

      <div className="panel-navy relative flex items-center justify-between py-2">
        <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-extrabold uppercase text-white/75">jogadas</span><span className={`t-display text-[22px] ${moves > goalAt ? 't-red' : 't-out'}`}>{moves}</span></div>
        <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-extrabold uppercase text-white/75">pares</span><span className="t-display t-out text-[22px]">{game?.matchedPairs ?? 0}/{game?.pairs ?? 8}</span></div>
        <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-extrabold uppercase text-white/75">gol até</span><span className="t-display t-gold text-[22px]">{goalAt}</span></div>
        <div className="flex flex-col items-center leading-none"><span className="text-[10px] font-extrabold uppercase text-white/75">vale</span><span className="t-display t-green text-[22px]">+{pts}</span></div>
      </div>

      <div className="relative grid grid-cols-4 gap-2" style={{ perspective: 900 }}>
        {(game ? faces : Array.from({ length: 16 }, () => ({ team: null, up: false, matched: false }))).map((f, i) => (
          <button key={i} onClick={() => flip(i)} disabled={!game || finished || f.up} className="no-drag relative aspect-[3/4] w-full" aria-label={f.team ? f.team.name : `carta ${i + 1}`}>
            <motion.div className="absolute inset-0" animate={{ rotateY: f.up ? 180 : 0 }} transition={{ duration: 0.35, ease: 'easeInOut' }} style={{ transformStyle: 'preserve-3d' }}>
              {/* verso */}
              <div className="item-blue absolute inset-0 flex items-center justify-center" style={{ backfaceVisibility: 'hidden' }}>
                <img src="/brand/logo-v.webp" alt="" className="h-10 w-10 object-contain opacity-80" />
              </div>
              {/* frente */}
              <div className={`${f.matched ? 'item-green' : 'item-yellow'} absolute inset-0 flex items-center justify-center`} style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                {f.team && <Shield team={f.team} size={44} />}
              </div>
            </motion.div>
          </button>
        ))}
      </div>

      {finished ? (
        <div className="card-white relative text-center">
          <div className="t-display text-[18px] text-navy-ink">{game?.reward?.goal ? 'GOL de memória!' : 'Fechou o baralho!'}</div>
          <div className="mt-0.5 text-[13px] font-extrabold text-navy-ink">
            {game?.reward?.moves ?? moves} jogadas · +{game?.reward?.levelPoints ?? 0} de nível{game?.reward?.goal ? ` · 1 gol pro ${me.team.name}` : ` · gol só até ${goalAt} jogadas`}
          </div>
          <div className="mt-2 text-[13px] font-extrabold text-muted">Baralho novo em <Countdown readyAt={game!.nextAt} className="text-orange-deep" /></div>
          <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-3 w-full">Voltar ao jogo</button>
        </div>
      ) : (
        <p className="relative text-center text-[12px] font-extrabold text-white/85">Vire duas cartas por jogada. Feche os 8 pares em até {goalAt} jogadas e é gol do {me.team.name}. Quanto menos jogadas, mais pontos de nível.</p>
      )}
    </div>
  );
}
