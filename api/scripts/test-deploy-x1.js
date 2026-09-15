/**
 * Trava de atualização do X1 (deploy sem partida travada; dono, 15/09/2026) contra a API LOCAL rodando (FP_API,
 * padrão http://localhost:4320) com ADMIN_KEY no .env dela: A e B começam uma partida; `POST /api/admin/x1/drain`
 * → C não consegue desafiar (erro `atualizacao`), a tela com abas recebe `drain`, o desafio aberto de D é
 * cancelado com o motivo, mas a partida de A e B segue; `POST /api/admin/x1/cancel` → os dois recebem `over`
 * cancelada com a aposta de volta, a linha vira CANCELED (fora do ranking); quem reconecta "dentro" de uma
 * partida recebe `no-match`; `POST /api/admin/x1/resume` → desafiar volta a funcionar.
 *
 * Uso (na pasta api/):  node scripts/test-deploy-x1.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-deploy-x1.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { config } = await import('../src/config.js');

const API = process.env.FP_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
let fails = 0, seq = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
if (!config.adminKey) { console.error('ADMIN_KEY ausente no .env local.'); process.exit(1); }
const admin = (path, body = {}) => fetch(`${API}/api/admin/x1/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': config.adminKey }, body: JSON.stringify(body) }).then((r) => r.json());
const status = () => fetch(`${API}/api/x1/status`).then((r) => r.json());

async function mkUser(team, money) {
  const nick = `dp${Date.now() % 1e5}${seq++}`;
  const t = await prisma.team.findUnique({ where: { slug: team } });
  const u = await prisma.user.create({ data: { nick, nickLower: nick.toLowerCase(), email: `${nick}@local.test`, passwordHash: 'x', teamId: t.id, money, vipUntil: new Date(Date.now() + 86_400_000) } });
  return { ...u, token: jwt.sign({ uid: u.id, nick: u.nick }, config.jwtSecret, { expiresIn: '1d' }) };
}
const money = async (u) => (await prisma.user.findUnique({ where: { id: u.id } })).money;
function phone(user, mode, ip) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(user.token)}&mode=${mode}`, { headers: { 'X-Real-IP': ip } });
  const box = [], waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(m); } else box.push(m);
  });
  return {
    ws, box, user, open: new Promise((r) => ws.on('open', r)), send: (m) => ws.send(JSON.stringify(m)),
    wait(t, ms = 8000) {
      const pred = (m) => m.t === t;
      const i = box.findIndex(pred);
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((resolve) => { const w = { pred, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); resolve(null); }, ms) }; waiters.push(w); });
    },
    close: () => ws.close(),
  };
}

await admin('resume'); // começa destravado, se um teste anterior parou no meio
const [A, B, C, D] = await Promise.all([mkUser('nautico', 1000), mkUser('bahia', 1000), mkUser('sport', 1000), mkUser('ceara', 1000)]);
const gA = phone(A, 'game', '10.9.0.1'), gB = phone(B, 'game', '10.9.0.2'), gC = phone(C, 'game', '10.9.0.3'), gD = phone(D, 'game', '10.9.0.4'), lobC = phone(C, 'lobby', '10.9.0.3');
await Promise.all([gA.open, gB.open, gC.open, gD.open, lobC.open]);
const hello = await gA.wait('hello');
check(hello && hello.drain === null, 'hello: sem trava');

// partida de A e B em andamento
gA.send({ t: 'challenge' });
const wA = await gA.wait('waiting');
gB.send({ t: 'accept', id: wA.id });
const mA = await gA.wait('match'), mB = await gB.wait('match');
check(!!mA && !!mB && (await money(A)) === 800 && (await money(B)) === 800, 'A e B começaram uma partida (aposta saiu)');
// D deixa um desafio aberto
gD.send({ t: 'challenge' });
check(!!(await gD.wait('waiting')), 'D está esperando alguém');
await gA.wait('open', 2000);

// 1) trava
const dr = await admin('drain', { seconds: 120 });
check(dr.until > Date.now() && dr.matches === 1, `drain: travou até ${new Date(dr.until).toLocaleTimeString('pt-BR')} com ${dr.matches} partida em andamento`);
const st = await status();
check(st.drain === dr.until && st.matches === 1, 'status público mostra a trava e a partida que segue');
check((await lobC.wait('drain', 2000))?.until === dr.until, 'a tela com abas (lobby) recebeu a trava');
const exD = await gD.wait('expired', 2000);
check(/atualizado/.test(exD?.message ?? ''), `o desafio aberto de D foi cancelado com o motivo ("${exD?.message}")`);
gC.send({ t: 'challenge' });
const eC = await gC.wait('error', 2000);
check(eC?.code === 'atualizacao' && eC.until === dr.until, 'C não consegue desafiar durante a trava');
gC.send({ t: 'bot' });
check((await gC.wait('error', 2000))?.code === 'atualizacao', 'nem treinar contra o bot');
check(!(await gA.wait('over', 800)) && (await status()).matches === 1, 'a partida de A e B continua normalmente');

// 3) cancela o que sobrou
const cn = await admin('cancel');
const oA = await gA.wait('over', 3000), oB = await gB.wait('over', 3000);
check(cn.canceled === 1 && oA?.canceled === true && oA.refund === true && oA.reason === 'atualizacao' && /atualizado/.test(oA.text) && oB?.canceled === true, `os dois receberam a partida cancelada com o motivo ("${oA?.text}")`);
check((await money(A)) === 1000 && (await money(B)) === 1000, 'a aposta voltou para os dois');
const row = await prisma.x1Match.findFirst({ where: { OR: [{ aId: A.id }, { bId: A.id }] }, orderBy: { id: 'desc' } });
check(row?.status === 'CANCELED' && row.reason === 'atualizacao' && row.winnerId === null, 'gravada como CANCELED (fora do ranking e do retrospecto)');
check((await status()).matches === 0, 'nenhuma partida em andamento');

// quem reconecta "dentro" de uma partida que não existe mais recebe no-match
const gA2 = phone(A, 'game', '10.9.0.1'); await gA2.open;
await gA2.wait('hello');
check(!!(await gA2.wait('no-match', 2000)), 'reconectou sem partida: recebe no-match (a tela volta ao começo com o aviso)');

// destrava (deploy abortado) e desafiar volta a funcionar
await admin('resume');
check((await lobC.wait('drain', 2000))?.until === null && (await status()).drain === null, 'resume: trava removida e avisada');
gC.send({ t: 'challenge' });
check(!!(await gC.wait('waiting', 2000)), 'C consegue desafiar de novo');
gC.send({ t: 'cancel' });

for (const p of [gA, gA2, gB, gC, gD, lobC]) p.close();
await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
