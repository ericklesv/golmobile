/**
 * Relatório diário no Telegram (pedido do outro investidor, 16/09/2026): todo dia às 08:00 de Brasília, o grupo
 * "JogaGol - ADMIN" recebe um gráfico (PNG) + resumo do DIA ANTERIOR (dia de Brasília, 00:00–23:59):
 *   - contas criadas, gols marcados, jogadores com 20+ gols (os três pedidos), e de brinde jogadores que
 *     marcaram, PIX pagos (quantos e R$) e partidas do X1;
 *   - cada número comparado com o dia anterior e com a média dos 7 dias anteriores (▲/▼ %);
 *   - gráfico dos últimos 14 dias das três métricas pedidas (barras; a de ontem em laranja; linha da média 7d).
 * O gráfico é um SVG desenhado aqui e virado em PNG pelo sharp (fonte DejaVu instalada na VPS em 16/09 —
 * sem fonte o texto sai vazio). `DailyReport` (migração 0037) guarda o dia enviado (não repete depois de um
 * reinício) e o JSON das métricas. Teste/reenvio: `POST /api/admin/relatorio-diario {day?: 'AAAA-MM-DD'}`
 * (x-admin-key; `?ver=1` devolve o PNG em vez de mandar).
 */
import sharp from 'sharp';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { tg } from '../lib/telegram.js';
import { tzParts, fromTz } from '../lib/time.js';

export const REPORT_HOUR = 8; // hora de Brasília em que o relatório de ontem sai
const DAYS = 14;               // dias no gráfico
const TZ = config.tz || 'America/Sao_Paulo';
const HOT = 20;                // "jogador quente": 20+ gols no dia (pedido)

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fmtInt = (n) => Math.round(n).toLocaleString('pt-BR');
const brl = (cents) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** O dia de Brasília `offset` dias atrás (0 = hoje): chave AAAA-MM-DD, [start, end) em UTC e rótulo. */
export function dayOf(offset = -1, now = new Date()) {
  const { y, m, d } = tzParts(now);
  const start = fromTz(y, m, d + offset, 0, 0), end = fromTz(y, m, d + offset + 1, 0, 0);
  const p = tzParts(start);
  return { key: ymd(p.y, p.m, p.d), start, end, label: `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')} (${WEEK[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]})` };
}

/** Série diária (dia de Brasília) de cada métrica nos últimos `days` dias que terminam em `last` (inclusive). */
async function series(last, days) {
  const first = dayOf(-(days - 1), last.start.getTime() + 3600_000 * 12); // 12h dentro do último dia, para o tzParts cair nele
  const from = first.start, to = last.end;
  // (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE tz)::date = a data de Brasília (Prisma grava timestamp sem fuso, em UTC)
  const rows = await prisma.$queryRawUnsafe(`
    WITH g AS (
      SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE $3)::date AS d, "userId" FROM "Goal" WHERE "createdAt" >= $1 AND "createdAt" < $2
        AND "userId" NOT IN (SELECT id FROM "User" WHERE "isBot") -- bots fora (services/bots.js)
    ), per AS (SELECT d, "userId", count(*) AS c FROM g GROUP BY d, "userId")
    SELECT to_char(d, 'YYYY-MM-DD') AS day,
           (SELECT count(*) FROM g g2 WHERE g2.d = per.d) AS goals,
           count(*) AS scorers,
           count(*) FILTER (WHERE c >= ${HOT}) AS hot
    FROM per GROUP BY d ORDER BY d`, from, to, TZ);
  const users = await prisma.$queryRawUnsafe(`
    SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day, count(*) AS n
    FROM "User" WHERE "createdAt" >= $1 AND "createdAt" < $2 AND NOT "isBot" GROUP BY 1`, from, to, TZ);
  const pix = await prisma.$queryRawUnsafe(`
    SELECT to_char((("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day, count(*) AS n, coalesce(sum("amountCents"), 0) AS cents
    FROM "VipPurchase" WHERE status = 'PAID' AND "paidAt" >= $1 AND "paidAt" < $2 GROUP BY 1`, from, to, TZ);
  const x1 = await prisma.$queryRawUnsafe(`
    SELECT to_char((("finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day, count(*) AS n
    FROM "FutPregoMatch" WHERE status = 'FINISHED' AND "finishedAt" >= $1 AND "finishedAt" < $2 GROUP BY 1`, from, to, TZ);
  const byDay = new Map();
  const at = (k) => { if (!byDay.has(k)) byDay.set(k, { day: k, accounts: 0, goals: 0, scorers: 0, hot: 0, pix: 0, pixCents: 0, x1: 0 }); return byDay.get(k); };
  for (const r of rows) Object.assign(at(r.day), { goals: Number(r.goals), scorers: Number(r.scorers), hot: Number(r.hot) });
  for (const r of users) at(r.day).accounts = Number(r.n);
  for (const r of pix) Object.assign(at(r.day), { pix: Number(r.n), pixCents: Number(r.cents) });
  for (const r of x1) at(r.day).x1 = Number(r.n);
  const out = [];
  for (let i = days - 1; i >= 0; i--) { const dk = dayOf(-i, last.start.getTime() + 3600_000 * 12); out.push({ ...at(dk.key), label: dk.label.slice(0, 5) }); }
  return out;
}

/** ▲ +12% / ▼ −8% / = 0% (base 0 = "novo"). */
function delta(cur, base) {
  if (!base) return cur ? '▲ novo' : '= 0%';
  const p = Math.round(((cur - base) / base) * 100);
  return p > 0 ? `▲ +${p}%` : p < 0 ? `▼ ${p}%` : '= 0%';
}
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/** Monta as métricas do dia (`dayKey` AAAA-MM-DD; padrão ontem) com as comparações e a série do gráfico. */
export async function buildDailyReport(dayKey = null, now = new Date()) {
  let day = dayOf(-1, now);
  if (dayKey) { const [y, m, d] = dayKey.split('-').map(Number); day = dayOf(0, fromTz(y, m, d, 12, 0)); }
  const s = await series(day, DAYS);
  const cur = s[s.length - 1], prev = s[s.length - 2] ?? null, week = s.slice(-8, -1);
  const cmp = (k) => ({ value: cur[k], prev: prev?.[k] ?? 0, avg7: avg(week.map((r) => r[k])), vsPrev: delta(cur[k], prev?.[k] ?? 0), vsAvg: delta(cur[k], avg(week.map((r) => r[k]))) });
  const m = { accounts: cmp('accounts'), goals: cmp('goals'), hot: cmp('hot'), scorers: cmp('scorers'), x1: cmp('x1'), pix: { ...cmp('pix'), cents: cur.pixCents, centsPrev: prev?.pixCents ?? 0 } };
  const hotPct = cur.scorers ? Math.round((cur.hot / cur.scorers) * 100) : 0;
  const perScorer = cur.scorers ? Math.round(cur.goals / cur.scorers) : 0;
  const text = [
    `📊 <b>Relatório de ${tg.esc(day.label)}</b>`,
    `👤 Contas criadas: <b>${fmtInt(m.accounts.value)}</b> — ${m.accounts.vsPrev} vs dia anterior · ${m.accounts.vsAvg} vs média 7d (${fmtInt(m.accounts.avg7)})`,
    `⚽ Gols: <b>${fmtInt(m.goals.value)}</b> — ${m.goals.vsPrev} · ${m.goals.vsAvg} vs média 7d (${fmtInt(m.goals.avg7)})`,
    `🔥 Com ${HOT}+ gols: <b>${fmtInt(m.hot.value)}</b> jogadores (${hotPct}% de quem marcou) — ${m.hot.vsPrev} · ${m.hot.vsAvg} vs média 7d (${fmtInt(m.hot.avg7)})`,
    `🎯 Marcaram gol: <b>${fmtInt(m.scorers.value)}</b> jogadores (${fmtInt(perScorer)} gols cada, em média) — ${m.scorers.vsPrev}`,
    `💰 PIX: <b>${fmtInt(m.pix.value)}</b> compra${m.pix.value === 1 ? '' : 's'} · <b>${brl(m.pix.cents)}</b> (dia anterior: ${brl(m.pix.centsPrev)})`,
    `⚔️ X1: <b>${fmtInt(m.x1.value)}</b> partida${m.x1.value === 1 ? '' : 's'} — ${m.x1.vsPrev} · ${m.x1.vsAvg} vs média 7d`,
  ].join('\n');
  return { day: day.key, label: day.label, metrics: m, series: s, text };
}

/** O gráfico: 3 painéis (contas, gols, 20+ gols) com 14 dias de barras, ontem em laranja, média 7d tracejada. */
export async function renderDailyChart(report) {
  const W = 1080, PAD = 40, PANEL_H = 250, GAP = 26, TOP = 96;
  const panels = [
    { key: 'accounts', title: 'Contas criadas', color: '#2EA8FF' },
    { key: 'goals', title: 'Gols marcados', color: '#4CD137' },
    { key: 'hot', title: `Jogadores com ${HOT}+ gols`, color: '#FFC63D' },
  ];
  const H = TOP + panels.length * (PANEL_H + GAP) + 24;
  const s = report.series;
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DejaVu Sans, Arial, sans-serif">
  <rect width="${W}" height="${H}" fill="#0B2D6B"/>
  <text x="${PAD}" y="48" font-size="30" font-weight="bold" fill="#FFFFFF">JogaGol — relatório de ${esc(report.label)}</text>
  <text x="${PAD}" y="76" font-size="16" fill="#A9BBDA">Últimos ${DAYS} dias · barra laranja = ${esc(report.label.slice(0, 5))} · linha tracejada = média dos 7 dias anteriores</text>`;
  panels.forEach((p, pi) => {
    const y0 = TOP + pi * (PANEL_H + GAP);
    const m = report.metrics[p.key];
    const vals = s.map((r) => r[p.key]);
    const max = Math.max(1, ...vals, m.avg7);
    const chartX = PAD + 12, chartW = W - PAD * 2 - 24, chartTop = y0 + 56, chartH = PANEL_H - 56 - 30;
    const slot = chartW / s.length, barW = Math.min(52, slot * 0.62);
    const yOf = (v) => chartTop + chartH - (v / max) * chartH * 0.86; // 14% de folga para o rótulo em cima da barra
    svg += `<rect x="${PAD}" y="${y0}" width="${W - PAD * 2}" height="${PANEL_H}" rx="16" fill="#123C8A"/>
    <text x="${PAD + 18}" y="${y0 + 32}" font-size="20" font-weight="bold" fill="#FFFFFF">${esc(p.title)}</text>
    <text x="${W - PAD - 18}" y="${y0 + 32}" font-size="20" font-weight="bold" fill="#FFC63D" text-anchor="end">${fmtInt(m.value)}</text>
    <text x="${PAD + 18}" y="${y0 + 52}" font-size="13" fill="#A9BBDA">${esc(m.vsPrev)} vs dia anterior · ${esc(m.vsAvg)} vs média 7d (${fmtInt(m.avg7)})</text>`;
    // grade (3 linhas)
    for (let g = 1; g <= 3; g++) { const gy = chartTop + chartH - (chartH * g) / 3; svg += `<line x1="${chartX}" y1="${gy}" x2="${chartX + chartW}" y2="${gy}" stroke="#FFFFFF" stroke-opacity="0.08"/>`; }
    // média 7d
    const ay = yOf(m.avg7);
    svg += `<line x1="${chartX}" y1="${ay}" x2="${chartX + chartW}" y2="${ay}" stroke="#FFFFFF" stroke-opacity="0.55" stroke-dasharray="6 6"/>`;
    s.forEach((r, i) => {
      const v = r[p.key], x = chartX + slot * i + (slot - barW) / 2, y = yOf(v), last = i === s.length - 1;
      const h = v > 0 ? Math.max(3, chartTop + chartH - y) : 2;
      svg += `<rect x="${x.toFixed(1)}" y="${(chartTop + chartH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${last ? '#FF8A2A' : p.color}" fill-opacity="${last ? 1 : 0.85}"/>`;
      if (v > 0 || last) svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(chartTop + chartH - h - 6).toFixed(1)}" font-size="12" font-weight="${last ? 'bold' : 'normal'}" fill="${last ? '#FFD54A' : '#FFFFFF'}" text-anchor="middle">${fmtInt(v)}</text>`;
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${chartTop + chartH + 20}" font-size="12" fill="${last ? '#FFD54A' : '#A9BBDA'}" text-anchor="middle">${esc(r.label)}</text>`;
    });
  });
  svg += '</svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Manda o relatório (gráfico + texto) para o grupo e grava em DailyReport. Devolve o relatório. */
export async function sendDailyReport(dayKey = null, { force = false } = {}) {
  const report = await buildDailyReport(dayKey);
  if (!force) { const done = await prisma.dailyReport.findUnique({ where: { day: report.day } }); if (done) return { ...report, skipped: true }; }
  let png = null;
  try { png = await renderDailyChart(report); } catch (e) { console.error('[relatorio] gráfico falhou (vai só o texto):', e.message); }
  await prisma.dailyReport.upsert({ where: { day: report.day }, create: { day: report.day, json: report.metrics }, update: { json: report.metrics, sentAt: new Date() } });
  if (png) await tg.photo(png, report.text); else tg.info(report.text);
  return report;
}

let lastCheck = 0;
/** Volta do scheduler: às REPORT_HOUR de Brasília manda o relatório de ontem, uma vez por dia (DailyReport). */
export async function dailyReportTick(now = new Date()) {
  if (now.getTime() - lastCheck < 60_000) return null;
  lastCheck = now.getTime();
  if (!tg.enabled() || tzParts(now).h < REPORT_HOUR) return null;
  const r = await sendDailyReport(null);
  if (!r.skipped) console.log(`[relatorio] diário de ${r.label} enviado`);
  return r;
}
