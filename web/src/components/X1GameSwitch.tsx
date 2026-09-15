import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { passSettled } from './Pass';
import { seriesNoticeSettled } from './SeriesNotice';
import { PregoBoard, type TeamPaint } from './PregoBoard';
import { BotaoField, BotaoDisc } from './BotaoField';
import { TriondaBall } from './TriondaBall';
import { money as fmt } from '../lib/format';
import type { X1Game, X1Today } from '../lib/types';

/**
 * Janela do jogo do dia no X1 (pedido do dono, 15/09/2026): quando o X1 troca de jogo (às 20h, com o app aberto)
 * e, para quem abre depois, 1x por dia-de-jogo por conta (controle no aparelho: `brgol.x1Jogo.<id>` = o `switchAt`
 * do dia mostrado). Mostra o jogo com a "imagem" de verdade (a tábua do FutPrego / o campo do Botão, nas cores do
 * time), como se joga, o que vale e que os jogos entram em rotação todo dia. Nas telas com abas (Layout) espera a
 * Presença da Semana e o aviso das séries; na tela do X1 (`gate={false}`) só no começo, nunca no meio da partida.
 */

const KEY = (id: number) => `brgol.x1Jogo.${id}`;
const seen = (id: number) => { try { return Number(localStorage.getItem(KEY(id)) || 0); } catch { return 0; } };
const mark = (id: number, at: number) => { try { localStorage.setItem(KEY(id), String(at)); } catch {} };
const DAY = 86_400_000;

/** O jogo de AGORA a partir da meta (que pode estar velha): a cada troca já passada, inverte hoje/amanhã. */
export function effectiveToday(t: X1Today, now: number): X1Today {
  let cur = t;
  for (let i = 0; i < 400 && cur.switchAt <= now; i++) cur = { ...cur, game: cur.next, name: cur.nextName, next: cur.game, nextName: cur.name, switchAt: cur.switchAt + DAY };
  return cur;
}

let showing = false;
/** A janela já saiu da frente (as outras podem vir). */
export const x1SwitchSettled = () => !showing;

export function X1GameSwitchWatcher({ gate = true }: { gate?: boolean }) {
  const me = useAuth((s) => s.me);
  const meta = useAuth((s) => s.meta);
  const now = useAuth((s) => s.now);
  const [open, setOpen] = useState<{ today: X1Today; switched: boolean } | null>(null);
  const id = me?.id;
  const base = meta?.x1?.today;

  useEffect(() => {
    if (id === undefined || !base) return;
    let timer: number | undefined, iv: number | undefined;
    const show = (switched: boolean) => {
      const today = effectiveToday(base, now());
      if (seen(id) === today.switchAt) return; // já mostrei este dia-de-jogo
      const go = () => { mark(id, today.switchAt); showing = true; setOpen({ today, switched }); };
      if (!gate) { go(); return; }
      iv = window.setInterval(() => {
        if (!passSettled(id) || !seriesNoticeSettled()) return;
        window.clearInterval(iv); iv = undefined;
        timer = window.setTimeout(go, 2000);
      }, 1000);
    };
    show(false);
    // a troca das 20h com o app aberto: mostra na hora (1,5 s depois, com o servidor já virado)
    const next = effectiveToday(base, now()).switchAt - now() + 1500;
    const at = window.setTimeout(() => show(true), Math.max(1000, next));
    return () => { window.clearTimeout(at); window.clearTimeout(timer); window.clearInterval(iv); };
  }, [id, base?.switchAt, base?.game, gate]);

  const close = () => { showing = false; setOpen(null); };
  if (!open || !me || !meta) return null;
  const { today, switched } = open;
  const bet = meta.futprego?.bet ?? 200, b = meta.x1?.botao, maxTurns = meta.futprego?.maxTurns ?? 10;
  const botao = today.game === 'BOTAO';
  const how = botao
    ? `Futebol de botão 1x1. Na sua vez, dê ${b?.snapsPerTurn ?? 2} petelecos num botão seu (quem começa dá ${b?.firstTurnSnaps ?? 1}): toque no botão, puxe para trás e solte. O primeiro gol acaba a partida; sem gol em ${b?.maxTurns ?? 9} vezes, vai para os pênaltis.`
    : `Futebol de prego 1x1, uma vez de cada: puxe a bola para trás e solte, e ela desvia nos pregos da tábua. Quem fizer o primeiro gol vence; sem gol em ${maxTurns} jogadas de cada, o dinheiro volta.`;
  return (
    <AnimatePresence>
      <motion.div key="x1-switch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="x1-switch-title"
        className="fixed inset-y-0 left-1/2 z-[92] flex w-full max-w-[480px] -translate-x-1/2 flex-col overflow-y-auto bg-navy-deep/80 backdrop-blur-[2px]">
        <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="relative m-auto w-full max-w-sm px-4 py-6">
          <div className="relative pt-7">
            <div className="absolute inset-x-0 top-0 z-10 flex justify-center"><div id="x1-switch-title" className="ribbon ribbon-orange text-[18px]">{switched ? 'MUDOU O JOGO DO X1' : 'X1 DE HOJE'}</div></div>
            <div className="panel pt-8 text-center text-navy-ink">
              <div className="mx-auto w-[46%] max-w-[150px]"><GamePreview game={today.game} team={me.team} meta={meta} /></div>
              <div className="mt-2 text-[12px] font-extrabold uppercase tracking-wide text-muted">{switched ? 'Agora o X1 é' : 'Hoje no X1'}</div>
              <div className="t-display text-[28px] leading-[1.05]">{today.name}</div>
              <p className="mt-2 text-[13px] font-bold leading-snug text-muted">{how}</p>
              <p className="mt-1.5 text-[13px] font-bold leading-snug text-navy-ink">Cada um põe {fmt(bet)}; quem vence leva {fmt(bet * 2)} e 1 gol para o time.</p>
              <div className="item-blue mt-3 flex items-center gap-2 px-2 py-1 text-left">
                <img src="/ui/ico-x1.svg" alt="" className="h-8 w-8 shrink-0" />
                <p className="text-[12px] font-extrabold leading-snug text-white">Os jogos do X1 entram em rotação todo dia: às {today.switchHour ?? 20}h, depois do fechamento da rodada, troca para <b className="text-gold">{today.nextName}</b>.</p>
              </div>
              {gate
                ? <Link to="/x1" onClick={close} className="btn btn-green btn-lg mt-4 w-full">Jogar o X1 agora</Link>
                : <button onClick={close} className="btn btn-green btn-lg mt-4 w-full">Bora jogar</button>}
              <button onClick={close} className="btn btn-blue btn-sm mt-2 w-full">Depois</button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** A "foto" do jogo: a tábua do FutPrego ou o campo do Botão com os botões na saída, nas cores do time do jogador. */
function GamePreview({ game, team, meta }: { game: X1Game; team: { colorPrimary: string; colorSecondary: string; colorTertiary?: string | null; kitDesign?: string | null }; meta: NonNullable<ReturnType<typeof useAuth.getState>['meta']> }) {
  const mine: TeamPaint = { primary: team.colorPrimary, secondary: team.colorSecondary, tertiary: team.colorTertiary ?? null, design: team.kitDesign ?? null };
  const rival: TeamPaint = { primary: '#FFFFFF', secondary: '#123C8A' };
  const board = meta.futprego?.board, field = meta.x1?.field, kickoff = meta.x1?.kickoff;
  if (game === 'BOTAO') {
    if (!field || !kickoff) return null;
    return (
      <BotaoField field={field} className="w-full drop-shadow-[0_5px_0_rgba(0,0,0,0.25)]">
        {kickoff.pieces.map((p, i) => <g key={i} transform={`translate(${p.x} ${p.y})`}><BotaoDisc p={p} r={field.piece} paint={p.side === 0 ? mine : rival} /></g>)}
        <g transform={`translate(${kickoff.ball.x} ${kickoff.ball.y})`}><TriondaBall r={field.ball} idle /></g>
      </BotaoField>
    );
  }
  if (!board) return null;
  return <PregoBoard board={board} paint={[mine, rival]} ball={<g transform={`translate(${board.W / 2} ${board.H / 2})`}><TriondaBall r={board.ball} idle /></g>} className="w-full drop-shadow-[0_5px_0_rgba(0,0,0,0.25)]" />;
}
