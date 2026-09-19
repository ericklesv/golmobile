/**
 * Relatório de RETENÇÃO dos novos jogadores (pedido do dono, 18/09/2026: "quantos ficam no jogo e depois saem e
 * nunca mais voltam", para pensar em como segurar quem entra). Lê o banco (só leitura), monta um gráfico (PNG,
 * SVG → sharp, como o relatório diário) e um texto com os números, o que diferencia quem fica e recomendações,
 * e manda para o grupo do Telegram (foto + 2 mensagens).
 *
 * Uso (pasta api/, com o .env do banco):
 *   node scripts/relatorio-retencao.js --ver /tmp/retencao.png    grava o PNG e imprime o texto (não manda nada)
 *   node scripts/relatorio-retencao.js --enviar                    manda para o Telegram (TELEGRAM_* do .env)
 *
 * Definições (dia = dia de Brasília):
 *  - Conta nova = User sem isBot, sem deletedAt, fora as contas de varredura (0 gol, IP banido 177.23.227.136).
 *  - 1º dia = as 24 h depois do cadastro. "Tempo no 1º dia" = do cadastro até o último sinal de vida dentro dessas
 *    24 h (último gol, ou lastSeenAt se ainda está nelas).
 *  - Voltou (D1) = teve atividade (gol, Presença ou lastSeenAt) em um dia DEPOIS do dia do cadastro; só conta para
 *    contas criadas até ontem. Ativo 3+ dias depois (D3) = atividade ≥ 3 dias depois; só contas com 3+ dias.
 *  - Ativo agora = voltou outro dia E lastSeenAt nas últimas 48 h (conta de hoje não conta como "ativa" só por existir).
 */
import 'dotenv/config';
import fs from 'node:fs';
import sharp from 'sharp';
import { prisma } from '../src/prisma.js';
import { tg } from '../src/lib/telegram.js';
import { tzParts, calendarDay } from '../src/lib/time.js';

const args = process.argv.slice(2);
const OUT = args.includes('--ver') ? args[args.indexOf('--ver') + 1] || 'retencao.png' : null;
const SEND = args.includes('--enviar');
const SWEEP_IP = '177.23.227.136'; // varredura de 17/09 (contas testadmin99, massassign99, audit_…): não são jogadores

const HOUR = 3600_000, DAY = 24 * HOUR;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const dayOf = (d) => calendarDay(new Date(d));
const dm = (d) => { const p = tzParts(new Date(d)); return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}`; };
const median = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Dados ────────────────────────────────────────────────────────────────────
async function collect(now = Date.now()) {
  const today = dayOf(now);
  const users = await prisma.user.findMany({
    where: { isBot: false, deletedAt: null },
    select: { id: true, nick: true, createdAt: true, lastSeenAt: true, goalsTotal: true, referredById: true, deviceMobile: true, createdIp: true, vipUntil: true, teamId: true },
    orderBy: { createdAt: 'asc' },
  });
  const ids = users.map((u) => u.id);
  const [goals, passes, dailies, chats, x1] = await Promise.all([
    prisma.goal.findMany({ where: { userId: { in: ids } }, select: { userId: true, createdAt: true } }),
    prisma.loginPass.findMany({ where: { userId: { in: ids } }, select: { userId: true, day: true } }),
    prisma.dailyGame.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
    prisma.chatMessage.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
    prisma.x1Match.findMany({ where: { status: 'FINISHED' }, select: { aId: true, bId: true } }),
  ]);
  const byUser = new Map(users.map((u) => [u.id, { ...u, goals: [], passDays: new Set(), minigames: 0, chat: 0, x1: 0 }]));
  for (const g of goals) byUser.get(g.userId)?.goals.push(g.createdAt.getTime());
  for (const p of passes) byUser.get(p.userId)?.passDays.add(p.day);
  for (const d of dailies) { const u = byUser.get(d.userId); if (u) u.minigames = d._count._all; }
  for (const c of chats) { const u = byUser.get(c.userId); if (u) u.chat = c._count._all; }
  for (const m of x1) { for (const id of [m.aId, m.bId]) { const u = byUser.get(id); if (u) u.x1++; } }

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
      id: u.id, nick: u.nick, created: c, cDay, label: dm(c), goalsTotal: u.goalsTotal, goals0: day0Goals.length, minutes0,
      kicked: u.goals.length > 0, minigames: u.minigames, chat: u.chat, x1: u.x1, invite: !!u.referredById, mobile: u.deviceMobile,
      vip: !!(u.vipUntil && u.vipUntil.getTime() > now), passes: u.passDays.size,
      d1: lastActiveDay >= cDay + 1, d3: lastActiveDay >= cDay + 3, activeNow: lastActiveDay >= cDay + 1 && seen >= now - 2 * DAY, // ativo = voltou E foi visto nas últimas 48 h
      elig1: cDay <= today - 1, elig3: cDay <= today - 3, daysActive: activeDays.size,
    });
  }
  return { rows, sweep, today, now };
}

// ─── Métricas ─────────────────────────────────────────────────────────────────
function analyze({ rows, sweep, today, now }) {
  const all = rows.length;
  const e1 = rows.filter((r) => r.elig1); // contas com pelo menos 1 dia inteiro para voltar
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
  ].map((b) => ({ ...b, n: e1.filter((r) => r.kicked && b.test(r.minutes0)).length }));
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
  // aparelho (celular × PC): só gravado desde 15/09 e em quem voltou a entrar — viés; fica nos dados, fora do texto
  const mobileKnown = e1.filter((r) => r.mobile !== null);
  const mobile = { n: mobileKnown.length, cel: share(mobileKnown.filter((r) => r.mobile), (r) => r.d1), pc: share(mobileKnown.filter((r) => !r.mobile), (r) => r.d1), nCel: mobileKnown.filter((r) => r.mobile).length, nPc: mobileKnown.filter((r) => !r.mobile).length };
  const invited = e1.filter((r) => r.invite);
  return { all, sweep, today, now, e1: e1.length, e3: e3.length, d3: e3.filter((r) => r.d3).length, funnel, buckets, days, compare, stay: stay.length, leave: leave.length, med, quick, fewKicks, returnedOnce, loyal, mobile, invited: { n: invited.length, d1: invited.filter((r) => r.d1).length }, activeNow: rows.filter((r) => r.activeNow).length, first: rows[0]?.label, last: rows[rows.length - 1]?.label };
}

// ─── Gráfico ──────────────────────────────────────────────────────────────────
// Cores: superfície marinho (#0B2D6B / painéis #123C8A); marcas em UM azul (#3B93E6) e o destaque "quem fica" em
// dourado (#B8850F — validado no scripts/validate_palette do dataviz para a superfície #123C8A); cinza #7C8DAA é
// só o "perdido" (neutro). Texto sempre em branco / #A9BBDA; números-herói em #FFC63D (token de texto).
const C = { bg: '#0B2D6B', panel: '#123C8A', ink: '#FFFFFF', ink2: '#A9BBDA', hero: '#FFC63D', blue: '#3B93E6', gold: '#B8850F', gray: '#7C8DAA', grid: 'rgba(255,255,255,0.08)' };
const FONT = 'DejaVu Sans, Arial, sans-serif';

export function render(m) {
  const W = 1100, PAD = 40, GAP = 24;
  let y = 0;
  const parts = [];
  const text = (x, yy, t, { size = 14, fill = C.ink, weight = 'normal', anchor = 'start' } = {}) => `<text x="${x}" y="${yy}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(t)}</text>`;
  const panel = (h, title, sub) => {
    const y0 = y;
    parts.push(`<rect x="${PAD}" y="${y0}" width="${W - PAD * 2}" height="${h}" rx="16" fill="${C.panel}"/>`);
    parts.push(text(PAD + 20, y0 + 34, title, { size: 21, weight: 'bold' }));
    if (sub) parts.push(text(PAD + 20, y0 + 56, sub, { size: 13, fill: C.ink2 }));
    y += h + GAP;
    return y0;
  };

  // cabeçalho
  y = 30;
  parts.push(text(PAD, y + 26, 'JogaGol — retenção dos novos jogadores', { size: 30, weight: 'bold' }));
  parts.push(text(PAD, y + 54, `Contas criadas de ${m.first} a ${m.last} · ${m.all} jogadores de verdade (fora ${m.sweep} contas de varredura e os bots) · gerado em ${dm(m.now)}`, { size: 14, fill: C.ink2 }));
  y += 80;

  // heróis
  const heroes = [
    { v: m.e1, l: 'contas novas', s: 'criadas até ontem (base do funil)' },
    { v: `${pct(m.funnel[1].n, m.e1)}%`, l: 'chutaram', s: 'fizeram ao menos 1 gol' },
    { v: `${pct(m.funnel[4].n, m.e1)}%`, l: 'voltaram outro dia', s: `${m.funnel[4].n} de ${m.e1}` },
    { v: `${pct(m.funnel[5].n, m.e1)}%`, l: 'ainda jogando', s: 'ativos nas últimas 48 h' },
  ];
  const hw = (W - PAD * 2 - GAP * 3) / 4;
  heroes.forEach((h, i) => {
    const x = PAD + i * (hw + GAP);
    parts.push(`<rect x="${x}" y="${y}" width="${hw}" height="104" rx="16" fill="${C.panel}"/>`);
    parts.push(text(x + 18, y + 48, h.v, { size: 36, weight: 'bold', fill: C.hero }));
    parts.push(text(x + 18, y + 72, h.l, { size: 15, weight: 'bold' }));
    parts.push(text(x + 18, y + 92, h.s, { size: 12, fill: C.ink2 }));
  });
  y += 104 + GAP;

  // funil
  {
    const rowH = 34, y0 = panel(70 + m.funnel.length * rowH + 16, 'O funil: da conta criada até ficar no jogo', 'cada barra = quantos dos novos chegaram àquele passo · à direita, quantos se perderam do passo anterior');
    const x0 = PAD + 260, maxW = W - PAD - 250 - x0, base = m.funnel[0].n || 1;
    m.funnel.forEach((f, i) => {
      const yy = y0 + 76 + i * rowH, w = Math.max(3, (f.n / base) * maxW);
      const fill = f.key === 'd1' || f.key === 'ativo' ? C.gold : C.blue;
      parts.push(text(x0 - 12, yy + 16, f.label, { size: 14, anchor: 'end' }));
      parts.push(`<rect x="${x0}" y="${yy}" width="${w.toFixed(1)}" height="22" rx="4" fill="${fill}"/>`);
      parts.push(text(x0 + w + 10, yy + 16, `${f.n}  (${pct(f.n, base)}%)`, { size: 14, weight: 'bold' }));
      if (i > 0) { const lost = m.funnel[i - 1].n - f.n; if (lost > 0) parts.push(text(W - PAD - 20, yy + 16, `−${lost} (−${pct(lost, m.funnel[i - 1].n)}%)`, { size: 13, fill: C.ink2, anchor: 'end' })); }
    });
  }

  // tempo no 1º dia
  {
    const h = 300, y0 = panel(h, 'Quanto tempo o novato fica no 1º dia', `do cadastro até o último gol/sinal de vida nas primeiras 24 h · só quem chutou · mediana: ${Math.round(m.med.minutes0)} min e ${m.med.goals0} gols`);
    const chartX = PAD + 30, chartW = W - PAD * 2 - 60, chartTop = y0 + 80, chartH = h - 80 - 44;
    const max = Math.max(1, ...m.buckets.map((b) => b.n)), slot = chartW / m.buckets.length, barW = Math.min(64, slot * 0.5);
    const total = m.buckets.reduce((s, b) => s + b.n, 0) || 1;
    for (let g = 1; g <= 3; g++) { const gy = chartTop + chartH - (chartH * g) / 3; parts.push(`<line x1="${chartX}" y1="${gy}" x2="${chartX + chartW}" y2="${gy}" stroke="${C.grid}"/>`); }
    m.buckets.forEach((b, i) => {
      const x = chartX + slot * i + (slot - barW) / 2, bh = b.n ? Math.max(3, (b.n / max) * chartH * 0.86) : 2, yy = chartTop + chartH - bh;
      const fill = i === 0 ? C.gray : C.blue; // "até 5 min" = perdido de cara
      parts.push(`<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${barW}" height="${bh.toFixed(1)}" rx="4" fill="${fill}"/>`);
      parts.push(text(x + barW / 2, yy - 8, `${b.n} (${pct(b.n, total)}%)`, { size: 13, weight: 'bold', anchor: 'middle' }));
      parts.push(text(x + barW / 2, chartTop + chartH + 22, b.label, { size: 13, fill: C.ink2, anchor: 'middle' }));
    });
  }

  // por dia de cadastro
  {
    const rowH = 30, y0 = panel(84 + m.days.length * rowH + 12, 'Por dia de cadastro', 'voltaram = atividade em outro dia · 3+ dias = ainda ativo 3 dias depois do cadastro · — = cedo demais para medir');
    const cols = [{ x: PAD + 20, t: 'Dia' }, { x: PAD + 130, t: 'Contas' }, { x: PAD + 230, t: 'Chutaram' }, { x: PAD + 340, t: '10+ min' }, { x: PAD + 450, t: 'Voltaram' }, { x: PAD + 590, t: 'Ativos 3+ dias' }, { x: PAD + 740, t: 'Ativos agora' }];
    cols.forEach((c) => parts.push(text(c.x, y0 + 80, c.t, { size: 12, fill: C.ink2, weight: 'bold' })));
    const barX = PAD + 860, barMax = W - PAD - 20 - barX - 50;
    m.days.forEach((d, i) => {
      const yy = y0 + 104 + i * rowH;
      const cell = (x, v, bold = false) => parts.push(text(x, yy, v, { size: 14, weight: bold ? 'bold' : 'normal' }));
      cell(cols[0].x, d.label, true); cell(cols[1].x, d.n); cell(cols[2].x, `${d.kicked} (${pct(d.kicked, d.n)}%)`); cell(cols[3].x, `${d.min10} (${pct(d.min10, d.n)}%)`);
      cell(cols[4].x, d.d1 === null ? '—' : `${d.d1} (${pct(d.d1, d.n)}%)`, true); cell(cols[5].x, d.d3 === null ? '—' : `${d.d3} (${pct(d.d3, d.n)}%)`); cell(cols[6].x, d.active === null ? '—' : d.active);
      if (d.d1 !== null) { const w = Math.max(2, (pct(d.d1, d.n) / 100) * barMax); parts.push(`<rect x="${barX}" y="${yy - 14}" width="${w.toFixed(1)}" height="16" rx="4" fill="${C.gold}"/>`); parts.push(text(barX + w + 8, yy, `${pct(d.d1, d.n)}%`, { size: 12, fill: C.ink2 })); }
    });
    parts.push(text(barX, y0 + 80, 'Voltaram (%)', { size: 12, fill: C.ink2, weight: 'bold' }));
  }

  // quem fica × quem some
  {
    const rowH = 44, y0 = panel(96 + m.compare.length * rowH + 10, 'Quem volta × quem some: o que cada grupo fez no 1º dia', `% de cada grupo · ${m.stay} voltaram (dourado) · ${m.leave} nunca mais voltaram (azul)`);
    // legenda
    parts.push(`<rect x="${W - PAD - 300}" y="${y0 + 22}" width="14" height="14" rx="3" fill="${C.gold}"/>`); parts.push(text(W - PAD - 280, y0 + 34, 'voltaram', { size: 13 }));
    parts.push(`<rect x="${W - PAD - 170}" y="${y0 + 22}" width="14" height="14" rx="3" fill="${C.blue}"/>`); parts.push(text(W - PAD - 150, y0 + 34, 'nunca mais voltaram', { size: 13 }));
    const x0 = PAD + 300, maxW = W - PAD - 90 - x0;
    m.compare.forEach((c, i) => {
      const yy = y0 + 84 + i * rowH;
      parts.push(text(x0 - 12, yy + 16, c.label, { size: 14, anchor: 'end' }));
      const wa = Math.max(2, (c.a / 100) * maxW), wb = Math.max(2, (c.b / 100) * maxW);
      parts.push(`<rect x="${x0}" y="${yy}" width="${wa.toFixed(1)}" height="14" rx="4" fill="${C.gold}"/>`); parts.push(text(x0 + wa + 8, yy + 12, `${c.a}%`, { size: 13, weight: 'bold' }));
      parts.push(`<rect x="${x0}" y="${yy + 17}" width="${wb.toFixed(1)}" height="14" rx="4" fill="${C.blue}"/>`); parts.push(text(x0 + wb + 8, yy + 29, `${c.b}%`, { size: 13 }));
    });
  }

  const H = y + 6;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${FONT}"><rect width="${W}" height="${H}" fill="${C.bg}"/>${parts.join('\n')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Texto ────────────────────────────────────────────────────────────────────
function texts(m) {
  const f = Object.fromEntries(m.funnel.map((x) => [x.key, x.n]));
  const caption = `📊 <b>Retenção dos novos jogadores</b> — contas de ${m.first} a ${m.last}
${m.e1} contas novas (até ontem): <b>${pct(f.d1, m.e1)}% voltaram</b> outro dia, <b>${pct(f.ativo, m.e1)}%</b> seguem ativas. ${pct(m.quick, m.e1)}% foram embora em menos de 15 min no 1º dia.`;

  const body = `📊 <b>RETENÇÃO DOS NOVOS JOGADORES — o que os números dizem</b>
<i>${m.all} jogadores de verdade criados de ${m.first} a ${m.last} (bots e ${m.sweep} contas de varredura fora). "Voltou" = teve atividade em outro dia depois do cadastro; medido só em contas criadas até ontem (${m.e1}).</i>

<b>1. O funil</b>
${m.funnel.map((x, i) => `${i === 0 ? '👤' : i === 4 ? '🔁' : i === 5 ? '🟢' : '▫️'} ${esc(x.label)}: <b>${x.n}</b> (${pct(x.n, m.e1)}%)`).join('\n')}

<b>2. Onde perdemos</b>
• <b>${pct(m.quick, m.e1)}% (${m.quick}) vão embora em menos de 15 min</b> no 1º dia — e ${pct(m.fewKicks, m.e1)}% (${m.fewKicks}) fazem no máximo 7 gols: é a primeira leva de chutes (direto, pênalti, falta, trilha), aí cai a recarga de 10 min e a pessoa não espera. Mediana de quem chuta: <b>${Math.round(m.med.minutes0)} min e ${m.med.goals0} gols</b> no 1º dia.
• Dos que passam do 1º dia, ${m.returnedOnce} voltaram uma vez e depois sumiram. Só <b>${m.loyal}</b> jogadores têm 4+ dias de atividade — é o núcleo de verdade do jogo hoje.
• Ativos 3 dias depois do cadastro (contas com 3+ dias): <b>${m.d3} de ${m.e3}</b> (${pct(m.d3, m.e3)}%).
• Por dia de cadastro (voltaram): ${m.days.filter((d) => d.d1 !== null).map((d) => `${d.label} ${pct(d.d1, d.n)}% (${d.d1}/${d.n})`).join(' · ')}. Os primeiros dias (conhecidos, público quente) voltaram bem mais que os dias de divulgação — quem chega "frio" precisa de mais motivo para ficar.
• Convidados por link: ${m.invited.n}, dos quais ${m.invited.d1} voltaram (${pct(m.invited.d1, m.invited.n)}%). Uma turma de amigos entrou junto em 15/09, jogou ~2 h e nenhum voltou: entrar em grupo não segurou ninguém sem motivo para o dia seguinte.

<b>3. Quem fica é diferente desde o 1º dia</b>
${m.compare.map((c) => `• ${esc(c.label)}: <b>${c.a}%</b> dos que voltaram × ${c.b}% dos que sumiram`).join('\n')}
Quem volta é quem achou <b>outra coisa para fazer enquanto a recarga corre</b> (minigame, X1, chat) e fez mais gols no 1º dia. Quem some viu só os 4 chutes e a tela de espera.`;

  const recs = `💡 <b>RECOMENDAÇÕES PARA SEGURAR QUEM ENTRA</b> (em ordem de impacto esperado)

<b>1. Primeiros 15 minutos sem parede de espera.</b> Hoje o novato dá 4 chutes em 2 min e cai numa recarga de 10 min — é exatamente onde ${pct(m.quick, m.e1)}% desistem. Proposta: no 1º dia (ou até o 10º gol) a recarga é de 1 min; ou 3 "bolas de boas-vindas" que liberam o chute na hora. Ele sai do 1º dia com 15–20 gols e um nível, não com 4.

<b>2. Missão do 1º dia com prêmio visível.</b> Ao criar a conta: "Faça 10 gols hoje e ganhe 1 VIP" (barra de progresso no topo). Objetivo claro + recompensa = motivo para ficar os 30 min que separam quem volta de quem some.

<b>3. Levar o novato para o minigame enquanto espera.</b> Quem jogou minigame volta ${m.compare[2].a}% × ${m.compare[2].b}%. Quando a recarga começa, mostrar na hora "Enquanto espera: Termo do dia (vale gol)" em cima, não o slider lá embaixo. O primeiro minigame vencido poderia dar +1 VIP.

<b>4. Motivo para voltar amanhã, e um lembrete.</b> A Presença da Semana já existe, mas o dia 2 dá só 40 XP + Energia. Sugestão: dia 2 = 1 VIP (o jogador experimenta o chute de 5 min), e avisar: notificação push do PWA/app ("sua recarga está pronta" / "seu prêmio do dia 2 venceu em 3 h") e um e-mail no dia seguinte ("você fez 6 gols pelo Flamengo — o time está em 4º"). Temos o e-mail de todo mundo e ninguém recebe nada.

<b>5. X1 e chat mais cedo na jornada.</b> ${m.compare[3].a}% de quem voltou jogou o X1 (× ${m.compare[3].b}%) e ${m.compare[4].a}% falou no chat. Depois do 1º gol: "Desafie alguém no X1 agora" com um adversário online; primeira vitória no X1 do dia 1 = VIP. Boas-vindas automática no chat do time ("@fulano chegou no Vasco!") para alguém responder.

<b>6. Amigos: recompensa no ato, não em 25 gols.</b> O primeiro marco do convite é 25 gols — a turma de 15/09 saiu com ~20. Marco inicial no 1º gol do convidado (1 VIP para os dois) e "jogue com seu amigo" (X1 contra ele = gol em dobro no 1º dia).

<b>7. Time com gente.</b> Novato que cai num time vazio vê placar 0 x 0 e ninguém no chat. Os bots (desde hoje) já cobrem a Série A; na escolha do time, mostrar "X jogadores online" e destacar os times com movimento.

<b>8. Medir o funil de verdade.</b> Hoje só sabemos que ele fez gol. Registrar eventos: viu o tutorial, abriu o slider, começou minigame, viu a recarga — para saber em qual tela a pessoa fecha o app. Com isso este relatório passa a dizer <i>por que</i>, não só <i>quanto</i>.

<i>Meta sugerida: passar de ${pct(f.d1, m.e1)}% para 35% de "voltaram outro dia" em 2 semanas. Reenvio deste relatório: node scripts/relatorio-retencao.js --enviar (pasta api/ na VPS).</i>`;
  return { caption, body, recs };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const m = analyze(await collect());
  const t = texts(m);
  if (OUT) {
    fs.writeFileSync(OUT, await render(m));
    console.log(`PNG gravado em ${OUT}\n`);
    console.log(t.caption, '\n\n', t.body, '\n\n', t.recs);
    console.log('\n[dados]', JSON.stringify({ e1: m.e1, funnel: m.funnel.map((f) => f.n), buckets: m.buckets.map((b) => b.n), days: m.days, compare: m.compare, med: m.med, quick: m.quick, fewKicks: m.fewKicks, loyal: m.loyal, mobile: m.mobile, invited: m.invited }));
  }
  if (SEND) {
    if (!tg.enabled()) { console.error('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados.'); process.exit(1); }
    const png = await render(m);
    const ok1 = await tg.photo(png, t.caption);
    const ok2 = await tg.raw(t.body);
    const ok3 = await tg.raw(t.recs);
    console.log(`Telegram: foto ${ok1 ? 'ok' : 'FALHOU'} · texto ${ok2 ? 'ok' : 'FALHOU'} · recomendações ${ok3 ? 'ok' : 'FALHOU'}`);
  }
  if (!OUT && !SEND) console.log('Uso: node scripts/relatorio-retencao.js --ver <arquivo.png> | --enviar');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
