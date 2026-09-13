import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { token } from '../lib/api';
import { useAuth } from '../store/auth';
import type { Team } from '../lib/types';
import { Shield } from '../components/Shield';
import { Avatar } from '../components/Avatar';
import { GoalOverlay } from '../components/GoalOverlay';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';
import { draw, preloadArena, ASPECT, type Field } from '../lib/cabecaoDraw';

/**
 * Cabeção — head soccer 1x1 ao vivo. Fila por WebSocket; a simulação roda no servidor
 * (30 Hz) e aqui só mandamos as teclas/botões e desenhamos o último estado (extrapolando
 * pela velocidade entre pacotes). Vencedor marca 1 gol (limites no servidor).
 */
type Snap = { k: number; ph: string; cd: number; tm: number; sc: [number, number]; g: boolean; ls: number | null; p: [number, number, number, number, number, number][]; b: [number, number, number, number] };
type Player = { id: number; nick: string; avatarUrl: string | null; team: Team; bot?: boolean };
type Over = { score: [number, number]; winner: number | null; reason: string; you: number; award: { goal: boolean; text?: string; why?: string; remaining?: number } | null };

const SKINS = ['#F6CBA6', '#E0A87A', '#B97A4B', '#7A4A2B'];
const HAIRS = ['#2B1B10', '#5A3A1E', '#111111', '#C98A2B', '#7A2A1A'];

export function CabecaoScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const [status, setStatus] = useState<{ queue: number; playing: number; rules?: { matchSec: number; goldenSec: number; maxGoalWinsPerDay: number; botAfterSec?: number } } | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [match, setMatch] = useState<{ side: number; players: Player[]; field: Field; training?: boolean } | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef<{ s: Snap; at: number } | null>(null);
  const matchRef = useRef<typeof match>(null);
  const input = useRef({ l: 0, r: 0, j: 0, k: 0 });
  const lastScore = useRef<[number, number]>([0, 0]);

  useEffect(() => { preloadArena(); }, []);

  // ?demo=1 — cena parada só pra conferir a arte (sem servidor)
  const demo = new URLSearchParams(location.search).get('demo');
  useEffect(() => {
    if (!demo) return;
    const opp = (meta?.teams ?? []).find((t) => t.slug !== me.team.slug) ?? me.team;
    const mm = { side: 0, players: [{ id: me.id, nick: me.nick, avatarUrl: me.avatarUrl ?? null, team: me.team }, { id: 7, nick: 'BOT Zagalinho', avatarUrl: null, team: opp, bot: true }], field: { w: 800, h: 400, goalW: 112, goalH: 206, barH: 10, playerR: 50, ballR: 17 } };
    matchRef.current = mm; setMatch(mm);
    const sn: Snap = { k: 1, ph: 'play', cd: 0, tm: 41, sc: [1, 0], g: false, ls: null, p: [[260, 0, 200, 0, 1, 1], [560, 70, 0, 0, -1, 0]], b: [420, 120, 0, 0] };
    snapRef.current = { s: sn, at: performance.now() }; setSnap(sn);
  }, [demo]);

  // conexão
  useEffect(() => {
    if (demo) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/ws/cabecao?token=${encodeURIComponent(token.get() ?? '')}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setInQueue(false); };
    ws.onerror = () => toast('Sem conexão com a arena do Cabeção.', 'error');
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'hello' || m.t === 'queue') setStatus({ queue: m.queue, playing: m.playing, rules: m.rules });
      else if (m.t === 'left') setInQueue(false);
      else if (m.t === 'match') { setInQueue(false); setOver(null); setStatus((st) => st ? { ...st, queue: Math.max(0, st.queue - 1) } : st); lastScore.current = [0, 0]; const mm = { side: m.side, players: m.players, field: m.field, training: !!m.training }; matchRef.current = mm; setMatch(mm); sound.play('pop'); }
      else if (m.t === 's') {
        snapRef.current = { s: m, at: performance.now() };
        if (m.sc[0] !== lastScore.current[0] || m.sc[1] !== lastScore.current[1]) { lastScore.current = [m.sc[0], m.sc[1]]; sound.play(m.ls === matchRef.current?.side ? 'goal' : 'error'); }
        setSnap(m);
      }
      else if (m.t === 'over') { setOver(m); if (m.award?.goal) { setTimeout(() => setOverlay(true), 800); } refresh(); }
      else if (m.t === 'kicked') toast('Você abriu o Cabeção em outra aba.');
      else if (m.t === 'error') toast(m.message, 'error');
    };
    return () => { ws.close(); };
  }, []);

  const send = (m: object) => { const ws = wsRef.current; if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  const join = () => { send({ t: 'join' }); setInQueue(true); sound.play('tap'); };
  const leave = () => { send({ t: 'leave' }); setInQueue(false); };

  // entradas: teclado (PC) + botões (toque); manda a cada mudança e a cada 100 ms
  useEffect(() => {
    if (!match) return;
    const map: Record<string, keyof typeof input.current> = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'j', w: 'j', W: 'j', ' ': 'k', k: 'k', K: 'k', s: 'k', S: 'k', Enter: 'k', ArrowDown: 'k' };
    const down = (e: KeyboardEvent) => { const key = map[e.key]; if (!key) return; e.preventDefault(); if (!input.current[key]) { input.current[key] = 1; send({ t: 'in', ...input.current }); } };
    const up = (e: KeyboardEvent) => { const key = map[e.key]; if (!key) return; input.current[key] = 0; send({ t: 'in', ...input.current }); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    const iv = setInterval(() => send({ t: 'in', ...input.current }), 100);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); clearInterval(iv); };
  }, [match]);

  // desenho
  useEffect(() => {
    if (!match) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const box = canvas.parentElement!.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.round(box.width), H = Math.round(box.width / ASPECT);
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cur = snapRef.current;
      const f = match.field;
      const ex = cur ? Math.min(0.12, (performance.now() - cur.at) / 1000) : 0; // extrapolação curta
      const moving = cur && (cur.s.ph === 'play' || cur.s.ph === 'golden');
      const players = match.players.map((pl, i) => {
        const p = cur?.s.p[i] ?? [i === 0 ? 180 : 620, 0, 0, 0, i === 0 ? 1 : -1, 0];
        const k = moving ? ex : 0;
        return { x: p[0] + p[2] * k, y: Math.max(0, p[1] + p[3] * k), vx: p[2], face: p[4], kick: !!p[5], grounded: p[1] <= 0.5, team: pl.team, skin: SKINS[Math.abs(pl.id) % SKINS.length], hair: HAIRS[Math.abs(pl.id) % HAIRS.length], hairStyle: Math.abs(pl.id * 7 + 3) % 3 };
      });
      const b = cur?.s.b ?? [400, 260, 0, 0];
      const k = moving ? ex : 0;
      draw(ctx, W, H, f, players, { x: b[0] + b[2] * k, y: Math.max(f.ballR, b[1] + b[3] * k), vx: b[2] }, performance.now(), cur?.s.ph === 'goal');
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [match]);

  const hold = (key: 'l' | 'r' | 'j' | 'k') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); input.current[key] = 1; send({ t: 'in', ...input.current }); },
    onPointerUp: () => { input.current[key] = 0; send({ t: 'in', ...input.current }); },
    onPointerCancel: () => { input.current[key] = 0; send({ t: 'in', ...input.current }); },
    onPointerLeave: () => { if (input.current[key]) { input.current[key] = 0; send({ t: 'in', ...input.current }); } },
  });

  const rules = status?.rules;
  const mine = match ? match.players[match.side] : null;
  const opp = match ? match.players[1 - match.side] : null;
  const ph = snap?.ph;
  const clock = snap ? Math.ceil(snap.tm) : rules?.matchSec ?? 60;

  return (
    <div className="app-frame relative flex min-h-full flex-col">
      <div className="stadium-bg" />
      <GoalOverlay open={overlay} goal title="GOOOL!!!" text={over?.award?.text ?? undefined} team={me.team} onClose={() => setOverlay(false)} />

      <div className="relative flex items-center justify-between px-3 pb-1" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12" aria-label="Voltar"><img src="/ui/pi-back.png" className="h-5 w-5" alt="" /></button>
        <div className="ribbon ribbon-orange text-[18px]">CABEÇÃO</div>
        <span className={`trap ${connected ? 'trap-green' : 'trap-orange'} text-[10px]`}>{connected ? `${status?.queue ?? 0} na fila` : 'conectando'}</span>
      </div>

      {!match ? (
        <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-3 px-3 pb-6">
          <div className="panel-navy text-center">
            <div className="t-display t-out text-[20px]">Head soccer 1x1 ao vivo</div>
            <p className="mt-1 text-[13px] font-extrabold text-white/90">Você contra outro craque de outro time, {rules?.matchSec ?? 60} segundos. Empatou, gol de ouro. Quem vence marca <span className="t-gold">1 gol</span> pro seu time (até {rules?.maxGoalWinsPerDay ?? 3} por dia, nunca duas vezes contra o mesmo adversário).</p>
            <div className="mt-3 flex justify-center gap-3">
              <span className="trap trap-blue text-[11px]">{status?.queue ?? 0} na fila</span>
              <span className="trap trap-green text-[11px]">{status?.playing ?? 0} jogando</span>
            </div>
          </div>
          {inQueue ? (
            <div className="panel text-center text-navy-ink">
              <div className="t-display text-[20px]">Procurando adversário…</div>
              <p className="mt-1 text-[12px] font-bold text-muted">Fique nesta tela. Assim que outro craque entrar na fila, a partida começa.</p>
              <div className="mx-auto my-3 h-2 w-40 overflow-hidden rounded-full bg-sky/20"><div className="h-full w-1/3 animate-[slide_1.1s_linear_infinite] rounded-full bg-sky" /></div>
              <button onClick={leave} className="btn btn-red btn-md w-full">Sair da fila</button>
            </div>
          ) : (
            <button onClick={join} disabled={!connected} className="btn btn-orange btn-lg w-full">Entrar na fila</button>
          )}
          <div className="card-white text-[12px] font-bold text-navy-ink">
            <div className="t-display text-[14px]">Controles</div>
            <p className="mt-1">Celular: botões na tela. PC: <b>A/D</b> ou <b>← →</b> andam, <b>W/↑</b> pula, <b>ESPAÇO</b> (ou K) chuta. A cabeça também rebate a bola.</p>
            <p className="mt-1 text-muted">Ninguém na fila em {rules?.botAfterSec ?? 15} s? Entra um <b>BOT</b> de time aleatório para treinar (treino não vale gol).</p>
          </div>
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col px-2" style={{ paddingBottom: 'calc(var(--sab) + 8px)' }}>
          {/* placar */}
          <div className="panel-navy mb-2 flex items-center justify-between px-3 py-1.5">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5"><Shield team={match.players[0].team} size={24} /><span className="t-display t-out break-all text-[10px] leading-tight">{match.players[0].nick}</span></div>
            <div className="flex shrink-0 items-center gap-2 px-2">
              <span className="t-display t-gold text-[26px] tabular-nums">{snap?.sc[0] ?? 0}</span>
              <span className={`trap ${snap?.g ? 'trap-orange' : 'trap-blue'} text-[12px] tabular-nums`}>{snap?.g ? 'OURO ' : ''}{clock}</span>
              <span className="t-display t-gold text-[26px] tabular-nums">{snap?.sc[1] ?? 0}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right"><Shield team={match.players[1].team} size={24} /><span className="t-display t-out break-all text-[10px] leading-tight">{match.players[1].nick}</span></div>
          </div>
          <div className="relative w-full overflow-hidden rounded-xl border-4 border-white/80 shadow-[0_6px_0_rgba(0,0,0,0.3)]" style={{ aspectRatio: '16 / 10' }}>
            <canvas ref={canvasRef} className="block touch-none" />
            {ph === 'countdown' && snap && (snap.sc[0] + snap.sc[1] > 0 || snap.g) && <div className="absolute inset-0 flex items-center justify-center"><span className="t-display t-out text-[64px] drop-shadow">{snap.g && snap.cd > 1.2 ? 'GOL DE OURO' : Math.ceil(snap.cd) || 'VAI!'}</span></div>}
            {ph === 'countdown' && snap && snap.sc[0] + snap.sc[1] === 0 && !snap.g && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-navy-deep/75">
                <div className="flex w-full items-center justify-around px-2">
                  {[match.players[0], match.players[1]].map((pl, i) => (
                    <div key={i} className={`flex w-[42%] flex-col items-center gap-0.5 ${i === match.side ? '' : 'opacity-95'}`}>
                      <Avatar url={pl.avatarUrl} size={40} />
                      <span className="t-display t-out max-w-full break-all text-center text-[13px] leading-tight">{pl.nick}</span>
                      <span className="flex items-center gap-1 text-[10px] font-extrabold text-white/90"><Shield team={pl.team} size={16} />{pl.team.name}</span>
                      <span className={`trap ${i === match.side ? 'trap-green' : pl.bot ? 'trap-orange' : 'trap-blue'} text-[9px]`}>{i === match.side ? 'VOCÊ' : pl.bot ? 'BOT (treino)' : 'ADVERSÁRIO'}</span>
                    </div>
                  ))}
                </div>
                <span className="t-display t-gold text-[40px] leading-none">{Math.ceil(snap.cd) || 'VAI!'}</span>
              </div>
            )}
            {ph === 'goal' && snap && <div className="absolute inset-0 flex items-center justify-center"><span className={`t-display text-[52px] ${snap.ls === match.side ? 't-gold' : 't-red'}`}>{snap.ls === match.side ? 'GOOOL!' : 'GOL DELE…'}</span></div>}
            {over && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy-deep/80 p-3 text-center">
                <span className={`t-display text-[34px] ${over.winner === over.you ? 't-gold' : over.winner == null ? 't-out' : 't-red'}`}>{over.winner === over.you ? 'VOCÊ VENCEU!' : over.winner == null ? 'EMPATE' : 'PERDEU'}</span>
                <span className="t-display t-out text-[22px]">{over.score[0]} x {over.score[1]}{over.reason === 'wo' ? ' (W.O.)' : over.reason === 'golden' ? ' (gol de ouro)' : ''}</span>
                {over.award && <span className="text-[12px] font-extrabold text-white">{over.award.goal ? `+1 gol pro ${me.team.name}!${over.award.remaining != null ? ` Ainda valem ${over.award.remaining} hoje.` : ''}` : over.award.text ?? ''}</span>}
                <div className="mt-1 flex gap-2">
                  <button onClick={() => { setMatch(null); matchRef.current = null; setSnap(null); setOver(null); }} className="btn btn-orange btn-md">Jogar de novo</button>
                  <button onClick={() => nav('/')} className="btn btn-white btn-md">Sair</button>
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-extrabold text-white">
            <span className="flex items-center gap-1"><Avatar url={mine?.avatarUrl ?? null} size={22} /> <Shield team={mine?.team} size={18} /> você</span>
            <span className="flex items-center gap-1">{opp?.bot ? 'treino vs ' : 'contra '}{opp?.nick} <Shield team={opp?.team} size={18} /> <Avatar url={opp?.avatarUrl ?? null} size={22} /></span>
          </div>
          {/* controles de toque */}
          <div className="mt-auto flex items-end justify-between pt-3 select-none" style={{ touchAction: 'none' }}>
            <div className="flex gap-2">
              <button {...hold('l')} className="btn-sq btn-sq-sky no-drag h-16 w-16" aria-label="esquerda"><img src="/ui/pi-back.png" className="h-7 w-7" alt="" /></button>
              <button {...hold('r')} className="btn-sq btn-sq-sky no-drag h-16 w-16" aria-label="direita"><img src="/ui/pi-back.png" className="h-7 w-7 -scale-x-100" alt="" /></button>
            </div>
            <div className="flex gap-2">
              <button {...hold('j')} className="btn-sq btn-sq-white no-drag h-16 w-16" aria-label="pular"><img src="/ui/pi-back.png" className="h-7 w-7 rotate-90" alt="" /></button>
              <button {...hold('k')} className="btn-sq btn-sq-sky no-drag h-16 w-16" aria-label="chutar"><img src="/ui/ico-energy.png" className="h-8 w-8" alt="" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
