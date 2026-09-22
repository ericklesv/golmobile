/**
 * Relatório AO VIVO do painel de admin (pedido do dono, 18/09/2026: "métricas de tudo e em tempo real", num menu
 * flutuante à esquerda da tela — web/src/components/AdminDock.tsx). `GET /api/painel/relatorio?dias=7`.
 *
 * Blocos:
 *  - agora: online (com QUEM está online — sem bots), gols nesta hora, hoje × ontem (gols, contas, quem marcou),
 *    X1 ao vivo (com QUEM está jogando em cada partida)/hoje, PIX, chat, bots; gols por hora nas últimas 24 h
 *    (sparkline). Quem está online e quem joga o X1: pedido do dono, 22/09/2026 — "precisamos ver essas infos
 *    primeiro".
 *  - retencao: contas dos últimos 7 dias inteiros — voltaram (d1), 3+ dias (d3), ativos 48 h; por dia de cadastro.
 *  - funil dos novatos no período (`dias`), pelos EVENTOS (tabela Event, routes/events.js): cadastrou → viu a home
 *    → chutou → viu a recarga → viu o slider → abriu minigame → abriu X1 → abriu o chat → voltou outro dia.
 *  - ondeSaem: a última tela de quem nunca mais voltou; tempo de sessão (app.saiu.seg) dos novatos.
 *  - eventos: os últimos 20 (o "ao vivo" do painel).
 * Cache de 10 s por período (o painel pede a cada 15 s; dois admins).
 */
import { prisma } from '../prisma.js';
import { hourKey } from '../lib/time.js';
import { dayOf } from './dailyReport.js';
import { retentionRows, pct, median, dm } from './retention.js';
import { x1Status, x1LiveMatches } from '../realtime/x1.js';

const DAY = 24 * 3600_000;
/** Telas de minigame (nome da rota) — "abriu minigame" no funil. */
const MINIGAME_SCREENS = new Set(['termo', 'quiz', 'memoria', 'qualtime', 'alvo', 'estatisticas', 'camisas', 'hat-trick', 'falta-pro', 'ganha-ou-perde', 'partygol', 'penalcup', 'goleada', 'frangaco']);
const SCREEN_LABEL = { home: 'Início', landing: 'Landing', cadastro: 'Cadastro', entrar: 'Login', penalti: 'Pênalti', falta: 'Falta', trilha: 'Trilha', liga: 'Liga', rankings: 'Rankings', loja: 'Loja', vip: 'VIP', time: 'Time', perfil: 'Perfil', chat: 'Chat', x1: 'X1', mensagens: 'Mensagens', ativos: 'Ativos', jogador: 'Jogador', partida: 'Partida', niveis: 'Níveis', regras: 'Regras', termo: 'Termo', quiz: 'Quiz', memoria: 'Memória', qualtime: 'De que time é?', alvo: 'Alvo no Gol', estatisticas: 'Estatísticas', camisas: 'Camisas', 'hat-trick': 'Hat Trick', 'falta-pro': 'Falta PRO', 'ganha-ou-perde': 'Ganha ou Perde', partygol: 'Party GoL', penalcup: 'PenalCup', goleada: 'PenalCup', propostas: 'Propostas', admin: 'Painel' };
export const screenLabel = (s) => SCREEN_LABEL[s] || s;

const cache = new Map(); // dias -> { until, value }

export async function adminReport({ days = 7 } = {}, now = new Date()) {
  const hit = cache.get(days);
  if (hit && hit.until > now.getTime()) return hit.value;
  const value = await build(days, now);
  cache.set(days, { until: now.getTime() + 10_000, value });
  return value;
}

async function build(days, now) {
  const t = now.getTime();
  const today = dayOf(0, now), yesterday = dayOf(-1, now);
  const human = { isBot: false };
  const onlineWhere = { ...human, deletedAt: null, lastSeenAt: { gt: new Date(t - 2 * 60_000) } };
  const [online, onlineRows, active24, botsOnline, golsHora, golsHoje, golsOntem, botsGolsHoje, contasHoje, contasOntem, marcaramHoje, marcaramOntem, x1Hoje, pixHoje, chatHoje, porHoraRows, recentes] = await Promise.all([
    prisma.user.count({ where: onlineWhere }),
    // quem está online (sem bots), o visto há menos tempo primeiro — até 120 nomes (o painel lista todos)
    prisma.user.findMany({ where: onlineWhere, orderBy: { lastSeenAt: 'desc' }, take: 120, select: { id: true, nick: true, lastSeenAt: true, vipUntil: true, team: { select: { abbr: true } } } }),
    prisma.user.count({ where: { ...human, deletedAt: null, lastSeenAt: { gt: new Date(t - DAY) } } }),
    prisma.user.count({ where: { isBot: true, lastSeenAt: { gt: new Date(t - 2 * 60_000) } } }),
    prisma.goal.count({ where: { hourKey: hourKey(now), user: human } }),
    prisma.goal.count({ where: { createdAt: { gte: today.start }, user: human } }),
    prisma.goal.count({ where: { createdAt: { gte: yesterday.start, lt: yesterday.end }, user: human } }),
    prisma.goal.count({ where: { createdAt: { gte: today.start }, user: { isBot: true } } }),
    prisma.user.count({ where: { ...human, createdAt: { gte: today.start } } }),
    prisma.user.count({ where: { ...human, createdAt: { gte: yesterday.start, lt: yesterday.end } } }),
    prisma.goal.groupBy({ by: ['userId'], where: { createdAt: { gte: today.start }, user: human } }),
    prisma.goal.groupBy({ by: ['userId'], where: { createdAt: { gte: yesterday.start, lt: yesterday.end }, user: human } }),
    prisma.x1Match.count({ where: { status: 'FINISHED', finishedAt: { gte: today.start } } }),
    prisma.vipPurchase.aggregate({ where: { status: 'PAID', paidAt: { gte: today.start } }, _count: { _all: true }, _sum: { amountCents: true } }),
    prisma.chatMessage.count({ where: { createdAt: { gte: today.start } } }),
    prisma.goal.groupBy({ by: ['hourKey'], where: { createdAt: { gte: new Date(t - DAY) }, user: human }, _count: { _all: true } }),
    prisma.event.findMany({ orderBy: { id: 'desc' }, take: 20, select: { id: true, name: true, data: true, createdAt: true, userId: true, user: { select: { nick: true } } } }),
  ]);
  // gols por hora, as últimas 24 horas cheias (a atual por último)
  const byHour = new Map(porHoraRows.map((r) => [r.hourKey, r._count._all]));
  const porHora = [];
  for (let i = 23; i >= 0; i--) { const hk = hourKey(new Date(t - i * 3600_000)); porHora.push({ h: Number(hk.slice(-2)), n: byHour.get(hk) ?? 0 }); }
  const x1 = x1Status();
  const onlineList = onlineRows.map((u) => ({ id: u.id, nick: u.nick, abbr: u.team?.abbr ?? null, vip: !!(u.vipUntil && u.vipUntil.getTime() > t), seenAgoSec: Math.max(0, Math.round((t - u.lastSeenAt.getTime()) / 1000)) }));
  const agora = {
    online, onlineList, active24, botsOnline, golsHora, golsHoje, golsOntem, botsGolsHoje, contasHoje, contasOntem,
    marcaramHoje: marcaramHoje.length, marcaramOntem: marcaramOntem.length,
    x1AoVivo: x1.matches, x1Partidas: x1LiveMatches(), x1Hoje, pixHoje: { n: pixHoje._count._all, cents: pixHoje._sum.amountCents ?? 0 }, chatHoje, porHora,
  };

  // ── retenção (contas dos últimos 7 dias inteiros + o período pedido, para o funil)
  const sinceDays = Math.max(days, 8);
  const { rows, today: todayN } = await retentionRows({ now: t, since: t - sinceDays * DAY });
  const last7 = rows.filter((r) => r.elig1 && r.cDay >= todayN - 7);
  const last7e3 = last7.filter((r) => r.elig3);
  const porDia = [];
  for (let d = todayN - 7; d <= todayN; d++) {
    const c = rows.filter((r) => r.cDay === d);
    porDia.push({ day: d, label: c[0]?.label ?? dm(t - (todayN - d) * DAY), n: c.length, d1: d <= todayN - 1 ? c.filter((r) => r.d1).length : null, kicked: c.filter((r) => r.kicked).length });
  }
  const retencao = {
    base: last7.length, d1: last7.filter((r) => r.d1).length, base3: last7e3.length, d3: last7e3.filter((r) => r.d3).length, ativos48: last7.filter((r) => r.activeNow).length,
    porDia,
  };

  // ── funil dos novatos no período, pelos eventos
  const cohort = rows.filter((r) => r.cDay >= todayN - (days - 1));
  const ids = cohort.map((r) => r.id);
  const evs = ids.length ? await prisma.event.groupBy({ by: ['userId', 'name'], where: { userId: { in: ids } }, _count: { _all: true } }) : [];
  const names = new Map(); // userId -> Set(name)
  for (const e of evs) { if (!names.has(e.userId)) names.set(e.userId, new Set()); names.get(e.userId).add(e.name); }
  const has = (r, f) => { const s = names.get(r.id); return !!s && [...s].some(f); };
  const steps = [
    { key: 'cadastrou', label: 'Criaram a conta', f: () => true },
    { key: 'home', label: 'Viram a tela inicial', f: (r) => has(r, (n) => n === 'tela.home') },
    { key: 'chutou', label: 'Chutaram', f: (r) => r.kicked },
    { key: 'recarga', label: 'Viram a recarga (esperando)', f: (r) => has(r, (n) => n === 'recarga.vista') },
    { key: 'slider', label: 'Viram os minigames', f: (r) => has(r, (n) => n === 'slider.visto') },
    { key: 'minigame', label: 'Abriram um minigame', f: (r) => has(r, (n) => n.startsWith('tela.') && MINIGAME_SCREENS.has(n.slice(5))) },
    { key: 'x1', label: 'Abriram o X1', f: (r) => has(r, (n) => n === 'tela.x1' || n === 'tela.futprego') },
    { key: 'chat', label: 'Abriram o chat', f: (r) => has(r, (n) => n === 'tela.chat') },
    { key: 'loja', label: 'Abriram a Loja ou o VIP', f: (r) => has(r, (n) => n === 'tela.loja' || n === 'tela.vip') },
  ];
  const cohortE1 = cohort.filter((r) => r.elig1);
  const funil = steps.map((s) => ({ key: s.key, label: s.label, n: cohort.filter(s.f).length }));
  funil.push({ key: 'voltou', label: 'Voltaram outro dia', n: cohortE1.filter((r) => r.d1).length, base: cohortE1.length });
  const medido = cohort.filter((r) => names.has(r.id)).length; // contas com algum evento (criadas depois da medição começar)

  // ── onde somem: a última tela de quem nunca mais voltou (elegível) + tempo de sessão dos novatos
  const churned = cohortE1.filter((r) => !r.d1 && names.has(r.id));
  const ultimaTela = [];
  if (churned.length) {
    const last = await prisma.event.findMany({ where: { userId: { in: churned.map((r) => r.id) }, name: { startsWith: 'tela.' } }, orderBy: { id: 'desc' }, select: { userId: true, name: true } });
    const seen = new Set(), count = new Map();
    for (const e of last) { if (seen.has(e.userId)) continue; seen.add(e.userId); const k = e.name.slice(5); count.set(k, (count.get(k) ?? 0) + 1); }
    for (const [tela, n] of [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) ultimaTela.push({ tela, label: screenLabel(tela), n, pct: pct(n, seen.size) });
  }
  const saidas = ids.length ? await prisma.event.findMany({ where: { userId: { in: ids }, name: 'app.saiu' }, select: { userId: true, data: true, createdAt: true } }) : [];
  const segs = saidas.map((e) => Number(e.data?.seg)).filter((n) => Number.isFinite(n) && n >= 0);
  const sessao = { n: segs.length, medianaSeg: Math.round(median(segs)), ate1min: segs.filter((s) => s < 60).length, ate5min: segs.filter((s) => s >= 60 && s < 300).length, ate15min: segs.filter((s) => s >= 300 && s < 900).length, mais15: segs.filter((s) => s >= 900).length };

  const eventos = recentes.map((e) => ({ id: e.id, at: e.createdAt.getTime(), nick: e.user?.nick ?? null, name: e.name, data: e.data ?? null }));
  return { at: t, dias: days, agora, retencao, funil: { steps: funil, cohort: cohort.length, medido, base1: cohortE1.length }, ondeSaem: { ultimaTela, churned: churned.length, sessao }, eventos };
}
