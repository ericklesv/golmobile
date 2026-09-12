import { settleDueRounds, closePastHours, ensureSeason } from './league.js';

let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const hour = await closePastHours();
    if (hour) console.log('[hora] fechada:', JSON.stringify(hour));
    const rounds = await settleDueRounds();
    for (const r of rounds) console.log('[rodada] fechada:', JSON.stringify(r));
    if (rounds.length) await ensureSeason();
  } catch (e) {
    console.error('[scheduler] erro:', e);
  } finally {
    ticking = false;
  }
}

export function startScheduler() {
  tick();
  setInterval(tick, 30_000);
}
