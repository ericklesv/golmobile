import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FutgolfCourse } from '../components/FutgolfCourse';
import { TiebreakDrama, type Drama } from '../components/FutgolfDrama';
import { TriondaBall } from '../components/TriondaBall';
import type { FgCourse } from '../lib/futgolf';

/**
 * Rota oculta (sem login) para conferir por screenshot os buracos do Futgolf (X1). Lê /api/x1/futgolf/buracos — nada
 * gravado.
 *   `/debug-futgolf` — os 8 buracos lado a lado (campo inteiro).
 *   `?buraco=ilha` — um só, grande; `&espelho=1` = espelhado; `&bola=200,500` põe uma bola ali;
 *   `&camera=1` — só a janela que a câmera mostra na partida (440 de largura), em volta da bola ou da saída.
 *   `&drama=200,300;150,260` — as medidas do desempate (duas bolas; a ordem é sorteada a cada carga), como na
 *   partida; `&janela=x,y,w,h` escolhe a janela (sem ela, o campo inteiro). `buraco=desempate` = o campo do desempate.
 */
export function DebugFutgolfScreen() {
  const [params] = useSearchParams();
  const [holes, setHoles] = useState<FgCourse[] | null>(null);
  const espelho = params.get('espelho') === '1';
  useEffect(() => {
    fetch(`/api/x1/futgolf/buracos${espelho ? '?espelho=1' : ''}`).then((r) => r.json()).then((d) => setHoles(d.holes ?? [])).catch(() => setHoles([]));
  }, [espelho]);
  if (!holes) return <p style={{ padding: 20 }}>Carregando…</p>;
  const one = params.get('buraco');
  const bola = (params.get('bola') ?? '').split(',').map(Number);
  if (one) {
    const c = holes.find((h) => h.id === one);
    if (!c) return <p style={{ padding: 20 }}>Buraco {one} não existe.</p>;
    const at = bola.length === 2 && bola.every(Number.isFinite) ? { x: bola[0], y: bola[1] } : c.tee;
    const h = 440 * (560 / 380);
    const jan = (params.get('janela') ?? '').split(',').map(Number);
    const view = jan.length === 4 && jan.every(Number.isFinite) ? { x: jan[0], y: jan[1], w: jan[2], h: jan[3] }
      : params.get('camera') === '1' ? { x: -20, y: Math.max(-34, Math.min(c.H + 34 - h, at.y - h * 0.6)), w: 440, h } : null;
    const dp = (params.get('drama') ?? '').split(';').map((p) => p.split(',').map(Number));
    const drama: Drama | null = dp.length === 2 && dp.every((p) => p.length === 2 && p.every(Number.isFinite)) ? (() => {
      const balls: [{ x: number; y: number }, { x: number; y: number }] = [{ x: dp[0][0], y: dp[0][1] }, { x: dp[1][0], y: dp[1][1] }];
      const dist = balls.map((b) => Math.hypot(b.x - c.cup.x, b.y - c.cup.y)) as [number, number];
      return { order: Math.random() < 0.5 ? [0, 1] : [1, 0], dist, balls, cup: c.cup, winner: dist[0] < dist[1] ? 0 : 1, you: 0, nicks: ['Você', 'Vilao'], t0: performance.now() };
    })() : null;
    return (
      <div style={{ background: '#1258c4', minHeight: '100vh', padding: 10 }}>
        <div style={{ width: 380, margin: '0 auto' }}>
          <FutgolfCourse course={c} view={view} still className="w-full" tiebreak={params.get('desempate') === '1'}>
            {drama ? drama.balls.map((b, i) => <g key={i} transform={`translate(${b.x} ${b.y})`}><TriondaBall r={c.ball} idle /></g>)
              : <g transform={`translate(${at.x} ${at.y})`}><TriondaBall r={c.ball} idle /></g>}
            {drama && <TiebreakDrama d={drama} r={c.ball} />}
          </FutgolfCourse>
          <p style={{ color: '#fff', font: '700 13px Nunito' }}>{c.name} · par {c.par} · {c.W}×{c.H}{c.mirror ? ' · espelhado' : ''}</p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: '#1258c4', minHeight: '100vh', padding: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
      {holes.map((c) => (
        <div key={c.id} style={{ width: 230 }}>
          <FutgolfCourse course={c} still className="w-full">
            <g transform={`translate(${c.tee.x} ${c.tee.y})`}><TriondaBall r={c.ball} idle /></g>
          </FutgolfCourse>
          <p style={{ color: '#fff', font: '700 12px Nunito', margin: '4px 0 0' }}>{c.name} · par {c.par}</p>
        </div>
      ))}
    </div>
  );
}
