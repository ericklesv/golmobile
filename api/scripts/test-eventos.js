/**
 * Eventos de uso (routes/events.js) e relatório ao vivo do painel (services/report.js) na API LOCAL:
 * lote sem login (só aparelho), lote com token no corpo (sendBeacon), nome inválido ignorado, lote de conta
 * excluída fica sem dono, limite por IP, e o relatório do admin com o funil lendo os eventos.
 *
 * Uso (pasta api/, API local no ar em PORT do .env, banco LOCAL):  node scripts/test-eventos.js  → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-eventos.js só roda no banco LOCAL.');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { signToken } = await import('../src/lib/auth.js');
const BASE = `http://localhost:${process.env.PORT || 4320}`;

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const post = (body, headers = {}) => fetch(`${BASE}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

const team = await prisma.team.findFirst();
const n = `te${Date.now() % 1e6}`;
const u = await prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, isAdmin: true } });
const tok = signToken(u);
const dev = 'devteste' + String(Date.now()).slice(-8);

// 1. sem login, só aparelho
let r = await post({ device: dev, events: [{ name: 'tela.landing' }, { name: 'app.abriu', data: { tela: 'landing' }, ago: 5000 }] });
check(r.status === 200 && r.json.n === 2, `lote sem login: ${r.json.n} gravados`);
let rows = await prisma.event.findMany({ where: { deviceId: dev }, orderBy: { id: 'asc' } });
check(rows.length === 2 && rows.every((e) => e.userId === null) && rows[1].createdAt.getTime() < rows[0].createdAt.getTime() - 3000, 'ficaram sem dono, com o aparelho, e o `ago` voltou o relógio');

// 2. com token no corpo (sendBeacon) e no cabeçalho; nome inválido e data grande ignorados
r = await post({ token: tok, device: dev, events: [{ name: 'cadastro.ok' }, { name: 'Tela Ruim!' }, { name: 'tela.home', data: { x: 'y'.repeat(500) } }, { name: 'recarga.vista' }] });
check(r.json.n === 3, `lote com token no corpo: 3 válidos de 4 (${r.json.n})`);
r = await post({ events: [{ name: 'slider.visto' }, { name: 'tela.termo' }, { name: 'app.saiu', data: { tela: 'termo', seg: 42 } }] }, { authorization: `Bearer ${tok}`, 'x-device-id': dev });
check(r.json.n === 3, 'lote com token no cabeçalho');
rows = await prisma.event.findMany({ where: { userId: u.id }, orderBy: { id: 'asc' } });
check(rows.length === 6 && rows.find((e) => e.name === 'tela.home')?.data === null, 'eventos com dono; data grande demais virou null');

// 3. token de conta que não existe mais: sem dono, sem erro
const ghost = signToken({ id: 999999999, nick: 'x' });
r = await post({ token: ghost, events: [{ name: 'tela.home' }] });
check(r.status === 200 && r.json.n === 1, 'token de conta inexistente: grava sem dono');

// 4. relatório do painel lê os eventos
const rep = await fetch(`${BASE}/api/painel/relatorio?dias=7`, { headers: { authorization: `Bearer ${tok}` } }).then((x) => x.json());
check(rep.agora && typeof rep.agora.online === 'number' && rep.agora.porHora.length === 24, `relatório: agora (online ${rep.agora?.online}, 24 horas)`);
check(rep.retencao && rep.retencao.porDia.length === 8, 'relatório: retenção por dia (8 linhas)');
const step = (k) => rep.funil.steps.find((s) => s.key === k)?.n ?? -1;
check(step('cadastrou') >= 1 && step('home') >= 1 && step('recarga') >= 1 && step('slider') >= 1 && step('minigame') >= 1, `relatório: funil lê os eventos (home ${step('home')}, recarga ${step('recarga')}, slider ${step('slider')}, minigame ${step('minigame')})`);
check(rep.ondeSaem.sessao.n >= 1 && rep.eventos.some((e) => e.nick === n && e.name === 'app.saiu'), 'relatório: sessão (app.saiu.seg) e últimos eventos com o nick');
const noAuth = await fetch(`${BASE}/api/painel/relatorio`).then((x) => x.status);
check(noAuth === 401, 'relatório sem login: 401');

// 5. limite por IP: 40 lotes/min — o 41º é ignorado (200 com n=0)
let last = null;
for (let i = 0; i < 45; i++) last = await post({ device: dev, events: [{ name: 'tela.liga' }] });
check(last.status === 200 && last.json.n === 0, 'depois de 40 lotes no minuto: aceita em silêncio e não grava');

await prisma.event.deleteMany({ where: { OR: [{ userId: u.id }, { deviceId: dev }] } });
await prisma.user.delete({ where: { id: u.id } });
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
