/**
 * Convites (services/referral.js) direto no banco LOCAL: código fixo, ligação no cadastro (e a trava da
 * mesma internet), pagamento dos marcos de gols uma vez só (inclusive com duas conferências ao mesmo
 * tempo), marco que espera enquanto os dois jogam na mesma internet ou um está suspenso. Cria jogadores tr…
 *
 * Uso (na pasta api/):  node scripts/test-referral.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-referral.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const R = await import('../src/services/referral.js');
const { REFERRAL } = await import('../src/lib/rules.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const team = await prisma.team.findFirst();
let seq = 0;
const mk = (extra = {}) => { const n = `tr${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, ...extra } }); };
const vip = async (id) => (await prisma.user.findUnique({ where: { id } })).vipDays;
const goals = (u, n) => prisma.user.update({ where: { id: u.id }, data: { goalsTotal: n } });

const ref = await mk({ lastIp: '10.1.1.1' });
const st = await R.myReferral(ref.id);
check(/^[A-Z2-9]{6}$/.test(st.code) && (await R.myReferral(ref.id)).code === st.code, `código de convite fixo: ${st.code}`);
check(st.perFriend === 16 && st.milestones.map((m) => m.goals).join(',') === '25,50,100,200,400,800,1000', `marcos: ${st.milestones.map((m) => `${m.goals}→${m.vip}`).join(' · ')} (16 VIP por convidado)`);
check((await R.refLookup(st.code.toLowerCase())).nick === ref.nick, 'o link funciona mesmo digitado em minúsculas (tela de cadastro mostra quem convidou)');
check((await err(R.refLookup('XXXXXX')))?.status === 404, 'código que não existe: "convite não encontrado"');

// cadastro pelo link
const a = await mk({ lastIp: '10.2.2.2' });
check(await R.attachReferral(a.id, st.code, '10.2.2.2') === ref.nick && (await prisma.user.findUnique({ where: { id: a.id } })).referredById === ref.id, 'conta nova pelo link (outra internet): vira convidado');
const b = await mk({ lastIp: '10.1.1.1' });
check(await R.attachReferral(b.id, st.code, '10.1.1.1') === null && (await prisma.user.findUnique({ where: { id: b.id } })).referredById === null, 'conta nova na MESMA internet de quem convidou: não vira convidado');
const c0 = await mk();
check(await R.attachReferral(c0.id, 'NAOEXI', '10.9.9.9') === null, 'código inválido no cadastro: conta criada normalmente, sem convite');

// marcos
await goals(a, 24); await R.referralSweep();
check((await vip(ref.id)) === 0, '24 gols: ainda nada');
await goals(a, 25); await R.referralSweep();
check((await vip(ref.id)) === 1 && (await vip(a.id)) === 1, '25 gols: +1 VIP para quem convidou E +1 para o convidado (dono, 15/09/2026)');
await R.referralSweep();
check((await vip(ref.id)) === 1, 'conferindo de novo: não paga duas vezes');
await goals(a, 130);
await Promise.all([R.referralSweep(), R.referralSweep(), R.referralSweep()]);
check((await vip(ref.id)) === 3, '130 gols (3 conferências ao mesmo tempo): +1 do 50 e +1 do 100, uma vez só');
await goals(a, 1000); await R.referralSweep();
check((await vip(ref.id)) === 16 && (await vip(a.id)) === 16 && (await prisma.referralReward.count({ where: { referredId: a.id } })) === 14, '1000 gols: 200, 400, 800 (+3) e 1000 (+10) → 16 VIP para cada lado (7 marcos × 2 lados)');
check((await prisma.message.count({ where: { userId: a.id, kind: 'PRESENTE' } })) === 7 && (await prisma.message.count({ where: { userId: ref.id, kind: 'PRESENTE' } })) === 7, 'cada marco pago virou mensagem na caixa dos dois');

// mesma internet depois do cadastro / suspenso: o marco espera
const c = await mk({ lastIp: '10.3.3.3' });
await R.attachReferral(c.id, st.code, '10.3.3.3');
await prisma.user.update({ where: { id: c.id }, data: { lastIp: '10.1.1.1', goalsTotal: 60 } });
await R.referralSweep();
check((await vip(ref.id)) === 16, 'convidado jogando na mesma internet de quem convidou: o VIP espera');
await prisma.user.update({ where: { id: c.id }, data: { lastIp: '10.3.3.3', bannedUntil: new Date(Date.now() + 3600_000) } });
await R.referralSweep();
check((await vip(ref.id)) === 16, 'convidado suspenso: o VIP espera');
await prisma.user.update({ where: { id: c.id }, data: { bannedUntil: null } });
await R.referralSweep();
check((await vip(ref.id)) === 18, 'voltou ao normal: paga os marcos que esperavam (25 e 50: +2)');

const me = await R.myReferral(ref.id);
const ia = me.invited.find((i) => i.nick === a.nick), ic = me.invited.find((i) => i.nick === c.nick);
check(me.count === 2 && me.earned === 18 && ia.earned === 16 && ia.next === null && ic.earned === 2 && ic.next?.goals === 100, `tela: 2 convidados, 18 VIP ganhos; ${c.nick} tem 60 gols e o próximo marco é 100`);

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
