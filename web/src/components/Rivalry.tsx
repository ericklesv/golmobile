import { motion } from 'framer-motion';

/** Retrospecto contra o adversário, na perspectiva de quem vê (o mesmo formato da faixa da partida). */
export interface H2HTally { total: number; wins: number; losses: number; draws: number; last: ('V' | 'D' | 'E')[] }

const STAMP = 1.25; // quando o resultado novo "carimba" (depois do texto do resultado entrar)

/**
 * Fim do FutPrego (pedido do dono, 15/09/2026): o retrospecto contra o adversário JÁ com a partida que acabou e
 * a frase de provocação escolhida pelo servidor (lib/rivalidade.js). O confronto atualiza na frente do jogador —
 * o resultado novo carimba na frente das últimas 5 e o número que mudou pula — e a frase entra por último.
 */
export function RivalryResult({ h2h, opp, line }: { h2h: H2HTally; opp: string; line: string | null }) {
  const now = h2h.last[0]; // esta partida
  const n = h2h.wins + h2h.draws + h2h.losses || 1;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="panel-navy mt-3 w-full px-2 pb-0.5 pt-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <Count value={h2h.wins} label="Você" tone="t-green" bump={now === 'V'} />
        <Count value={h2h.draws} label={h2h.draws === 1 ? 'empate' : 'empates'} tone="t-out" small bump={now === 'E'} />
        <Count value={h2h.losses} label={opp} tone="t-red" bump={now === 'D'} />
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <span className="bg-grass" style={{ width: `${(h2h.wins / n) * 100}%` }} />
        <span className="bg-white/40" style={{ width: `${(h2h.draws / n) * 100}%` }} />
        <span className="bg-danger" style={{ width: `${(h2h.losses / n) * 100}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-center gap-1" aria-label="últimas partidas entre vocês, a mais recente primeiro">
        {h2h.last.map((r, i) => (
          <motion.span key={i} initial={i === 0 ? { scale: 2.4, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: STAMP, type: 'spring', stiffness: 420, damping: 15 }}
            className={`flex h-6 w-6 items-center justify-center rounded-md font-display text-[13px] leading-none text-white ${r === 'V' ? 'bg-[#2E9E3A]' : r === 'D' ? 'bg-[#C0392B]' : 'bg-white/30'} ${i === 0 ? 'ring-2 ring-white' : 'opacity-80'}`}>
            {r}
          </motion.span>
        ))}
      </div>
      {line && (
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: STAMP + 0.45 }}
          className={`t-display mt-2 text-[17px] leading-snug ${now === 'V' ? 't-gold' : 't-out'}`}>
          {line}
        </motion.p>
      )}
    </motion.div>
  );
}

/** Um lado do placar do confronto: o número e de quem é. O que mudou nesta partida pula quando o resultado carimba. */
function Count({ value, label, tone, small = false, bump }: { value: number; label: string; tone: string; small?: boolean; bump: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <motion.span animate={bump ? { scale: [1, 1.45, 1] } : undefined} transition={{ delay: STAMP, duration: 0.45 }}
        className={`t-display ${tone} tabular-nums leading-none ${small ? 'text-[22px]' : 'text-[32px]'}`}>
        {value}
      </motion.span>
      <span className="mt-0.5 max-w-full truncate text-[11px] font-extrabold text-white/80">{label}</span>
    </div>
  );
}
