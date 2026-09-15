import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { token } from '../lib/api';
import { useAuth } from '../store/auth';
import type { Team } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { RivalryResult } from '../components/Rivalry';
import { Avatar } from '../components/Avatar';
import { Shield } from '../components/Shield';
import { PregoBoard, type PregoBoardData, type TeamPaint } from '../components/PregoBoard';
import { TriondaBall, type TriondaApi } from '../components/TriondaBall';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';
import { money as fmt } from '../lib/format';

/**
 * FutPrego — futebol de prego 1x1 ao vivo, uma vez de cada (pedido do dono, 14/09/2026). Tudo passa pelo
 * WebSocket /api/ws/futprego?mode=game (realtime/futprego.js na API): desafiar, aceitar, petelecos e o fim.
 * O servidor calcula a bola; esta tela só mostra os quadros e manda direção + força. Quem joga do lado de
 * cima vê a tábua girada: sempre ataca para cima. Arrastar em qualquer lugar da tábua = estilingue (puxa
 * para trás, a bola vai para frente).
 */

type Side = 0 | 1;
interface Player { id: number; nick: string; avatarUrl: string | null; team: Team; bot: boolean }
interface Rules { bet: number; turnSec: number; maxTurns: number; inviteSec: number; botAfterSec: number; maxGoalWinsPerDay: number }
/** Retrospecto contra o adversário desta partida (só partidas de verdade que terminaram; null no treino). */
interface H2H { total: number; wins: number; losses: number; draws: number; last: ('V' | 'D' | 'E')[]; lastAt: string | null }
interface Match {
  id: number; you: Side; players: [Player, Player]; board: PregoBoardData; ball: { x: number; y: number };
  turn: Side; turnEndsAt: number; turns: [number, number]; maxTurns: number; turnSec: number; bet: number; training: boolean;
  h2h: H2H | null;
}
interface Over {
  winner: Side | null; reason: string; you: Side; training: boolean; money: number; pot?: number; goal?: boolean; why?: string | null;
  goalText?: string | null; lost?: boolean; lostTeam?: string | null; refund?: boolean; players?: Player[]; text?: string; late?: boolean;
  /** Retrospecto já com esta partida e a frase de provocação (só partida que entrou no retrospecto). */
  h2h?: H2H; rivalry?: { kind: string; text: string } | null;
}
interface OpenChallenge { id: number; from: Player; at: number }

const MAX_PULL = 120; // arrasto (em unidades da tábua) para a força máxima
const DEFAULT_RULES: Rules = { bet: 200, turnSec: 15, maxTurns: 10, inviteSec: 10, botAfterSec: 60, maxGoalWinsPerDay: 3 };
const paintOf = (t: Team): TeamPaint => ({ primary: t.colorPrimary, secondary: t.colorSecondary });

export function FutPregoScreen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const now = useAuth((s) => s.now);
  const meta = useAuth((s) => s.meta);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState<'connecting' | 'lobby' | 'waiting' | 'match' | 'kicked' | 'offline'>('connecting');
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [open, setOpen] = useState<OpenChallenge[]>([]);
  const [waiting, setWaiting] = useState<{ id: number; startedAt: number; botOffer: boolean } | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [animating, setAnimating] = useState(false);
  const [sent, setSent] = useState(false); // mandou o peteleco, esperando o servidor
  const [aim, setAim] = useState<{ sx: number; sy: number; power: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oppDropped, setOppDropped] = useState(false);
  const [goalFlash, setGoalFlash] = useState<'top' | 'bottom' | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [lastResult, setLastResult] = useState<Over | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ballRef = useRef<SVGGElement | null>(null);
  const ballApi = useRef<TriondaApi | null>(null); // bola Trionda: rola conforme anda (TriondaBall.tsx)
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef<number | null>(null);
  const queue = useRef<any[]>([]); // mensagens que esperam a animação do peteleco acabar
  const animRef = useRef(false);
  const matchRef = useRef<Match | null>(null);
  const acceptId = useRef<number | null>(Number(params.get('aceitar')) || null);
  matchRef.current = match;

  const send = (m: object) => { const ws = wsRef.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
  const placeBall = (x: number, y: number) => {
    ballRef.current?.setAttribute('transform', `translate(${x} ${y})`);
    const p = lastPos.current;
    if (p) ballApi.current?.roll(x - p.x, y - p.y); // teleporte (partida nova) não gira: só anda
    lastPos.current = { x, y };
  };

  // relógio da vez / da espera
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(iv); }, []);

  // ─── conexão ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let closed = false, tries = 0, timer: number | undefined;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/api/ws/futprego?mode=game&token=${encodeURIComponent(token.get() ?? '')}`);
      wsRef.current = ws;
      ws.onopen = () => { tries = 0; };
      ws.onmessage = (ev) => { try { onMessage(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (closed) return;
        tries++;
        if (tries <= 8) timer = window.setTimeout(connect, Math.min(4000, 600 * tries)); // o servidor segura a partida por 20 s
        else setPhase('offline');
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  function onMessage(m: any) {
    // enquanto a bola anda, vez/fim esperam na fila (a tela mostra tudo na ordem)
    if (animRef.current && (m.t === 'turn' || m.t === 'over' || m.t === 'skip')) { queue.current.push(m); return; }
    switch (m.t) {
      case 'hello':
        setRules(m.rules ?? DEFAULT_RULES);
        setPhase((p) => (p === 'connecting' || p === 'offline' ? 'lobby' : p));
        if (acceptId.current) { send({ t: 'accept', id: acceptId.current }); acceptId.current = null; setParams({}, { replace: true }); }
        break;
      case 'open': setOpen(m.list ?? []); break;
      case 'waiting': setBusy(false); setWaiting({ id: m.id, startedAt: m.at, botOffer: false }); setPhase('waiting'); break;
      case 'bot-offer': setWaiting((w) => (w ? { ...w, botOffer: true } : w)); break;
      case 'canceled': setWaiting(null); setPhase('lobby'); break;
      case 'expired': toast(m.message, 'error'); setWaiting(null); setPhase('lobby'); break;
      case 'taken': setBusy(false); toast(m.message, 'error'); setWaiting(null); setPhase('lobby'); break;
      case 'error': setBusy(false); toast(m.message, 'error'); break;
      case 'kicked': setPhase('kicked'); break;
      case 'match': {
        setBusy(false); setWaiting(null); setOver(null); setAim(null); setSent(false); setGoalFlash(null); setOppDropped(false); setConfirmLeave(false);
        setMatch({ id: m.id, you: m.you, players: m.players, board: m.board, ball: m.ball, turn: m.turn, turnEndsAt: m.turnEndsAt, turns: m.turns, maxTurns: m.maxTurns, turnSec: m.turnSec, bet: m.bet, training: m.training, h2h: m.h2h ?? null });
        setPhase('match');
        lastPos.current = null;
        requestAnimationFrame(() => placeBall(m.ball.x, m.ball.y));
        if (!m.resumed) { if (!m.training) refresh(); sound.play('pop'); }
        break;
      }
      case 'shot': {
        setSent(false); setAim(null);
        setMatch((x) => (x ? { ...x, turns: m.turns } : x));
        runShot(m.frames, () => {
          setMatch((x) => (x ? { ...x, ball: m.ball } : x));
          if (m.goal !== null) setGoalFlash(m.goal === 0 ? 'top' : 'bottom');
        });
        break;
      }
      case 'turn': {
        setMatch((x) => (x ? { ...x, turn: m.turn, turnEndsAt: m.turnEndsAt, turns: m.turns } : x));
        if (matchRef.current && m.turn === matchRef.current.you) sound.play('pop');
        break;
      }
      case 'skip': {
        setMatch((x) => (x ? { ...x, turns: m.turns } : x));
        const x = matchRef.current;
        if (x) flashNotice(m.side === x.you ? 'Você perdeu a vez.' : `${x.players[m.side].nick} perdeu a vez.`);
        break;
      }
      case 'opp-dropped': setOppDropped(true); break;
      case 'opp-back': setOppDropped(false); break;
      case 'over': showOver(m as Over); break;
    }
  }

  function runShot(frames: [number, number][], onEnd: () => void) {
    if (raf.current) cancelAnimationFrame(raf.current);
    animRef.current = true; setAnimating(true);
    const start = performance.now();
    const step = (t: number) => {
      const f = Math.max(0, ((t - start) / 1000) * 30); // o horário do quadro pode vir antes do start
      const i = Math.floor(f);
      if (i >= frames.length - 1) {
        const [x, y] = frames[frames.length - 1];
        placeBall(x, y);
        raf.current = null; animRef.current = false; setAnimating(false);
        onEnd();
        const pending = queue.current.splice(0);
        pending.forEach(onMessage);
        return;
      }
      const [x0, y0] = frames[i], [x1, y1] = frames[i + 1], k = f - i;
      placeBall(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }

  function flashNotice(text: string) { setNotice(text); window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 2200); }

  function showOver(o: Over) {
    setOver(o); setLastResult(o); setAim(null); setSent(false);
    if (!o.training) refresh();
  }
  function closeOver() { setOver(null); setMatch(null); setGoalFlash(null); setPhase('lobby'); }

  // ─── ações ────────────────────────────────────────────────────────────────
  function challenge() {
    if (busy) return;
    if (me.money < rules.bet) { toast(`Você precisa de ${fmt(rules.bet)} para jogar.`, 'error'); return; }
    setBusy(true); setLastResult(null);
    send({ t: 'challenge' });
    window.setTimeout(() => setBusy(false), 4000);
  }
  function accept(id: number) {
    if (busy) return;
    if (me.money < rules.bet) { toast(`Você precisa de ${fmt(rules.bet)} para jogar.`, 'error'); return; }
    setBusy(true); setLastResult(null);
    send({ t: 'accept', id });
    window.setTimeout(() => setBusy(false), 4000);
  }
  function leave() {
    if (phase === 'match' && match && !over) { setConfirmLeave(true); return; }
    if (phase === 'waiting') send({ t: 'cancel' });
    nav('/');
  }
  function giveUp() { send({ t: 'giveup' }); setConfirmLeave(false); }

  // ─── estilingue ───────────────────────────────────────────────────────────
  const myTurn = !!match && match.turn === match.you && !animating && !sent && !over && !goalFlash;
  function toSvg(e: React.PointerEvent) {
    const svg = svgRef.current!, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  }
  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!myTurn) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSvg(e);
    drag.current = { x: p.x, y: p.y };
  }
  /** Direção (coordenadas do servidor) e força pelo arrasto até o ponto do evento. */
  function aimFrom(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current || !match) return null;
    const p = toSvg(e);
    const dx = p.x - drag.current.x, dy = p.y - drag.current.y; // arrasto na tela
    const len = Math.hypot(dx, dy);
    if (len < 4) return null;
    // a bola vai para o lado contrário do arrasto; quem está girado (lado de cima) tem o eixo invertido
    const flip = match.you === 1;
    return { sx: (flip ? dx : -dx) / len, sy: (flip ? dy : -dy) / len, power: Math.min(1, len / MAX_PULL) };
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (drag.current) setAim(aimFrom(e));
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    const a = aimFrom(e); // o ponto onde o dedo soltou vale (não o último quadro desenhado)
    drag.current = null;
    if (!a || !myTurn || a.power < 0.06) { setAim(null); return; }
    send({ t: 'flick', dx: a.sx, dy: a.sy, power: a.power });
    setSent(true);
    window.setTimeout(() => setSent(false), 3000);
    sound.play('tap');
  }

  // ─── telas ────────────────────────────────────────────────────────────────
  const header = (
    <div className="relative flex items-center justify-between gap-2 px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
      <button onClick={leave} className="btn-sq btn-sq-white h-12 w-12 shrink-0" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
      <div className="ribbon ribbon-orange text-[18px]">FUTPREGO</div>
      <div className="resbar shrink-0 text-[14px] tabular-nums"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-7 w-7" alt="" />{fmt(me.money)}</div>
    </div>
  );

  let body: React.ReactNode = null;
  if (phase === 'connecting') body = <p className="t-out mt-10 text-center text-[15px] font-extrabold">Abrindo a tábua…</p>;
  else if (phase === 'offline') body = <Msg title="Sem conexão" text="Não deu para falar com o servidor do FutPrego. Confira a internet e abra de novo." onBack={() => nav('/')} />;
  else if (phase === 'kicked') body = <Msg title="Aberto em outra tela" text="O FutPrego foi aberto em outra aba ou aparelho. Continue por lá." onBack={() => nav('/')} />;
  else if (phase === 'lobby') body = <Lobby rules={rules} open={open} busy={busy} me={me} lastResult={lastResult} onChallenge={challenge} onAccept={accept} board={meta?.futprego?.board} />;
  else if (phase === 'waiting' && waiting) body = (
    <Waiting rules={rules} elapsed={Math.max(0, now() - waiting.startedAt)} botOffer={waiting.botOffer}
      onCancel={() => send({ t: 'cancel' })} onBot={() => send({ t: 'bot' })} onKeep={() => setWaiting({ ...waiting, botOffer: false })} />
  );
  else if (phase === 'match' && match) {
    const you = match.you, opp = (1 - you) as Side;
    const left = Math.max(0, Math.ceil((match.turnEndsAt - now()) / 1000));
    const paint: [TeamPaint, TeamPaint] = [paintOf(match.players[0].team), paintOf(match.players[1].team)];
    const b = match.ball;
    const L = aim ? 26 + aim.power * 110 : 0;
    const overlay = aim && myTurn ? (
      <g pointerEvents="none">
        <line x1={b.x} y1={b.y} x2={b.x - aim.sx * aim.power * 38} y2={b.y - aim.sy * aim.power * 38} stroke="#5B3A1A" strokeWidth="3" strokeLinecap="round" />
        <line x1={b.x} y1={b.y} x2={b.x + aim.sx * L} y2={b.y + aim.sy * L} stroke="#FFFFFF" strokeWidth="2.6" strokeDasharray="2 6" strokeLinecap="round" />
        <circle cx={b.x + aim.sx * L} cy={b.y + aim.sy * L} r="3.4" fill="#FFFFFF" />
        <circle cx={b.x} cy={b.y} r={match.board.ball + 5} fill="none" stroke={aim.power > 0.8 ? '#F0413E' : aim.power > 0.45 ? '#FFC63D' : '#7DFF5C'} strokeWidth="2.5" />
      </g>
    ) : myTurn ? (
      <circle cx={b.x} cy={b.y} r={match.board.ball + 6} fill="none" stroke="#FFD54A" strokeWidth="2" pointerEvents="none">
        <animate attributeName="r" values={`${match.board.ball + 4};${match.board.ball + 9};${match.board.ball + 4}`} dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
      </circle>
    ) : null;
    body = (
      <div className="flex flex-1 flex-col items-center">
        <PlayerBar p={match.players[opp]} turns={match.turns[opp]} max={match.maxTurns} active={match.turn === opp && !animating} left={left} total={match.turnSec} label={oppDropped ? 'caiu, esperando voltar' : match.turn === opp && !animating ? 'vez dele' : null} />
        {!match.training && match.h2h && <H2HStrip h2h={match.h2h} opp={match.players[opp].nick} />}
        <div className="relative my-1.5" style={{ width: `min(92vw, 380px, calc((100dvh - ${!match.training && match.h2h ? 276 : 250}px) * 0.62))` }}>
          <PregoBoard ref={svgRef} board={match.board} flip={you === 1} paint={paint} glowGoal={goalFlash} overlay={overlay}
            ball={<g ref={ballRef} transform={`translate(${b.x} ${b.y})`}><TriondaBall ref={ballApi} r={match.board.ball} /></g>}
            className={`w-full drop-shadow-[0_6px_0_rgba(0,0,0,0.25)] ${myTurn ? 'cursor-grab' : ''}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
          <AnimatePresence>
            {notice && (
              <motion.div key={notice} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                <span className="rounded-xl bg-navy-deep/85 px-3 py-1.5 text-[13px] font-extrabold text-white">{notice}</span>
              </motion.div>
            )}
            {goalFlash && (
              <motion.div key="gol" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }} className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                <span className="t-display t-gold text-[56px] leading-none">GOL!</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <PlayerBar p={match.players[you]} me turns={match.turns[you]} max={match.maxTurns} active={myTurn} left={left} total={match.turnSec}
          label={myTurn ? (aim ? `força ${Math.round(aim.power * 100)}%` : 'sua vez: puxe e solte') : null} />
        <div className="mt-1 flex w-full max-w-[380px] items-center justify-between px-1">
          <span className="text-[11px] font-extrabold leading-tight text-white/80">{match.training ? 'Treino contra bot: não vale gol nem dinheiro' : `Valendo ${fmt(match.bet * 2)} e 1 gol`}{match.board.name && <><br />Tábua {match.board.name}</>}</span>
          <button onClick={() => setConfirmLeave(true)} className="btn btn-gray btn-sm">Desistir</button>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-frame relative flex min-h-full flex-col">
        <div className="stadium-bg" />
        <OverResult over={over} me={me} onClose={closeOver} />
        {header}
        <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 12px)' }}>{body}</div>
        <AnimatePresence>
          {confirmLeave && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-y-0 left-1/2 z-[80] flex w-full max-w-[480px] -translate-x-1/2 items-center bg-navy-deep/70 px-4" role="dialog" aria-modal="true">
              <div className="panel w-full text-center text-navy-ink">
                <div className="t-display text-[20px]">Desistir da partida?</div>
                <p className="mt-1 text-[13px] font-bold leading-snug text-muted">{match?.training ? 'É só um treino: nada muda.' : 'Conta como derrota: você perde a aposta e o seu time pode perder 1 gol. Se ainda não jogou 2 vezes, o dinheiro volta para os dois.'}</p>
                <button onClick={() => { giveUp(); }} className="btn btn-red btn-md mt-3 w-full">Desistir</button>
                <button onClick={() => setConfirmLeave(false)} className="btn btn-blue btn-sm mt-2 w-full">Continuar jogando</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function Msg({ title, text, onBack }: { title: string; text: string; onBack: () => void }) {
  return (
    <div className="panel mt-6 text-center text-navy-ink">
      <div className="t-display text-[20px]">{title}</div>
      <p className="mt-1 text-[13px] font-bold text-muted">{text}</p>
      <button onClick={onBack} className="btn btn-orange btn-md mt-4 w-full">Voltar ao jogo</button>
    </div>
  );
}

/** Começo: a tábua de enfeite, as regras em 3 linhas, desafiar e os desafios abertos. */
function Lobby({ rules, open, busy, me, lastResult, onChallenge, onAccept, board }: {
  rules: Rules; open: OpenChallenge[]; busy: boolean; me: { money: number; team: Team }; lastResult: Over | null;
  onChallenge: () => void; onAccept: (id: number) => void; board: PregoBoardData | undefined;
}) {
  return (
    <>
      {lastResult && <LastResult o={lastResult} />}
      {board && (
        <div className="mx-auto mt-2" style={{ width: 'min(44vw, 180px, calc((100dvh - 470px) * 0.62))', minWidth: 96 }}>
          <PregoBoard board={board} paint={[paintOf(me.team), { primary: '#FFFFFF', secondary: '#123C8A' }]} ball={<g transform={`translate(${board.W / 2} ${board.H / 2})`}><TriondaBall r={board.ball} idle /></g>} className="w-full drop-shadow-[0_6px_0_rgba(0,0,0,0.25)]" />
        </div>
      )}
      <div className="panel-navy mt-3 px-3 py-2.5">
        <p className="text-[14px] font-extrabold leading-snug text-white">Futebol de prego 1x1, uma vez de cada. Cada um põe {fmt(rules.bet)}. Quem fizer o primeiro gol leva {fmt(rules.bet * 2)} e 1 gol para o time, e o time do outro perde 1 gol na rodada.</p>
        <p className="mt-1.5 text-[12px] font-bold leading-snug text-white/75">Sem gol em {rules.maxTurns} jogadas de cada, o dinheiro volta. Até {rules.maxGoalWinsPerDay} gols por dia; ganhar da mesma pessoa duas vezes seguidas, a segunda não vale gol.</p>
      </div>
      {open.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {open.map((c) => (
            <div key={c.id} className="card-white flex items-center gap-2" style={{ borderRadius: 16 }}>
              <Avatar url={c.from.avatarUrl} size={38} />
              <div className="min-w-0 flex-1">
                <div className="t-display truncate text-[15px] text-navy-ink">{c.from.nick}</div>
                <div className="flex items-center gap-1 text-[11px] font-extrabold text-muted"><Shield team={c.from.team} size={14} />{c.from.team.name} está desafiando</div>
              </div>
              <button onClick={() => onAccept(c.id)} disabled={busy} className="btn btn-green btn-sm min-w-[76px]">Aceitar</button>
            </div>
          ))}
        </div>
      )}
      <button onClick={onChallenge} disabled={busy || me.money < rules.bet} className="btn btn-green btn-lg mt-3 w-full">{busy ? 'Chamando…' : `Desafiar alguém (${fmt(rules.bet)})`}</button>
      {me.money < rules.bet && <p className="t-out mt-2 text-center text-[12px] font-extrabold">Você precisa de {fmt(rules.bet)} para jogar.</p>}
    </>
  );
}

function LastResult({ o }: { o: Over }) {
  const won = o.winner === o.you;
  const text = o.training ? 'Treino contra o bot.' : o.refund ? `Empate: os ${fmt(o.money)} voltaram.` : won ? `Você venceu e levou ${fmt(o.money)}${o.goal ? ' e 1 gol' : ''}.` : 'Você perdeu a última.';
  return <div className={`${won && !o.refund && !o.training ? 'card-green' : 'card-blue'} mt-2 px-2 py-1 text-center text-[13px] font-extrabold`} style={{ borderRadius: 16 }}>{text}</div>;
}

/** Esperando alguém aceitar: o tempo, cancelar e, depois de 1 min, o treino contra o bot. */
function Waiting({ rules, elapsed, botOffer, onCancel, onBot, onKeep }: { rules: Rules; elapsed: number; botOffer: boolean; onCancel: () => void; onBot: () => void; onKeep: () => void }) {
  const s = Math.floor(elapsed / 1000);
  return (
    <div className="panel mt-6 text-center text-navy-ink">
      <div className="t-display text-[22px]">Procurando adversário</div>
      <div className="t-display mt-1 text-[34px] tabular-nums text-orange-deep">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</div>
      <p className="mt-1 text-[13px] font-bold leading-snug text-muted">Quem está no JogaGol agora recebe o seu desafio. Quando alguém aceitar, a partida começa aqui.</p>
      {botOffer ? (
        <div className="mt-3 rounded-xl bg-sky/15 p-2">
          <p className="text-[13px] font-extrabold">Ninguém aceitou ainda. Quer treinar contra o bot enquanto isso?</p>
          <p className="text-[11px] font-bold text-muted">O treino não vale gol nem dinheiro.</p>
          <button onClick={onBot} className="btn btn-blue btn-md mt-2 w-full">Treinar contra o bot</button>
          <button onClick={onKeep} className="btn btn-white btn-sm mt-2 w-full">Continuar esperando</button>
        </div>
      ) : (
        <p className="mt-2 text-[12px] font-bold text-muted">Depois de {Math.round(rules.botAfterSec / 60)} minuto, dá para treinar contra o bot.</p>
      )}
      <button onClick={onCancel} className="btn btn-red btn-md mt-3 w-full">Cancelar desafio</button>
    </div>
  );
}

/** Faixa de cada jogador: foto, nick, escudo, jogadas e o relógio da vez. */
function PlayerBar({ p, me = false, turns, max, active, left, total, label }: { p: Player; me?: boolean; turns: number; max: number; active: boolean; left: number; total: number; label: string | null }) {
  const pct = Math.max(0, Math.min(1, left / total));
  return (
    <div className={`flex w-full max-w-[380px] items-center gap-2 rounded-2xl px-2 py-1 ${active ? 'bg-gold/30 ring-2 ring-gold' : 'bg-navy-deep/40'}`}>
      <Avatar url={p.avatarUrl} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1"><span className="t-display t-out truncate text-[14px] leading-tight">{me ? 'Você' : p.nick}</span><Shield team={p.team} size={16} /></div>
        <div className="text-[11px] font-extrabold text-white/85">{label ?? `jogadas ${turns} de ${max}`}</div>
      </div>
      {active && (
        <svg viewBox="0 0 36 36" className="h-9 w-9 shrink-0" aria-label={`${left} segundos`}>
          <circle cx="18" cy="18" r="15" fill="rgba(11,45,107,0.75)" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={left <= 5 ? '#F0413E' : '#FFD54A'} strokeWidth="4" strokeDasharray={`${pct * 94.2} 94.2`} transform="rotate(-90 18 18)" strokeLinecap="round" />
          <text x="18" y="23" textAnchor="middle" fontFamily="'Lilita One', Impact, sans-serif" fontSize="14" fill="#fff">{left}</text>
        </svg>
      )}
    </div>
  );
}

/** Retrospecto contra este adversário, logo abaixo da barra dele: V·E·D e as últimas 5 (a mais recente primeiro). */
function H2HStrip({ h2h, opp }: { h2h: H2H; opp: string }) {
  const tone = h2h.wins > h2h.losses ? 'text-[#7DFF5C]' : h2h.wins < h2h.losses ? 'text-[#FF8A80]' : 'text-gold';
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-1 flex w-full max-w-[380px] items-center justify-between gap-2 rounded-xl bg-navy-deep/50 px-2 py-0.5">
      {h2h.total === 0 ? (
        <span className="text-[11px] font-extrabold text-white/85">Primeiro confronto contra {opp}</span>
      ) : (
        <>
          <span className="truncate text-[11px] font-extrabold text-white/85">
            Contra {opp}: <b className={tone}>{h2h.wins}V</b> · <b className="text-white">{h2h.draws}E</b> · <b className={h2h.losses > h2h.wins ? 'text-[#FF8A80]' : 'text-white'}>{h2h.losses}D</b>
          </span>
          <span className="flex shrink-0 gap-0.5" aria-label="últimas partidas, a mais recente primeiro">
            {h2h.last.map((r, i) => (
              <span key={i} className={`flex h-4 w-4 items-center justify-center rounded font-display text-[10px] leading-none text-white ${r === 'V' ? 'bg-[#2E9E3A]' : r === 'D' ? 'bg-[#C0392B]' : 'bg-white/30'}`}>{r}</span>
            ))}
          </span>
        </>
      )}
    </motion.div>
  );
}

/** Fim da partida: gol, dinheiro e o aviso do gol perdido (usa a janela de resultado dos minigames). */
function OverResult({ over, me, onClose }: { over: Over | null; me: { team: Team }; onClose: () => void }) {
  if (!over) return <GoalOverlay open={false} goal={false} onClose={onClose} />;
  const won = over.winner === over.you;
  const opp = over.players?.[1 - over.you]?.nick ?? 'o adversário';
  let title = 'PERDEU', text = '', goal = false, money = 0;
  if (over.training) { title = won ? 'VENCEU O TREINO' : 'FIM DO TREINO'; text = 'Treino contra bot não vale gol nem dinheiro. Desafie alguém de verdade!'; goal = won; }
  else if (over.refund) { title = 'EMPATE'; text = over.why === 'wo-cedo' ? `A partida acabou antes de cada um jogar 2 vezes: os ${fmt(over.money)} voltaram.` : `Ninguém marcou em 10 jogadas: os ${fmt(over.money)} voltaram.`; }
  else if (won) {
    goal = true; money = over.money;
    title = over.goal ? 'GOOOL!!!' : 'VENCEU!';
    const why = over.why === 'limite' ? ' O gol não valeu: você já fez os gols de hoje no FutPrego.' : over.why === 'repetido' ? ` O gol não valeu: você ganhou de ${opp} duas vezes seguidas.` : '';
    const narr = over.goalText ?? `Você venceu ${opp}!`;
    text = over.goal ? `${narr}${/[.!?]$/.test(narr) ? '' : '.'}${over.lost ? ` O ${over.lostTeam} perdeu 1 gol na rodada.` : ''}` : `Você venceu ${opp} e levou ${fmt(over.money)}.${why}`;
  } else {
    text = over.reason === 'wo' ? `Você ficou fora e perdeu por W.O. para ${opp}.` : over.reason === 'desistiu' ? 'Você desistiu da partida.' : over.reason === 'gol-contra' ? `Gol contra! ${opp} venceu.` : `${opp} marcou primeiro.`;
    text += over.goal && over.lost ? ` O ${over.lostTeam} perdeu 1 gol na rodada.` : ' Seu time não perdeu gol.';
  }
  const rival = !over.training && over.h2h ? over.h2h : null;
  return (
    <GoalOverlay open goal={goal} title={title} text={text} money={money} team={me.team} onClose={onClose} autoClose={rival ? 10000 : 6000}>
      {rival && <RivalryResult h2h={rival} opp={opp} line={over.rivalry?.text ?? null} />}
    </GoalOverlay>
  );
}

