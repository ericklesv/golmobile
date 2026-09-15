/**
 * Conta (routes/account.js) direto no banco LOCAL: bloqueio no chat, denúncia + painel de denúncias
 * (apagar/banir/log) e exclusão de conta (anonimização, token/login/busca/ranking/cadastro novo).
 * Sobe a API na porta 4399 e bate nela por HTTP. Cria jogadores de teste, por isso se recusa a rodar
 * fora de localhost. Uso (na pasta api/):  node scripts/test-conta.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-conta.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
process.env.PORT = '4399';
process.env.NODE_ENV = 'test';
const API = 'http://localhost:4399';
const { prisma } = await import('../src/prisma.js');
await import('../src/index.js');
await new Promise((r) => setTimeout(r, 800));

let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok  ', msg); else { fails++; console.log('  FALHA', msg); } };
async function call(method, path, body, token, headers = {}) {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const team = await prisma.team.findFirst();
// cada cadastro numa "internet" própria (X-Forwarded-For, como os outros testes): sem isso, 3 rodadas no mesmo dia
// esgotam a trava de 3 contas por IP em 24 h do PC (::1) e o teste cai no 429
let ipSeq = 0;
const regIp = () => ({ 'x-forwarded-for': `10.77.${Date.now() % 250}.${++ipSeq}` });
async function register(nick) {
  const r = await call('POST', '/api/auth/register', { nick, email: `${nick}@teste.com`, password: 'senha123', gender: 'M', teamSlug: team.slug }, null, regIp());
  if (r.status !== 200 && r.status !== 201) throw new Error('register ' + JSON.stringify(r));
  return r.data.token;
}
const suffix = Date.now().toString(36).slice(-4);
const A = await register(`alfa${suffix}`), B = await register(`beta${suffix}`);
const nickA = `alfa${suffix}`, nickB = `beta${suffix}`;

console.log('chat + bloqueio');
const m1 = await call('POST', '/api/chat/geral', { text: 'oi galera, sou o B' }, B);
ok(m1.status === 200 && m1.data.id, 'B manda mensagem');
let chat = await call('GET', '/api/chat/geral', null, A);
ok(chat.data.messages.some((m) => m.id === m1.data.id), 'A vê a mensagem de B');
let blk = await call('POST', `/api/account/blocks/${nickB}`, null, A);
ok(blk.status === 200 && blk.data.blocked === true, 'A bloqueia B');
chat = await call('GET', '/api/chat/geral', null, A);
ok(!chat.data.messages.some((m) => m.id === m1.data.id), 'A NÃO vê mais a mensagem de B');
chat = await call('GET', '/api/chat/geral', null, B);
ok(chat.data.messages.some((m) => m.id === m1.data.id), 'B continua vendo a própria mensagem');
let list = await call('GET', '/api/account/blocks', null, A);
ok(list.data.length === 1 && list.data[0].nick === nickB, 'lista de bloqueados de A = [B]');
blk = await call('DELETE', `/api/account/blocks/${nickB}`, null, A);
ok(blk.data.blocked === false, 'A desbloqueia B');
chat = await call('GET', '/api/chat/geral', null, A);
ok(chat.data.messages.some((m) => m.id === m1.data.id), 'A volta a ver a mensagem');
const self = await call('POST', `/api/account/blocks/${nickA}`, null, A);
ok(self.status === 400, 'não bloqueia a si mesmo (400)');

console.log('denúncia');
let rep = await call('POST', '/api/account/reports', { nick: nickB, messageId: m1.data.id, reason: 'ofensa', details: 'teste' }, A);
ok(rep.status === 200 && rep.data.ok && rep.data.repeated === false, 'A denuncia a mensagem de B');
rep = await call('POST', '/api/account/reports', { nick: nickB, messageId: m1.data.id, reason: 'spam' }, A);
ok(rep.data.repeated === true, 'denúncia repetida não duplica');
rep = await call('POST', '/api/account/reports', { nick: nickB, reason: 'xyz' }, A);
ok(rep.status === 400, 'motivo inválido = 400');
rep = await call('POST', '/api/account/reports', { nick: nickB, messageId: 999999, reason: 'spam' }, A);
ok(rep.status === 400, 'mensagem inexistente = 400');
const stored = await prisma.report.findFirst({ where: { messageId: m1.data.id } });
ok(stored && stored.messageText === 'oi galera, sou o B' && stored.status === 'OPEN', 'cópia do texto guardada, status OPEN');

console.log('painel de denúncias (admin)');
const admin = await prisma.user.findFirst({ where: { nickLower: nickA } });
await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: true } });
let pan = await call('GET', '/api/painel/denuncias', null, A);
ok(pan.status === 200 && pan.data.open >= 1 && pan.data.rows.some((r) => r.id === stored.id && r.messageText), 'painel lista a denúncia aberta');
let res = await call('POST', `/api/painel/denuncias/${stored.id}/resolver`, { acao: 'banir', horas: 2 }, A);
ok(res.status === 200, 'resolver com banir');
const after = await prisma.report.findUnique({ where: { id: stored.id } });
ok(after.status === 'RESOLVED' && after.resolution === 'banir' && after.resolvedById === admin.id, 'denúncia RESOLVED/banir');
ok(!(await prisma.chatMessage.findUnique({ where: { id: m1.data.id } })), 'mensagem denunciada apagada');
const bUser = await prisma.user.findFirst({ where: { nickLower: nickB } });
ok(bUser.bannedUntil && bUser.bannedUntil.getTime() > Date.now(), 'B banido');
res = await call('GET', '/api/me', null, B);
ok(res.status === 403, 'B banido não entra (403)');
const log = await prisma.adminAction.findFirst({ where: { action: 'denuncia', targetId: bUser.id } });
ok(log && log.payload.acao === 'banir', 'ação no log de admin');
res = await call('POST', `/api/painel/denuncias/${stored.id}/resolver`, { acao: 'ignorar' }, A);
ok(res.status === 400, 'resolver de novo = 400');
await prisma.user.update({ where: { id: bUser.id }, data: { bannedUntil: null } });

console.log('exclusão de conta');
// B ganha foto, bio, dinheiro, uma proposta recebida e mensagens; depois se exclui
await prisma.user.update({ where: { id: bUser.id }, data: { bio: 'minha bio', money: 500, vipDays: 3, dexterity: 2 } });
await call('POST', '/api/chat/geral', { text: 'mensagem que deve sumir' }, B);
await call('POST', '/api/chat/geral', { text: `oi @${nickB}` }, A);
await prisma.activity.create({ data: { userId: bUser.id, teamId: bUser.teamId, kind: 'AUTO', goal: true, text: `GOOOL! CRAQUE ${nickB} chutou forte!` } });
await prisma.userBlock.create({ data: { userId: admin.id, blockedId: bUser.id } });
let del = await call('DELETE', '/api/account', { password: 'errada' }, B);
ok(del.status === 401, 'senha errada = 401');
del = await call('DELETE', '/api/account', {}, B);
ok(del.status === 400, 'sem senha = 400');
del = await call('DELETE', '/api/account', { password: 'senha123' }, B);
ok(del.status === 200 && del.data.ok, 'B exclui a conta');
const gone = await prisma.user.findUnique({ where: { id: bUser.id } });
ok(gone.deletedAt && gone.nick === `excluido-${bUser.id}` && gone.email.startsWith('excluido-') && gone.passwordHash === '!' && gone.bio === null && gone.money === 0 && gone.vipDays === 0 && gone.dexterity === 0 && gone.lastIp === null, 'linha anonimizada');
ok((await prisma.chatMessage.count({ where: { userId: bUser.id } })) === 0, 'mensagens de B apagadas');
ok((await prisma.userBlock.count({ where: { blockedId: bUser.id } })) === 0, 'bloqueios envolvendo B apagados');
const act = await prisma.activity.findFirst({ where: { userId: bUser.id } });
ok(act && !act.text.includes(nickB) && act.text.includes('Jogador excluído'), 'lance do feed sem o nick');
res = await call('GET', '/api/me', null, B);
ok(res.status === 401, 'token antigo de B não entra mais (401)');
res = await call('POST', '/api/auth/login', { login: nickB, password: 'senha123' }, null);
ok(res.status === 401, 'login com o nick antigo falha');
res = await call('GET', `/api/players/${nickB}`, null, null);
ok(res.status === 404, 'perfil público some (404)');
res = await call('GET', `/api/players/search?q=beta${suffix}`, null, A);
ok(Array.isArray(res.data) && !res.data.some((u) => u.nick.toLowerCase() === nickB), 'busca não acha');
res = await call('GET', '/api/rankings/geral', null, A);
ok(!res.data.rows?.some((r) => r.nick === `excluido-${bUser.id}`), 'ranking geral sem a conta excluída');
res = await call('POST', '/api/auth/register', { nick: nickB, email: `${nickB}@teste.com`, password: 'senha123', gender: 'M', teamSlug: team.slug }, null, regIp());
ok(res.status === 200 || res.status === 201, 'nick e e-mail ficam livres para cadastro novo');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
