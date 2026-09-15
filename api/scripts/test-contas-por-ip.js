/**
 * No máximo 3 contas JOGANDO AO MESMO TEMPO na mesma internet (lib/security.js; dono, 15/09/2026). Duas partes:
 *   1) as regras (takeIpSlot/assertIpHasRoom) com relógio de mentira: a 4ª é barrada, quem já tem vaga continua,
 *      a vaga solta depois de `ipOnlineMs` parada, IP privado nunca trava;
 *   2) ponta a ponta contra a API LOCAL no ar (FP_API, padrão http://localhost:4320), com o X-Real-IP que o nginx
 *      grava na VPS: qualquer tela com login, login, cadastro e o WebSocket do X1 barram a 4ª conta; outra internet e
 *      o admin passam; o IP gravado no banco é o do X-Real-IP mesmo com um X-Forwarded-For falso no pedido.
 * Cria jogadores de teste (nicks tk…). Usa IPs 198.18.x.y (faixa de teste, não é privada) diferentes a cada rodada.
 *
 * Uso (na pasta api/, com a API local no ar):  node scripts/test-contas-por-ip.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-contas-por-ip.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import WebSocket from 'ws';
const { SECURITY, takeIpSlot, assertIpHasRoom, resetIpSlots } = await import('../src/lib/security.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const thrown = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const MAX = SECURITY.maxOnlinePerIp, WIN = SECURITY.ipOnlineMs;

// ── 1) as regras, com relógio de mentira
{
  resetIpSlots();
  const ip = '198.18.200.1', t0 = 1_000_000;
  check([1, 2, 3].every((id) => !thrown(() => takeIpSlot(ip, id, t0))), `${MAX} contas na mesma internet: entram`);
  const e = thrown(() => takeIpSlot(ip, 4, t0 + 1000));
  check(e?.status === 403 && e.code === 'multiconta', `a ${MAX + 1}ª: barrada ("${e?.message}")`);
  check(!thrown(() => takeIpSlot(ip, 1, t0 + 2000)), 'quem já tem a vaga continua');
  takeIpSlot(ip, 2, t0 + 5 * 60_000); takeIpSlot(ip, 3, t0 + 5 * 60_000);
  check(!thrown(() => takeIpSlot(ip, 4, t0 + 2000 + WIN + 1)), `a 1ª ficou ${WIN / 60_000} min parada: a vaga soltou e a 4ª entra`);
  check(thrown(() => takeIpSlot(ip, 1, t0 + 2000 + WIN + 2))?.code === 'multiconta', 'a que ficou parada volta e agora é ela quem espera');
  check(!thrown(() => takeIpSlot('198.18.200.2', 1, t0)), 'outra internet: entra');
  check([1, 2, 3, 4, 5].every((id) => !thrown(() => takeIpSlot('10.0.0.5', id, t0))), 'IP privado (PC de desenvolvimento): nunca trava');
  check(thrown(() => assertIpHasRoom(ip, t0 + WIN))?.code === 'multiconta' && !thrown(() => assertIpHasRoom('198.18.200.3', t0)), 'cadastro: internet cheia barra, internet livre passa');
  resetIpSlots();
}

// ── 2) ponta a ponta
const API = process.env.FP_API || 'http://localhost:4320';
let up = false;
for (let i = 0; i < 20 && !up; i++) { try { up = (await fetch(`${API}/api/health`)).ok; } catch { await new Promise((r) => setTimeout(r, 500)); } }
if (!up) { console.error(`API local fora do ar em ${API}: suba a API (PORT=4320) e rode de novo.`); process.exit(1); }
const { prisma } = await import('../src/prisma.js');
const { config } = await import('../src/config.js');
const run = Date.now() % 250;
const IP = (n) => `198.18.${run}.${n}`;
const team = await prisma.team.findFirst({ orderBy: { id: 'asc' } });
let seq = 0;
const mk = async (extra = {}) => {
  const nick = `tk${Date.now() % 1e5}${seq++}`;
  const u = await prisma.user.create({ data: { nick, nickLower: nick, email: `${nick}@local.test`, passwordHash: await bcrypt.hash('senha123', 4), gender: 'M', teamId: team.id, ...extra } });
  return { ...u, token: jwt.sign({ uid: u.id, nick }, config.jwtSecret, { expiresIn: '1h' }) };
};
const me = async (u, ip, extraHeaders = {}) => { const r = await fetch(`${API}/api/me`, { headers: { authorization: `Bearer ${u.token}`, 'x-real-ip': ip, ...extraHeaders } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

const [A, B, C, D, E, F] = await Promise.all([mk(), mk(), mk(), mk(), mk(), mk()]);
const ADM = await mk({ isAdmin: true });
check([await me(A, IP(1)), await me(B, IP(1)), await me(C, IP(1))].every((r) => r.status === 200), `3 contas na internet ${IP(1)}: as 3 jogam`);
const d = await me(D, IP(1));
check(d.status === 403 && d.body.error === 'multiconta' && /3 contas jogando nesta internet/.test(d.body.message), `a 4ª (qualquer tela com login): 403 "${d.body.message}"`);
check((await me(A, IP(1))).status === 200, 'as 3 que já estavam continuam');
check((await me(D, IP(2))).status === 200, `a 4ª em outra internet (${IP(2)}): entra`);
check((await me(ADM, IP(1))).status === 200 && (await me(E, IP(1))).status === 403, 'o admin entra na internet cheia e não ocupa vaga (a próxima conta continua barrada)');

// login
const login = async (nick, ip, extra = {}) => { const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...extra }, body: JSON.stringify({ login: nick, password: 'senha123' }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const l1 = await login(F.nick, IP(1));
check(l1.status === 403 && l1.body.error === 'multiconta' && !l1.body.token, 'login na internet cheia: barrado, sem token');
const l2 = await login(F.nick, IP(3), { 'x-forwarded-for': '1.2.3.4' });
const fRow = await prisma.user.findUnique({ where: { id: F.id } });
check(l2.status === 200 && !!l2.body.token && fRow.lastIp === IP(3), `login em outra internet: entra, e o IP gravado é o verdadeiro (${fRow.lastIp}), não o X-Forwarded-For falso (1.2.3.4)`);

// cadastro
const reg = async (ip) => {
  const nick = `tk${Date.now() % 1e5}${seq++}`;
  const r = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify({ nick, email: `${nick}@gmail.com`, password: 'senha123', teamSlug: team.slug, gender: 'M', elapsedMs: 5000 }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const r1 = await reg(IP(1));
check(r1.status === 403 && r1.body.error === 'multiconta', `cadastro na internet cheia: barrado ("${r1.body.message}")`);
const r2 = await reg(IP(4));
check(r2.status === 200 && !!r2.body.token, 'cadastro em outra internet: entra');

// WebSocket do X1 (lobby)
const wsOpen = (u, ip) => new Promise((resolve) => {
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/api/ws/x1?token=${encodeURIComponent(u.token)}&mode=lobby`, { headers: { 'x-real-ip': ip } });
  const done = (v) => { try { ws.close(); } catch {} resolve(v); };
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'hello') done('hello'); });
  ws.on('unexpected-response', (_req, res) => done(`http ${res.statusCode}`));
  ws.on('error', () => done('erro'));
  setTimeout(() => done('nada'), 4000);
});
check((await wsOpen(A, IP(1))) === 'hello', 'X1: quem tem a vaga conecta');
const wsD = await wsOpen(E, IP(1));
check(wsD !== 'hello', `X1: a conta a mais não conecta (${wsD})`);

await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
