import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FutgolfCourse } from '../components/FutgolfCourse';
import { TriondaBall } from '../components/TriondaBall';
import type { FgCourse } from '../lib/futgolf';

/**
 * Rota oculta (sem login) para conferir por screenshot os buracos do Futgolf (X1). Lê /api/x1/futgolf/buracos — nada
 * gravado.
 *   `/debug-futgolf` — os 8 buracos lado a lado (campo inteiro).
 *   `?buraco=ilha` — um só, grande; `&espelho=1` = espelhado; `&bola=200,500` põe uma bola ali;
 *   `&camera=1` — só a janela que a câmera mostra na partida (440 de largura), em volta da bola ou da saída.
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
    const view = params.get('camera') === '1' ? { x: -20, y: Math.max(-34, Math.min(c.H + 34 - h, at.y - h * 0.6)), w: 440, h } : null;
    return (
      <div style={{ background: '#1258c4', minHeight: '100vh', padding: 10 }}>
        <div style={{ width: 380, margin: '0 auto' }}>
          <FutgolfCourse course={c} view={view} still className="w-full" tiebreak={params.get('desempate') === '1'}>
            <g transform={`translate(${at.x} ${at.y})`}><TriondaBall r={c.ball} idle /></g>
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
