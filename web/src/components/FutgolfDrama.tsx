import { useEffect, useState } from 'react';
import { cmOf, type FgPoint } from '../lib/futgolf';

type Side = 0 | 1;

/** Desempate na distância: a ordem sorteada, as distâncias (unidades do campo), as bolas, o buraco e quem venceu. */
export type Drama = { order: [Side, Side]; dist: [number, number]; balls: [FgPoint, FgPoint]; cup: FgPoint; winner: Side; you: Side; nicks: [string, string]; t0: number };
/** Tempos do drama (ms desde o começo): pausa, cada medida crescendo, intervalo, o "mais perto" e o fim (< 7 s). */
export const DRAMA = { start: 600, grow: 1900, gap: 500, reveal: 5000, end: 6300 };

/**
 * As medidas do desempate, dentro do campo: do buraco sai uma linha vermelha tracejada até cada bola, com o número
 * em centímetros crescendo junto — rápido no começo e freando no fim (o suspense fica nos últimos centímetros). A
 * ordem é sorteada; no fim, a bola vencedora ganha "MAIS PERTO!" e a outra apaga um pouco.
 */
export function TiebreakDrama({ d, r }: { d: Drama; r: number }) {
  const [, setT] = useState(0);
  useEffect(() => {
    let id = 0;
    const loop = () => { setT(performance.now()); if (performance.now() - d.t0 < DRAMA.end) id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [d]);
  const t = performance.now() - d.t0, done = t >= DRAMA.reveal;
  return (
    <g pointerEvents="none">
      {d.order.map((side, k) => {
        const s0 = DRAMA.start + k * (DRAMA.grow + DRAMA.gap);
        if (t < s0) return null;
        const p = Math.min(1, (t - s0) / DRAMA.grow), e = 1 - (1 - p) ** 4;
        const b = d.balls[side], vx = b.x - d.cup.x, vy = b.y - d.cup.y, len = Math.hypot(vx, vy) || 1;
        const x = d.cup.x + vx * e, y = d.cup.y + vy * e;
        // o número vai na ponta da linha e termina um pouco além da bola (do lado de fora, longe do buraco)
        const lx = x + (vx / len) * (r + 16) * e, ly = y + (vy / len) * (r + 16) * e - 4;
        const win = done && side === d.winner, lose = done && side !== d.winner;
        const who = side === d.you ? 'VOCÊ' : d.nicks[side];
        return (
          <g key={side} opacity={lose ? 0.55 : 1}>
            <line x1={d.cup.x} y1={d.cup.y} x2={x} y2={y} stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" opacity="0.5" />
            <line x1={d.cup.x} y1={d.cup.y} x2={x} y2={y} stroke="#E0161B" strokeWidth="3.2" strokeDasharray="7 4" strokeLinecap="round" />
            <circle cx={b.x} cy={b.y} r={r + 5} fill="none" stroke="#E0161B" strokeWidth="3" opacity={p} />
            <text x={lx} y={ly} textAnchor="middle" fontFamily="'Lilita One', Impact, sans-serif" fontSize={win ? 30 : 25} fill="#E0161B" stroke="#FFFFFF" strokeWidth="5" paintOrder="stroke">
              {cmOf(d.dist[side] * e)} cm
            </text>
            <text x={lx} y={ly + 14} textAnchor="middle" fontFamily="'Nunito', sans-serif" fontWeight="900" fontSize="11" fill="#FFFFFF" stroke="#0B2D6B" strokeWidth="3" paintOrder="stroke">{who}</text>
            {win && <text x={lx} y={ly - 30} textAnchor="middle" fontFamily="'Lilita One', Impact, sans-serif" fontSize="16" fill="#FFD54A" stroke="#0B2D6B" strokeWidth="4" paintOrder="stroke">MAIS PERTO!</text>}
          </g>
        );
      })}
    </g>
  );
}
