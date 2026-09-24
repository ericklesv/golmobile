import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { api, token } from '../lib/api';
import { deviceQuery } from '../lib/device';
import { useAuth } from '../store/auth';
import type { PublicPlayer, Team, X1Game, X1Today } from '../lib/types';
import { GoalOverlay } from '../components/GoalOverlay';
import { RivalryResult } from '../components/Rivalry';
import { Avatar } from '../components/Avatar';
import { Shield } from '../components/Shield';
import { PregoBoard, type PregoBoardData } from '../components/PregoBoard';
import { BotaoField, BotaoDisc, type BotaoFieldData, type BotaoPiece } from '../components/BotaoField';
import { FutgolfCourse } from '../components/FutgolfCourse';
import { DRAMA, TiebreakDrama, type Drama } from '../components/FutgolfDrama';
import { golfActive, previewView, type FgCourse, type FgEvent, type FgFrame, type FgPoint, type FgView } from '../lib/futgolf';
import { TriondaBall, type TriondaApi } from '../components/TriondaBall';
import { toast } from '../components/Toast';
import { X1GameSwitchWatcher, advanceX1Today } from '../components/X1GameSwitch';
import { sound } from '../lib/sound';
import { money as fmt, timeLeft } from '../lib/format';
import { paintOf, matchPaints, previewPaints } from '../lib/paint';

/**
 * X1 — jogos 1x1 ao vivo, um por dia (pedido do dono, 15/09/2026: "cada dia 1 jogo para não ficar
 * enjoativo"): FutPrego (futebol de prego, uma vez de cada), Futebol de Botão (2 petelecos num botão seu
 * por vez; o 1º gol acaba; empate no fim vira DEATH MATCH) e Futgolf (os dois chutam AO MESMO TEMPO no mesmo
 * buraco; quem embocar primeiro vence — a câmera segue a sua bola, a do outro é um fantasma). Tudo passa pelo WebSocket /api/ws/x1?mode=game
 * (realtime/x1.js na API): desafiar, aceitar, petelecos e o fim. O servidor calcula tudo; esta tela só mostra
 * os quadros e manda direção + força. Quem joga do lado de cima vê o campo girado: sempre ataca para cima.
 * Estilingue: puxa para trás e solta (a bola / o botão vai para a frente).
 */

type Side = 0 | 1;
interface Player { id: number; nick: string; avatarUrl: string | null; team: Team; bot: boolean }
/** Provocar: careta (`icon`, em /ui/emotes/) ou frase (`text`); `vip` = só com VIP ativo (catálogo vem do servidor). */
interface ProvocarItem { key: string; icon?: string; text?: string; label?: string; vip?: boolean }
interface Provocar { gapMs: number; burst: number; burstMs: number; punishMs: number; showMs: number; list: ProvocarItem[] }
interface Rules {
  bet: number; turnSec: number; maxTurns: number; inviteSec: number; botAfterSec: number; maxGoalsPerHour: number; challengeCooldownSec?: number;
  botao?: { snapsPerTurn: number; firstTurnSnaps: number; snapSec: number; goalsToWin: number; maxTurns: number; death: { snapsPerTurn: number; drawAfter1v1: number } };
  futgolf?: { kickSec: number; overPar: number; tiebreaks: number };
  provocar?: Provocar;
}
interface Bubble { item: ProvocarItem; id: number }
/** Retrospecto contra o adversário desta partida no X1 (só partidas de verdade que terminaram; null no treino). */
interface H2H { total: number; wins: number; losses: number; draws: number; last: ('V' | 'D' | 'E')[]; lastAt: string | null }
// sameTeam = amistoso entre dois do mesmo time: vale só dinheiro (sem gol e fora do Ranking X1)
// freeplay = os dois na mesma internet: treino puro — sem aposta, sem gol e fora do Ranking X1 (17/09/2026)
interface MatchBase { id: number; you: Side; players: [Player, Player]; turnEndsAt: number; bet: number; training: boolean; sameTeam: boolean; freeplay?: boolean; h2h: H2H | null }
interface PregoMatch extends MatchBase {
  game: 'FUTPREGO'; board: PregoBoardData; ball: { x: number; y: number };
  turn: Side; turns: [number, number]; maxTurns: number; turnSec: number;
}
interface BotaoView {
  phase: 'play' | 'death'; pieces: BotaoPiece[]; ball: { x: number; y: number }; score: [number, number];
  turn: Side; turnNo: number; maxTurns: number; snapsLeft: number; snapsPerTurn: number; goalsToWin: number;
  /** DEATH MATCH: botões que sobraram de cada lado, rodadas já jogadas no 1x1 e em quantas dá empate. */
  death: { left: [number, number]; rounds1v1: number; drawAfter: number } | null;
}
interface BotaoMatch extends MatchBase { game: 'BOTAO'; field: BotaoFieldData; bv: BotaoView; snapSec: number }
/** Futgolf: o buraco (vem uma vez) e o andamento; `tiebreak` = a rodada aberta é de desempate. */
interface GolfMatch extends MatchBase { game: 'FUTGOLF'; course: FgCourse; fg: FgView; kickSec: number }
type Match = PregoMatch | BotaoMatch | GolfMatch;
type Cam = { x: number; y: number; w: number; h: number };
interface Over {
  game?: X1Game; winner: Side | null; reason: string; you: Side; training: boolean; money: number; pot?: number; goal?: boolean; why?: string | null;
  goalText?: string | null; lost?: boolean; lostTeam?: string | null; refund?: boolean; players?: Player[]; text?: string; late?: boolean;
  score?: [number, number] | null; lossLimit?: boolean;
  /** Futgolf: o andamento no fim (chutes de cada um, quem embocou) e o nome do buraco. */
  golf?: FgView & { hole: string };
  /** Quem não é VIP: até quando espera para desafiar de novo (null = pode já; ausente no treino). */
  cooldownUntil?: number | null;
  /** Retrospecto já com esta partida e a frase de provocação (só partida que entrou no retrospecto). */
  h2h?: H2H; rivalry?: { kind: string; text: string } | null;
  /** Cancelada pela atualização do jogo (deploy): aposta devolvida, nada contou; `text` explica. */
  canceled?: boolean;
}
interface OpenChallenge { id: number; game?: X1Game; gameName?: string; from: Player; at: number; sameTeam?: boolean; freeplay?: boolean }
interface Shown { ball: { x: number; y: number }; pieces: BotaoPiece[] }

const MAX_PULL = 120; // FutPrego: arrasto (em unidades da tábua) para a força máxima
const MAX_PULL_BOTAO = 110; // Botão: idem, puxando o botão
const XRAY_NICKS = ['MVGIC', 'ericklesv']; // Raio-X (tecla R): quem pode usar — e quem fica sabendo quando o outro usa
const DEFAULT_RULES: Rules = { bet: 200, turnSec: 15, maxTurns: 10, inviteSec: 10, botAfterSec: 60, maxGoalsPerHour: 10 };
const GAME_NAME: Record<X1Game, string> = { FUTPREGO: 'FutPrego', BOTAO: 'Futebol de Botão', FUTGOLF: 'Futgolf' };
const GOLF_PULL = 150; // Futgolf: arrasto (em pixels da tela) para a força máxima — a câmera muda a escala, a mão não
const GOLF_VIEW_W = 440; // Futgolf: largura (em unidades do campo) que a câmera mostra
const golfNick = (m: GolfMatch, side: number) => (side === m.you ? 'Você' : m.players[side].nick);
// paintOf / matchPaints (uniforme reserva quando os dois times se confundem, amistoso incluído): lib/paint.ts
const shownOf = (bv: BotaoView): Shown => ({ ball: { ...bv.ball }, pieces: bv.pieces.map((p) => ({ ...p })) });

/** Botões que `side` pode tocar agora (no death match os goleiros já saíram). */
const canMove = (bv: BotaoView, side: Side, p: BotaoPiece) => bv.turn === side && p.side === side;
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
  // Aviso do DEATH MATCH: some sozinho e NÃO entra no busyFx — senão trava a vez de quem ia jogar (bug de 16/09)
  const [deathFlash, setDeathFlash] = useState(false);
  const [over, setOver] = useState<Over | null>(null);
  const [lastResult, setLastResult] = useState<Over | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [season, setSeason] = useState<PublicPlayer['x1'] | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null); // sem VIP: espera para desafiar de novo
  // Provocar (caretas e frases prontas durante a partida; pedido do dono, 15/09/2026)
  const [tray, setTray] = useState(false);
  const [bubbles, setBubbles] = useState<[Bubble | null, Bubble | null]>([null, null]); // o balão de cada lado
  const [muted, setMuted] = useState(false); // silenciei o adversário nesta partida (só na minha tela)
  const [provocarUntil, setProvocarUntil] = useState(0); // próxima permitida (ritmo de 2 s ou castigo)
  const [drainUntil, setDrainUntil] = useState<number | null>(null); // atualização do jogo: a busca do X1 está travada até aqui
  // Raio-X (brincadeira do dono, 15/09/2026; só a conta MVGIC — o servidor também confere): a tecla R liga/desliga a
  // trajetória exata da mira, que o servidor simula com a mesma física do peteleco de verdade
  const [xray, setXray] = useState(false);
  const [oppXray, setOppXray] = useState(false); // o adversário (MVGIC/ericklesv) está com o Raio-X ligado
  const [preview, setPreview] = useState<{ path: [number, number][]; piece: [number, number][] | null; goal: string | null } | null>(null);
  // Futgolf: onde as bolas estão paradas, o efeito escolhido, a câmera, "ver o campo inteiro", as molas batidas e
  // qual bola está andando (a minha anima enquanto o outro ainda mira: as duas animações correm juntas)
  const [golfShown, setGolfShown] = useState<[FgPoint, FgPoint] | null>(null);
  const [spin, setSpin] = useState<-1 | 0 | 1>(0);
  const [overview, setOverview] = useState(false);
  const [cam, setCam] = useState<Cam | null>(null);
  const [bumps, setBumps] = useState<Record<number, number>>({});
  const [golfMoving, setGolfMoving] = useState<[boolean, boolean]>([false, false]);
  const golfBallEls = useRef<(SVGGElement | null)[]>([null, null]);
  const golfShadowEls = useRef<(SVGEllipseElement | null)[]>([null, null]); // sombra no chão quando a bola voa (rampa)
  const golfAnims = useRef<({ frames: FgFrame[]; cuts: Set<number>; start: number; onEnd: () => void } | null)[]>([null, null]);
  const golfRaf = useRef<number | null>(null);
  const panRaf = useRef<number | null>(null); // a câmera deslizando até a bola (ex.: voltando da lagoa)
  // desempate decidido na distância: as medidas em vermelho antes da janela do fim (a janela espera o `dramaTimer`)
  const [drama, setDrama] = useState<Drama | null>(null);
  const dramaTimer = useRef<number | null>(null);
  const golfBox = useRef<HTMLDivElement | null>(null);
  const camRef = useRef<Cam | null>(null);
  const overviewRef = useRef(false);
  overviewRef.current = overview;
  const previewSeq = useRef(0);
  const previewAt = useRef(0);
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
  const autoDesafio = useRef(params.get('desafiar') === '1'); // tutorial: já chega desafiando (components/Tutorial.tsx)
  const provocarRef = useRef<Provocar | null>(null); // onMessage é o do 1º render: catálogo e "silenciado" por ref
  const phaseRef = useRef(phase);
  const mutedRef = useRef(false);
  const bubbleSeq = useRef(0);
  matchRef.current = match;
  shownRef.current = shown;
  mutedRef.current = muted;
  phaseRef.current = phase;

  const send = (m: object) => { const ws = wsRef.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
  const placeBall = (x: number, y: number) => {
    ballRef.current?.setAttribute('transform', `translate(${x} ${y})`);
    const p = lastPos.current;
    if (p) ballApi.current?.roll(x - p.x, y - p.y); // teleporte (partida nova) não gira: só anda
    lastPos.current = { x, y };
  };

  // relógio da vez / da espera
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(iv); }, []);
  // Raio-X: tecla R (só MVGIC e ericklesv; o servidor confere de novo e avisa o outro)
  useEffect(() => {
    if (!XRAY_NICKS.includes(me.nick)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      setXray((v) => { toast(v ? 'Raio-X desligado' : 'Raio-X ligado: a trajetória aparece enquanto você mira'); send({ t: 'xray', on: !v }); return !v; });
      setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [me.nick]);
  // o servidor guarda o Raio-X por conexão: ao (re)conectar, conta de novo
  useEffect(() => { if (xray) send({ t: 'xray', on: true }); }, [phase === 'lobby' || phase === 'match']);
  // o jogo do dia vira às 19h, junto com a rodada (com a tela aberta): os jogos se alternam
  useEffect(() => {
    if (!today) return;
    const t = window.setTimeout(() => setToday((d) => (d ? advanceX1Today(d) : d)), Math.max(1000, today.switchAt - Date.now() + 1500));
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
      const ws = new WebSocket(`${proto}://${location.host}/api/ws/x1?mode=game&token=${encodeURIComponent(token.get() ?? '')}${deviceQuery()}`);
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
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); if (raf.current) cancelAnimationFrame(raf.current); if (golfRaf.current) cancelAnimationFrame(golfRaf.current); };
  }, []);

  function onMessage(m: any) {
    // enquanto a bola anda, vez/fim esperam na fila (a tela mostra tudo na ordem)
    if (animRef.current && ['turn', 'over', 'skip', 'bturn', 'bskip', 'ground'].includes(m.t)) { queue.current.push(m); return; }
    switch (m.t) {
      case 'hello':
        setRules(m.rules ?? DEFAULT_RULES);
        provocarRef.current = m.rules?.provocar ?? null;
        setDrainUntil(m.drain ?? null);
        if (m.today) setToday(m.today);
        setPhase((p) => (p === 'connecting' || p === 'offline' ? 'lobby' : p));
        if (acceptId.current) { send({ t: 'accept', id: acceptId.current }); acceptId.current = null; setParams({}, { replace: true }); }
        else if (autoDesafio.current) { autoDesafio.current = false; setParams({}, { replace: true }); send({ t: 'challenge' }); }
        break;
      case 'open': setOpen(m.list ?? []); break;
      case 'waiting': setBusy(false); setWaiting({ id: m.id, startedAt: m.at, botOffer: false, gameName: m.gameName ?? '' }); setPhase('waiting'); break;
      case 'bot-offer': setWaiting((w) => (w ? { ...w, botOffer: true } : w)); break;
      case 'canceled': setWaiting(null); setPhase('lobby'); break;
      case 'expired': toast(m.message, 'error'); setWaiting(null); setPhase('lobby'); break;
      case 'taken': setBusy(false); toast(m.message, 'error'); setWaiting(null); setPhase('lobby'); break;
      case 'error': setBusy(false); if (m.code === 'cooldown') setCooldownUntil(m.until ?? null); if (m.code === 'atualizacao') setDrainUntil(m.until ?? null); toast(m.message, 'error'); break;
      case 'cooldown': setCooldownUntil(m.until ?? null); break;
      case 'drain': setDrainUntil(m.until ?? null); break; // atualização do jogo: trava/destrava a busca
      case 'preview': if (m.seq === previewSeq.current) setPreview({ path: m.path ?? [], piece: m.piece ?? null, goal: m.goal ?? null }); break; // Raio-X: só a resposta da mira atual
      case 'xray-opp': setOppXray(!!m.on); if (m.on) toast('O adversário ligou o Raio-X!', 'error'); break;
      case 'no-match': // voltei "dentro" de uma partida ou espera que o servidor não tem mais (a API reiniciou)
        if (phaseRef.current === 'match' || phaseRef.current === 'waiting') {
          toast(phaseRef.current === 'match' ? 'A partida foi encerrada: o JogaGol foi atualizado. A aposta voltou e nada contou.' : 'A busca foi cancelada porque a conexão caiu. Desafie de novo.', 'error');
          setOver(null); setMatch(null); setShown(null); setWaiting(null); setTray(false); setGoalFlash(null); setBigText(null); setPhase('lobby'); refresh();
        }
        break;
      case 'kicked': setPhase('kicked'); break;
      case 'match': {
        setBusy(false); setWaiting(null); setOver(null); setAim(null); setSent(false); setGoalFlash(null); setBigText(null); setOppDropped(false); setConfirmLeave(false);
        setTray(false); setBubbles([null, null]); setProvocarUntil(0); if (!m.resumed) setMuted(false);
        stopDrama();
        setOppXray(!!m.oppXray); if (m.oppXray) toast('O adversário está com o Raio-X ligado!', 'error');
        const base = { id: m.id, you: m.you, players: m.players, turnEndsAt: m.turnEndsAt, bet: m.bet, training: m.training, sameTeam: !!m.sameTeam, freeplay: !!m.freeplay, h2h: m.h2h ?? null };
        let ball: { x: number; y: number };
        if (m.game === 'BOTAO') {
          const bv: BotaoView = m.botao;
          setMatch({ ...base, game: 'BOTAO', field: m.field, bv, snapSec: m.snapSec });
          setShown(shownOf(bv)); setSel(nearestPiece(bv, m.you)); setTurnOpen(true);
          ball = bv.ball;
        } else if (m.game === 'FUTGOLF') {
          const fg: FgView = m.fg;
          setMatch({ ...base, game: 'FUTGOLF', course: m.course, fg, kickSec: m.kickSec });
          setShown(null); setGolfShown([{ ...fg.balls[0] }, { ...fg.balls[1] }]); setGolfMoving([false, false]);
          golfAnims.current = [null, null];
          if (!m.resumed) { setSpin(0); setOverview(false); }
          setCam(null); camRef.current = null; // a câmera se ajusta quando o campo aparecer (golfFit)
          ball = fg.balls[m.you];
        } else {
          setMatch({ ...base, game: 'FUTPREGO', board: m.board, ball: m.ball, turn: m.turn, turns: m.turns, maxTurns: m.maxTurns, turnSec: m.turnSec });
          setShown(null);
          ball = m.ball;
        }
        setPhase('match');
        lastPos.current = null;
        if (m.game !== 'FUTGOLF') requestAnimationFrame(() => placeBall(ball.x, ball.y));
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
          // O servidor pode ter TIRADO botões nesta jogada: os goleiros quando o death match começa, ou o botão
          // que acabou de jogar. Aí a cena boa é a DELE — o último quadro da animação ainda tem os botões
          // antigos, e a seleção/mira passaria a sair do botão errado (bug de 16/09: "não consegui atacar
          // quando eu sou o primeiro do death match", com os goleiros ainda desenhados em campo).
          const mesmosBotoes = !!before && m.botao?.pieces?.length === before.pieces.length;
          if (mesmosBotoes) setShown({ ball: { x: last[0][0], y: last[0][1] }, pieces: before.pieces.map((p, j) => ({ ...p, x: last[j + 1]?.[0] ?? p.x, y: last[j + 1]?.[1] ?? p.y })) });
          else setShown(shownOf(m.botao));
          setMatch((x) => (x && x.game === 'BOTAO' ? { ...x, bv: m.botao } : x));
          if (m.goal) { setGoalFlash(m.goal.side === 0 ? 'top' : 'bottom'); setBigText(m.goal.own ? 'GOL CONTRA!' : 'GOL!'); }
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
        if (m.deathStart) {
          setDeathFlash(true);
          window.setTimeout(() => setDeathFlash(false), 1800);
          flashNotice('Sem gol: os goleiros saem, força máxima e cada jogada custa um botão.');
        }
        if (bv.turn === x.you) sound.play('pop');
        break;
      }
      case 'bskip': {
        const x = matchRef.current;
        if (!x || x.game !== 'BOTAO') break;
        const morte = x.bv.phase === 'death';
        setMatch({ ...x, bv: m.botao }); setShown(shownOf(m.botao)); setTurnOpen(false); setAim(null);
        const who = m.side === x.you ? 'Você' : x.players[m.side].nick;
        flashNotice(morte ? `${who} perdeu o peteleco (tempo) e perdeu um botão.` : `${who} perdeu o peteleco (tempo).`);
        break;
      }
      // Futgolf
      case 'ground': { // rodada nova: todo mundo que ainda joga chuta de novo
        const x = matchRef.current;
        if (!x || x.game !== 'FUTGOLF') break;
        const fg: FgView = m.fg;
        // do 2º desempate em diante o servidor manda o CAMPO DO DESEMPATE junto: troca o campo e a câmera pula para ele
        const course: FgCourse = m.course ?? x.course;
        if (m.course) { camRef.current = null; setBumps({}); }
        setMatch({ ...x, course, fg, turnEndsAt: m.turnEndsAt });
        setGolfShown([{ ...fg.balls[0] }, { ...fg.balls[1] }]);
        for (const side of [0, 1] as const) placeGolfBall(side, fg.balls[side].x, fg.balls[side].y, 0, false);
        lastPos.current = { ...fg.balls[x.you] };
        setAim(null); setSent(false); setBigText(null); setGoalFlash(null);
        golfFollow({ ...x, course }, fg, fg.balls[x.you]);
        if (m.tiebreak) flashNotice(m.course ? `DESEMPATE (${fg.tbCount}º) no CAMPO DO DESEMPATE: um chute de cada. Mais perto do buraco vence.` : `DESEMPATE${fg.tbCount > 1 ? ` (${fg.tbCount}º)` : ''}: um chute de cada, do X. Mais perto do buraco vence.`);
        if (golfActive(fg, x.you)) sound.play('pop');
        break;
      }
      case 'gshot': {
        const x = matchRef.current;
        if (!x || x.game !== 'FUTGOLF') break;
        const side = m.side as Side, fg: FgView = m.fg, events: FgEvent[] = m.events ?? [];
        if (side === x.you) { setSent(false); setAim(null); setPreview(null); }
        setMatch({ ...x, fg: { ...fg, balls: x.fg.balls } }); // o placar muda já; as bolas, quando pararem
        const frames: FgFrame[] = m.frames;
        const cuts = new Set(events.filter((e) => e.t === 'tunel').map((e) => e.f));
        const who = golfNick(x, side);
        for (const e of events) {
          const at = (e.f * 1000) / 30;
          if (e.t === 'mola' && e.i !== undefined) window.setTimeout(() => { setBumps((b) => ({ ...b, [e.i!]: Date.now() })); if (side === x.you) sound.play('tap'); }, at);
          else if (e.t === 'agua') window.setTimeout(() => flashNotice(side === x.you ? 'Na lagoa! A bola volta de onde saiu.' : `${who} caiu na lagoa!`), at);
          else if (e.t === 'tunel') window.setTimeout(() => {
            if (side === x.you) sound.play('pop');
            if (e.azar === undefined) return; // bueiro de duas saídas: sorte ou azar
            const n = (e.i ?? 0) + 1;
            flashNotice(side === x.you ? (e.azar ? `Azar! O bueiro ${n} te jogou lá para trás.` : `Sorte! O bueiro ${n} te levou para perto do buraco.`) : `${who} ${e.azar ? 'deu azar' : 'deu sorte'} no bueiro ${n}!`);
          }, at);
          else if ((e.t === 'rampa' || e.t === 'pouso') && side === x.you) window.setTimeout(() => sound.play(e.t === 'rampa' ? 'pop' : 'tap'), at);
          else if (e.t === 'beirada') window.setTimeout(() => { flashNotice(side === x.you ? 'Tirou tinta! Veio forte demais para cair.' : `${who} tirou tinta do buraco!`); if (side === x.you) sound.play('tap'); }, at);
        }
        setGolfMoving((g) => { const n: [boolean, boolean] = [g[0], g[1]]; n[side] = true; return n; });
        golfAnimate(side, frames, cuts, () => {
          setGolfMoving((g) => { const n: [boolean, boolean] = [g[0], g[1]]; n[side] = false; return n; });
          setGolfShown((b) => { const n: [FgPoint, FgPoint] = b ? [b[0], b[1]] : [fg.balls[0], fg.balls[1]]; n[side] = { ...fg.balls[side] }; return n; });
          golfBallEls.current[side]?.setAttribute('transform', `translate(${fg.balls[side].x} ${fg.balls[side].y})`);
          setMatch((mm) => (mm && mm.game === 'FUTGOLF' ? { ...mm, fg: { ...mm.fg, balls: mm.fg.balls.map((bb, i) => (i === side ? { ...fg.balls[side] } : bb)) as [FgPoint, FgPoint] } } : mm));
          if (m.holed) {
            if (side === x.you) { setBigText(fg.phase === 'tiebreak' ? 'NO BURACO!' : 'EMBOCOU!'); sound.play('goal'); window.setTimeout(() => setBigText((t) => (t === 'EMBOCOU!' || t === 'NO BURACO!' ? null : t)), 1600); }
            else flashNotice(`${who} embocou!`);
          }
          if (side === x.you) golfFollow(x, fg, fg.balls[side]);
        });
        break;
      }
      case 'gskip': {
        const x = matchRef.current;
        if (!x || x.game !== 'FUTGOLF') break;
        setMatch({ ...x, fg: { ...m.fg, balls: x.fg.balls } });
        if (m.side === x.you) { setAim(null); setSent(false); }
        flashNotice(m.side === x.you ? 'Você perdeu o chute (tempo): conta 1.' : `${x.players[m.side].nick} perdeu o chute (tempo).`);
        break;
      }
      case 'opp-dropped': setOppDropped(true); break;
      case 'opp-back': setOppDropped(false); break;
      case 'provocar': {
        const mt = matchRef.current;
        const item = provocarRef.current?.list.find((e) => e.key === m.key);
        if (!mt || !item) break;
        const side = m.side as Side;
        if (side !== mt.you && mutedRef.current) break; // silenciado: nem balão nem som
        const id = ++bubbleSeq.current;
        setBubbles((b) => { const n: [Bubble | null, Bubble | null] = [b[0], b[1]]; n[side] = { item, id }; return n; });
        window.setTimeout(() => setBubbles((b) => { if (b[side]?.id !== id) return b; const n: [Bubble | null, Bubble | null] = [b[0], b[1]]; n[side] = null; return n; }), provocarRef.current?.showMs ?? 2800);
        if (side !== mt.you) sound.play('pop');
        break;
      }
      case 'provocar-wait': setProvocarUntil(m.until ?? 0); toast('Calma, campeão: 10 s sem provocar.', 'error'); break;
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

  // ─── Futgolf: as duas bolas podem andar ao mesmo tempo ──────────────────────
  /** Janela da câmera: o campo na largura, com a bola um pouco abaixo do meio (dá para ver o caminho à frente). */
  function golfCamAt(c: FgCourse, p: FgPoint): Cam {
    const el = golfBox.current;
    const ratio = el && el.clientWidth ? el.clientHeight / el.clientWidth : 1.4;
    const w = GOLF_VIEW_W, h = w * ratio;
    return { x: (c.W - w) / 2, y: Math.max(-34, Math.min(c.H + 34 - h, p.y - h * 0.58)), w, h };
  }
  const golfWhole = (c: FgCourse): Cam => ({ x: -34, y: -34, w: c.W + 68, h: c.H + 68 });
  /** Janela que mostra todos estes pontos com folga (o desempate: o buraco e as duas bolas). */
  function golfFitCam(pts: FgPoint[]): Cam {
    const el = golfBox.current;
    const ratio = el && el.clientWidth ? el.clientHeight / el.clientWidth : 1.4;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), pad = 80;
    let w = Math.max(280, Math.max(...xs) - Math.min(...xs) + pad * 2);
    w = Math.max(w, (Math.max(...ys) - Math.min(...ys) + pad * 2 + 40) / ratio);
    const h = w * ratio, cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2 - 12;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  /** Leva a câmera para a bola que importa: a minha — ou, se eu já saí do buraco, a do outro. */
  function golfFollow(x: GolfMatch, fg: FgView, p: FgPoint) {
    const mine = golfActive(fg, x.you) || fg.phase === 'tiebreak' ? p : fg.balls[1 - x.you];
    golfPan(golfCamAt(x.course, mine));
  }
  /**
   * Desliza a câmera até `to` (meio segundo). Escreve o viewBox direto no DOM, como a câmera que segue a bola: se só
   * mudasse o estado, voltar da lagoa não mexia em nada — a bola volta EXATAMENTE para onde estava antes do chute, a
   * câmera "nova" era igual à última que o React desenhou e ele não tocava no viewBox, que ficava na lagoa (dono,
   * 24/09/2026: "ao cair na água, a nossa visão não está voltando para a bola").
   */
  function golfPan(to: Cam, ms = 500) {
    if (panRaf.current) { cancelAnimationFrame(panRaf.current); panRaf.current = null; }
    const from = camRef.current;
    camRef.current = to;
    if (overviewRef.current) { setCam(to); return; } // vendo o campo inteiro: a janela volta quando sair dele
    if (!from || Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.w - to.w) < 1) { setViewBox(to); setCam(to); return; }
    const t0 = performance.now();
    const step = (t: number) => {
      if (golfRaf.current) { panRaf.current = null; return; } // uma bola voltou a andar: a câmera dela manda
      const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setViewBox({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (k < 1) { panRaf.current = requestAnimationFrame(step); return; }
      panRaf.current = null; setCam({ ...to });
    };
    panRaf.current = requestAnimationFrame(step);
  }
  function setViewBox(c: Cam) { svgRef.current?.setAttribute('viewBox', `${c.x} ${c.y} ${c.w} ${c.h}`); }
  /** Põe a bola no lugar; `z` = altura (no ar depois de uma rampa: sobe, cresce e deixa a sombra no chão). */
  function placeGolfBall(side: number, x: number, y: number, z = 0, roll = true) {
    golfBallEls.current[side]?.setAttribute('transform', z > 0.5 ? `translate(${x} ${y - z}) scale(${1 + z / 90})` : `translate(${x} ${y})`);
    const sh = golfShadowEls.current[side];
    if (sh) { sh.setAttribute('cx', String(x + z * 0.25)); sh.setAttribute('cy', String(y + 2)); sh.setAttribute('opacity', z > 0.5 ? String(Math.max(0.12, 0.34 - z / 300)) : '0'); }
    const mt = matchRef.current;
    if (roll && mt && side === mt.you) {
      const p = lastPos.current;
      if (p) ballApi.current?.roll(x - p.x, y - p.y);
      lastPos.current = { x, y };
    }
  }
  function golfAnimate(side: number, frames: FgFrame[], cuts: Set<number>, onEnd: () => void) {
    golfAnims.current[side] = { frames, cuts, start: performance.now(), onEnd };
    animRef.current = true; setAnimating(true);
    if (!golfRaf.current) golfRaf.current = requestAnimationFrame(golfStep);
  }
  function golfStep(t: number) {
    const mt = matchRef.current;
    let any = false;
    for (const side of [0, 1]) {
      const a = golfAnims.current[side];
      if (!a) continue;
      const f = Math.max(0, ((t - a.start) / 1000) * 30), i = Math.floor(f);
      if (i >= a.frames.length - 1) {
        const last = a.frames[a.frames.length - 1];
        placeGolfBall(side, last[0], last[1], last[2] ?? 0);
        golfAnims.current[side] = null;
        a.onEnd();
        continue;
      }
      any = true;
      const f0 = a.frames[i], f1 = a.frames[i + 1];
      const k = a.cuts.has(i + 1) ? 0 : f - i; // bueiro: some num lugar e aparece no outro, sem "voar" entre eles
      const x = f0[0] + (f1[0] - f0[0]) * k, y = f0[1] + (f1[1] - f0[1]) * k, z = (f0[2] ?? 0) + ((f1[2] ?? 0) - (f0[2] ?? 0)) * k;
      placeGolfBall(side, x, y, z);
      // a câmera acompanha a bola que importa (sem re-render: mexe no viewBox direto)
      if (mt && mt.game === 'FUTGOLF' && !overviewRef.current && camRef.current) {
        const follow = golfActive(mt.fg, mt.you) || mt.fg.phase === 'tiebreak' || mt.fg.kicked[mt.you] ? mt.you : 1 - mt.you;
        if (side === follow || (side !== mt.you && !golfAnims.current[mt.you] && !golfActive(mt.fg, mt.you))) {
          const target = golfCamAt(mt.course, { x, y });
          const c = camRef.current;
          const ny = c.y + (target.y - c.y) * (a.cuts.has(i + 1) ? 1 : 0.12);
          camRef.current = { ...c, y: ny }; setViewBox(camRef.current);
        }
      }
    }
    if (any) { golfRaf.current = requestAnimationFrame(golfStep); return; }
    golfRaf.current = null; animRef.current = false; setAnimating(false);
    if (camRef.current && !panRaf.current) setCam({ ...camRef.current }); // (deslizando: o fim do deslize grava)
    queue.current.splice(0).forEach(onMessage);
  }

  /**
   * Desempate decidido NA DISTÂNCIA (ninguém embocou, as duas bolas no campo): antes da janela do fim, a distância de
   * cada bola até o buraco cresce em vermelho, uma de cada vez e em ordem SORTEADA (dono, 24/09/2026: "de forma
   * dramática… totalmente aleatória… não demorar mais que 7 s"). DRAMA.end = 6,3 s.
   */
  function startDrama(o: Over): boolean {
    const mt = matchRef.current, g = o.golf;
    if (!mt || mt.game !== 'FUTGOLF' || !g || o.reason !== 'desempate' || o.winner === null) return false;
    const [d0, d1] = g.tbDist;
    if (d0 === null || d1 === null || d0 <= 0 || d1 <= 0) return false; // alguém embocou ou caiu na água/perdeu o tempo
    const d: Drama = { order: Math.random() < 0.5 ? [0, 1] : [1, 0], dist: [d0, d1], balls: [{ ...g.balls[0] }, { ...g.balls[1] }], cup: { ...mt.course.cup }, winner: o.winner, you: o.you, nicks: [golfNick(mt, 0), golfNick(mt, 1)], t0: performance.now() };
    setOverview(false); overviewRef.current = false;
    golfPan(golfFitCam([d.cup, ...d.balls]), 700);
    setDrama(d);
    d.order.forEach((_, k) => {
      const s0 = DRAMA.start + k * (DRAMA.grow + DRAMA.gap);
      window.setTimeout(() => sound.play('pop'), s0);
      window.setTimeout(() => sound.play('tap'), s0 + DRAMA.grow);
    });
    dramaTimer.current = window.setTimeout(() => { dramaTimer.current = null; setDrama(null); showOver(o, true); }, DRAMA.end);
    return true;
  }
  function stopDrama() {
    if (dramaTimer.current) window.clearTimeout(dramaTimer.current);
    dramaTimer.current = null; setDrama(null);
  }
  function showOver(o: Over, afterDrama = false) {
    if (!afterDrama && startDrama(o)) return;
    setOver(o); setLastResult(o); setAim(null); setSent(false); setTray(false);
    if (o.cooldownUntil !== undefined) setCooldownUntil(o.cooldownUntil); // o relógio começa quando a partida acaba
    if (!o.training) refresh();
  }
  function closeOver() { stopDrama(); setOver(null); setMatch(null); setShown(null); setGolfShown(null); setGoalFlash(null); setBigText(null); setOverview(false); setPhase('lobby'); }

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
  /** Manda uma provocação: o balão só aparece quando o servidor devolve (as duas telas ficam iguais). */
  function provocar(item: ProvocarItem) {
    if (item.vip && !me.vip) { toast('Essa é só para VIP. Vire VIP e provoque à vontade!', 'error'); return; }
    const n = now();
    if (provocarUntil > n) return;
    send({ t: 'provocar', key: item.key });
    setProvocarUntil(n + (rules.provocar?.gapMs ?? 2000));
    setTray(false);
    sound.play('tap');
  }
  function muteOpp() { setMuted(true); setTray(false); setBubbles((b) => (match ? [match.you === 0 ? b[0] : null, match.you === 1 ? b[1] : null] : b)); }
  function leave() {
    if (phase === 'match' && match && !over) { setConfirmLeave(true); return; }
    if (phase === 'waiting') send({ t: 'cancel' });
    nav('/');
  }
  function giveUp() { send({ t: 'giveup' }); setConfirmLeave(false); }

  // ─── estilingue ───────────────────────────────────────────────────────────
  const busyFx = animating || sent || !!over || !!goalFlash || !!bigText;
  // Futgolf: a bola do outro andando não trava a minha mira (os dois chutam ao mesmo tempo); a rodada abre em
  // turnEndsAt − kickSec (antes disso o servidor ignora o chute)
  const golfOpen = !!match && match.game === 'FUTGOLF' && now() >= match.turnEndsAt - match.kickSec * 1000 - 300;
  const myTurn = !!match && (match.game === 'FUTGOLF'
    ? golfOpen && golfActive(match.fg, match.you) && !match.fg.kicked[match.you] && !golfMoving[match.you] && !sent && !over
    : !busyFx && (match.game === 'FUTPREGO' ? match.turn === match.you : match.bv.turn === match.you && turnOpen));
  function toSvg(e: React.PointerEvent) {
    const svg = svgRef.current!, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  }
  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!myTurn || !match) return;
    if (match.game === 'FUTGOLF') { // puxa de qualquer lugar do campo (em pixels: a escala muda com a câmera)
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY };
      return;
    }
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
    if (match.game === 'FUTGOLF') {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y, len = Math.hypot(dx, dy);
      if (len < 6) return null;
      return { sx: -dx / len, sy: -dy / len, power: Math.min(1, len / GOLF_PULL) };
    }
    const p = toSvg(e);
    const dx = p.x - drag.current.x, dy = p.y - drag.current.y; // arrasto na tela
    const len = Math.hypot(dx, dy);
    if (len < 4) return null;
    // vai para o lado contrário do arrasto; quem está girado (lado de cima) tem o eixo invertido
    const flip = match.you === 1;
    return { sx: (flip ? dx : -dx) / len, sy: (flip ? dy : -dy) / len, power: Math.min(1, len / (match.game === 'BOTAO' ? MAX_PULL_BOTAO : MAX_PULL)) };
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const a = aimFrom(e);
    setAim(a);
    // Raio-X: pede ao servidor a trajetória desta mira (no máximo ~12 por segundo; a resposta traz o seq da mira)
    if (xray && a && myTurn && match && a.power >= 0.06 && performance.now() - previewAt.current > 80) {
      if (match.game === 'BOTAO' && sel === null) return;
      previewAt.current = performance.now();
      const seq = ++previewSeq.current;
      send(match.game === 'BOTAO' ? { t: 'preview', seq, idx: sel, dx: a.sx, dy: a.sy, power: a.power } : { t: 'preview', seq, dx: a.sx, dy: a.sy, power: a.power, spin });
    }
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    const a = aimFrom(e); // o ponto onde o dedo soltou vale (não o último quadro desenhado)
    drag.current = null;
    setPreview(null); previewSeq.current++;
    if (!a || !myTurn || !match || a.power < (match.game === 'FUTGOLF' ? 0.03 : 0.06)) { setAim(null); return; }
    if (match.game === 'FUTGOLF') send({ t: 'gkick', dx: a.sx, dy: a.sy, power: a.power, spin });
    else if (match.game === 'BOTAO') {
      if (sel === null) { setAim(null); return; }
      const forca = match.bv.phase === 'death' ? 1 : a.power; // death match: sempre força máxima
      send({ t: 'snap', idx: sel, dx: a.sx, dy: a.sy, power: forca });
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
      cooldownLeft={cooldownUntil ? Math.max(0, cooldownUntil - now()) : 0} drain={!!drainUntil && drainUntil > now()}
      onChallenge={challenge} onAccept={accept} board={meta?.futprego?.board} field={meta?.x1?.field} kickoff={meta?.x1?.kickoff} golfPreview={meta?.x1?.futgolf?.preview} />
  );
  else if (phase === 'waiting' && waiting) body = (
    <Waiting rules={rules} gameName={waiting.gameName || today?.name || ''} elapsed={Math.max(0, now() - waiting.startedAt)} botOffer={waiting.botOffer}
      onCancel={() => send({ t: 'cancel' })} onBot={() => send({ t: 'bot' })} onKeep={() => setWaiting({ ...waiting, botOffer: false })} />
  );
  else if (phase === 'match' && match) {
    const you = match.you, opp = (1 - you) as Side;
    const { paint, reserve: reserveSide } = matchPaints(paintOf(match.players[0].team), paintOf(match.players[1].team));
    const h2hOn = !match.training && !!match.h2h;
    const bigOverlay = (
      <AnimatePresence>
        {notice && (
          <motion.div key={notice} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center px-4">
            <span className="rounded-xl bg-navy-deep/85 px-3 py-1.5 text-center text-[13px] font-extrabold text-white">{notice}</span>
          </motion.div>
        )}
        {deathFlash && !bigText && (
          <motion.div key="dm" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }} className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
            <span className="t-display t-gold text-[46px] leading-none">DEATH MATCH!</span>
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
    const reserve = reserveSide === null ? '' : reserveSide === you ? ' · você de uniforme reserva' : ' · o adversário de uniforme reserva';
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
          {xray && preview && <XrayPath path={preview.path} goal={preview.goal} r={match.board.ball} />}
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
    } else if (match.game === 'FUTGOLF') {
      const { fg, course: C } = match;
      const tb = fg.phase === 'tiebreak';
      const balls = golfShown ?? fg.balls;
      left = Math.max(0, Math.min(match.kickSec, Math.ceil((match.turnEndsAt - now()) / 1000))); total = match.kickSec;
      const oppPlays = golfActive(fg, opp), mePlays = golfActive(fg, you);
      oppActive = oppPlays && !fg.kicked[opp] && golfOpen; meActive = myTurn;
      const state = (side: Side) => (fg.holed[side] && !tb ? 'embocou' : fg.out[side] && !tb ? 'pegou a bola' : null);
      oppLabel = oppDropped ? 'caiu, esperando voltar' : state(opp) ?? (golfMoving[opp] ? 'a bola dele está andando' : fg.kicked[opp] ? 'já chutou' : oppActive ? 'mirando…' : null);
      meLabel = myTurn ? (aim ? `força ${Math.round(aim.power * 100)}%` : 'puxe e solte') : state(you) ?? (golfMoving[you] ? null : fg.kicked[you] && oppPlays ? `esperando ${match.players[opp].nick}` : null);
      extraH = 64; foot = `Futgolf · ${C.name} (par ${fg.par})`;
      const me = balls[you], other = balls[opp];
      const L = aim ? 30 + aim.power * 150 : 0;
      // mira: o efeito puxa a bola para o lado dele aos poucos (mais no fim), então a ponta da linha vai para esse lado
      // (+1 = direita de quem chuta; na tela, a direita de (sx, sy) é (−sy, sx) — a mesma conta da física). Antes a
      // ponta ia para o lado CONTRÁRIO e parecia que as setas do efeito estavam invertidas (dono, 24/09/2026).
      const side = aim ? spin * L * 0.3 : 0;
      const tip = aim ? { x: me.x + aim.sx * L - aim.sy * side, y: me.y + aim.sy * L + aim.sx * side } : null;
      const ctrl = aim ? { x: me.x + aim.sx * L * 0.55, y: me.y + aim.sy * L * 0.55 } : null;
      const overlay = aim && myTurn && tip && ctrl ? (
        <g pointerEvents="none">
          {xray && preview && <XrayPath path={preview.path} goal={preview.goal} r={C.ball} />}
          <line x1={me.x} y1={me.y} x2={me.x - aim.sx * aim.power * 46} y2={me.y - aim.sy * aim.power * 46} stroke="#0B2D6B" strokeOpacity="0.6" strokeWidth="4" strokeLinecap="round" />
          <path d={`M${me.x} ${me.y} Q${ctrl.x} ${ctrl.y} ${tip.x} ${tip.y}`} fill="none" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
          <circle cx={tip.x} cy={tip.y} r="4" fill="#FFFFFF" />
          <circle cx={me.x} cy={me.y} r={C.ball + 6} fill="none" stroke={powerColor(aim.power)} strokeWidth="3" />
        </g>
      ) : myTurn ? (
        <circle cx={me.x} cy={me.y} r={C.ball + 7} fill="none" stroke="#FFD54A" strokeWidth="2.5" pointerEvents="none">
          <animate attributeName="r" values={`${C.ball + 5};${C.ball + 11};${C.ball + 5}`} dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
        </circle>
      ) : null;
      const oppPaint = paint[opp].primary;
      const view = overview ? golfWhole(C) : cam;
      center = (
        <div ref={(el) => {
          golfBox.current = el;
          if (el && !camRef.current && match.game === 'FUTGOLF') { const c = golfCamAt(C, balls[you]); camRef.current = c; window.setTimeout(() => setCam(c), 0); }
        }} className="relative w-full overflow-hidden rounded-[18px] border-[3px] border-navy-deep shadow-[0_5px_0_rgba(0,0,0,0.25)]" style={{ height: 'clamp(280px, calc(100dvh - 378px), 560px)' }}>
          <FutgolfCourse ref={svgRef} course={C} view={view} bumps={bumps} tiebreak={tb} wind={fg.wind} className={`h-full w-full ${myTurn ? 'cursor-grab' : ''}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setAim(null); }}>
            {overlay}
            {([opp, you] as const).map((sd) => <ellipse key={`sh${sd}`} ref={(el) => { golfShadowEls.current[sd] = el; }} cx={balls[sd].x} cy={balls[sd].y} rx={C.ball} ry={C.ball * 0.6} fill="#000" opacity="0" pointerEvents="none" />)}
            {(golfActive(fg, opp) || golfMoving[opp] || tb) && !(fg.holed[opp] && !golfMoving[opp] && !tb) && (
              <g ref={(el) => { golfBallEls.current[opp] = el; }} transform={`translate(${other.x} ${other.y})`} opacity="0.6" pointerEvents="none">
                <circle r={C.ball + 3} fill="none" stroke={oppPaint} strokeWidth="3" />
                <circle r={C.ball} fill="#FFFFFF" />
              </g>
            )}
            {!(fg.holed[you] && !golfMoving[you] && !tb) && (
              <g ref={(el) => { golfBallEls.current[you] = el; }} transform={`translate(${me.x} ${me.y})`} pointerEvents="none"><TriondaBall ref={ballApi} r={C.ball} /></g>
            )}
            {drama && <TiebreakDrama d={drama} r={C.ball} />}
          </FutgolfCourse>
          {drama ? (
            <>
              <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.5) 100%)' }} />
              <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 animate-pulse whitespace-nowrap rounded-xl bg-[#D62828] px-3 py-1 font-display text-[14px] text-white shadow-[0_3px_0_rgba(0,0,0,0.3)]">QUEM FICOU MAIS PERTO?</span>
            </>
          ) : (
            <>
              <button onClick={() => setOverview((v) => !v)} className="no-drag absolute right-2 top-2 rounded-xl bg-navy-deep/80 px-2.5 py-1 font-display text-[12px] text-white" aria-pressed={overview}>
                {overview ? 'Seguir a bola' : 'Ver o campo'}
              </button>
              {tb && <span className="pointer-events-none absolute left-2 top-2 rounded-xl bg-gold px-2 py-0.5 font-display text-[12px] text-navy-deep">DESEMPATE: mais perto vence</span>}
            </>
          )}
          <WindChip wind={fg.wind} />
        </div>
      );
    } else {
      const { bv, field: F } = match;
      const morte = bv.phase === 'death';
      left = Math.max(0, Math.min(match.snapSec, Math.ceil((match.turnEndsAt - now()) / 1000))); total = match.snapSec;
      oppActive = bv.turn === opp && turnOpen && !animating; meActive = myTurn;
      oppLabel = oppDropped ? 'caiu, esperando voltar' : oppActive ? 'vez dele' : null;
      meLabel = myTurn
        ? (aim ? (morte ? 'força máxima' : `força ${Math.round(aim.power * 100)}%`) : morte ? 'só mire: a força é máxima' : 'toque num botão seu e puxe')
        : bv.turn === you && bv.snapsLeft > 0 && !busyFx ? 'sua vez' : null;
      extraH = 30; foot = morte ? 'Futebol de Botão · DEATH MATCH' : 'Futebol de Botão';
      const s = shown ?? shownOf(bv);
      const selP = sel !== null ? s.pieces[sel] : null;
      const L = aim ? (morte ? 150 : 30 + aim.power * 120) : 0; // no death match a mira já mostra a força cheia
      const overlay = aim && myTurn && selP ? (
        <g pointerEvents="none">
          {xray && preview && <XrayPath path={preview.path} piece={preview.piece} goal={preview.goal} r={F.ball} />}
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
        <PlayerBar p={match.players[opp]} active={oppActive} left={left} total={total} label={oppLabel} bubble={bubbles[opp]} muted={muted} onMute={muteOpp} xray={oppXray} />
        {h2hOn && <H2HStrip h2h={match.h2h!} opp={match.players[opp].nick} />}
        {match.game === 'BOTAO' && <BotaoStrip bv={match.bv} you={you} oppNick={match.players[opp].nick} firstSnaps={rules.botao?.firstTurnSnaps ?? 1} />}
        {match.game === 'FUTGOLF' && <GolfStrip m={match} />}
        <div className="relative my-1.5" style={{ width: match.game === 'FUTGOLF' ? 'min(92vw, 380px)' : `min(92vw, 380px, calc((100dvh - ${250 + (h2hOn ? 26 : 0) + extraH}px) * 0.62))` }}>
          {center}
          {bigOverlay}
        </div>
        {match.game === 'FUTGOLF' && <SpinPicker spin={spin} onPick={setSpin} disabled={!golfActive(match.fg, you)} />}
        <PlayerBar p={match.players[you]} me active={meActive} left={left} total={total} label={meLabel} bubble={bubbles[you]} />
        <div className="mt-1 flex w-full max-w-[380px] items-center justify-between gap-2 px-1">
          <span className="min-w-0 text-[11px] font-extrabold leading-tight text-white/80">{match.training ? 'Treino contra bot: não vale gol nem dinheiro' : match.freeplay ? 'Treino: vocês estão na mesma internet — sem aposta e sem gol' : match.sameTeam ? `Amistoso do seu time: valendo ${fmt(match.bet * 2)}, sem gol` : `Valendo ${fmt(match.bet * 2)} e 1 gol`}<br />{foot}{reserve}{xray && <span className="ml-1 rounded bg-gold px-1 text-[9px] text-navy-deep">RAIO-X</span>}</span>
          <div className="flex shrink-0 items-center gap-2">
            <ProvocarButton left={Math.max(0, provocarUntil - now())} gapMs={rules.provocar?.gapMs ?? 2000} punishMs={rules.provocar?.punishMs ?? 10000} onClick={() => setTray(true)} />
            <button onClick={() => setConfirmLeave(true)} className="btn btn-gray btn-sm">Desistir</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-frame relative flex min-h-full flex-col">
        <div className="stadium-bg" />
        <OverResult over={over} me={me} limit={rules.maxGoalsPerHour} onClose={closeOver} />
        {phase === 'lobby' && <X1GameSwitchWatcher gate={false} />}
        {header}
        <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-3" style={{ paddingBottom: 'calc(var(--sab) + 12px)' }}>{body}</div>
        <AnimatePresence>
          {tray && match && (
            <ProvocarTray key="provocar" items={rules.provocar?.list ?? []} vip={me.vip} oppNick={match.players[1 - match.you].nick} muted={muted}
              onPick={provocar} onMute={muteOpp} onUnmute={() => setMuted(false)} onClose={() => setTray(false)} />
          )}
          {confirmLeave && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-y-0 left-1/2 z-[80] flex w-full max-w-[480px] -translate-x-1/2 items-center bg-navy-deep/70 px-4" role="dialog" aria-modal="true">
              <div className="panel w-full text-center text-navy-ink">
                <div className="t-display text-[20px]">Desistir da partida?</div>
                <p className="mt-1 text-[13px] font-bold leading-snug text-muted">{match?.training || match?.freeplay ? 'É só um treino: nada muda.' : match?.sameTeam ? 'Conta como derrota: você perde a aposta. Fechar o app dá no mesmo.' : 'Conta como derrota: você perde a aposta, o ponto no Ranking X1 e o seu time pode perder 1 gol. Fechar o app dá no mesmo.'}</p>
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
  const g = r.futgolf;
  if (game === 'FUTGOLF') return {
    main: `Futgolf 1x1: os dois chutam AO MESMO TEMPO no mesmo buraco (${g?.kickSec ?? 20} s por chute). Puxe a bola e solte; escolha o efeito para curvar. O VENTO muda a cada rodada e empurra a bola enquanto ela rola — a bandeira mostra para onde. Setas dão velocidade, molas devolvem a bola com força, os bueiros levam a bola para outro lugar e, na lagoa, a bola volta de onde saiu. Quem embocar primeiro vence (o outro sempre dá o mesmo número de chutes); se os dois embocarem juntos, desempate: um chute de cada e vence quem deixar a bola mais perto do buraco.`,
    stakes: `Cada um põe ${fmt(r.bet)}. Quem vencer leva ${fmt(r.bet * 2)} e 1 gol para o time, e o time do outro perde 1 gol na rodada.`,
  };
  const main = game === 'BOTAO'
    ? `Futebol de botão 1x1. Na sua vez, dê ${b?.snapsPerTurn ?? 2} petelecos num botão seu (quem começa dá ${b?.firstTurnSnaps ?? 1}). O primeiro gol acaba a partida. Sem gol em ${b?.maxTurns ?? 9} vezes, entra o DEATH MATCH: os goleiros saem, só vale força máxima, 1 peteleco por vez e o botão que você jogar sai do campo — até ficar 1x1. As áreas ficam liberadas (sem goleiro) e a bola rola mais; ${b?.death?.drawAfter1v1 ?? 5} rodadas de 1x1 sem gol dão empate.`
    : `Futebol de prego 1x1, uma vez de cada. Quem fizer o primeiro gol vence; sem gol em ${r.maxTurns} jogadas de cada, o dinheiro volta.`;
  return { main, stakes: `Cada um põe ${fmt(r.bet)}. Quem vencer leva ${fmt(r.bet * 2)} e 1 gol para o time, e o time do outro perde 1 gol na rodada.` };
}

/** Começo: o X1 de hoje (e o de amanhã), as regras, a campanha na temporada, os desafios abertos e desafiar. */
function Lobby({ rules, today, open, busy, me, lastResult, season, now, cooldownLeft, drain, onChallenge, onAccept, board, field, kickoff, golfPreview }: {
  rules: Rules; today: X1Today | null; open: OpenChallenge[]; busy: boolean; me: { money: number; team: Team }; lastResult: Over | null;
  season: PublicPlayer['x1'] | null; now: number; cooldownLeft: number; drain: boolean; onChallenge: () => void; onAccept: (id: number) => void;
  board: PregoBoardData | undefined; field: BotaoFieldData | undefined; kickoff: { pieces: BotaoPiece[]; ball: { x: number; y: number } } | undefined;
  golfPreview?: FgCourse;
}) {
  const game: X1Game = today?.game ?? 'FUTPREGO';
  const t = rulesText(game, rules);
  const [mine, rival] = previewPaints(paintOf(me.team));
  const preview = game === 'FUTGOLF'
    ? golfPreview && <FutgolfCourse course={golfPreview} view={previewView(golfPreview)} still className="w-full drop-shadow-[0_5px_0_rgba(0,0,0,0.25)]" />
    : game === 'BOTAO'
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
          {today && (today.test ? (
            <p className="mt-1.5 text-[12px] font-bold leading-snug text-muted">
              Jogo em teste: só as contas de teste desafiam nele. Se ninguém aceitar em 5 s, um bot aceita.
            </p>
          ) : (
            <p className="mt-1.5 text-[12px] font-bold leading-snug text-muted">
              Às {today.switchHour ?? 19}h troca para <b className="text-navy-ink">{today.nextName}</b>{today.switchAt > now ? `, daqui a ${timeLeft(today.switchAt - now)}` : ''}.
            </p>
          ))}
          <Link to="/rankings?aba=x1" className="mt-2 inline-flex items-center gap-1 text-[12px] font-extrabold text-sky-deep underline decoration-2 underline-offset-2">Ranking X1 (com prêmios)</Link>
        </div>
      </div>
      <div className="panel-navy mt-3 px-3 py-2.5">
        <p className="text-[14px] font-extrabold leading-snug text-white">{t.main}</p>
        <p className="mt-1.5 text-[12px] font-bold leading-snug text-white/80">{t.stakes} Só as {rules.maxGoalsPerHour} primeiras partidas de cada jogador em cada hora mexem no placar (empate também conta); depois, até a hora virar, vale só o dinheiro. Ganhar da mesma pessoa duas vezes seguidas, sem jogar com mais ninguém no meio, a segunda não vale gol e não conta nas {rules.maxGoalsPerHour}. Contra alguém do seu time é amistoso: vale só o dinheiro, sem gol e sem ponto no Ranking X1.</p>
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
                <div className="flex items-center gap-1 text-[11px] font-extrabold text-muted"><Shield team={c.from.team} size={14} /><span className="truncate">{c.freeplay ? `${c.from.team.name} · mesma internet: treino, sem aposta` : c.sameTeam ? `Amistoso do ${c.from.team.name}: vale só dinheiro` : `${c.from.team.name} desafia no ${c.gameName ?? GAME_NAME[c.game ?? game]}`}</span></div>
              </div>
              <button onClick={() => onAccept(c.id)} disabled={busy || drain} className="btn btn-green btn-sm min-w-[76px]">Aceitar</button>
            </div>
          ))}
        </div>
      )}
      {drain && (
        <div className="panel-navy mt-3 flex items-center gap-3 text-left">
          <img src="/ui/ico-info.png" className="h-8 w-8 shrink-0" alt="" />
          <p className="text-[13px] font-extrabold leading-snug">O JogaGol está sendo atualizado. A busca do X1 volta em instantes — as partidas em andamento terminam normalmente.</p>
        </div>
      )}
      <button onClick={onChallenge} disabled={busy || drain || me.money < rules.bet || cooldownLeft > 0} className="btn btn-green btn-lg mt-3 w-full tabular-nums">
        {drain ? 'Atualizando o JogaGol…' : busy ? 'Chamando…' : cooldownLeft > 0 ? `Desafiar de novo em ${mmss(cooldownLeft)}` : `Desafiar alguém (${fmt(rules.bet)})`}
      </button>
      {cooldownLeft > 0 && !drain && <VipNudge minutes={Math.round((rules.challengeCooldownSec ?? 120) / 60)} />}
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
/**
 * Barra do jogador. `bubble` = a provocação dele agora (balão ao lado do avatar: o meu sobe, o do adversário desce,
 * como a torre do Clash Royale); no balão do adversário há o X de silenciar. `muted` = já silenciei este adversário.
 */
function PlayerBar({ p, me = false, active, left, total, label, bubble, muted, onMute, xray = false }: { p: Player; me?: boolean; active: boolean; left: number; total: number; label: string | null; bubble?: Bubble | null; muted?: boolean; onMute?: () => void; xray?: boolean }) {
  const pct = Math.max(0, Math.min(1, left / total));
  return (
    <div className={`relative z-10 flex w-full max-w-[380px] items-center gap-2 rounded-2xl px-2 py-1 ${active ? 'bg-gold/30 ring-2 ring-gold' : 'bg-navy-deep/40'}`}>
      <Avatar url={p.avatarUrl} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1"><span className="t-display t-out truncate text-[14px] leading-tight">{me ? 'Você' : p.nick}</span><Shield team={p.team} size={16} /></div>
        <div className="truncate text-[11px] font-extrabold text-white/85">{label ?? p.team.name}</div>
      </div>
      {muted && <span className="flex shrink-0 items-center gap-1 rounded-full bg-navy-deep/70 px-2 py-0.5 text-[10px] font-black text-white/90"><img src="/ui/pi-sound_off.png" className="h-3 w-3" alt="" />silenciado</span>}
      {xray && <span className="shrink-0 rounded bg-danger px-1.5 py-0.5 font-display text-[10px] text-white" title="O adversário está vendo a trajetória">RAIO-X</span>}
      <AnimatePresence>
        {bubble && (
          <motion.div key={bubble.id} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0, y: me ? 6 : -6 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }}
            className={`pointer-events-none absolute left-2 z-20 flex min-h-[52px] items-center rounded-2xl border-[3px] border-navy-deep bg-white px-3 py-1.5 text-navy-deep shadow-[0_4px_0_rgba(0,0,0,0.25)] ${me ? 'bottom-full mb-1.5 origin-bottom-left' : 'top-full mt-1.5 origin-top-left'}`}>
            <span className={`absolute left-5 h-3.5 w-3.5 rotate-45 border-navy-deep bg-white ${me ? '-bottom-2 border-b-[3px] border-r-[3px]' : '-top-2 border-l-[3px] border-t-[3px]'}`} />
            {bubble.item.icon ? <img src={`/ui/emotes/${bubble.item.icon}`} alt={bubble.item.label ?? ''} className="h-12 w-12 object-contain" /> : <span className="t-display whitespace-nowrap text-[18px]">{bubble.item.text}</span>}
            {onMute && !muted && (
              <button onClick={onMute} className="no-drag pointer-events-auto absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-navy-deep bg-danger" aria-label={`Silenciar ${p.nick}`}>
                <img src="/ui/pi-sound_off.png" className="h-3 w-3" alt="" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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

/** Raio-X: o caminho que a bola vai fazer com a mira atual (pontos a 1/15 s) e onde para; dourado quando é gol. */
function XrayPath({ path, piece = null, goal, r }: { path: [number, number][]; piece?: [number, number][] | null; goal: string | null; r: number }) {
  if (path.length < 2) return null;
  const end = path[path.length - 1];
  const color = goal ? '#FFD54A' : '#FFFFFF';
  return (
    <g pointerEvents="none" opacity={0.95}>
      {piece && piece.length > 1 && <polyline points={piece.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#7FD0FF" strokeWidth="1.6" strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />}
      <polyline points={path.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#0B2D6B" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" opacity={0.6} />
      <polyline points={path.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={end[0]} cy={end[1]} r={r} fill="none" stroke={color} strokeWidth="2" strokeDasharray="2 2" />
      {goal && <text x={end[0]} y={end[1] - r - 4} textAnchor="middle" fontFamily="'Lilita One', Impact, sans-serif" fontSize="9" fill="#FFD54A" stroke="#0B2D6B" strokeWidth="0.6">GOL</text>}
    </g>
  );
}

/** Botão que abre o Provocar; com o anel da espera (2 s entre provocações, 10 s de castigo). */
function ProvocarButton({ left, gapMs, punishMs, onClick }: { left: number; gapMs: number; punishMs: number; onClick: () => void }) {
  const total = left > gapMs ? punishMs : gapMs;
  const pct = Math.max(0, Math.min(1, left / total));
  return (
    <button onClick={onClick} disabled={left > 0} className="btn-sq btn-sq-white no-drag relative h-12 w-12 shrink-0" aria-label="Provocar">
      <img src="/ui/ico-chat.png" className={`h-6 w-6 ${left > 0 ? 'opacity-40' : ''}`} alt="" />
      {left > 0 && (
        <svg viewBox="0 0 36 36" className="pointer-events-none absolute inset-0 m-auto h-11 w-11" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#FFC63D" strokeWidth="4" strokeDasharray={`${pct * 94.2} 94.2`} transform="rotate(-90 18 18)" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

/**
 * Bandeja do Provocar (pedido do dono, 15/09/2026): caretas em cima, frases embaixo. Sem VIP só as 4 caras
 * básicas; o resto aparece com cadeado e leva para a tela do VIP. "Silenciar" vale só nesta partida e só aqui.
 */
function ProvocarTray({ items, vip, oppNick, muted, onPick, onMute, onUnmute, onClose }: {
  items: ProvocarItem[]; vip: boolean; oppNick: string; muted: boolean; onPick: (i: ProvocarItem) => void; onMute: () => void; onUnmute: () => void; onClose: () => void;
}) {
  const icons = items.filter((i) => i.icon), phrases = items.filter((i) => !i.icon);
  const locked = (i: ProvocarItem) => !!i.vip && !vip;
  return (
    <>
      <motion.div key="provocar-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-y-0 left-1/2 z-[68] w-full max-w-[480px] -translate-x-1/2 bg-navy-deep/40" />
      <motion.div key="provocar-tray" initial={{ y: '110%' }} animate={{ y: 0 }} exit={{ y: '110%' }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className="fixed bottom-0 left-1/2 z-[70] w-full max-w-[480px] -translate-x-1/2 px-2" style={{ paddingBottom: 'calc(var(--sab) + 8px)' }} role="dialog" aria-modal="true" aria-label="Provocar">
        <div className="panel-navy">
          <div className="mb-1.5 flex items-center justify-between">
            <div><span className="t-display text-[20px] text-gold" style={{ textShadow: '0 2px 0 rgba(0,0,0,0.35)' }}>PROVOCAR</span><span className="ml-2 text-[11px] font-extrabold text-white/75">{oppNick} vê na hora</span></div>
            <button onClick={onClose} className="btn-sq btn-sq-white no-drag h-9 w-9" aria-label="Fechar"><img src="/ui/pi-close.png" className="h-3.5 w-3.5" alt="" /></button>
          </div>
          <div className="grid grid-cols-4 justify-items-center gap-1.5">
            {icons.map((i) => (
              <button key={i.key} onClick={() => onPick(i)} aria-label={i.label ?? i.key}
                className={`no-drag relative flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-navy-deep bg-white shadow-[0_4px_0_rgba(0,0,0,0.3)] active:translate-y-0.5 active:shadow-[0_1px_0_rgba(0,0,0,0.3)] ${locked(i) ? 'grayscale' : ''}`}>
                <img src={`/ui/emotes/${i.icon}`} className={`h-12 w-12 object-contain ${locked(i) ? 'opacity-40' : ''}`} alt="" />
                {locked(i) && <img src="/ui/ico-lock01_s.png" className="absolute -bottom-1 -right-1 h-6 w-6" alt="Só VIP" />}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1">
            {phrases.map((i) => (
              <button key={i.key} onClick={() => onPick(i)} className={`btn btn-sm no-drag ${locked(i) ? 'btn-gray' : 'btn-white'}`} style={{ minHeight: 34, fontSize: 13 }}>
                {locked(i) && <img src="/ui/ico-lock01_s.png" className="-ml-1 h-4 w-4" alt="Só VIP" />}{i.text}
              </button>
            ))}
          </div>
          {!vip && <Link to="/vip" className="btn btn-yellow btn-sm mt-2 w-full"><img src="/ui/ico-crown_silver.png" className="h-5 w-5" alt="" /> Vire VIP e libere tudo</Link>}
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-extrabold text-white/80">
            <span>1 a cada 2 s</span>
            <button onClick={muted ? onUnmute : onMute} className={`no-drag flex items-center gap-1 rounded-lg px-2 py-1 font-black text-white ${muted ? 'bg-danger/40' : ''}`}>
              <img src="/ui/pi-sound_off.png" className="h-3.5 w-3.5" alt="" />{muted ? `Ouvir ${oppNick} de novo` : `Silenciar ${oppNick}`}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/**
 * Futebol de Botão: a vez (N de 9) e os petelecos que faltam nesta vez. No DEATH MATCH, os botões que cada
 * um ainda tem em campo (cada jogada gasta um) e, no 1x1, quantas rodadas faltam para dar empate.
 */
function BotaoStrip({ bv, you, oppNick, firstSnaps }: { bv: BotaoView; you: Side; oppNick: string; firstSnaps: number }) {
  if (bv.phase === 'death' && bv.death) {
    const d = bv.death;
    // número (não bolinhas): com 6 botões de cada lado, a fileira não cabe ao lado do aviso em tela estreita
    const conta = (s: Side) => (
      <b className={`t-display text-[16px] tabular-nums ${s === you ? 'text-gold' : 'text-white'}`} aria-label={`${d.left[s]} botões em campo`}>{d.left[s]}</b>
    );
    const umXum = d.left[0] === 1 && d.left[1] === 1;
    const faltam = Math.max(0, Math.ceil(d.drawAfter - d.rounds1v1));
    return (
      <div className="mt-1 flex w-full max-w-[380px] items-center justify-between gap-2 rounded-xl bg-[#7A1620]/80 px-2 py-1">
        <span className="flex min-w-0 items-center gap-1"><span className="text-[11px] font-extrabold text-white">Você</span>{conta(you)}</span>
        <span className="t-display shrink-0 text-[12px] leading-tight text-gold">
          {umXum ? `1x1 · ${faltam} p/ empate` : 'DEATH MATCH'}
          <span className="block text-center text-[9px] font-extrabold text-white/70">botões em campo</span>
        </span>
        <span className="flex min-w-0 items-center gap-1">{conta((1 - you) as Side)}<span className="truncate text-[11px] font-extrabold text-white">{oppNick}</span></span>
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

/** Futgolf: o vento da rodada no canto do campo (seta para onde sopra + força; 0 = sem vento). */
function WindChip({ wind }: { wind?: { ang: number; str: number } }) {
  const str = wind?.str ?? 0;
  return (
    <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-xl bg-navy-deep/85 px-2 py-1 font-display text-[12px] text-white" aria-label={str ? `Vento força ${str}` : 'Sem vento'}>
      VENTO
      {str > 0 ? (
        <>
          <svg viewBox="0 0 24 24" className="h-4 w-4" style={{ transform: `rotate(${wind!.ang}deg)` }} aria-hidden="true">
            <path d="M12 20 V5 M6.5 10.5 L12 5 L17.5 10.5" fill="none" stroke="#FFD54A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-gold">{str}</span>
          <span className="flex gap-[2px]" aria-hidden="true">{[1, 2, 3, 4, 5].map((k) => <i key={k} className={`block h-2.5 w-[3px] rounded-sm ${k <= str ? 'bg-gold' : 'bg-white/25'}`} />)}</span>
        </>
      ) : <span className="text-white/80">parado</span>}
    </span>
  );
}

/** Futgolf, logo abaixo do retrospecto: o buraco e o par, os chutes de cada um e quem já embocou. */
function GolfStrip({ m }: { m: GolfMatch }) {
  const { fg, you } = m, opp = (1 - you) as Side, tb = fg.phase === 'tiebreak';
  const cell = (side: Side) => {
    const tag = fg.holed[side] ? 'embocou' : fg.out[side] ? 'pegou a bola' : null;
    return (
      <span className="flex items-center gap-1">
        <span className="max-w-[88px] truncate text-[11px] font-extrabold text-white/85">{side === you ? 'Você' : m.players[side].nick}</span>
        <b className="t-display text-[17px] leading-none text-white tabular-nums">{fg.strokes[side]}</b>
        {tag && <span className={`rounded px-1 text-[9px] font-black ${fg.holed[side] ? 'bg-gold text-navy-deep' : 'bg-white/25 text-white'}`}>{tag}</span>}
      </span>
    );
  };
  return (
    <div className="mt-1 flex w-full max-w-[380px] items-center justify-between gap-2 rounded-xl bg-navy-deep/60 px-2 py-1">
      <span className="min-w-0">
        <span className="t-display block truncate text-[14px] leading-none text-gold">{m.course.name}</span>
        <span className="text-[10px] font-extrabold text-white/80">{tb ? `desempate ${fg.tbCount > 1 ? `${fg.tbCount}º` : ''}`.trim() : `par ${fg.par} · rodada ${fg.round}`}</span>
      </span>
      <span className="flex items-center gap-3">{cell(you)}<span className="text-[10px] font-black text-white/50">×</span>{cell(opp)}</span>
    </div>
  );
}

/** Futgolf: o efeito do próximo chute — curva para a esquerda, reto ou curva para a direita. */
function SpinPicker({ spin, onPick, disabled }: { spin: -1 | 0 | 1; onPick: (s: -1 | 0 | 1) => void; disabled: boolean }) {
  const opts: { v: -1 | 0 | 1; label: string; d: string }[] = [
    { v: -1, label: 'Curva para a esquerda', d: 'M16 21 C16 12 12 7 5 6 M9 2.5 L5 6 L9 9.5' },
    { v: 0, label: 'Sem efeito', d: 'M12 21 V4 M8 8 L12 4 L16 8' },
    { v: 1, label: 'Curva para a direita', d: 'M8 21 C8 12 12 7 19 6 M15 2.5 L19 6 L15 9.5' },
  ];
  return (
    <div className="mb-1 flex w-full max-w-[380px] items-center gap-2 px-1">
      <span className="t-display t-out text-[13px]">EFEITO</span>
      {opts.map((o) => (
        <button key={o.v} onClick={() => onPick(o.v)} disabled={disabled} aria-label={o.label} aria-pressed={spin === o.v}
          className={`no-drag btn btn-sm w-11 !px-0 ${spin === o.v ? 'btn-yellow' : 'btn-white'}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d={o.d} fill="none" stroke={spin === o.v ? '#5a3200' : '#14335F'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      ))}
      <span className="min-w-0 flex-1 text-right text-[11px] font-extrabold leading-tight text-white/85">Puxe e solte: direção e força</span>
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
  const botao = over.game === 'BOTAO', golf = over.game === 'FUTGOLF';
  let title = 'PERDEU', text = '', goal = false, money = 0;
  if (over.canceled) { title = 'PARTIDA CANCELADA'; text = over.text ?? 'O JogaGol está sendo atualizado. A aposta voltou e nada contou.'; }
  else if (over.training) { title = won ? 'VENCEU O TREINO' : 'FIM DO TREINO'; text = 'Treino contra bot não vale gol nem dinheiro. Desafie alguém de verdade!'; goal = won; }
  // mesma internet: jogo por diversão — nada de dinheiro, gol ou ranking (17/09/2026)
  else if (over.why === 'mesma-internet') { title = won ? 'VENCEU O TREINO' : over.winner === null ? 'EMPATE NO TREINO' : 'FIM DO TREINO'; text = over.text ?? 'Vocês estão na mesma internet: valeu pela diversão — sem aposta, sem gol e fora do Ranking X1.'; }
  else if (over.refund) {
    title = 'EMPATE';
    text = botao ? `Nem o death match desempatou: os ${fmt(over.money)} voltaram.` : golf ? `Nem os desempates separaram vocês: os ${fmt(over.money)} voltaram.` : `Ninguém marcou em 10 jogadas: os ${fmt(over.money)} voltaram.`;
  } else if (won) {
    goal = true; money = over.money;
    title = over.goal ? 'GOOOL!!!' : 'VENCEU!';
    const why = over.why === 'limite' ? ` O gol não valeu: você já jogou as ${limit} partidas desta hora que valem gol.` : over.why === 'repetido' ? ` O gol não valeu: você ganhou de ${opp} duas vezes seguidas.`
      : over.why === 'mesmo-time' ? ' Amistoso do seu time: não vale gol.' : '';
    const how = '';
    const narr = over.goalText ?? `Você venceu ${opp}${how}!`;
    // o time do outro pode perder gol mesmo quando o seu não valeu: cada um conta as 10 partidas dele na hora
    const lostTxt = over.lost ? ` O ${over.lostTeam} perdeu 1 gol na rodada.` : '';
    text = over.goal ? `${narr}${/[.!?]$/.test(narr) ? '' : '.'}${lostTxt}` : `Você venceu ${opp}${how} e levou ${fmt(over.money)}.${why}${lostTxt}`;
  } else {
    text = over.reason === 'wo' ? `Você ficou fora e perdeu por W.O. para ${opp}.` : over.reason === 'desistiu' ? 'Você desistiu da partida.'
      : over.reason === 'gol-contra' ? `Gol contra! ${opp} venceu.`
        : over.reason === 'desempate' ? `${opp} deixou a bola mais perto do buraco no desempate.`
          : golf ? `${opp} embocou primeiro${over.golf ? ` (${over.golf.strokes[1 - over.you]} chute${over.golf.strokes[1 - over.you] === 1 ? '' : 's'})` : ''}.` : `${opp} marcou primeiro.`;
    text += over.why === 'mesmo-time' ? ' Amistoso do seu time: não vale gol.'
      : over.lost ? ` O ${over.lostTeam} perdeu 1 gol na rodada.` : over.lossLimit ? ` Seu time não perdeu gol: você já jogou as ${limit} partidas desta hora que valem gol.` : ' Seu time não perdeu gol.';
  }
  // retrospecto contra o adversário já com esta partida + a frase de provocação (lib/rivalidade.js na API)
  const rival = !over.training && !over.canceled && over.h2h ? over.h2h : null;
  return (
    <GoalOverlay open goal={goal} title={title} text={text} money={money} team={me.team} onClose={onClose} autoClose={rival ? 10000 : 6000}>
      {rival && <RivalryResult h2h={rival} opp={opp} line={over.rivalry?.text ?? null} />}
    </GoalOverlay>
  );
}
