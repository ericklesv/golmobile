/**
 * Habilidades (services/skills.js) e chute de prata/ouro (lib/bola.js + services/play.js) no banco LOCAL:
 * só ponto de nível paga, os tetos (recarga 4:30, pênalti 90%, falta 80%, sorte 10%), a árvore inteira
 * custando 36 pontos = nível 36, e a recarga de prata/ouro rendendo 2 e 3 batidas sem cobrar recarga nova.
 * Cria jogadores th…
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
const { penalty, foul } = await import('../src/services/play.js');
const R = await import('../src/lib/rules.js');
const { ballView } = await import('../src/lib/bola.js');
const { cooldownsView } = await import('../src/services/view.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
const pct = (v) => `${(v * 100).toFixed(0)}%`;
const team = await prisma.team.findFirst({ where: { slug: 'nautico' } }) ?? await prisma.team.findFirst();
let seq = 0;
const mk = (extra = {}) => { const n = `th${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, ...extra } }); };
const U = (id) => prisma.user.findUnique({ where: { id }, include: { items: true } });

// ── a árvore
const custo = R.SKILLS.reduce((s, x) => s + x.max, 0);
check(R.SKILLS.map((s) => s.key).join(',') === 'CD,AIM,SHOT,LUCK', `as 4 habilidades, na ordem do dono: ${R.SKILLS.map((s) => s.name).join(' → ')}`);
check(custo === 36 && R.LEVELS.at(-1).lvl === 36, `a árvore inteira custa ${custo} pontos e o nível máximo é ${R.LEVELS.at(-1).lvl} (${R.LEVELS.at(-1).goals.toLocaleString('pt-BR')} pontos de nível)`);
check(Object.keys(R.SKILL_COST).join(',') === 'point', 'habilidade paga só com ponto de nível (dinheiro e VIP saíram)');
check(R.CHANCE_CAP.PENALTY === 0.90 && R.CHANCE_CAP.FOUL === 0.80, `tetos: pênalti ${pct(R.CHANCE_CAP.PENALTY)}, falta ${pct(R.CHANCE_CAP.FOUL)}`);

// ── um jogador full: cada habilidade no máximo entrega o que o dono pediu
const full = { skillCd: 11, skillAim: 9, skillShot: 9, skillLuck: 7, goalsTotal: 300000, levelBonus: 0 };
check(R.levelOf(full).lvl === 36, `com 300 mil pontos o jogador chega ao nível ${R.levelOf(full).lvl} — e aí tem os 36 pontos da árvore`);
check(R.shotChance(full, 'PENALTY') === 0.90, `pênalti no full: ${pct(R.shotChance(full, 'PENALTY'))}`);
check(Math.abs(R.shotChance(full, 'FOUL') - 0.80) < 1e-9, `falta no full: ${pct(R.shotChance(full, 'FOUL'))}`);
check(Math.abs(R.ballChance(full).total - 0.10) < 1e-9, `chance de chute especial no full: ${pct(R.ballChance(full).total)} (prata ${(R.ballChance(full).silver * 100).toFixed(1)}% + ouro ${(R.ballChance(full).gold * 100).toFixed(1)}%)`);
check(Math.abs(R.ballChance({}).total - 0.03) < 1e-9, `e no nível 0, sem gastar ponto: ${pct(R.ballChance({}).total)} (2% prata + 1% ouro), como o dono pediu`);
for (const kind of ['AUTO', 'PENALTY', 'FOUL']) {
  check(R.cooldownFor(full, kind) === R.COOLDOWN_MIN, `${kind}: recarga no full = ${mmss(R.cooldownFor(full, kind))}`);
}
check(R.cooldownFor({ ...full, skillCd: 0 }, 'PENALTY') === 10 * 60_000, 'sem a habilidade Recarga, o pênalti continua 10:00');
check(R.cooldownFor({ ...full, skillCd: 5 }, 'PENALTY') === 7.5 * 60_000, 'no nível 5 da Recarga: 7:30 (30 s por nível)');
// VIP chega ao piso mais cedo, e o piso é o mesmo para todo mundo
const vip = { ...full, skillCd: 1, vipUntil: new Date(Date.now() + 86400e3) };
check(R.cooldownFor(vip, 'PENALTY') === R.COOLDOWN_MIN, 'VIP com 1 nível de Recarga já bate no piso de 4:30');

// ── Boost Auto: -30 s e nunca abaixo de 4 min
const I = await import('../src/lib/items.js');
check(I.BOOST_AUTO_MS === 30_000 && I.BOOST_AUTO_MIN_MS === 4 * 60_000, `Boost Auto: -${I.BOOST_AUTO_MS / 1000} s, e o chute direto não passa de ${mmss(I.BOOST_AUTO_MIN_MS)}`);

// ── comprar habilidade: só com ponto, e o ponto vem do nível
const u = await mk({ goalsTotal: 200, money: 10_000_000, vipDays: 50 }); // nível 5 = 5 pontos
check(R.skillPointsLeft(await U(u.id)) === 5, `jogador de 200 gols: nível ${R.levelOf(await U(u.id)).lvl}, ${R.skillPointsLeft(await U(u.id))} pontos`);
const eMoeda = await err(buySkill(u.id, 'CD', 'money'));
check(eMoeda?.status === 400, `pagar com dinheiro é recusado: "${eMoeda?.message}"`);
const eVip = await err(buySkill(u.id, 'CD', 'vip'));
check(eVip?.status === 400, 'pagar com VIP é recusado');
for (let i = 0; i < 5; i++) await buySkill(u.id, 'CD', 'point');
let me = await U(u.id);
check(me.skillCd === 5 && me.money === 10_000_000 && me.vipDays === 50, '5 níveis de Recarga comprados: não tirou dinheiro nem VIP');
const eSem = await err(buySkill(u.id, 'AIM', 'point'));
check(eSem?.code === 'no-points', `acabaram os pontos: "${eSem?.message}"`);
check(R.cooldownFor(me, 'PENALTY') === 7.5 * 60_000, `a recarga do pênalti dele caiu para ${mmss(R.cooldownFor(me, 'PENALTY'))}`);

// ── teto de cada habilidade
const alto = await mk({ goalsTotal: 300000 });
for (let i = 0; i < 9; i++) await buySkill(alto.id, 'AIM', 'point');
const eTeto = await err(buySkill(alto.id, 'AIM', 'point'));
check(eTeto?.status === 400 && (await U(alto.id)).skillAim === 9, `Pontaria trava no nível 9: "${eTeto?.message}"`);

// ── chute de prata e de ouro: a recarga rende 2 e 3 batidas
const sortudo = await mk({ goalsTotal: 5000, skillLuck: 7 });
// força a bola da próxima recarga para conferir o fluxo sem depender do sorteio
const forca = (id, kind, bola) => prisma.$executeRawUnsafe('UPDATE "User" SET "ballNext" = jsonb_set(COALESCE("ballNext", \'{}\'::jsonb), ARRAY[$2], $3::jsonb) WHERE id = $1', id, kind, JSON.stringify(bola));
for (const [bola, batidas] of [['PRATA', 2], ['OURO', 3]]) {
  await prisma.user.update({ where: { id: sortudo.id }, data: { lastPenaltyAt: null, ballLeft: {} } });
  await forca(sortudo.id, 'PENALTY', bola);
  const antes = await U(sortudo.id);
  check(ballView(antes, 'PENALTY').ball === bola && ballView(antes, 'PENALTY').left === batidas, `card do pênalti mostra a bola ${bola} valendo ${batidas} batidas antes de bater`);
  const rs = [];
  for (let i = 0; i < batidas; i++) rs.push(await penalty(sortudo.id, 'left')); // nenhuma pode dar 429
  check(rs.length === batidas && rs.every((r) => r.ball === bola), `bateu as ${batidas} batidas da bola ${bola} sem esperar recarga`);
  check(rs.at(-1).ballLeft === 0, 'na última batida a bola acaba');
  const e429 = await err(penalty(sortudo.id, 'left'));
  check(e429?.code === 'cooldown', `a ${batidas + 1}ª batida cai na recarga normal ("${e429?.message ?? ''}".trim() = recarga)`);
  const gols = rs.filter((r) => r.goal).length;
  const linhas = await prisma.goal.findMany({ where: { userId: sortudo.id, kind: 'PENALTY', ball: bola } });
  check(linhas.length === gols, `os gols dessa bola ficaram marcados como ${bola} (${gols} de ${batidas} entraram)`);
  await prisma.goal.deleteMany({ where: { userId: sortudo.id } });
}
// a bola da próxima recarga é sorteada sozinha ao gastar a recarga
await prisma.user.update({ where: { id: sortudo.id }, data: { lastFoulAt: null, ballLeft: {}, ballNext: {} } });
await foul(sortudo.id, 'over');
const depois = await U(sortudo.id);
check('FOUL' in (depois.ballNext ?? {}), 'ao bater, o servidor já sorteia a bola da PRÓXIMA recarga (é ela que pinta o card)');

// ── o sorteio bate com a chance da Sorte
const sorteios = { PRATA: 0, OURO: 0, normal: 0 };
const N = 20000;
for (let i = 0; i < N; i++) { const b = R.rollBall({ skillLuck: 7 }, 'PENALTY'); sorteios[b ?? 'normal']++; }
const esperado = R.ballChance({ skillLuck: 7 });
check(Math.abs(sorteios.OURO / N - esperado.gold) < 0.005 && Math.abs(sorteios.PRATA / N - esperado.silver) < 0.008,
  `${N} sorteios no full: ${(sorteios.PRATA / N * 100).toFixed(1)}% prata e ${(sorteios.OURO / N * 100).toFixed(1)}% ouro (previsto ${(esperado.silver * 100).toFixed(1)}% e ${(esperado.gold * 100).toFixed(1)}%)`);
check(R.rollBall({ skillLuck: 7 }, 'AUTO') === null, 'chute direto nunca é de prata nem de ouro (decisão do dono)');

// ── Atacante extra (loja): a última linha da trilha vira 2 casas livres de 3
const { trailPick } = await import('../src/services/play.js');
const I2 = await import('../src/lib/items.js');
const cavador = await mk({ goalsTotal: 5000, money: 1_000_000 });
const linhaFinal = R.TRAIL_LINES.length - 1;
const ladroesDaUltima = async (id) => {
  // a trilha é sorteada ao começar; se a primeira escolha já for ladrão a trilha acaba e o layout some,
  // então tenta de novo até pegar uma que continuou viva
  for (let i = 0; i < 15; i++) {
    await prisma.user.update({ where: { id }, data: { lastTrailAt: null, trailState: null, ballLeft: {}, ballNext: {} } });
    await trailPick(id, 0);
    const st = (await U(id)).trailState;
    if (st?.layout) return st.layout[linhaFinal].filter(Boolean).length;
  }
  return -1;
};
const semItem = await ladroesDaUltima(cavador.id);
check(semItem === R.TRAIL_LINES[linhaFinal].mines, `sem item, o ataque tem ${semItem} ladrões de ${R.TRAIL_LINES[linhaFinal].total} (1 casa livre)`);
const def = I2.ITEMS.find((x) => x.key === 'STRIKER');
check(def.price === 1000 && def.durationMs === 3600_000, `Atacante extra: R$ ${def.price} por ${def.durationMs / 3600_000} hora`);
await prisma.userItem.create({ data: { userId: cavador.id, itemKey: 'STRIKER', expiresAt: new Date(Date.now() + 3600_000) } });
const comItem = await ladroesDaUltima(cavador.id);
check(comItem === R.TRAIL_LINES[linhaFinal].mines - 1, `com o Atacante extra: ${comItem} ladrão de ${R.TRAIL_LINES[linhaFinal].total} — ataca com 2, como no BRGOL`);
// a chance de fazer gol na trilha dobra
const chance = (mines) => R.TRAIL_LINES.reduce((p, l, i) => p * ((l.total - (i === linhaFinal ? mines : l.mines)) / l.total), 1);
check(chance(comItem) > chance(semItem) * 1.9, `gol na trilha: de ${(chance(semItem) * 100).toFixed(1)}% para ${(chance(comItem) * 100).toFixed(1)}% enquanto o item durar`);
await prisma.userItem.deleteMany({ where: { userId: cavador.id } });
check((await ladroesDaUltima(cavador.id)) === R.TRAIL_LINES[linhaFinal].mines, 'vencido o item, o ataque volta a ser 1 casa livre de 3');

// ── a tela recebe tudo
const view = cooldownsView(await U(sortudo.id));
check(view.PENALTY.ball !== undefined && view.TRAIL.ball !== undefined && view.AUTO.ball === null, 'cooldownsView manda a bola de cada modo para a tela');

const ids = [u.id, alto.id, sortudo.id, cavador.id];
await prisma.$transaction([
  prisma.userItem.deleteMany({ where: { userId: { in: ids } } }),
  prisma.goal.deleteMany({ where: { userId: { in: ids } } }),
  prisma.activity.deleteMany({ where: { userId: { in: ids } } }),
  prisma.shopLog.deleteMany({ where: { userId: { in: ids } } }),
  prisma.user.deleteMany({ where: { id: { in: ids } } }),
]);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
