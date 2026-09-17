/**
 * Segurança (lib/security.js) direto no banco LOCAL: teto de contas por IP, e-mail descartável,
 * tempo mínimo do formulário, trava de login por conta, cache das rotas públicas, limite de busca e
 * número de mentira no corpo do pedido (um jogador tentou isso em 17/09/2026 e derrubou a rota com erro 500).
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
// IPs de cadastro sem conta nas últimas 24 h no banco local: com IP fixo, a trava de 3 contas/IP/24 h valia entre
// rodadas do mesmo dia e a 3ª rodada do dia falhava ("outro IP cadastra normal", "o cadastro certo ainda passa")
const usados = new Set((await prisma.user.findMany({ where: { createdAt: { gt: new Date(Date.now() - 86_400_000) }, createdIp: { not: null } }, select: { createdIp: true } })).map((x) => x.createdIp));
const livre = (base) => { for (;;) { const ip = `${base}.${1 + Math.floor(Math.random() * 250)}`; if (!usados.has(ip)) { usados.add(ip); return ip; } } };
const IP_REG = livre('203.0.113'), IP_A = livre('198.51.100'), IP_OUTRO = livre('198.51.100');
const reg = (n, extra = {}, ip = IP_REG) => call('POST', '/api/auth/register', { nick: n, email: `${n}@teste.com`, password: 'senha123', gender: 'M', teamSlug: team.slug, elapsedMs: 10_000, ...extra }, { ip });

console.log('cadastro');
// honeypot removido em 16/09/2026 (autofill do Android preenchia e barrava jogador real): `website` cheio passa
let r = await reg(`sec${tag}a`, { website: 'https://jogagol.com.br' });
ok(r.status === 200 || r.status === 201, 'campo website preenchido (autofill / front em cache) NÃO barra mais');
r = await reg(`sec${tag}b`, { elapsedMs: 800 });
ok(r.status === 429 && r.data.error === 'slow-down', 'formulário enviado em < 3 s = 429');
r = await reg(`sec${tag}b`, { elapsedMs: undefined, startedAt: Date.now() - 500 });
ok(r.status === 429 && r.data.error === 'slow-down', 'front antigo (startedAt) enviado em < 3 s = 429');
r = await reg(`sec${tag}c`, { email: `sec${tag}c@mailinator.com` });
ok(r.status === 400 && /temporários/.test(r.data.message), 'e-mail descartável = 400');
// relógio do aparelho adiantado (caso real de 15/09/2026): 70 s no formulário, PC 2 min na frente do servidor
r = await reg(`sec${tag}b`, { email: `sec${tag}b@mailinator.com`, elapsedMs: undefined, startedAt: Date.now() + 120_000 - 70_000 });
ok(r.status === 400 && /temporários/.test(r.data.message), 'front antigo com relógio adiantado NÃO cai em "rápido demais" (chega à checagem de e-mail = 400)');
// as recusas acima (5 do mesmo IP, no limite de 5/h) não gastam a cota: o cadastro certo passa
r = await reg(`sec${tag}b`, { elapsedMs: 800 });
r = await reg(`sec${tag}b`, { elapsedMs: 800 });
r = await reg(`sec${tag}b`);
ok(r.status === 200 || r.status === 201, 'depois de 7 recusas do mesmo IP, o cadastro certo ainda passa (recusa não conta no limite/h)');
const ipA = IP_A;
const made = [];
for (let i = 0; i < SECURITY.registerPerIpPerDay; i++) { r = await reg(`sec${tag}${i}x`, {}, ipA); made.push(r); }
ok(made.every((x) => x.status === 200 || x.status === 201), `${SECURITY.registerPerIpPerDay} contas do mesmo IP passam`);
r = await reg(`sec${tag}zz`, {}, ipA);
ok(r.status === 429 && r.data.error === 'too-many-accounts', `a ${SECURITY.registerPerIpPerDay + 1}ª conta do mesmo IP em 24 h = 429`);
r = await reg(`sec${tag}zy`, {}, IP_OUTRO);
ok(r.status === 200 || r.status === 201, 'outro IP cadastra normal');
const u = await prisma.user.findFirst({ where: { nickLower: `sec${tag}zy` } });
ok(u?.createdIp === IP_OUTRO, 'createdIp gravado');

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

console.log('número de mentira no corpo (jogador ivictor, 17/09/2026: erro 500 em /api/me/vip-to-money)');
{
  const tk = r.data.token;
  for (const [rota, corpo] of [
    ['/api/me/vip-to-money', { qtd: 'abc' }],
    ['/api/me/vip-to-money', { qtd: {} }],
    ['/api/me/vip-to-money', { qtd: [1, 2] }],
    ['/api/me/activate-vip', { days: 'x' }],
  ]) {
    const res = await call('POST', rota, corpo, { token: tk });
    ok(res.status === 400 && /número/i.test(res.data?.message ?? ''), `${rota} com ${JSON.stringify(corpo)}: 400 "${res.data?.message ?? ''}" (não 500)`);
  }
  // e o caminho normal continua: sem VIP guardado, o erro é o de sempre (400 "não tem VIP suficiente")
  const normal = await call('POST', '/api/me/vip-to-money', { qtd: 2 }, { token: tk });
  ok(normal.status === 400 && /VIP/i.test(normal.data?.message ?? ''), `pedido certo sem VIP no banco: "${normal.data?.message ?? ''}"`);
}

console.log('cabeçalhos');
const h = await fetch(API + '/api/health');
ok(h.headers.get('x-content-type-options') === 'nosniff' && !!h.headers.get('x-frame-options'), 'helmet: nosniff + x-frame-options');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
