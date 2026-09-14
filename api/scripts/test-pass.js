/**
 * Presença da Semana (services/pass.js) direto no banco LOCAL, simulando os dias (o serviço aceita `now`):
 * prêmios dos 7 dias, um resgate por dia (inclusive dois toques ao mesmo tempo), XP em dobro para VIP,
 * VIP do 7º dia ativando na hora (sem ir para o banco), 2ª semana seguida = 2 VIP, pulou um dia = volta
 * ao dia 1, Energia que nunca rebaixa e destreza no máximo virando dinheiro. Cria jogadores tp…
 *
 * Uso (na pasta api/):  node scripts/test-pass.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-pass.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { passState, passClaim } = await import('../src/services/pass.js');
const { LOGIN_PASS, DEXTERITY_MAX, levelOf } = await import('../src/lib/rules.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const DAY = 86_400_000;
const at = (d, h = 12) => new Date(Date.UTC(2026, 9, 1 + d, h + 3)); // d dias depois de 01/10/2026, h horas em Brasília
const team = await prisma.team.findFirst({ where: { slug: 'nautico' } }) ?? await prisma.team.findFirst();
let seq = 0;
const mk = (extra = {}) => { const n = `tp${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, ...extra } }); };
const U = (id) => prisma.user.findUnique({ where: { id }, include: { items: true } });

// ── semana 1 completa, jogador novo sem VIP
const u = await mk();
let st = await passState(u.id, at(0));
check(!st.claimed && st.step === 1 && st.days.length === 7 && st.days.map((d) => d.xp).join(',') === '30,40,50,60,70,90,150', `dia 1 disponível; XP da semana: ${st.days.map((d) => d.xp).join(' · ')} (total ${st.days.reduce((a, d) => a + d.xp, 0)})`);
let r = await passClaim(u.id, at(0));
let x = await U(u.id);
check(r.reward.xp === 30 && x.levelBonus === 30 && x.money === 1000 && levelOf(x).lvl === 1, `dia 1: +30 XP e R$ 1.000 → nível ${levelOf(x).lvl} (libera o Party GoL)`);
check((await err(passClaim(u.id, at(0, 20))))?.status === 409, 'resgatar de novo no mesmo dia (mais tarde): recusado');
st = await passState(u.id, at(0, 23));
check(st.claimed && st.step === 1 && st.days[0].done && !st.days[1].done, 'tela: dia 1 marcado, esperando o dia 2 (vira à meia-noite)');

r = await passClaim(u.id, at(1, 0.5)); // 00h30 do dia seguinte já conta
x = await U(u.id);
const en = x.items.find((i) => i.itemKey === 'ENERGY');
check(r.reward.step === 2 && x.levelBonus === 70 && en?.level === 1 && Math.round((en.expiresAt - at(1, 0.5)) / 3_600_000) === 28, 'dia 2 (00h30): +40 XP e Energia do chute nível 1 por 28 h');
await passClaim(u.id, at(2)); x = await U(u.id);
check(x.levelBonus === 120 && x.money === 3000, 'dia 3: +50 XP e R$ 2.000');
await passClaim(u.id, at(3)); x = await U(u.id);
const boost = x.items.find((i) => i.itemKey === 'BOOST_AUTO');
check(x.levelBonus === 180 && boost && Math.round((boost.expiresAt - at(3)) / 3_600_000) === 28, 'dia 4: +60 XP e Boost Auto por 28 h');
await passClaim(u.id, at(4)); x = await U(u.id);
check(x.levelBonus === 250 && x.dexterity === 1, 'dia 5: +70 XP e +1 de destreza');
await passClaim(u.id, at(5)); x = await U(u.id);
const en2 = x.items.filter((i) => i.itemKey === 'ENERGY' && i.expiresAt > at(5)); // a do dia 2 já venceu
check(x.levelBonus === 340 && en2.length === 1 && en2[0].level === 2, 'dia 6: +90 XP e Energia nível 2');
r = await passClaim(u.id, at(6, 10)); x = await U(u.id);
check(x.levelBonus === 490 && x.money === 8000 && x.vipDays === 0 && Math.round((x.vipUntil - at(6, 10)) / 3_600_000) === 24 && r.reward.vip === 1,
  `dia 7: +150 XP, R$ 5.000 e VIP ATIVO por 24 h (banco de VIPs continua ${x.vipDays}) → nível ${levelOf(x).lvl}`);

// ── semana 2 seguida: VIP ativo ganha XP em dobro; 7º dia = 2 VIP
st = await passState(u.id, at(7, 9));
check(!st.claimed && st.step === 1 && st.week === 2 && st.vip && st.days[0].xp === 60 && st.days[6].vip === LOGIN_PASS.streakVip, 'semana 2 (ainda VIP): dia 1 vale 60 XP (dobro) e o 7º dia mostra 2 VIP');
r = await passClaim(u.id, at(7, 9)); x = await U(u.id);
check(r.reward.xp === 60 && x.levelBonus === 550, 'VIP ativo: +60 XP no dia 1 (dobro)');
for (let d = 8; d <= 12; d++) await passClaim(u.id, at(d)); // dias 2–6 (já sem VIP: XP normal)
x = await U(u.id);
check(x.levelBonus === 550 + 40 + 50 + 60 + 70 + 90, `dias 2–6 da semana 2 sem VIP: XP normal (${x.levelBonus})`);
r = await passClaim(u.id, at(13, 10)); x = await U(u.id);
check(r.reward.vip === 2 && Math.round((x.vipUntil - at(13, 10)) / 3_600_000) === 48, 'semana 2, dia 7: 2 VIP (48 h de VIP ativo)');

// ── pulou um dia: volta ao dia 1
st = await passState(u.id, at(15));
check(!st.claimed && st.step === 1 && st.week === 1 && st.broken, 'pulou um dia: a semana recomeçou do dia 1 (e as semanas seguidas zeraram)');
r = await passClaim(u.id, at(15)); // ainda VIP (vence em 14/10 10h + 48 h)
check(r.reward.step === 1 && r.reward.week === 1, 'resgatou o dia 1 de novo');

// ── dois toques ao mesmo tempo
const v = await mk();
const race = await Promise.allSettled([passClaim(v.id, at(0)), passClaim(v.id, at(0)), passClaim(v.id, at(0))]);
const vv = await U(v.id);
check(race.filter((p) => p.status === 'fulfilled').length === 1 && vv.levelBonus === 30 && vv.money === 1000, '3 toques ao mesmo tempo: o prêmio sai uma vez só');

// ── Energia nunca rebaixa; destreza no máximo vira dinheiro
const w = await mk({ dexterity: DEXTERITY_MAX });
await prisma.userItem.create({ data: { userId: w.id, itemKey: 'ENERGY', level: 3, expiresAt: new Date(at(1).getTime() + 2 * 3_600_000) } });
await passClaim(w.id, at(0)); await passClaim(w.id, at(1));
let ww = await U(w.id);
const e3 = ww.items.find((i) => i.itemKey === 'ENERGY');
check(e3.level === 3 && Math.round((e3.expiresAt - at(1)) / 3_600_000) === 28, 'tinha Energia nível 3: o dia 2 não rebaixa (continua nível 3, agora com 28 h)');
for (let d = 2; d <= 4; d++) await passClaim(w.id, at(d));
ww = await U(w.id);
check(ww.dexterity === DEXTERITY_MAX && ww.money === 1000 + 2000 + 1000, 'destreza já no máximo: o dia 5 vira R$ 1.000');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
