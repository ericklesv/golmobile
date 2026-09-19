/**
 * Tutorial de boas-vindas (services/tutorial.js) no banco LOCAL: quem chega vê o tutorial e ninguém mais,
 * as três etapas só andam quando o jogador FEZ a coisa, o VIP cai uma vez só e quem recusa fica livre dos
 * pop-ups. Cria jogadores tt… e apaga tudo no fim.
 *
 * Uso (na pasta api/):  node scripts/test-tutorial.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-tutorial.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { tutorialState, tutorialStart, tutorialSkip, tutorialDone, noPassoDoX1 } = await import('../src/services/tutorial.js');
const { TUTORIAL } = await import('../src/lib/rules.js');
const { dayNumber } = await import('../src/lib/time.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const time = await prisma.team.findFirst();
let seq = 0;
const mk = (extra = {}) => { const n = `tt${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: time.id, ...extra } }); };
const U = (id) => prisma.user.findUnique({ where: { id } });
const criados = [];
const novo = async (extra) => { const u = await mk(extra); criados.push(u.id); return u; };

// ── quem acaba de chegar
const u = await novo();
const v0 = await tutorialState(u.id);
check(v0.step === 0 && v0.pending, 'conta nova: tutorial pendente (é o que segura TODOS os pop-ups)');
check(v0.vip === TUTORIAL.vip, `a tela sabe que o prêmio é ${v0.vip} VIP`);

const v1 = await tutorialStart(u.id);
check(v1.step === 1 && v1.pending, 'topou fazer: etapa 1 (o pênalti)');
check((await tutorialStart(u.id)).step === 1, 'tocar em "fazer" de novo não volta nem pula etapa');

// ── etapa 1: só anda depois de bater o pênalti de verdade
const e1 = await err(tutorialDone(u.id, 1));
check(e1?.status === 409 && /pênalti/i.test(e1.message), `sem bater, não anda: "${e1?.message}"`);
await prisma.user.update({ where: { id: u.id }, data: { penaltyTries: 1 } });
check((await tutorialDone(u.id, 1)).step === 2, 'bateu o pênalti: foi para a etapa 2 (minigames)');

// ── etapa 2: só anda depois de jogar o Termo
const e2 = await err(tutorialDone(u.id, 2));
check(e2?.status === 409 && /termo/i.test(e2.message), `sem jogar o Termo, não anda: "${e2?.message}"`);
await prisma.dailyGame.create({ data: { userId: u.id, game: 'TERMO', day: dayNumber(), state: { guesses: [] } } });
check((await tutorialDone(u.id, 2)).step === 3, 'jogou o Termo: foi para a etapa 3 (X1)');
check(await noPassoDoX1(u.id), 'na etapa 3 o X1 sabe que pode mandar um bot aceitar o desafio');

// ── etapa 3: só termina depois de uma partida de X1
const e3 = await err(tutorialDone(u.id, 3));
check(e3?.status === 409 && /X1/i.test(e3.message), `sem partida de X1, não termina: "${e3?.message}"`);
const rival = await novo();
const partida = await prisma.x1Match.create({ data: { game: 'FUTPREGO', aId: u.id, bId: rival.id, aTeamId: time.id, bTeamId: time.id, aIp: '1.1.1.1', bIp: '2.2.2.2', bet: 200 } });
const vipAntes = (await U(u.id)).vipDays;
const fim = await tutorialDone(u.id, 3);
check(fim.step === TUTORIAL.DONE && !fim.pending && fim.done, 'jogou o X1: tutorial terminado');
check(fim.vipGanho === TUTORIAL.vip && (await U(u.id)).vipDays === vipAntes + TUTORIAL.vip, `caiu ${TUTORIAL.vip} VIP no banco`);
check(!(await noPassoDoX1(u.id)), 'terminado o tutorial, o X1 volta a ser só entre gente de verdade');

// ── o VIP não sai duas vezes
const dobro = await tutorialDone(u.id, 3);
check(dobro.vipGanho === 0 && (await U(u.id)).vipDays === vipAntes + TUTORIAL.vip, 'mandar a última etapa de novo NÃO paga outro VIP');
check((await U(u.id)).tutorialAt instanceof Date, 'ficou gravado quando ele terminou');

// ── quem diz "agora não"
const r = await novo();
const rec = await tutorialSkip(r.id);
check(rec.step === TUTORIAL.RECUSOU && !rec.pending, 'recusou: os pop-ups normais voltam a aparecer');
check((await U(r.id)).vipDays === 0, 'quem recusa não ganha VIP');
const eRec = await err(tutorialStart(r.id));
check(eRec?.status === 409, 'e não dá para começar de novo depois de recusar');

// ── pular no meio também fecha
const m = await novo();
await tutorialStart(m.id);
await prisma.user.update({ where: { id: m.id }, data: { penaltyTries: 1 } });
await tutorialDone(m.id, 1);
const pulou = await tutorialSkip(m.id);
check(pulou.step === TUTORIAL.RECUSOU && (await U(m.id)).vipDays === 0, 'pulou no meio: fecha sem VIP');

// ── quem já jogava não é incomodado (a migração marcou todo mundo como recusado)
const velho = await novo({ tutorialStep: TUTORIAL.RECUSOU });
check(!(await tutorialState(velho.id)).pending, 'jogador antigo não vê tutorial nenhum');

await prisma.$transaction([
  prisma.x1Match.deleteMany({ where: { id: partida.id } }),
  prisma.dailyGame.deleteMany({ where: { userId: { in: criados } } }),
  prisma.user.deleteMany({ where: { id: { in: criados } } }),
]);
await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
