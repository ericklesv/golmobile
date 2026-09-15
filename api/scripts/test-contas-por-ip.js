/**
 * Contas AO MESMO TEMPO (lib/security.js; dono, 15/09/2026): até 3 no mesmo APARELHO (código do navegador, lib/device.js)
 * e, no PC, até 3 na mesma INTERNET; celulares diferentes na mesma internet jogam à vontade. Duas partes:
 *   1) as regras (takeSlot/assertRoom) com relógio de mentira: 4º PC na internet barrado, 5 celulares na mesma
 *      internet passam, 4ª conta no mesmo aparelho (até celular) barrada, a vaga solta depois de `onlineMs` parada,
 *      IP privado nunca trava;
 *   2) ponta a ponta contra a API LOCAL no ar (FP_API, padrão http://localhost:4320), com o X-Real-IP que o nginx grava
 *      na VPS e o User-Agent/X-Device-Id de cada "aparelho": qualquer tela com login, login, cadastro e o WebSocket do
 *      X1; admin passa; o IP gravado é o do X-Real-IP mesmo com um X-Forwarded-For falso; o heartbeat grava o aparelho
 *      e o painel mostra "outras contas neste aparelho" e o selo "mesmo aparelho" na Multiconta.
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
const { SECURITY, takeSlot, assertRoom, resetSlots } = await import('../src/lib/security.js');
const { deviceOf } = await import('../src/lib/device.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const thrown = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const MAX = SECURITY.maxOnline, WIN = SECURITY.onlineMs;
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0';
const UA_CEL = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// ── 0) o nome do aparelho
{
  const d = (ua, extra = {}) => deviceOf({ headers: { 'user-agent': ua, ...extra }, url: '/' });
  const pc = d(UA_PC, { 'x-device-id': 'abcdef123456' }), cel = d(UA_CEL), iph = d(UA_IPHONE), app = d(UA_CEL, { 'x-app': 'twa' });
  check(pc.label === 'Windows · Edge' && !pc.mobile && pc.id === 'abcdef123456', `PC: "${pc.label}", não é celular, código lido`);
  check(cel.label === 'Android · Chrome' && cel.mobile && iph.label === 'iPhone · Safari' && iph.mobile, `celulares: "${cel.label}" e "${iph.label}"`);
  check(app.label === 'App Android' && app.mobile, `app da Play Store: "${app.label}"`);
  check(d(UA_PC, { 'x-device-id': 'x"; DROP' }).id === null, 'código inválido é ignorado');
  check(deviceOf({ headers: { 'user-agent': UA_CEL }, url: '/api/ws/x1?token=t&device=celular12345&app=twa' }).id === 'celular12345', 'WebSocket: código e app vêm pelo endereço');
}

// ── 1) as regras, com relógio de mentira
{
  resetSlots();
  const ip = '198.18.200.1', t0 = 1_000_000;
  const pc = (n) => ({ ip, device: { id: `pc${n}xxxxxxx`, mobile: false, label: 'PC' } });
  const cel = (n) => ({ ip, device: { id: `cel${n}xxxxxx`, mobile: true, label: 'Celular' } });
  check([1, 2, 3].every((id) => !thrown(() => takeSlot(pc(id), id, t0))), `${MAX} contas de PC na mesma internet: entram`);
  const e = thrown(() => takeSlot(pc(4), 4, t0 + 1000));
  check(e?.status === 403 && e.code === 'multiconta' && /computador/.test(e.message), `o ${MAX + 1}º PC na mesma internet: barrado ("${e?.message}")`);
  check([10, 11, 12, 13, 14].every((id) => !thrown(() => takeSlot(cel(id), id, t0 + 1000))), '5 celulares diferentes na mesma internet (e com os PCs lá): todos entram');
  check(!thrown(() => takeSlot(pc(1), 1, t0 + 2000)), 'quem já tem a vaga continua');
  const same = (id) => ({ ip: '198.18.200.9', device: { id: 'mesmocelular1', mobile: true, label: 'Android' } });
  check([20, 21, 22].every((id) => !thrown(() => takeSlot(same(id), id, t0))), `${MAX} contas no mesmo celular: entram`);
  const e2 = thrown(() => takeSlot(same(23), 23, t0));
  check(e2?.code === 'multiconta' && /neste aparelho/.test(e2.message), `a ${MAX + 1}ª no mesmo celular: barrada ("${e2?.message}")`);
  check(!thrown(() => takeSlot({ ip: '198.18.200.10', device: { id: 'mesmocelular1', mobile: true } }, 20, t0)), 'a mesma conta no mesmo aparelho em outra internet: continua (a vaga é dela)');
  takeSlot(pc(2), 2, t0 + 5 * 60_000); takeSlot(pc(3), 3, t0 + 5 * 60_000);
  check(!thrown(() => takeSlot(pc(4), 4, t0 + 2000 + WIN + 1)), `um PC ficou ${WIN / 60_000} min parado: a vaga soltou e o 4º entra`);
  check(thrown(() => takeSlot(pc(1), 1, t0 + 2000 + WIN + 2))?.code === 'multiconta', 'o que ficou parado volta e agora é ele quem espera');
  check(!thrown(() => takeSlot({ ip: '198.18.200.2', device: { id: 'pc1xxxxxxx', mobile: false } }, 99, t0 + 2000 + WIN + 2)), 'PC em outra internet: entra');
  check(!thrown(() => takeSlot({ ip, device: { id: null, mobile: true } }, 50, t0 + 2000 + WIN + 2)), 'celular sem código (site antigo): não trava pela internet');
  check([1, 2, 3, 4, 5].every((id) => !thrown(() => takeSlot({ ip: '10.0.0.5', device: { id: 'pcdev000001', mobile: false } }, id, t0))), 'IP privado (PC de desenvolvimento): nunca trava');
  check(thrown(() => assertRoom(pc(9), t0 + 2000 + WIN + 3))?.code === 'multiconta' && !thrown(() => assertRoom(cel(99), t0 + 2000 + WIN + 3)), 'cadastro: PC na internet cheia barra, celular na mesma internet passa');
  resetSlots();
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
const PC = (id) => ({ 'user-agent': UA_PC, 'x-device-id': id });
const CEL = (id) => ({ 'user-agent': UA_CEL, 'x-device-id': id });
const get = async (u, path, ip, h = {}) => { const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${u.token}`, 'x-real-ip': ip, ...h } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const me = (u, ip, h) => get(u, '/api/me', ip, h);

const [A, B, C, D, E, F] = await Promise.all([mk(), mk(), mk(), mk(), mk(), mk()]);
const ADM = await mk({ isAdmin: true });
// PC: 3 contas em navegadores diferentes do mesmo PC (códigos diferentes), mesma internet
check([await me(A, IP(1), PC(`pcA${run}xxxxx`)), await me(B, IP(1), PC(`pcB${run}xxxxx`)), await me(C, IP(1), PC(`pcC${run}xxxxx`))].every((r) => r.status === 200), `3 contas de PC na internet ${IP(1)}: as 3 jogam`);
const d = await me(D, IP(1), PC(`pcD${run}xxxxx`));
check(d.status === 403 && d.body.error === 'multiconta' && /computador/.test(d.body.message), `a 4ª de PC (qualquer tela com login): 403 "${d.body.message}"`);
check((await me(A, IP(1), PC(`pcA${run}xxxxx`))).status === 200, 'as 3 que já estavam continuam');
// celulares na mesma internet
const cels = await Promise.all([mk(), mk(), mk(), mk(), mk()]);
const rc = await Promise.all(cels.map((u, i) => me(u, IP(1), CEL(`cel${i}${run}xxxxx`))));
check(rc.every((r) => r.status === 200), '5 celulares diferentes na mesma internet (com 3 PCs lá): todos jogam');
// mesmo celular, várias contas
const [G1, G2, G3, G4] = await Promise.all([mk(), mk(), mk(), mk()]);
const one = CEL(`celunico${run}xx`);
check([await me(G1, IP(5), one), await me(G2, IP(5), one), await me(G3, IP(5), one)].every((r) => r.status === 200), '3 contas no mesmo celular: entram');
const g4 = await me(G4, IP(5), one);
check(g4.status === 403 && /neste aparelho/.test(g4.body.message), `a 4ª no mesmo celular: 403 "${g4.body.message}"`);
check((await me(D, IP(2), PC(`pcD${run}xxxxx`))).status === 200, `a 4ª de PC em outra internet (${IP(2)}): entra`);
check((await me(ADM, IP(1), PC(`pcA${run}xxxxx`))).status === 200 && (await me(E, IP(1), PC(`pcE${run}xxxxx`))).status === 403, 'o admin entra na internet cheia e não ocupa vaga (a próxima conta continua barrada)');

// o aparelho fica gravado (heartbeat) e o painel mostra
const hb = await fetch(`${API}/api/me/heartbeat`, { method: 'POST', headers: { authorization: `Bearer ${G1.token}`, 'x-real-ip': IP(5), ...one } });
await fetch(`${API}/api/me/heartbeat`, { method: 'POST', headers: { authorization: `Bearer ${G2.token}`, 'x-real-ip': IP(5), ...one } });
const g1 = await prisma.user.findUnique({ where: { id: G1.id } });
check(hb.status === 200 && g1.device === 'Android · Chrome' && g1.deviceMobile === true && g1.deviceId === one['x-device-id'], `heartbeat grava o aparelho: "${g1.device}", celular, código ${g1.deviceId}`);
const admH = { authorization: `Bearer ${ADM.token}`, 'x-real-ip': IP(9) };
const det = await (await fetch(`${API}/api/painel/users/${G1.id}`, { headers: admH })).json();
check(det.device === 'Android · Chrome' && det.deviceMobile === true && det.deviceCode === one['x-device-id'].slice(0, 6) && det.sameDevice?.some((o) => o.id === G2.id), `painel: aparelho da conta e "outras contas neste aparelho" (${det.sameDevice?.map((o) => o.nick).join(', ')})`);
const multi = await (await fetch(`${API}/api/painel/multicontas?q=${encodeURIComponent(IP(5))}`, { headers: admH })).json();
const grp = multi.rows?.find((g) => g.ip === IP(5));
check(grp?.sameDevice >= 2 && grp.users.filter((u) => u.sameDevice).length >= 2 && grp.users.some((u) => u.device === 'Android · Chrome'), `Multiconta: selo "mesmo aparelho: ${grp?.sameDevice}" no grupo e nas contas`);

// login
const login = async (nick, ip, extra = {}) => { const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...extra }, body: JSON.stringify({ login: nick, password: 'senha123' }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const l1 = await login(F.nick, IP(1), PC(`pcF${run}xxxxx`));
check(l1.status === 403 && l1.body.error === 'multiconta' && !l1.body.token, 'login de PC na internet cheia: barrado, sem token');
const l1c = await login(F.nick, IP(1), CEL(`celF${run}xxxxx`));
check(l1c.status === 200 && !!l1c.body.token, 'o mesmo login pelo celular na mesma internet: entra');
const l2 = await login(F.nick, IP(3), { ...PC(`pcF${run}xxxxx`), 'x-forwarded-for': '1.2.3.4' });
const fRow = await prisma.user.findUnique({ where: { id: F.id } });
check(l2.status === 200 && !!l2.body.token && fRow.lastIp === IP(3) && fRow.device === 'Windows · Edge', `login em outra internet: entra, IP gravado = o verdadeiro (${fRow.lastIp}, não o 1.2.3.4 falso) e aparelho "${fRow.device}"`);

// cadastro
const reg = async (ip, h) => {
  const nick = `tk${Date.now() % 1e5}${seq++}`;
  const r = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...h }, body: JSON.stringify({ nick, email: `${nick}@gmail.com`, password: 'senha123', teamSlug: team.slug, gender: 'M', elapsedMs: 5000 }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const r1 = await reg(IP(1), PC(`pcR${run}xxxxx`));
check(r1.status === 403 && r1.body.error === 'multiconta', `cadastro pelo PC na internet cheia: barrado ("${r1.body.message}")`);
const r1c = await reg(IP(1), CEL(`celR${run}xxxxx`));
check(r1c.status === 200 && !!r1c.body.token, 'cadastro pelo celular na mesma internet: entra');
const r2 = await reg(IP(4), PC(`pcS${run}xxxxx`));
check(r2.status === 200 && !!r2.body.token, 'cadastro pelo PC em outra internet: entra');

// WebSocket do X1 (lobby)
const wsOpen = (u, ip, ua, dev) => new Promise((resolve) => {
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/api/ws/x1?token=${encodeURIComponent(u.token)}&mode=lobby&device=${dev}`, { headers: { 'x-real-ip': ip, 'user-agent': ua } });
  const done = (v) => { try { ws.close(); } catch {} resolve(v); };
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'hello') done('hello'); });
  ws.on('unexpected-response', (_req, res) => done(`http ${res.statusCode}`));
  ws.on('error', () => done('erro'));
  setTimeout(() => done('nada'), 4000);
});
check((await wsOpen(A, IP(1), UA_PC, `pcA${run}xxxxx`)) === 'hello', 'X1: quem tem a vaga conecta');
const wsE = await wsOpen(E, IP(1), UA_PC, `pcE${run}xxxxx`);
check(wsE !== 'hello', `X1: a 4ª de PC não conecta (${wsE})`);
check((await wsOpen(cels[0], IP(1), UA_CEL, `cel0${run}xxxxx`)) === 'hello', 'X1: celular na mesma internet conecta');

await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
