/**
 * Chute direto do VIP com o app FECHADO (vipOfflineAutoKicks em services/play.js, ligado em 18/10/2026 —
 * VIP_OFFLINE_AUTO em rules.js) direto no banco LOCAL: chuta o VIP com a recarga vencida (gol, dinheiro, linha
 * de Goal, lance), não chuta quem ainda está em recarga, bot (ganha VIP na Presença e se entregaria chutando de
 * 5 em 5 min o dia todo), conta excluída, suspensa, VIP vencido nem quem não é VIP; chamar de novo na hora não
 * dá outro gol; e o app aberto chutando no mesmo instante que o servidor faz 1 gol só. Cria jogadores de teste
 * (nicks vo…) e vence o VIP deles no fim, para o scheduler da API local não seguir chutando por eles.
 *
 * Uso (na pasta api/):  node scripts/test-vip-offline.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-vip-offline.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { vipOfflineAutoKicks, autoKick } = await import('../src/services/play.js');
const { VIP_OFFLINE_AUTO, MONEY, COOLDOWNS, freeMode } = await import('../src/lib/rules.js');
if (freeMode()) { console.error('Tire o MODO_LIVRE=1 do api/.env: com ele não há recarga e o teste não vale.'); process.exit(1); }
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const MIN = 60_000;
const DAY = 86_400_000;
const now = Date.now();

check(VIP_OFFLINE_AUTO === true, 'interruptor VIP_OFFLINE_AUTO ligado');

const team = (await prisma.match.findFirst({ where: { status: 'LIVE' }, select: { homeTeamId: true } }))?.homeTeamId
  ?? (await prisma.team.findFirst({ orderBy: { id: 'asc' } })).id;
let seq = 0;
const criados = [];
const mk = async (extra = {}) => {
  const n = `vo${Date.now() % 1e6}${seq++}`;
  const u = await prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team, money: 0, vipUntil: new Date(now + DAY), ...extra } });
  criados.push(u.id);
  return u;
};
const U = (id) => prisma.user.findUnique({ where: { id } });
const autoGols = (id) => prisma.goal.count({ where: { userId: id, kind: 'AUTO' } });

const pronto = await mk(); // nunca chutou
const vencida = await mk({ lastAutoAt: new Date(now - 6 * MIN) }); // recarga VIP (5 min) já passou
const recente = await mk({ lastAutoAt: new Date(now - 1 * MIN) }); // ainda longe
const quase = await mk({ lastAutoAt: new Date(now - 4.75 * MIN) }); // passou do piso de 4:30, mas a recarga dele é 5 min
const bot = await mk({ isBot: true });
const excluido = await mk({ deletedAt: new Date(now - DAY) });
const suspenso = await mk({ bannedUntil: new Date(now + DAY) });
const expirado = await mk({ vipUntil: new Date(now - MIN) });
const comum = await mk({ vipUntil: null });
const solto = await mk({ bannedUntil: new Date(now - DAY) }); // suspensão que já acabou: chuta

check(COOLDOWNS.AUTO.vip === 5 * MIN, 'recarga do chute direto do VIP: 5 min');
const feitos = await vipOfflineAutoKicks();
check(feitos >= 3, `a volta do scheduler fez ${feitos} gol(s) (os 3 deste teste com a recarga vencida, no mínimo)`);

for (const [u, label] of [[pronto, 'VIP que nunca chutou'], [vencida, 'VIP com a recarga vencida há 1 min'], [solto, 'VIP com a suspensão já vencida']]) {
  const a = await U(u.id);
  check(a.goalsTotal === 1 && a.autoGoals === 1 && a.money === MONEY.AUTO && a.lastAutoAt && a.lastAutoAt.getTime() >= now - 1000,
    `${label}: chutou com o app fechado (1 gol, R$ ${a.money}, recarga reiniciada)`);
  check(await autoGols(u.id) === 1, `${label}: 1 linha de Goal AUTO (conta na artilharia e no placar)`);
}
const lance = await prisma.activity.findFirst({ where: { userId: pronto.id, kind: 'AUTO' } });
check(!!lance?.goal, `lance ao vivo do gol: "${lance?.text?.slice(0, 70)}…"`);

for (const [u, label] of [
  [recente, 'VIP que chutou há 1 min'], [quase, 'VIP a 15 s do fim da recarga'], [bot, 'bot com VIP'], [excluido, 'conta excluída'],
  [suspenso, 'conta suspensa'], [expirado, 'VIP vencido'], [comum, 'jogador sem VIP'],
]) {
  check(await autoGols(u.id) === 0 && (await U(u.id)).goalsTotal === 0, `${label}: não chutou`);
}

// de novo, na hora: ninguém repete
await vipOfflineAutoKicks();
check(await autoGols(pronto.id) === 1 && await autoGols(vencida.id) === 1, 'chamar de novo logo em seguida não dá outro gol');

// app aberto e servidor no mesmo instante: a recarga é reservada uma vez só
const corrida = await mk();
const [app] = await Promise.allSettled([autoKick(corrida.id), vipOfflineAutoKicks()]);
check(await autoGols(corrida.id) === 1, `app aberto chutando junto com o servidor: 1 gol só (o app ${app.status === 'fulfilled' ? 'ganhou a corrida' : 'levou "recarga"'})`);

// a recarga venceu de novo (como se 5 min tivessem passado): volta a chutar sozinho
await prisma.user.update({ where: { id: pronto.id }, data: { lastAutoAt: new Date(Date.now() - 5 * MIN - 2000) } });
await vipOfflineAutoKicks();
check(await autoGols(pronto.id) === 2, 'passados os 5 min, chutou de novo sozinho (2º gol)');

// o VIP dos jogadores de teste vence agora: a API local (scheduler) não segue chutando por eles
await prisma.user.updateMany({ where: { id: { in: criados } }, data: { vipUntil: new Date(Date.now() - MIN) } });
await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
