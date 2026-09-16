import { Router } from 'express';
import { prisma } from '../prisma.js';
import { handle, notFound } from '../lib/errors.js';
import { requireAdminKey } from '../lib/auth.js';
import { settleDueRounds, ensureSeason, closePastHours } from '../services/league.js';
import { LEVELS } from '../lib/rules.js';
import { startX1Drain, cancelX1Matches, stopX1Drain, x1Status } from '../realtime/x1.js';
import { buildDailyReport, renderDailyChart, sendDailyReport } from '../services/dailyReport.js';

export const admin = Router();
admin.use(requireAdminKey);

// Força o fim da rodada atual (testes)
admin.post('/advance-round', handle(async () => {
  await prisma.round.updateMany({ where: { status: 'LIVE' }, data: { endsAt: new Date(0) } });
  const r = await settleDueRounds();
  await ensureSeason();
  return { settled: r };
}));

admin.post('/close-hour', handle(() => closePastHours()));

// Deploy sem partida travada (dono, 15/09/2026; usado pelo brgol-deploy.sh — ver realtime/x1.js "Trava de
// atualização"): 1) drain = trava a busca do X1 e cancela os desafios abertos; 2) o script espera
// `GET /api/x1/status`.matches chegar a 0; 3) cancel = o que sobrou é cancelado com a aposta devolvida; então reinicia.
admin.post('/x1/drain', handle((req) => startX1Drain(Number(req.body?.seconds) || 420)));
admin.post('/x1/cancel', handle(() => cancelX1Matches('atualizacao')));
admin.post('/x1/resume', handle(() => stopX1Drain())); // deploy abortado: destrava sem reiniciar
admin.get('/x1/status', handle(() => x1Status()));

// Relatório diário do Telegram (services/dailyReport.js): manda agora o de `day` (AAAA-MM-DD; padrão ontem), de novo se
// preciso (`force`); com `?ver=1` só devolve o PNG do gráfico (conferir sem mandar).
admin.post('/relatorio-diario', handle(async (req, res) => {
  const day = req.body?.day ? String(req.body.day) : null;
  if (req.query.ver) { const r = await buildDailyReport(day); res.type('png').send(await renderDailyChart(r)); return; }
  const r = await sendDailyReport(day, { force: req.body?.force !== false });
  return { day: r.day, skipped: !!r.skipped, text: r.text };
}));

admin.post('/vip', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const days = Number(req.body?.days || 0);
  const base = user.vipUntil && user.vipUntil > new Date() ? user.vipUntil.getTime() : Date.now();
  const u = await prisma.user.update({ where: { id: user.id }, data: { vipUntil: new Date(base + days * 86_400_000) } });
  return { nick: u.nick, vipUntil: u.vipUntil };
}));

// Coloca o jogador no nível N (ajusta levelBonus para levelPoints = pontos do nível). Só testes.
admin.post('/level', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const lvl = Number(req.body?.level ?? 0);
  const row = LEVELS.find((l) => l.lvl === lvl);
  if (!row) throw notFound('Nível inválido.');
  const u = await prisma.user.update({ where: { id: user.id }, data: { levelBonus: Math.max(0, row.goals - user.goalsTotal) } });
  return { nick: u.nick, level: lvl, levelPoints: u.goalsTotal + u.levelBonus, levelBonus: u.levelBonus };
}));

/** Zera os minigames diários do jogador (testes): apaga as partidas de hoje e de outros dias. */
admin.post('/reset-daily', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const r = await prisma.dailyGame.deleteMany({ where: { userId: user.id } });
  return { nick: user.nick, removed: r.count };
}));

admin.post('/money', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const u = await prisma.user.update({ where: { id: user.id }, data: { money: { increment: Number(req.body?.amount || 0) } } });
  return { nick: u.nick, money: u.money };
}));

admin.post('/ban', handle(async (req) => {
  const user = await prisma.user.findUnique({ where: { nickLower: String(req.body?.nick || '').toLowerCase() } });
  if (!user) throw notFound('Jogador não encontrado.');
  const hours = Number(req.body?.hours || 24);
  const u = await prisma.user.update({ where: { id: user.id }, data: { bannedUntil: new Date(Date.now() + hours * 3600_000) } });
  return { nick: u.nick, bannedUntil: u.bannedUntil };
}));

admin.get('/stats', handle(async () => ({
  users: await prisma.user.count(),
  goals: await prisma.goal.count(),
  online: await prisma.user.count({ where: { lastSeenAt: { gt: new Date(Date.now() - 2 * 60_000) } } }),
})));
