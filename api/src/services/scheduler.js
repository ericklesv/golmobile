import { settleDueRounds, closePastHours, ensureSeason, refreshLiveRound } from './league.js';
import { vipOfflineAutoKicks } from './play.js';
import { vipReconcile } from './vip.js';
import { clubSweep } from './club.js';

let ticking = false;
let exact = null; // disparo extra para fechar a rodada NA HORA (a volta normal é de 30 s)
let lastReconcile = 0; // conferência dos PIX do VIP pendentes: a cada 2 min
let lastClubSweep = 0; // diretoria: cargos perdidos e propostas vencidas (o VIP volta) — a cada 5 min

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
    // VIP ativo: chute direto sai sozinho mesmo com o app fechado (a cada recarga)
    const vipGoals = await vipOfflineAutoKicks();
    if (vipGoals) console.log('[vip] auto-chutes com app fechado:', vipGoals);
    if (Date.now() - lastReconcile > 120_000) {
      lastReconcile = Date.now();
      const paid = await vipReconcile();
      if (paid) console.log('[vip] PIX confirmados pela conferência:', paid);
    }
    if (Date.now() - lastClubSweep > 300_000) {
      lastClubSweep = Date.now();
      await clubSweep();
    }
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
