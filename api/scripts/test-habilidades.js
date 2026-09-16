/**
 * Habilidades (services/skills.js) no banco LOCAL: comprar nível com ponto de nível, dinheiro e VIP,
 * o acerto do pênalti/falta subindo junto (rules.js shotChance), o teto de 10 níveis, o teto do acerto
 * com chuteira e os dois toques ao mesmo tempo (ninguém sobe dois níveis pagando um). Cria jogadores th…
 *
 * Uso (na pasta api/):  node scripts/test-habilidades.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-habilidades.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { buySkill } = await import('../src/services/skills.js');
const { SKILL_COST, SKILL_BY_KEY, CHANCE_CAP, PENALTY_BASE_CHANCE, FOUL_BASE_CHANCE, shotChance, skillPointsLeft, levelOf } = await import('../src/lib/rules.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const team = await prisma.team.findFirst({ where: { slug: 'nautico' } }) ?? await prisma.team.findFirst();
let seq = 0;
const mk = (extra = {}) => { const n = `th${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, ...extra } }); };
const U = (id) => prisma.user.findUnique({ where: { id }, include: { items: true } });

// ── quem nunca gastou nada: base pura
const novato = await mk();
check(shotChance(novato, 'PENALTY') === PENALTY_BASE_CHANCE && shotChance(novato, 'FOUL') === FOUL_BASE_CHANCE,
  `jogador novo: ${pct(PENALTY_BASE_CHANCE)} no pênalti e ${pct(FOUL_BASE_CHANCE)} na falta`);
check(skillPointsLeft(novato) === levelOf(novato).lvl, `pontos de nível = nível do jogador (${levelOf(novato).lvl})`);

// ── ponto de nível: quem não tem nível não sobe
const e1 = await err(buySkill(novato.id, 'AIM', 'point'));
check(e1?.status === 402 && e1.code === 'no-points', 'sem ponto de nível: recusado (402)');

// ── dinheiro
const rico = await mk({ money: SKILL_COST.money * 2 + 10 });
await buySkill(rico.id, 'AIM', 'money');
let x = await U(rico.id);
const passo = SKILL_BY_KEY.AIM.perLevel;
check(x.skillAim === 1 && x.money === SKILL_COST.money + 10, `pagou ${SKILL_COST.money} e subiu Pontaria para 1 (sobrou R$ ${x.money})`);
check(Math.abs(shotChance(x, 'PENALTY') - (PENALTY_BASE_CHANCE + passo)) < 1e-9, `acerto do pênalti: ${pct(shotChance(x, 'PENALTY'))}`);
check(x.skillPoints === 0, 'pagou com dinheiro: não gastou ponto de nível');
await buySkill(rico.id, 'SHOT', 'money');
x = await U(rico.id);
check(x.skillShot === 1 && x.money === 10, 'segundo nível (Chute) pago com o resto do dinheiro');
const e2 = await err(buySkill(rico.id, 'AIM', 'money'));
check(e2?.status === 402 && e2.code === 'no-money', 'sem dinheiro: recusado (402)');

// ── VIP guardado
const vip = await mk({ vipDays: 1 });
await buySkill(vip.id, 'SHOT', 'vip');
x = await U(vip.id);
check(x.skillShot === 1 && x.vipDays === 0, 'pagou 1 VIP guardado e subiu Chute para 1');
const e3 = await err(buySkill(vip.id, 'SHOT', 'vip'));
check(e3?.status === 402 && e3.code === 'no-vip', 'sem VIP guardado: recusado (402)');

// ── ponto de nível: 1 por nível do jogador, e cada compra gasta um
const forte = await mk({ levelBonus: 100_000 });
x = await U(forte.id);
const lvl = levelOf(x).lvl;
check(lvl >= 3, `jogador de nível ${lvl} para gastar pontos`);
await buySkill(forte.id, 'AIM', 'point');
await buySkill(forte.id, 'SHOT', 'point');
x = await U(forte.id);
check(x.skillAim === 1 && x.skillShot === 1 && x.skillPoints === 2 && skillPointsLeft(x) === lvl - 2, `2 níveis por ponto: sobraram ${skillPointsLeft(x)} pontos`);
check(x.money === 0 && x.vipDays === 0, 'pagou com ponto: não tirou dinheiro nem VIP');

// ── teto: 10 níveis e o acerto que eles dão
const max = await mk({ money: SKILL_COST.money * 20 });
for (let i = 0; i < SKILL_BY_KEY.AIM.max; i++) await buySkill(max.id, 'AIM', 'money');
x = await U(max.id);
const topo = PENALTY_BASE_CHANCE + SKILL_BY_KEY.AIM.max * SKILL_BY_KEY.AIM.perLevel;
check(x.skillAim === 10 && Math.abs(shotChance(x, 'PENALTY') - topo) < 1e-9, `Pontaria no 10: ${pct(shotChance(x, 'PENALTY'))} de acerto no pênalti`);
const e4 = await err(buySkill(max.id, 'AIM', 'money'));
check(e4?.status === 400 && /nível 10/.test(e4.message), 'no nível 10: recusado');

// ── teto do acerto: chuteira de diamante em cima da habilidade no máximo não passa do limite
await prisma.userItem.create({ data: { userId: max.id, itemKey: 'BOOT_DIAMOND', equipped: true, expiresAt: new Date(Date.now() + 86_400_000) } });
x = await U(max.id);
check(shotChance(x, 'PENALTY') === CHANCE_CAP.PENALTY, `com chuteira de diamante o acerto trava no teto: ${pct(CHANCE_CAP.PENALTY)}`);

// ── dois toques ao mesmo tempo: paga um, sobe um
const corrida = await mk({ money: SKILL_COST.money });
const race = await Promise.allSettled([buySkill(corrida.id, 'AIM', 'money'), buySkill(corrida.id, 'AIM', 'money'), buySkill(corrida.id, 'AIM', 'money')]);
x = await U(corrida.id);
check(race.filter((p) => p.status === 'fulfilled').length === 1 && x.skillAim === 1 && x.money === 0, '3 toques ao mesmo tempo: sobe um nível só e cobra uma vez');

// ── o mesmo com ponto de nível (a trava é o skillPoints)
const corrida2 = await mk({ levelBonus: 0 });
await prisma.user.update({ where: { id: corrida2.id }, data: { goalsTotal: 0 } });
x = await U(corrida2.id);
if (levelOf(x).lvl >= 1) {
  const race2 = await Promise.allSettled([buySkill(corrida2.id, 'AIM', 'point'), buySkill(corrida2.id, 'SHOT', 'point')]);
  x = await U(corrida2.id);
  check(x.skillAim + x.skillShot === Math.min(2, levelOf(x).lvl + x.skillPoints) && x.skillPoints === x.skillAim + x.skillShot, 'pontos de nível: nunca gasta mais do que tem');
}

// ── habilidade e moeda inválidas
const e5 = await err(buySkill(rico.id, 'VOO', 'money'));
const e6 = await err(buySkill(rico.id, 'AIM', 'pix'));
check(e5?.status === 400 && e6?.status === 400, 'habilidade ou forma de pagar inválida: recusado');

// ── histórico da loja
const logs = await prisma.shopLog.findMany({ where: { userId: rico.id } });
check(logs.length === 2 && logs.every((l) => l.itemKey.startsWith('SKILL_')), 'compras aparecem no histórico da loja');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
