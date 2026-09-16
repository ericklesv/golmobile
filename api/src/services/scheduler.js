import { settleDueRounds, closePastHours, ensureSeason, refreshLiveRound } from './league.js';
import { dailyReportTick } from './dailyReport.js';
import { vipOfflineAutoKicks } from './play.js';
import { VIP_OFFLINE_AUTO } from '../lib/rules.js';
import { tg } from '../lib/telegram.js';
import { vipReconcile } from './vip.js';
import { clubSweep } from './club.js';
import { referralSweep } from './referral.js';

let ticking = false;
let exact = null; // disparo extra para fechar a rodada NA HORA (a volta normal é de 30 s)
let lastReconcile = 0; // conferência dos PIX do VIP pendentes: a cada 2 min
let lastClubSweep = 0; // diretoria: cargos perdidos e propostas vencidas (o VIP volta) — a cada 5 min
let lastReferral = 0; // convites: paga os marcos de gols que os convidados passaram — a cada 2 min

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
    // VIP ativo: chute direto sai sozinho mesmo com o app fechado (a cada recarga) — desligado por ora
    if (VIP_OFFLINE_AUTO) {
      const vipGoals = await vipOfflineAutoKicks();
      if (vipGoals) console.log('[vip] auto-chutes com app fechado:', vipGoals);
    }
    if (Date.now() - lastReconcile > 120_000) {
      lastReconcile = Date.now();
      const paid = await vipReconcile();
      if (paid) console.log('[vip] PIX confirmados pela conferência:', paid);
    }
    if (Date.now() - lastClubSweep > 300_000) {
      lastClubSweep = Date.now();
      await clubSweep();
    }
    if (Date.now() - lastReferral > 120_000) {
      lastReferral = Date.now();
      const n = await referralSweep();
      if (n) console.log('[convite] marcos pagos:', n);
    }
    // relatório diário no Telegram (08:00 de Brasília, o dia anterior) — um erro aqui não segura o resto
    await dailyReportTick().catch((e) => { console.error('[relatorio] erro:', e); tg.error(`Relatório diário: ${tg.esc(String(e?.message || e).slice(0, 300))}`, { key: 'relatorio', every: 60 * 60_000 }); });
  } catch (e) {
    console.error('[scheduler] erro:', e);
    tg.error(`Scheduler (liga/hora/rodada): ${tg.esc(String(e?.message || e).slice(0, 300))}`, { key: 'scheduler', every: 10 * 60_000 });
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
