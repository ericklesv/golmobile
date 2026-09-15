/**
 * Segurança (lib/security.js) direto no banco LOCAL: teto de contas por IP, e-mail descartável, honeypot,
 * tempo mínimo do formulário, trava de login por conta, cache das rotas públicas, limite de busca.
 * Sobe a API na porta 4398 e bate nela por HTTP; o IP é simulado por X-Forwarded-For (trust proxy 1 —
 * o pedido vem de 127.0.0.1, que é o "proxy"). Cria jogadores de teste, por isso só roda em localhost.
 * Uso (na pasta api/):  node scripts/test-seguranca.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-seguranca.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
process.env.PORT = '4398';
process.env.NODE_ENV = 'test';
const API = 'http://localhost:4398';
const { prisma } = await import('../src/prisma.js');
const { SECURITY } = await import('../src/lib/security.js');
await import('../src/index.js');
await new Promise((r) => setTimeout(r, 800));

let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok  ', msg); else { fails++; console.log('  FALHA', msg); } };
async function call(method, path, body, { token, ip } = {}) {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})), headers: res.headers };
}
const team = await prisma.team.findFirst();
const tag = Date.now().toString(36).slice(-4);
const reg = (n, extra = {}, ip = '203.0.113.10') => call('POST', '/api/auth/register', { nick: n, email: `${n}@teste.com`, password: 'senha123', gender: 'M', teamSlug: team.slug, startedAt: Date.now() - 10_000, ...extra }, { ip });

console.log('cadastro');
let r = await reg(`sec${tag}a`, { website: 'http://spam' });
ok(r.status === 400, 'honeypot preenchido = 400');
r = await reg(`sec${tag}b`, { startedAt: Date.now() });
ok(r.status === 429, 'formulário enviado em < 3 s = 429');
r = await reg(`sec${tag}c`, { email: `sec${tag}c@mailinator.com` });
ok(r.status === 400 && /temporários/.test(r.data.message), 'e-mail descartável = 400');
const ipA = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
const made = [];
for (let i = 0; i < SECURITY.registerPerIpPerDay; i++) { r = await reg(`sec${tag}${i}x`, {}, ipA); made.push(r); }
ok(made.every((x) => x.status === 200 || x.status === 201), `${SECURITY.registerPerIpPerDay} contas do mesmo IP passam`);
r = await reg(`sec${tag}zz`, {}, ipA);
ok(r.status === 429 && r.data.error === 'too-many-accounts', `a ${SECURITY.registerPerIpPerDay + 1}ª conta do mesmo IP em 24 h = 429`);
r = await reg(`sec${tag}zy`, {}, '198.51.100.250');
ok(r.status === 200 || r.status === 201, 'outro IP cadastra normal');
const u = await prisma.user.findFirst({ where: { nickLower: `sec${tag}zy` } });
ok(u?.createdIp === '198.51.100.250', 'createdIp gravado');

console.log('login: trava por conta');
const nick = `sec${tag}0x`;
let last;
for (let i = 0; i < SECURITY.loginMaxFails; i++) last = await call('POST', '/api/auth/login', { login: nick, password: 'errada' }, { ip: `203.0.113.${20 + i}` });
ok(last.status === 401, `${SECURITY.loginMaxFails} senhas erradas de IPs diferentes = 401 até a última`);
r = await call('POST', '/api/auth/login', { login: nick, password: 'senha123' }, { ip: '203.0.113.99' });
ok(r.status === 429 && r.data.error === 'locked', 'depois disso, até a senha CERTA dá 429 (conta trancada)');
r = await call('POST', '/api/auth/login', { login: `sec${tag}zy`, password: 'senha123' }, { ip: '203.0.113.99' });
ok(r.status === 200 && r.data.token, 'outra conta entra normal');

console.log('cache das rotas públicas');
const a = await call('GET', '/api/rankings/geral');
const b = await call('GET', '/api/rankings/geral');
ok(a.headers.get('x-cache') === 'miss' && b.headers.get('x-cache') === 'hit', 'rankings: 1ª miss, 2ª hit');
const m1 = await call('GET', '/api/meta'); const m2 = await call('GET', '/api/meta');
ok(m2.headers.get('x-cache') === 'hit' && JSON.stringify(m1.data) === JSON.stringify(m2.data), 'meta em cache com o mesmo corpo');
ok(m1.data.turnstileSiteKey === null, 'turnstile desligado sem chave (null na meta)');
const me = await call('GET', '/api/me', null, { token: r.data.token });
ok(me.headers.get('x-cache') === null && me.status === 200, '/api/me (dado do usuário) NÃO passa pelo cache');

console.log('limites por rota');
let hit429 = false;
for (let i = 0; i < 70; i++) { const s = await call('GET', '/api/players/search?q=a', null, { ip: '203.0.113.77' }); if (s.status === 429) { hit429 = true; break; } }
ok(hit429, 'busca de jogadores: 429 depois de 60/min');

console.log('cabeçalhos');
const h = await fetch(API + '/api/health');
ok(h.headers.get('x-content-type-options') === 'nosniff' && !!h.headers.get('x-frame-options'), 'helmet: nosniff + x-frame-options');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
