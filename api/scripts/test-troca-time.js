/**
 * Troca de time na Loja (item TEAM_CHANGE: R$ 50 mil ou 1 VIP — dono, 15/09/2026) direto no banco LOCAL, pelo
 * services/shop.js changeTeam (o mesmo que atende POST /api/shop/team e o endereço antigo /api/me/change-team):
 * cobra certo nas duas moedas, recusa sem saldo / mesmo time / time inválido / com contrato sem cobrar nada, zera o
 * contador da rodada, tira da diretoria e devolve o VIP das propostas abertas, grava no histórico da loja e nos
 * lances, e duas trocas ao mesmo tempo com saldo para uma só: passa uma. Cria jogadores de teste (nicks tt…).
 *
 * Uso (na pasta api/):  node scripts/test-troca-time.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-troca-time.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { changeTeam } = await import('../src/services/shop.js');
const { ITEM_BY_KEY } = await import('../src/lib/items.js');
const DEF = ITEM_BY_KEY.TEAM_CHANGE;
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const DAY = 86_400_000;

check(DEF?.price === 50000 && DEF.priceVip === 1 && DEF.kind === 'service' && DEF.category === 'perfil', 'item Troca de time no catálogo: R$ 50.000 ou 1 VIP, na seção Perfil');

// times sem ninguém na diretoria (o teste pode rodar várias vezes sem apagar nada)
const [T1, T2, T3] = await prisma.team.findMany({ where: { roles: { none: {} } }, take: 3, orderBy: { id: 'asc' } });
console.log(`times do teste: ${T1.name} · ${T2.name} · ${T3.name}`);
let seq = 0;
const mk = async (extra = {}) => {
  const n = `tt${Date.now() % 1e6}${seq++}`;
  return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: T1.id, money: 0, vipDays: 0, ...extra } });
};
const U = (id) => prisma.user.findUnique({ where: { id } });
const round = await prisma.round.findFirst({ where: { status: 'LIVE' } });

// ── em dinheiro
{
  const u = await mk({ money: 60000, vipDays: 3, goalsRound: 5, roundId: round?.id ?? null });
  const me = await changeTeam(u.id, T2.slug, 'money');
  const a = await U(u.id);
  check(a.teamId === T2.id && me.team?.slug === T2.slug, `em dinheiro: foi do ${T1.name} para o ${T2.name} (e a resposta já traz o time novo)`);
  check(a.money === 10000 && a.vipDays === 3, `cobrou R$ 50.000 (sobrou R$ ${a.money}) e não mexeu no VIP`);
  check(a.goalsRound === 0 && a.roundId === null, 'o contador "Rodada: X gols" zerou (os gols feitos ficam com o time antigo)');
  const logRow = await prisma.shopLog.findFirst({ where: { userId: u.id }, orderBy: { id: 'desc' } });
  check(logRow?.itemKey === 'TEAM_CHANGE' && logRow.price === 50000 && logRow.currency === 'money', 'histórico da loja: Troca de time, R$ 50.000');
  const act = await prisma.activity.findFirst({ where: { userId: u.id }, orderBy: { id: 'desc' } });
  check(act?.teamId === T2.id && act.text.includes(`agora joga pelo ${T2.name}`), `lances: "${act?.text}"`);
}

// ── em VIP
{
  const u = await mk({ money: 1000, vipDays: 2 });
  await changeTeam(u.id, T3.slug, 'vip');
  const a = await U(u.id);
  check(a.teamId === T3.id && a.vipDays === 1 && a.money === 1000, 'em VIP: trocou, gastou 1 VIP do banco e não mexeu no dinheiro');
  const logRow = await prisma.shopLog.findFirst({ where: { userId: u.id }, orderBy: { id: 'desc' } });
  check(logRow?.price === 1 && logRow.currency === 'vip', 'histórico da loja: Troca de time, 1 VIP');
}

// ── recusas (e nada é cobrado)
{
  const pobre = await mk({ money: 49999 });
  let e = await err(changeTeam(pobre.id, T2.slug, 'money'));
  check(e?.status === 402 && (await U(pobre.id)).teamId === T1.id && (await U(pobre.id)).money === 49999, `sem R$ 50.000: recusa ("${e?.message}") e não troca`);
  e = await err(changeTeam(pobre.id, T2.slug, 'vip'));
  check(e?.status === 402 && (await U(pobre.id)).teamId === T1.id, `sem VIP no banco: recusa ("${e?.message}")`);
  const rico = await mk({ money: 100000, vipDays: 5 });
  e = await err(changeTeam(rico.id, T1.slug, 'money'));
  check(e?.status === 400 && /já é desse time/.test(e.message) && (await U(rico.id)).money === 100000, 'mesmo time: recusa sem cobrar');
  e = await err(changeTeam(rico.id, 'time-que-nao-existe', 'money'));
  check(e?.status === 400 && (await U(rico.id)).money === 100000, 'time inválido: recusa sem cobrar');
  e = await err(changeTeam(rico.id, T2.slug, 'ouro'));
  check(e?.status === 400 && (await U(rico.id)).money === 100000, 'moeda inválida: recusa sem cobrar');
  const preso = await mk({ money: 100000, vipDays: 5, contractUntil: new Date(Date.now() + 2 * DAY) });
  e = await err(changeTeam(preso.id, T2.slug, 'vip'));
  const p = await U(preso.id);
  check(e?.status === 409 && e.code === 'contract' && p.teamId === T1.id && p.vipDays === 5 && p.money === 100000, `com contrato de contratação: recusa sem cobrar ("${e?.message}")`);
  await prisma.user.update({ where: { id: preso.id }, data: { contractUntil: new Date(Date.now() - 1000) } });
  await changeTeam(preso.id, T2.slug, 'money');
  check((await U(preso.id)).teamId === T2.id, 'contrato acabou: aí troca');
}

// ── diretoria: sai do cargo e as propostas abertas que fez voltam
{
  const pres = await mk({ money: 50000, vipDays: 0 });
  const alvo = await mk({ teamId: T2.id });
  await prisma.teamRole.create({ data: { teamId: T1.id, userId: pres.id, role: 'PRESIDENTE', slot: 0 } });
  const offer = await prisma.transferOffer.create({ data: { teamId: T1.id, fromUserId: pres.id, toUserId: alvo.id, vip: 3, expiresAt: new Date(Date.now() + DAY) } });
  await changeTeam(pres.id, T3.slug, 'money');
  const a = await U(pres.id);
  const o = await prisma.transferOffer.findUnique({ where: { id: offer.id } });
  check(!(await prisma.teamRole.findUnique({ where: { userId: pres.id } })), `o presidente do ${T1.name} que trocou de time saiu do cargo`);
  check(o.status === 'CANCELED' && a.vipDays === 3 && a.money === 0, 'a proposta aberta que ele fez foi cancelada e os 3 VIP voltaram para ele');
}

// ── duas trocas ao mesmo tempo, com dinheiro para uma: passa uma só
{
  const u = await mk({ money: 50000 });
  const res = await Promise.all([err(changeTeam(u.id, T2.slug, 'money')), err(changeTeam(u.id, T3.slug, 'money'))]);
  const a = await U(u.id);
  const ok = res.filter((x) => x === null).length;
  check(ok === 1 && a.money === 0 && [T2.id, T3.id].includes(a.teamId) && (await prisma.shopLog.count({ where: { userId: u.id } })) === 1, `duas trocas ao mesmo tempo com R$ 50.000: ${ok} passou, a outra recusada ("${res.find((x) => x)?.message}")`);
}

await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
