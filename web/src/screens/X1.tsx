import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { api, token } from '../lib/api';
import { useAuth } from '../store/auth';
import type { PublicPlayer, Team, X1Game, X1Today } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { RivalryResult } from '../components/Rivalry';
import { Avatar } from '../components/Avatar';
import { Shield } from '../components/Shield';
import { PregoBoard, type PregoBoardData, type TeamPaint } from '../components/PregoBoard';
import { BotaoField, BotaoDisc, type BotaoFieldData, type BotaoPiece } from '../components/BotaoField';
import { TriondaBall, type TriondaApi } from '../components/TriondaBall';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';
import { money as fmt, timeLeft } from '../lib/format';

/**
 * X1 — jogos 1x1 ao vivo, um por dia (pedido do dono, 15/09/2026: "cada dia 1 jogo para não ficar
 * enjoativo"): FutPrego (futebol de prego, uma vez de cada) e Futebol de Botão (2 petelecos num botão seu
 * por vez; o 1º gol acaba; empate vai para os pênaltis). Tudo passa pelo WebSocket /api/ws/x1?mode=game
 * (realtime/x1.js na API): desafiar, aceitar, petelecos e o fim. O servidor calcula tudo; esta tela só mostra
 * os quadros e manda direção + força. Quem joga do lado de cima vê o campo girado: sempre ataca para cima.
 * Estilingue: puxa para trás e solta (a bola / o botão vai para a frente).
 */

type Side = 0 | 1;
interface Player { id: number; nick: string; avatarUrl: string | null; team: Team; bot: boolean }
interface Rules {
  bet: number; turnSec: number; maxTurns: number; inviteSec: number; botAfterSec: number; maxGoalsPerHour: number; challengeCooldownSec?: number;
  botao?: { snapsPerTurn: number; firstTurnSnaps: number; snapSec: number; goalsToWin: number; maxTurns: number; penalties: number };
}
/** Retrospecto contra o adversário desta partida no X1 (só partidas de verdade que terminaram; null no treino). */
interface H2H { total: number; wins: number; losses: number; draws: number; last: ('V' | 'D' | 'E')[]; lastAt: string | null }
interface MatchBase { id: number; you: Side; players: [Player, Player]; turnEndsAt: number; bet: number; training: boolean; h2h: H2H | null }
interface PregoMatch extends MatchBase {
  game: 'FUTPREGO'; board: PregoBoardData; ball: { x: number; y: number };
  turn: Side; turns: [number, number]; maxTurns: number; turnSec: number;
}
interface BotaoView {
  phase: 'play' | 'penalties'; pieces: BotaoPiece[]; ball: { x: number; y: number }; score: [number, number];
  turn: Side; turnNo: number; maxTurns: number; snapsLeft: number; snapsPerTurn: number; goalsToWin: number;
  pen: { kicks: [boolean[], boolean[]]; kicker: Side; round: number; of: number } | null;
}
interface BotaoMatch extends MatchBase { game: 'BOTAO'; field: BotaoFieldData; bv: BotaoView; snapSec: number }
type Match = PregoMatch | BotaoMatch;
interface Over {
  game?: X1Game; winner: Side | null; reason: string; you: Side; training: boolean; money: number; pot?: number; goal?: boolean; why?: string | null;
  goalText?: string | null; lost?: boolean; lostTeam?: string | null; refund?: boolean; players?: Player[]; text?: string; late?: boolean;
  score?: [number, number] | null; pen?: [boolean[], boolean[]] | null; lossLimit?: boolean;
  /** Quem não é VIP: até quando espera para desafiar de novo (null = pode já; ausente no treino). */
  cooldownUntil?: number | null;
  /** Retrospecto já com esta partida e a frase de provocação (só partida que entrou no retrospecto). */
  h2h?: H2H; rivalry?: { kind: string; text: string } | null;
}
interface OpenChallenge { id: number; game?: X1Game; gameName?: string; from: Player; at: number }
interface Shown { ball: { x: number; y: number }; pieces: BotaoPiece[] }

const MAX_PULL = 120; // FutPrego: arrasto (em unidades da tábua) para a força máxima
const MAX_PULL_BOTAO = 110; // Botão: idem, puxando o botão
const DEFAULT_RULES: Rules = { bet: 200, turnSec: 15, maxTurns: 10, inviteSec: 10, botAfterSec: 60, maxGoalsPerHour: 10 };
const GAME_NAME: Record<X1Game, string> = { FUTPREGO: 'FutPrego', BOTAO: 'Futebol de Botão' };
const paintOf = (t: Team): TeamPaint => ({ primary: t.colorPrimary, secondary: t.colorSecondary });
const shownOf = (bv: BotaoView): Shown => ({ ball: { ...bv.ball }, pieces: bv.pieces.map((p) => ({ ...p })) });

/** Botões que `side` pode tocar agora (no pênalti, só o cobrador). */
const canMove = (bv: BotaoView, side: Side, p: BotaoPiece) => bv.turn === side && p.side === side && (bv.phase === 'play' || !p.gk);
/** O botão seu mais perto da bola: já vem escolhido quando chega a sua vez. */
function nearestPiece(bv: BotaoView, side: Side): number | null {
  let best: number | null = null, bd = Infinity;
  bv.pieces.forEach((p, i) => {
    if (!canMove(bv, side, p)) return;
    const d = Math.hypot(p.x - bv.ball.x, p.y - bv.ball.y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export function X1Screen() {
  const me = useAuth((s) => s.me)!;
  const refresh = useAuth((s) => s.refresh);
  const now = useAuth((s) => s.now);
  const meta = useAuth((s) => s.meta);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState<'connecting' | 'lobby' | 'waiting' | 'match' | 'kicked' | 'offline'>('connecting');
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [today, setToday] = useState<X1Today | null>(meta?.x1?.today ?? null);
  const [open, setOpen] = useState<OpenChallenge[]>([]);
  const [waiting, setWaiting] = useState<{ id: number; startedAt: number; botOffer: boolean; gameName: string } | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [shown, setShown] = useState<Shown | null>(null); // Botão: onde estão a bola e os botões (fora da animação)
  const [sel, setSel] = useState<number | null>(null); // Botão: o botão escolhido para o peteleco
  const [turnOpen, setTurnOpen] = useState(false); // Botão: o servidor já abriu o relógio deste peteleco
  const [animating, setAnimating] = useState(false);
  const [sent, setSent] = useState(false); // mandou o peteleco, esperando o servidor
  const [aim, setAim] = useState<{ sx: number; sy: number; power: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oppDropped, setOppDropped] = useState(false);
  const [goalFlash, setGoalFlash] = useState<'top' | 'bottom' | null>(null);
  const [bigText, setBigText] = useState<string | null>(null); // "GOL!" / "NÃO ENTROU!" no meio do campo
  const [over, setOver] = useState<Over | null>(null);
  const [lastResult, setLastResult] = useState<Over | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [season, setSeason] = useState<PublicPlayer['x1'] | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null); // sem VIP: espera para desafiar de novo
  const [, tick] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ballRef = useRef<SVGGElement | null>(null);
  const ballApi = useRef<TriondaApi | null>(null); // bola Trionda: rola conforme anda (TriondaBall.tsx)
  const pieceEls = useRef<(SVGGElement | null)[]>([]);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef<number | null>(null);
  const queue = useRef<any[]>([]); // mensagens que esperam a animação do peteleco acabar
  const animRef = useRef(false);
  const matchRef = useRef<Match | null>(null);
  const shownRef = useRef<Shown | null>(null);
  const acceptId = useRef<number | null>(Number(params.get('aceitar')) || null);
  matchRef.current = match;
  shownRef.current = shown;

  const send = (m: object) => { const ws = wsRef.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
  const placeBall = (x: number, y: number) => {
    ballRef.current?.setAttribute('transform', `translate(${x} ${y})`);
    const p = lastPos.current;
    if (p) ballApi.current?.roll(x - p.x, y - p.y); // teleporte (partida nova) não gira: só anda
    lastPos.current = { x, y };
  };

  // relógio da vez / da espera
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(iv); }, []);
  // o jogo do dia vira às 20h (com a tela aberta): os jogos se alternam
  useEffect(() => {
    if (!today) return;
    const t = window.setTimeout(() => setToday((d) => (d ? { ...d, game: d.next, name: d.nextName, next: d.game, nextName: d.name, switchAt: d.switchAt + 86_400_000 } : d)), Math.max(1000, today.switchAt - Date.now() + 1500));
    return () => clearTimeout(t);
  }, [today?.switchAt]);
  // campanha no X1 (temporada e posição no ranking) para o começo
  useEffect(() => {
    if (phase !== 'lobby') return;
    let alive = true;
    api.player(me.nick).then((p) => { if (alive) setSeason(p.x1 ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [phase, me.nick]);

  // ─── conexão ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let closed = false, tries = 0, timer: number | undefined;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/api/ws/x1?mode=game&token=${encodeURIComponent(token.get() ?? '')}`);
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
    if (animRef.current && ['turn', 'over', 'skip', 'bturn', 'bskip'].includes(m.t)) { queue.current.push(m); return; }
    switch (m.t) {
      case 'hello':
        setRules(m.rules ?? DEFAULT_RULES);
        if (m.today) setToday(m.today);
        setPhase((p) => (p === 'connecting' || p === 'offline' ? 'lobby' : p));
        if (acceptId.current) { send({ t: 'accept', id: acceptId.current }); acceptId.current = null; setParams({}, { replace: true }); }
        break;
      case 'open': setOpen(m.list ?? []); break;
      case 'waiting': setBusy(false); setWaiting({ id: m.id, startedAt: m.at, botOffer: false, gameName: m.gameName ?? '' }); setPhase('waiting'); break;
      case 'bot-offer': setWaiting((w) => (w ? { ...w, botOffer: true } : w)); break;
      case 'canceled': setWaiting(null); setPhase('lobby'); break;
      case 'expired': toast(m.message, 'error'); setWaiting(null); setPhase('lobby'); break;
      case 'taken': setBusy(false); toast(m.message, 'error'); setWaiting(null); setPhase('lobby'); break;
      case 'error': setBusy(false); if (m.code === 'cooldown') setCooldownUntil(m.until ?? null); toast(m.message, 'error'); break;
      case 'cooldown': setCooldownUntil(m.until ?? null); break;
      case 'kicked': setPhase('kicked'); break;
      case 'match': {
        setBusy(false); setWaiting(null); setOver(null); setAim(null); setSent(false); setGoalFlash(null); setBigText(null); setOppDropped(false); setConfirmLeave(false);
        const base = { id: m.id, you: m.you, players: m.players, turnEndsAt: m.turnEndsAt, bet: m.bet, training: m.training, h2h: m.h2h ?? null };
        let ball: { x: number; y: number };
        if (m.game === 'BOTAO') {
          const bv: BotaoView = m.botao;
          setMatch({ ...base, game: 'BOTAO', field: m.field, bv, snapSec: m.snapSec });
          setShown(shownOf(bv)); setSel(nearestPiece(bv, m.you)); setTurnOpen(true);
          ball = bv.ball;
        } else {
          setMatch({ ...base, game: 'FUTPREGO', board: m.board, ball: m.ball, turn: m.turn, turns: m.turns, maxTurns: m.maxTurns, turnSec: m.turnSec });
          setShown(null);
          ball = m.ball;
        }
        setPhase('match');
        lastPos.current = null;
        requestAnimationFrame(() => placeBall(ball.x, ball.y));
        if (!m.resumed) { if (!m.training) refresh(); sound.play('pop'); }
        break;
      }
      // FutPrego
      case 'shot': {
        setSent(false); setAim(null);
        setMatch((x) => (x && x.game === 'FUTPREGO' ? { ...x, turns: m.turns } : x));
        const frames: [number, number][] = m.frames;
        animate(frames.length, (i, k) => {
          const [x0, y0] = frames[i], [x1, y1] = frames[Math.min(i + 1, frames.length - 1)];
          placeBall(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
        }, () => {
          setMatch((x) => (x && x.game === 'FUTPREGO' ? { ...x, ball: m.ball } : x));
          if (m.goal !== null) { setGoalFlash(m.goal === 0 ? 'top' : 'bottom'); setBigText('GOL!'); }
        });
        break;
      }
      case 'turn': {
        setMatch((x) => (x && x.game === 'FUTPREGO' ? { ...x, turn: m.turn, turnEndsAt: m.turnEndsAt, turns: m.turns } : x));
        if (matchRef.current && m.turn === matchRef.current.you) sound.play('pop');
        break;
      }
      case 'skip': {
        setMatch((x) => (x && x.game === 'FUTPREGO' ? { ...x, turns: m.turns } : x));
        const x = matchRef.current;
        if (x) flashNotice(m.side === x.you ? 'Você perdeu a vez.' : `${x.players[m.side].nick} perdeu a vez.`);
        break;
      }
      // Futebol de Botão
      case 'snap': {
        setSent(false); setAim(null); setTurnOpen(false);
        const frames: [number, number][][] = m.frames;
        const before = shownRef.current;
        animate(frames.length, (i, k) => {
          const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
          placeBall(a[0][0] + (b[0][0] - a[0][0]) * k, a[0][1] + (b[0][1] - a[0][1]) * k);
          for (let j = 1; j < a.length; j++) {
            pieceEls.current[j - 1]?.setAttribute('transform', `translate(${a[j][0] + (b[j][0] - a[j][0]) * k} ${a[j][1] + (b[j][1] - a[j][1]) * k})`);
          }
        }, () => {
          const last = frames[frames.length - 1];
          if (before) setShown({ ball: { x: last[0][0], y: last[0][1] }, pieces: before.pieces.map((p, j) => ({ ...p, x: last[j + 1]?.[0] ?? p.x, y: last[j + 1]?.[1] ?? p.y })) });
          setMatch((x) => (x && x.game === 'BOTAO' ? { ...x, bv: m.botao } : x));
          if (m.goal) { setGoalFlash(m.goal.side === 0 ? 'top' : 'bottom'); setBigText(m.goal.own ? 'GOL CONTRA!' : 'GOL!'); }
          else if (m.penalty) {
            if (m.penalty.scored) setGoalFlash(m.penalty.kicker === 0 ? 'top' : 'bottom');
            setBigText(m.penalty.scored ? 'GOL!' : 'NÃO ENTROU!');
          }
        });
        break;
      }
      case 'bturn': {
        const x = matchRef.current;
        if (!x || x.game !== 'BOTAO') break;
        const bv: BotaoView = m.botao;
        setMatch({ ...x, bv, turnEndsAt: m.turnEndsAt });
        setShown(shownOf(bv)); lastPos.current = { ...bv.ball }; ballRef.current?.setAttribute('transform', `translate(${bv.ball.x} ${bv.ball.y})`);
        setGoalFlash(null); setBigText(null); setAim(null); setSent(false); setTurnOpen(true);
        setSel(nearestPiece(bv, x.you));
        if (m.penaltiesStart) flashNotice('Sem gol: agora é nos pênaltis!');
        if (bv.turn === x.you) sound.play('pop');
        break;
      }
      case 'bskip': {
        const x = matchRef.current;
        if (!x || x.game !== 'BOTAO') break;
        const wasPen = x.bv.phase === 'penalties';
        setMatch({ ...x, bv: m.botao }); setShown(shownOf(m.botao)); setTurnOpen(false); setAim(null);
        const who = m.side === x.you ? 'Você' : x.players[m.side].nick;
        flashNotice(wasPen ? `${who} perdeu a cobrança (tempo).` : `${who} perdeu o peteleco (tempo).`);
        break;
      }
      case 'opp-dropped': setOppDropped(true); break;
      case 'opp-back': setOppDropped(false); break;
      case 'over': showOver(m as Over); break;
    }
  }

  /** Toca os quadros do peteleco a 30 por segundo; no fim, solta as mensagens que esperaram. */
  function animate(count: number, draw: (i: number, k: number) => void, onEnd: () => void) {
    if (raf.current) cancelAnimationFrame(raf.current);
    animRef.current = true; setAnimating(true);
    const start = performance.now();
    const step = (t: number) => {
      const f = Math.max(0, ((t - start) / 1000) * 30); // o horário do quadro pode vir antes do start
      const i = Math.floor(f);
      if (i >= count - 1) {
        draw(count - 1, 0);
        raf.current = null; animRef.current = false; setAnimating(false);
        onEnd();
        queue.current.splice(0).forEach(onMessage);
        return;
      }
      draw(i, f - i);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }

  function flashNotice(text: string) { setNotice(text); window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 2400); }

  function showOver(o: Over) {
    setOver(o); setLastResult(o); setAim(null); setSent(false);
    if (o.cooldownUntil !== undefined) setCooldownUntil(o.cooldownUntil); // o relógio começa quando a partida acaba
    if (!o.training) refresh();
  }
  function closeOver() { setOver(null); setMatch(null); setShown(null); setGoalFlash(null); setBigText(null); setPhase('lobby'); }

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
  const busyFx = animating || sent || !!over || !!goalFlash || !!bigText;
  const myTurn = !!match && !busyFx && (match.game === 'FUTPREGO' ? match.turn === match.you : match.bv.turn === match.you && turnOpen);
  function toSvg(e: React.PointerEvent) {
    const svg = svgRef.current!, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  }
  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!myTurn || !match) return;
    const p = toSvg(e);
    if (match.game === 'BOTAO') {
      // tocou num botão seu: escolhe ele (e já dá para puxar); tocou fora: puxa o que está escolhido
      const F = match.field, flip = match.you === 1;
      const sx = flip ? F.W - p.x : p.x, sy = flip ? F.H - p.y : p.y;
      let hit: number | null = null, hd = F.piece + 14;
      match.bv.pieces.forEach((q, i) => {
        if (!canMove(match.bv, match.you, q)) return;
        const d = Math.hypot(q.x - sx, q.y - sy);
        if (d < hd) { hd = d; hit = i; }
      });
      if (hit !== null) setSel(hit);
      else if (sel === null) return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: p.x, y: p.y };
  }
  /** Direção (coordenadas do servidor) e força pelo arrasto até o ponto do evento. */
  function aimFrom(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current || !match) return null;
    const p = toSvg(e);
    const dx = p.x - drag.current.x, dy = p.y - drag.current.y; // arrasto na tela
    const len = Math.hypot(dx, dy);
    if (len < 4) return null;
    // vai para o lado contrário do arrasto; quem está girado (lado de cima) tem o eixo invertido
    const flip = match.you === 1;
    return { sx: (flip ? dx : -dx) / len, sy: (flip ? dy : -dy) / len, power: Math.min(1, len / (match.game === 'BOTAO' ? MAX_PULL_BOTAO : MAX_PULL)) };
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (drag.current) setAim(aimFrom(e));
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    const a = aimFrom(e); // o ponto onde o dedo soltou vale (não o último quadro desenhado)
    drag.current = null;
    if (!a || !myTurn || !match || a.power < 0.06) { setAim(null); return; }
    if (match.game === 'BOTAO') {
      if (sel === null) { setAim(null); return; }
      send({ t: 'snap', idx: sel, dx: a.sx, dy: a.sy, power: a.power });
    } else send({ t: 'flick', dx: a.sx, dy: a.sy, power: a.power });
    setSent(true);
    window.setTimeout(() => setSent(false), 3000);
    sound.play('tap');
  }

  // ─── telas ────────────────────────────────────────────────────────────────
  const header = (
    <div className="relative flex items-center justify-between gap-2 px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
      <button onClick={leave} className="btn-sq btn-sq-white h-12 w-12 shrink-0" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
      <div className="ribbon ribbon-orange text-[18px]">X1</div>
      <div className="resbar shrink-0 text-[14px] tabular-nums"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-7 w-7" alt="" />{fmt(me.money)}</div>
    </div>
  );

  let body: React.ReactNode = null;
  if (phase === 'connecting') body = <p className="t-out mt-10 text-center text-[15px] font-extrabold">Abrindo o X1…</p>;
  else if (phase === 'offline') body = <Msg title="Sem conexão" text="Não deu para falar com o servidor do X1. Confira a internet e abra de novo." onBack={() => nav('/')} />;
  else if (phase === 'kicked') body = <Msg title="Aberto em outra tela" text="O X1 foi aberto em outra aba ou aparelho. Continue por lá." onBack={() => nav('/')} />;
  else if (phase === 'lobby') body = (
    <Lobby rules={rules} today={today} open={open} busy={busy} me={me} lastResult={lastResult} season={season} now={now()}
      cooldownLeft={cooldownUntil ? Math.max(0, cooldownUntil - now()) : 0}
      onChallenge={challenge} onAccept={accept} board={meta?.futprego?.board} field={meta?.x1?.field} kickoff={meta?.x1?.kickoff} />
  );
  else if (phase === 'waiting' && waiting) body = (
    <Waiting rules={rules} gameName={waiting.gameName || today?.name || ''} elapsed={Math.max(0, now() - waiting.startedAt)} botOffer={waiting.botOffer}
      onCancel={() => send({ t: 'cancel' })} onBot={() => send({ t: 'bot' })} onKeep={() => setWaiting({ ...waiting, botOffer: false })} />
  );
  else if (phase === 'match' && match) {
    const you = match.you, opp = (1 - you) as Side;
    const paint: [TeamPaint, TeamPaint] = [paintOf(match.players[0].team), paintOf(match.players[1].team)];
    const h2hOn = !match.training && !!match.h2h;
    const bigOverlay = (
      <AnimatePresence>
        {notice && (
          <motion.div key={notice} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center px-4">
            <span className="rounded-xl bg-navy-deep/85 px-3 py-1.5 text-center text-[13px] font-extrabold text-white">{notice}</span>
          </motion.div>
        )}
        {bigText && (
          <motion.div key={bigText} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }} className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
            <span className={`t-display ${bigText === 'NÃO ENTROU!' ? 't-out text-[40px]' : 't-gold text-[56px]'} leading-none`}>{bigText}</span>
          </motion.div>
        )}
      </AnimatePresence>
    );

    let center: React.ReactNode, oppLabel: string | null, meLabel: string | null, oppActive: boolean, meActive: boolean, left: number, total: number, extraH = 0, foot = '';
    if (match.game === 'FUTPREGO') {
      left = Math.max(0, Math.ceil((match.turnEndsAt - now()) / 1000)); total = match.turnSec;
      oppActive = match.turn === opp && !animating; meActive = myTurn;
      oppLabel = oppDropped ? 'caiu, esperando voltar' : oppActive ? 'vez dele' : `jogadas ${match.turns[opp]} de ${match.maxTurns}`;
      meLabel = myTurn ? (aim ? `força ${Math.round(aim.power * 100)}%` : 'sua vez: puxe e solte') : `jogadas ${match.turns[you]} de ${match.maxTurns}`;
      foot = match.board.name ? `Tábua ${match.board.name}` : 'FutPrego';
      const b = match.ball;
      const L = aim ? 26 + aim.power * 110 : 0;
      const overlay = aim && myTurn ? (
        <g pointerEvents="none">
          <line x1={b.x} y1={b.y} x2={b.x - aim.sx * aim.power * 38} y2={b.y - aim.sy * aim.power * 38} stroke="#5B3A1A" strokeWidth="3" strokeLinecap="round" />
          <line x1={b.x} y1={b.y} x2={b.x + aim.sx * L} y2={b.y + aim.sy * L} stroke="#FFFFFF" strokeWidth="2.6" strokeDasharray="2 6" strokeLinecap="round" />
          <circle cx={b.x + aim.sx * L} cy={b.y + aim.sy * L} r="3.4" fill="#FFFFFF" />
          <circle cx={b.x} cy={b.y} r={match.board.ball + 5} fill="none" stroke={powerColor(aim.power)} strokeWidth="2.5" />
        </g>
      ) : myTurn ? (
        <circle cx={b.x} cy={b.y} r={match.board.ball + 6} fill="none" stroke="#FFD54A" strokeWidth="2" pointerEvents="none">
          <animate attributeName="r" values={`${match.board.ball + 4};${match.board.ball + 9};${match.board.ball + 4}`} dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
        </circle>
      ) : null;
      center = (
        <PregoBoard ref={svgRef} board={match.board} flip={you === 1} paint={paint} glowGoal={goalFlash} overlay={overlay}
          ball={<g ref={ballRef} transform={`translate(${b.x} ${b.y})`}><TriondaBall ref={ballApi} r={match.board.ball} /></g>}
          className={`w-full drop-shadow-[0_6px_0_rgba(0,0,0,0.25)] ${myTurn ? 'cursor-grab' : ''}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
      );
    } else {
      const { bv, field: F } = match;
      const pen = bv.phase === 'penalties';
      left = Math.max(0, Math.min(match.snapSec, Math.ceil((match.turnEndsAt - now()) / 1000))); total = match.snapSec;
      oppActive = bv.turn === opp && turnOpen && !animating; meActive = myTurn;
      oppLabel = oppDropped ? 'caiu, esperando voltar' : oppActive ? (pen ? 'vai cobrar' : 'vez dele') : null;
      meLabel = myTurn
        ? (aim ? `força ${Math.round(aim.power * 100)}%` : pen ? 'cobre o pênalti: puxe e solte' : 'toque num botão seu e puxe')
        : bv.turn === you && !pen && bv.snapsLeft > 0 && !busyFx ? 'sua vez' : null;
      extraH = 30; foot = 'Futebol de Botão';
      const s = shown ?? shownOf(bv);
      const selP = sel !== null ? s.pieces[sel] : null;
      const L = aim ? 30 + aim.power * 120 : 0;
      const overlay = aim && myTurn && selP ? (
        <g pointerEvents="none">
          <line x1={selP.x} y1={selP.y} x2={selP.x - aim.sx * aim.power * 42} y2={selP.y - aim.sy * aim.power * 42} stroke="#5B3A1A" strokeWidth="5" strokeLinecap="round" />
          <line x1={selP.x} y1={selP.y} x2={selP.x + aim.sx * L} y2={selP.y + aim.sy * L} stroke="#FFFFFF" strokeWidth="2.6" strokeDasharray="2 6" strokeLinecap="round" />
          <circle cx={selP.x + aim.sx * L} cy={selP.y + aim.sy * L} r="3.4" fill="#FFFFFF" />
        </g>
      ) : null;
      center = (
        <BotaoField ref={svgRef} field={F} flip={you === 1} glowGoal={goalFlash}
          className={`w-full drop-shadow-[0_6px_0_rgba(0,0,0,0.25)] ${myTurn ? 'cursor-grab' : ''}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
          {overlay}
          {s.pieces.map((p, i) => (
            <g key={i} ref={(el) => { pieceEls.current[i] = el; }} transform={`translate(${p.x} ${p.y})`} data-piece={i} data-side={p.side} data-gk={p.gk ? 1 : 0}>
              <BotaoDisc p={p} r={F.piece} paint={paint[p.side]} selected={myTurn && sel === i} active={myTurn && canMove(bv, you, p)} powerRing={myTurn && sel === i && aim ? powerColor(aim.power) : null} />
            </g>
          ))}
          <g ref={ballRef} transform={`translate(${s.ball.x} ${s.ball.y})`} data-ball=""><TriondaBall ref={ballApi} r={F.ball} /></g>
        </BotaoField>
      );
    }

    body = (
      <div className="flex flex-1 flex-col items-center">
        <PlayerBar p={match.players[opp]} active={oppActive} left={left} total={total} label={oppLabel} />
        {h2hOn && <H2HStrip h2h={match.h2h!} opp={match.players[opp].nick} />}
        {match.game === 'BOTAO' && <BotaoStrip bv={match.bv} you={you} oppNick={match.players[opp].nick} firstSnaps={rules.botao?.firstTurnSnaps ?? 1} />}
        <div className="relative my-1.5" style={{ width: `min(92vw, 380px, calc((100dvh - ${250 + (h2hOn ? 26 : 0) + extraH}px) * 0.62))` }}>
          {center}
          {bigOverlay}
        </div>
        <PlayerBar p={match.players[you]} me active={meActive} left={left} total={total} label={meLabel} />
        <div className="mt-1 flex w-full max-w-[380px] items-center justify-between px-1">
          <span className="text-[11px] font-extrabold leading-tight text-white/80">{match.training ? 'Treino contra bot: não vale gol nem dinheiro' : `Valendo ${fmt(match.bet * 2)} e 1 gol`}<br />{foot}</span>
          <button onClick={() => setConfirmLeave(true)} className="btn btn-gray btn-sm">Desistir</button>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-frame relative flex min-h-full flex-col">
        <div className="stadium-bg" />
        <OverResult over={over} me={me} limit={rules.maxGoalsPerHour} onClose={closeOver} />
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

const powerColor = (p: number) => (p > 0.8 ? '#F0413E' : p > 0.45 ? '#FFC63D' : '#7DFF5C');

function Msg({ title, text, onBack }: { title: string; text: string; onBack: () => void }) {
  return (
    <div className="panel mt-6 text-center text-navy-ink">
      <div className="t-display text-[20px]">{title}</div>
      <p className="mt-1 text-[13px] font-bold text-muted">{text}</p>
      <button onClick={onBack} className="btn btn-orange btn-md mt-4 w-full">Voltar ao jogo</button>
    </div>
  );
}

/** As regras do jogo de hoje em duas frases (a aposta e as travas valem para os dois jogos). */
function rulesText(game: X1Game, r: Rules) {
  const b = r.botao;
  const main = game === 'BOTAO'
    ? `Futebol de botão 1x1. Na sua vez, dê ${b?.snapsPerTurn ?? 2} petelecos num botão seu (quem começa dá ${b?.firstTurnSnaps ?? 1}). O primeiro gol acaba a partida; sem gol em ${b?.maxTurns ?? 9} vezes, vai para os pênaltis.`
    : `Futebol de prego 1x1, uma vez de cada. Quem fizer o primeiro gol vence; sem gol em ${r.maxTurns} jogadas de cada, o dinheiro volta.`;
  return { main, stakes: `Cada um põe ${fmt(r.bet)}. Quem vencer leva ${fmt(r.bet * 2)} e 1 gol para o time, e o time do outro perde 1 gol na rodada.` };
}

/** Começo: o X1 de hoje (e o de amanhã), as regras, a campanha na temporada, os desafios abertos e desafiar. */
function Lobby({ rules, today, open, busy, me, lastResult, season, now, cooldownLeft, onChallenge, onAccept, board, field, kickoff }: {
  rules: Rules; today: X1Today | null; open: OpenChallenge[]; busy: boolean; me: { money: number; team: Team }; lastResult: Over | null;
  season: PublicPlayer['x1'] | null; now: number; cooldownLeft: number; onChallenge: () => void; onAccept: (id: number) => void;
  board: PregoBoardData | undefined; field: BotaoFieldData | undefined; kickoff: { pieces: BotaoPiece[]; ball: { x: number; y: number } } | undefined;
}) {
  const game: X1Game = today?.game ?? 'FUTPREGO';
  const t = rulesText(game, rules);
  const mine = paintOf(me.team), rival: TeamPaint = { primary: '#FFFFFF', secondary: '#123C8A' };
  const preview = game === 'BOTAO'
    ? field && kickoff && (
      <BotaoField field={field} className="w-full drop-shadow-[0_5px_0_rgba(0,0,0,0.25)]">
        {kickoff.pieces.map((p, i) => <g key={i} transform={`translate(${p.x} ${p.y})`}><BotaoDisc p={p} r={field.piece} paint={p.side === 0 ? mine : rival} /></g>)}
        <g transform={`translate(${kickoff.ball.x} ${kickoff.ball.y})`}><TriondaBall r={field.ball} idle /></g>
      </BotaoField>
    )
    : board && (
      <PregoBoard board={board} paint={[mine, rival]} ball={<g transform={`translate(${board.W / 2} ${board.H / 2})`}><TriondaBall r={board.ball} idle /></g>} className="w-full drop-shadow-[0_5px_0_rgba(0,0,0,0.25)]" />
    );
  return (
    <>
      {lastResult && <LastResult o={lastResult} />}
      <div className="panel mt-2 flex items-center gap-3 text-navy-ink" style={{ paddingBlock: 12 }}>
        <div className="w-[34%] max-w-[128px] shrink-0">{preview}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-extrabold text-muted">Hoje no X1</div>
          <div className="t-display text-[26px] leading-[1.05]">{today?.name ?? GAME_NAME[game]}</div>
          {today && (
            <p className="mt-1.5 text-[12px] font-bold leading-snug text-muted">
              Às {today.switchHour ?? 20}h troca para <b className="text-navy-ink">{today.nextName}</b>{today.switchAt > now ? `, daqui a ${timeLeft(today.switchAt - now)}` : ''}.
            </p>
          )}
          <Link to="/rankings?aba=x1" className="mt-2 inline-flex items-center gap-1 text-[12px] font-extrabold text-sky-deep underline decoration-2 underline-offset-2">Ranking X1 (com prêmios)</Link>
        </div>
      </div>
      <div className="panel-navy mt-3 px-3 py-2.5">
        <p className="text-[14px] font-extrabold leading-snug text-white">{t.main}</p>
        <p className="mt-1.5 text-[12px] font-bold leading-snug text-white/80">{t.stakes} Cada jogador ganha no máximo {rules.maxGoalsPerHour} gols por hora no X1, e o time perde no máximo {rules.maxGoalsPerHour} por hora por causa dele. Ganhar da mesma pessoa duas vezes seguidas, a segunda não vale gol.</p>
      </div>
      {season?.season && season.season.played > 0 && (
        <p className="t-out mt-2 text-center text-[12px] font-extrabold">
          Temporada {season.season.number}: {season.season.points} {Math.abs(season.season.points) === 1 ? 'ponto' : 'pontos'} no Ranking X1{season.season.position ? `, ${season.season.position}º lugar` : ''}.
        </p>
      )}
      {open.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {open.map((c) => (
            <div key={c.id} className="card-white flex items-center gap-2" style={{ borderRadius: 16 }}>
              <Avatar url={c.from.avatarUrl} size={38} />
              <div className="min-w-0 flex-1">
                <div className="t-display truncate text-[15px] text-navy-ink">{c.from.nick}</div>
                <div className="flex items-center gap-1 text-[11px] font-extrabold text-muted"><Shield team={c.from.team} size={14} /><span className="truncate">{c.from.team.name} desafia no {c.gameName ?? GAME_NAME[c.game ?? game]}</span></div>
              </div>
              <button onClick={() => onAccept(c.id)} disabled={busy} className="btn btn-green btn-sm min-w-[76px]">Aceitar</button>
            </div>
          ))}
        </div>
      )}
      <button onClick={onChallenge} disabled={busy || me.money < rules.bet || cooldownLeft > 0} className="btn btn-green btn-lg mt-3 w-full tabular-nums">
        {busy ? 'Chamando…' : cooldownLeft > 0 ? `Desafiar de novo em ${mmss(cooldownLeft)}` : `Desafiar alguém (${fmt(rules.bet)})`}
      </button>
      {cooldownLeft > 0 && <VipNudge minutes={Math.round((rules.challengeCooldownSec ?? 120) / 60)} />}
      {me.money < rules.bet && <p className="t-out mt-2 text-center text-[12px] font-extrabold">Você precisa de {fmt(rules.bet)} para jogar.</p>}
    </>
  );
}

const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Sem VIP, esperando para desafiar: o convite para o VIP (aceitar desafio continua liberado na lista acima). */
function VipNudge({ minutes }: { minutes: number }) {
  return (
    <Link to="/vip" className="card-orange mt-2 flex items-center gap-3 text-left" style={{ borderRadius: 18 }}>
      <img src="/ui/ico-crown_silver.png" alt="" className="h-11 w-11 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="t-display t-out block text-[16px] leading-tight">Vire VIP e jogue o X1 ilimitado!</span>
        <span className="mt-0.5 block text-[12px] font-bold leading-snug text-white/90">Sem VIP, você espera {minutes} {minutes === 1 ? 'minuto' : 'minutos'} depois de cada partida para desafiar. Aceitar desafio pode na hora.</span>
      </span>
      <span className="btn btn-yellow btn-sm shrink-0">Ver VIP</span>
    </Link>
  );
}

function LastResult({ o }: { o: Over }) {
  const won = o.winner === o.you;
  const text = o.training ? 'Treino contra o bot.' : o.refund ? `Empate: os ${fmt(o.money)} voltaram.` : won ? `Você venceu e levou ${fmt(o.money)}${o.goal ? ' e 1 gol' : ''}.` : 'Você perdeu a última.';
  return <div className={`${won && !o.refund && !o.training ? 'card-green' : 'card-blue'} mt-2 px-2 py-1 text-center text-[13px] font-extrabold`} style={{ borderRadius: 16 }}>{text}</div>;
}

/** Esperando alguém aceitar: o tempo, cancelar e, depois de 1 min, o treino contra o bot. */
function Waiting({ rules, gameName, elapsed, botOffer, onCancel, onBot, onKeep }: { rules: Rules; gameName: string; elapsed: number; botOffer: boolean; onCancel: () => void; onBot: () => void; onKeep: () => void }) {
  const s = Math.floor(elapsed / 1000);
  return (
    <div className="panel mt-6 text-center text-navy-ink">
      <div className="t-display text-[22px]">Procurando adversário</div>
      {gameName && <div className="text-[13px] font-extrabold text-muted">no {gameName}</div>}
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

/** Faixa de cada jogador: foto, nick, escudo, o que está acontecendo e o relógio da vez. */
function PlayerBar({ p, me = false, active, left, total, label }: { p: Player; me?: boolean; active: boolean; left: number; total: number; label: string | null }) {
  const pct = Math.max(0, Math.min(1, left / total));
  return (
    <div className={`flex w-full max-w-[380px] items-center gap-2 rounded-2xl px-2 py-1 ${active ? 'bg-gold/30 ring-2 ring-gold' : 'bg-navy-deep/40'}`}>
      <Avatar url={p.avatarUrl} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1"><span className="t-display t-out truncate text-[14px] leading-tight">{me ? 'Você' : p.nick}</span><Shield team={p.team} size={16} /></div>
        <div className="truncate text-[11px] font-extrabold text-white/85">{label ?? p.team.name}</div>
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

/**
 * Futebol de Botão: a vez (N de 9) e os petelecos que faltam nesta vez; nos pênaltis, as cobranças de cada um
 * (verde = gol, vermelho = não entrou, vazio = falta cobrar).
 */
function BotaoStrip({ bv, you, oppNick, firstSnaps }: { bv: BotaoView; you: Side; oppNick: string; firstSnaps: number }) {
  if (bv.phase === 'penalties' && bv.pen) {
    const pen = bv.pen;
    const row = (s: Side) => {
      const k = pen.kicks[s];
      const slots = Math.max(pen.of, k.length + (pen.kicker === s ? 1 : 0));
      return (
        <span className="flex gap-1" aria-label={`${k.filter(Boolean).length} gols em ${k.length} cobranças`}>
          {Array.from({ length: slots }, (_, i) => (
            <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${i < k.length ? (k[i] ? 'border-[#1E7A2A] bg-[#46C24F]' : 'border-[#9B2A22] bg-[#E5484D]') : pen.kicker === s && i === k.length ? 'border-gold bg-gold/30' : 'border-white/50'}`} />
          ))}
        </span>
      );
    };
    const goals = (s: Side) => pen.kicks[s].filter(Boolean).length;
    return (
      <div className="mt-1 flex w-full max-w-[380px] items-center justify-between gap-2 rounded-xl bg-navy-deep/60 px-2 py-1">
        <span className="flex min-w-0 items-center gap-1.5"><span className="text-[11px] font-extrabold text-white">Você</span>{row(you)}</span>
        <span className="t-display t-gold shrink-0 text-[15px] tabular-nums">{goals(you)} x {goals((1 - you) as Side)}</span>
        <span className="flex min-w-0 items-center gap-1.5">{row((1 - you) as Side)}<span className="truncate text-[11px] font-extrabold text-white">{oppNick}</span></span>
      </div>
    );
  }
  const totalSnaps = bv.turnNo === 1 ? firstSnaps : bv.snapsPerTurn;
  const mine = bv.turn === you;
  return (
    <div className="mt-1 flex w-full max-w-[380px] items-center justify-between gap-2 rounded-xl bg-navy-deep/60 px-2 py-1">
      <span className="text-[12px] font-extrabold text-white">Vez <b className="t-display text-[14px] text-gold">{bv.turnNo}</b> de {bv.maxTurns}</span>
      <span className="text-[11px] font-extrabold text-white/75">o 1º gol vence</span>
      <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-white/85">
        {mine ? 'seus' : 'dele'}
        <span className="flex gap-1" aria-label={`${bv.snapsLeft} petelecos nesta vez`}>
          {Array.from({ length: Math.max(totalSnaps, bv.snapsLeft) }, (_, i) => (
            <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${i < bv.snapsLeft ? 'border-[#B8860B] bg-gold' : 'border-white/40 bg-transparent'}`} />
          ))}
        </span>
      </span>
    </div>
  );
}

/** Retrospecto contra este adversário no X1, logo abaixo da barra dele: V·E·D e as últimas 5 (a mais recente primeiro). */
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
function OverResult({ over, me, limit, onClose }: { over: Over | null; me: { team: Team }; limit: number; onClose: () => void }) {
  if (!over) return <GoalOverlay open={false} goal={false} onClose={onClose} />;
  const won = over.winner === over.you;
  const opp = over.players?.[1 - over.you]?.nick ?? 'o adversário';
  const botao = over.game === 'BOTAO';
  // placar dos pênaltis com o do vencedor primeiro ("venceu por 3 x 2")
  const pm = over.pen ? over.pen[over.you].filter(Boolean).length : 0, po = over.pen ? over.pen[1 - over.you].filter(Boolean).length : 0;
  const penScore = won ? `${pm} x ${po}` : `${po} x ${pm}`;
  let title = 'PERDEU', text = '', goal = false, money = 0;
  if (over.training) { title = won ? 'VENCEU O TREINO' : 'FIM DO TREINO'; text = 'Treino contra bot não vale gol nem dinheiro. Desafie alguém de verdade!'; goal = won; }
  else if (over.refund) {
    title = 'EMPATE';
    text = over.why === 'wo-cedo' ? `A partida acabou antes de cada um jogar 2 vezes: os ${fmt(over.money)} voltaram.`
      : botao ? `Empate até nos pênaltis: os ${fmt(over.money)} voltaram.` : `Ninguém marcou em 10 jogadas: os ${fmt(over.money)} voltaram.`;
  } else if (won) {
    goal = true; money = over.money;
    title = over.goal ? 'GOOOL!!!' : 'VENCEU!';
    const why = over.why === 'limite' ? ` O gol não valeu: você já fez os ${limit} gols desta hora no X1.` : over.why === 'repetido' ? ` O gol não valeu: você ganhou de ${opp} duas vezes seguidas.` : '';
    const how = over.reason === 'penaltis' ? ` nos pênaltis (${penScore})` : '';
    const narr = over.goalText ?? `Você venceu ${opp}${how}!`;
    text = over.goal ? `${narr}${/[.!?]$/.test(narr) ? '' : '.'}${over.lost ? ` O ${over.lostTeam} perdeu 1 gol na rodada.` : ''}` : `Você venceu ${opp}${how} e levou ${fmt(over.money)}.${why}`;
  } else {
    text = over.reason === 'wo' ? `Você ficou fora e perdeu por W.O. para ${opp}.` : over.reason === 'desistiu' ? 'Você desistiu da partida.'
      : over.reason === 'gol-contra' ? `Gol contra! ${opp} venceu.` : over.reason === 'penaltis' ? `${opp} venceu nos pênaltis (${penScore}).` : `${opp} marcou primeiro.`;
    text += over.goal && over.lost ? ` O ${over.lostTeam} perdeu 1 gol na rodada.` : over.lossLimit ? ` Seu time não perdeu gol: já foram ${limit} nesta hora.` : ' Seu time não perdeu gol.';
  }
  // retrospecto contra o adversário já com esta partida + a frase de provocação (lib/rivalidade.js na API)
  const rival = !over.training && over.h2h ? over.h2h : null;
  return (
    <GoalOverlay open goal={goal} title={title} text={text} money={money} team={me.team} onClose={onClose} autoClose={rival ? 10000 : 6000}>
      {rival && <RivalryResult h2h={rival} opp={opp} line={over.rivalry?.text ?? null} />}
    </GoalOverlay>
  );
}
