import { settleDueRounds, closePastHours, ensureSeason, refreshLiveRound } from './league.js';

let ticking = false;
let exact = null; // disparo extra para fechar a rodada NA HORA (a volta normal é de 30 s)

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const hour = await closePastHours();
    if (hour) console.log('[hora] fechada:', JSON.stringify(hour));
    const rounds = await settleDueRounds();
    for (const r of rounds) console.log('[rodada] fechada:', JSON.stringify(r));
    if (rounds.length) await ensureSeason();
    armExactClose(await refreshLiveRound());
  } catch (e) {
    console.error('[scheduler] erro:', e);
  } finally {
    ticking = false;
  }
}

/** Se a rodada viva fecha antes da próxima volta, agenda uma volta para o segundo exato do fechamento. */
function armExactClose(live) {
  const ms = live ? live.endsAt - Date.now() : Infinity;
  if (exact || !(ms > 0 && ms <= 31_000)) return;
  exact = setTimeout(function fire() {
    if (ticking) { exact = setTimeout(fire, 500); return; }
    exact = null;
    tick();
  }, ms + 250);
}

export function startScheduler() {
  tick();
  setInterval(tick, 30_000);
}
