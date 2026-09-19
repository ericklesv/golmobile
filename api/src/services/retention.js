/**
 * Retenção dos novos jogadores — a leitura "por conta" que o relatório do Telegram (scripts/relatorio-retencao.js)
 * e o relatório ao vivo do painel (services/report.js) compartilham. Só leitura no banco.
 *
 * Definições (dia = dia de Brasília, calendarDay):
 *  - Conta nova = User sem isBot, sem deletedAt, fora as contas de varredura (0 gol, IP banido SWEEP_IP).
 *  - 1º dia = as 24 h depois do cadastro. `minutes0` = do cadastro até o último sinal de vida nessas 24 h
 *    (último gol, ou lastSeenAt se ainda está nelas). `goals0` = gols nas 24 h.
 *  - Voltou (d1) = atividade (gol, Presença ou lastSeenAt) num dia DEPOIS do dia do cadastro; `elig1` = conta criada
 *    até ontem (teve um dia inteiro para voltar). d3 = atividade 3+ dias depois; `elig3` = conta com 3+ dias.
 *  - activeNow = voltou E lastSeenAt nas últimas 48 h (conta de hoje não conta como "ativa" só por existir).
 */
import { prisma } from '../prisma.js';
import { tzParts, calendarDay } from '../lib/time.js';

export const SWEEP_IP = '177.23.227.136'; // varredura de 17/09/2026 (testadmin99, massassign99, audit_…): não são jogadores
const DAY = 24 * 3600_000;
export const dayOf = (d) => calendarDay(new Date(d));
export const dm = (d) => { const p = tzParts(new Date(d)); return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}`; };
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const median = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Uma linha por conta nova, com tudo que a retenção precisa. `since` (ms) limita às contas criadas a partir dali. */
export async function retentionRows({ now = Date.now(), since = null } = {}) {
  const today = dayOf(now);
  const users = await prisma.user.findMany({
    where: { isBot: false, deletedAt: null, ...(since ? { createdAt: { gte: new Date(since) } } : {}) },
    select: { id: true, nick: true, createdAt: true, lastSeenAt: true, goalsTotal: true, referredById: true, deviceMobile: true, createdIp: true, vipUntil: true, deviceId: true },
    orderBy: { createdAt: 'asc' },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { rows: [], sweep: 0, today, now };
  const [goals, passes, dailies, chats, x1, kicks] = await Promise.all([
    prisma.goal.findMany({ where: { userId: { in: ids } }, select: { userId: true, createdAt: true } }),
    prisma.loginPass.findMany({ where: { userId: { in: ids } }, select: { userId: true, day: true } }),
    prisma.dailyGame.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
    prisma.chatMessage.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
    prisma.x1Match.findMany({ where: { status: 'FINISHED', OR: [{ aId: { in: ids } }, { bId: { in: ids } }] }, select: { aId: true, bId: true } }),
    prisma.activity.groupBy({ by: ['userId'], where: { userId: { in: ids }, kind: { in: ['AUTO', 'PENALTY', 'FOUL', 'TRAIL'] } }, _count: { _all: true } }), // chutes (gol ou erro)
  ]);
  const byUser = new Map(users.map((u) => [u.id, { ...u, goals: [], passDays: new Set(), minigames: 0, chat: 0, x1: 0, kicks: 0 }]));
  for (const g of goals) byUser.get(g.userId)?.goals.push(g.createdAt.getTime());
  for (const p of passes) byUser.get(p.userId)?.passDays.add(p.day);
  for (const d of dailies) { const u = byUser.get(d.userId); if (u) u.minigames = d._count._all; }
  for (const c of chats) { const u = byUser.get(c.userId); if (u) u.chat = c._count._all; }
  for (const k of kicks) { const u = byUser.get(k.userId); if (u) u.kicks = k._count._all; }
  for (const m of x1) for (const id of [m.aId, m.bId]) { const u = byUser.get(id); if (u) u.x1++; }

  const rows = [];
  let sweep = 0;
  for (const u of byUser.values()) {
    if (u.createdIp === SWEEP_IP && !u.goals.length) { sweep++; continue; }
    const c = u.createdAt.getTime(), seen = u.lastSeenAt.getTime();
    u.goals.sort((a, b) => a - b);
    const cDay = dayOf(c);
    const day0Goals = u.goals.filter((t) => t < c + DAY);
    const lastDay0 = Math.max(day0Goals.length ? day0Goals[day0Goals.length - 1] : c, seen < c + DAY ? seen : c);
    const minutes0 = (lastDay0 - c) / 60_000;
    const activeDays = new Set([...u.goals.map(dayOf), ...u.passDays, dayOf(seen)]);
    const lastActiveDay = Math.max(...activeDays);
    rows.push({
      id: u.id, nick: u.nick, deviceId: u.deviceId, created: c, cDay, label: dm(c), goalsTotal: u.goalsTotal, goals0: day0Goals.length, minutes0,
      kicked: u.kicks > 0 || u.goals.length > 0, minigames: u.minigames, chat: u.chat, x1: u.x1, invite: !!u.referredById, mobile: u.deviceMobile,
      vip: !!(u.vipUntil && u.vipUntil.getTime() > now), passes: u.passDays.size,
      d1: lastActiveDay >= cDay + 1, d3: lastActiveDay >= cDay + 3, activeNow: lastActiveDay >= cDay + 1 && seen >= now - 2 * DAY,
      elig1: cDay <= today - 1, elig3: cDay <= today - 3, daysActive: activeDays.size,
    });
  }
  return { rows, sweep, today, now };
}

/** O resumo que o relatório do Telegram usa (funil, tempo no 1º dia, por dia, quem volta × quem some…). */
export function retentionSummary({ rows, sweep, today, now }) {
  const all = rows.length;
  const e1 = rows.filter((r) => r.elig1);
  const e3 = rows.filter((r) => r.elig3);
  const funnel = [
    { key: 'cadastrou', label: 'Criaram a conta', n: e1.length },
    { key: 'chutou', label: 'Chutaram ao menos 1 vez', n: e1.filter((r) => r.kicked).length },
    { key: 'min10', label: 'Ficaram 10+ min no 1º dia', n: e1.filter((r) => r.minutes0 >= 10).length },
    { key: 'min30', label: 'Ficaram 30+ min no 1º dia', n: e1.filter((r) => r.minutes0 >= 30).length },
    { key: 'd1', label: 'Voltaram outro dia', n: e1.filter((r) => r.d1).length },
    { key: 'ativo', label: 'Ativos nas últimas 48 h', n: e1.filter((r) => r.activeNow).length },
  ];
  const buckets = [
    { label: 'até 5 min', test: (m) => m < 5 },
    { label: '5–15 min', test: (m) => m >= 5 && m < 15 },
    { label: '15–30 min', test: (m) => m >= 15 && m < 30 },
    { label: '30–60 min', test: (m) => m >= 30 && m < 60 },
    { label: '1–3 h', test: (m) => m >= 60 && m < 180 },
    { label: '3 h ou mais', test: (m) => m >= 180 },
  ].map((b) => ({ label: b.label, n: e1.filter((r) => r.kicked && b.test(r.minutes0)).length }));
  const days = [...new Set(rows.map((r) => r.cDay))].sort((a, b) => a - b).map((d) => {
    const c = rows.filter((r) => r.cDay === d);
    const el1 = d <= today - 1, el3 = d <= today - 3;
    return { day: d, label: c[0].label, n: c.length, kicked: c.filter((r) => r.kicked).length, min10: c.filter((r) => r.minutes0 >= 10).length,
      d1: el1 ? c.filter((r) => r.d1).length : null, d3: el3 ? c.filter((r) => r.d3).length : null, active: el1 ? c.filter((r) => r.activeNow).length : null };
  });
  const stay = e1.filter((r) => r.d1), leave = e1.filter((r) => !r.d1);
  const share = (grp, f) => pct(grp.filter(f).length, grp.length);
  const compare = [
    { label: 'Ficaram 30+ min no 1º dia', a: share(stay, (r) => r.minutes0 >= 30), b: share(leave, (r) => r.minutes0 >= 30) },
    { label: 'Fizeram 10+ gols no 1º dia', a: share(stay, (r) => r.goals0 >= 10), b: share(leave, (r) => r.goals0 >= 10) },
    { label: 'Jogaram algum minigame', a: share(stay, (r) => r.minigames > 0), b: share(leave, (r) => r.minigames > 0) },
    { label: 'Jogaram o X1', a: share(stay, (r) => r.x1 > 0), b: share(leave, (r) => r.x1 > 0) },
    { label: 'Falaram no chat', a: share(stay, (r) => r.chat > 0), b: share(leave, (r) => r.chat > 0) },
    { label: 'Entraram por convite', a: share(stay, (r) => r.invite), b: share(leave, (r) => r.invite) },
  ];
  const kicked1 = e1.filter((r) => r.kicked);
  const med = { minutes0: median(kicked1.map((r) => r.minutes0)), goals0: median(kicked1.map((r) => r.goals0)) };
  const quick = e1.filter((r) => r.kicked && r.minutes0 < 15).length; // saiu antes da 2ª recarga
  const fewKicks = e1.filter((r) => r.kicked && r.goals0 <= 7).length; // só a 1ª leva de chutes
  const returnedOnce = e1.filter((r) => r.d1 && !r.activeNow).length; // voltou e depois sumiu
  const loyal = rows.filter((r) => r.daysActive >= 4).length;
  const invited = e1.filter((r) => r.invite);
  return { all, sweep, today, now, e1: e1.length, e3: e3.length, d3: e3.filter((r) => r.d3).length, funnel, buckets, days, compare, stay: stay.length, leave: leave.length, med, quick, fewKicks, returnedOnce, loyal, invited: { n: invited.length, d1: invited.filter((r) => r.d1).length }, activeNow: rows.filter((r) => r.activeNow).length, first: rows[0]?.label, last: rows[rows.length - 1]?.label };
}
