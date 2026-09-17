/**
 * Party GoL (roleta) direto no banco LOCAL: as três casas premiadas pagam valores DIFERENTES
 * (300 / 800 / 1.500), cada casa tem a mesma chance (1 em 8), o giro custa R$ 100, o gol vale só na
 * primeira vitória do dia, os 10 giros acabam (429) e o cartão SOME do slider da Home quando acabam.
 * Cria jogadores tp…
 *
 * Uso (na pasta api/):  node scripts/test-party.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-party.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { partySpin, partyStatus } = await import('../src/services/play.js');
const { minigamesHub } = await import('../src/services/daily.js');
const { MONEY, PARTY_PRIZES, PARTY_SPINS, PARTY_WIN_CHANCE } = await import('../src/lib/rules.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const real = (v) => `R$ ${v.toLocaleString('pt-BR')}`;
const team = await prisma.team.findFirst({ where: { slug: 'nautico' } }) ?? await prisma.team.findFirst();
let seq = 0;
const mk = (extra = {}) => { const n = `tp${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, levelBonus: 600, ...extra } }); };
const U = (id) => prisma.user.findUnique({ where: { id } });
const limpaDia = (userId) => prisma.$transaction([
  prisma.activity.deleteMany({ where: { userId, kind: 'PARTY' } }),
  prisma.goal.deleteMany({ where: { userId, kind: 'PARTY' } }),
]);

// ── as casas
const pagam = PARTY_PRIZES.filter((p) => p > 0);
check(PARTY_PRIZES.length === 8 && pagam.length === 3, `roda de ${PARTY_PRIZES.length} casas, ${pagam.length} pagam`);
check(pagam.join(',') === '300,800,1500', `as três casas pagam ${pagam.map(real).join(' · ')} (o dono pediu 300, 800 e 1.500)`);
check(Math.abs(PARTY_WIN_CHANCE - 3 / 8) < 1e-9, `chance de ganhar: ${(PARTY_WIN_CHANCE * 100).toFixed(1)}%`);
check(MONEY.PARTY_BET === 100 && PARTY_SPINS.free === 10 && PARTY_SPINS.vip === 10, `giro custa ${real(MONEY.PARTY_BET)}; ${PARTY_SPINS.free} giros por dia para todo mundo`);
const ev = PARTY_PRIZES.reduce((s, p) => s + p, 0) / PARTY_PRIZES.length - MONEY.PARTY_BET;
check(ev > 0, `o jogador ganha em média ${real(Math.round(ev))} por giro (${real(Math.round(ev * PARTY_SPINS.free))} nos ${PARTY_SPINS.free} giros)`);

// ── um dia inteiro de um jogador: cobrança, prêmio da casa, gol só na primeira vitória
const u = await mk({ money: 100_000 });
let vitorias = 0, pago = 0, gols = 0;
for (let i = 0; i < PARTY_SPINS.free; i++) {
  const antes = (await U(u.id)).money;
  const r = await partySpin(u.id);
  const depois = (await U(u.id)).money;
  const premioDaCasa = PARTY_PRIZES[r.segment];
  if (r.prize !== premioDaCasa) check(false, `giro ${i + 1}: pagou ${real(r.prize)} mas a casa ${r.segment} vale ${real(premioDaCasa)}`);
  if (depois !== antes - MONEY.PARTY_BET + premioDaCasa) check(false, `giro ${i + 1}: dinheiro ${real(antes)} → ${real(depois)} não bate`);
  if (r.win !== premioDaCasa > 0) check(false, `giro ${i + 1}: win=${r.win} não bate com a casa`);
  if (r.win) { vitorias++; pago += r.prize; if (r.goal) gols++; }
  else if (r.goal) check(false, `giro ${i + 1}: deu gol sem ganhar`);
  if (r.left !== PARTY_SPINS.free - i - 1) check(false, `giro ${i + 1}: faltam ${r.left}`);
}
check(true, `10 giros: cobrou ${real(MONEY.PARTY_BET)} em todos e pagou exatamente o valor da casa sorteada`);
check(vitorias === 0 || gols === 1, `gol só na 1ª vitória do dia (${vitorias} vitórias, ${gols} gol)`);
check(pago === 0 || pago > 0, `levou ${real(pago)} em ${vitorias} vitórias`);

// ── acabaram os giros
const e = await err(partySpin(u.id));
check(e?.status === 429 && e?.code === 'party-limit', `11º giro recusado: "${e?.message}"`);
const st = await partyStatus(u.id);
check(st.left === 0 && st.spins === PARTY_SPINS.free && st.prizes?.join(',') === PARTY_PRIZES.join(','), 'a tela vê 10/10 giros usados e o valor de cada casa');

// ── o cartão some do slider da Home
const cartao = (hub) => hub.games.find((g) => g.id === 'PARTY');
let hub = await minigamesHub(u.id);
let c = cartao(hub);
check(c && !c.available && c.finished && c.nextAt > Date.now(), `sem giros: cartão marcado como JOGADO, volta em ${new Date(c.nextAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
const ordem = hub.games.map((g) => g.id);
const disponiveis = hub.games.filter((g) => g.available).length;
check(ordem.indexOf('PARTY') >= disponiveis, `o cartão vai para trás dos ${disponiveis} disponíveis (posição ${ordem.indexOf('PARTY') + 1} de ${ordem.length})`);

await limpaDia(u.id);
c = cartao(await minigamesHub(u.id));
check(c.available && !c.finished, 'com giros de novo (virou o dia), o cartão volta para o slider');

// ── um jogador sem dinheiro não gasta giro
const pobre = await mk({ money: 50 });
const e2 = await err(partySpin(pobre.id));
check(e2?.status === 402, `sem dinheiro: recusado ("${e2?.message}")`);
check((await prisma.activity.count({ where: { userId: pobre.id, kind: 'PARTY' } })) === 0 && (await U(pobre.id)).money === 50, 'recusa não gasta giro nem dinheiro');

// ── sorteio: cada casa 1 em 8, em milhares de giros
const many = await mk({ money: 50_000_000 });
const N = 8000;
const conta = new Array(PARTY_PRIZES.length).fill(0);
let caixa = 0;
for (let i = 0; i < N; i++) {
  if (i % PARTY_SPINS.free === 0) await limpaDia(many.id); // o limite do dia não atrapalha a amostra
  const r = await partySpin(many.id);
  conta[r.segment]++;
  caixa += r.prize - MONEY.PARTY_BET;
}
const pior = Math.max(...conta.map((q) => Math.abs(q / N - 1 / 8)));
check(pior < 0.015, `${N} giros: cada casa ficou perto de 12,5% (maior desvio ${(pior * 100).toFixed(2)} pontos) — ${conta.map((q, i) => `${PARTY_PRIZES[i] || 'errou'}:${(q / N * 100).toFixed(1)}%`).join(' ')}`);
const medio = caixa / N;
check(Math.abs(medio - ev) < 40, `ganho médio medido ${real(Math.round(medio))} por giro (previsto ${real(Math.round(ev))})`);

await prisma.$transaction([
  prisma.goal.deleteMany({ where: { userId: { in: [u.id, pobre.id, many.id] } } }),
  prisma.activity.deleteMany({ where: { userId: { in: [u.id, pobre.id, many.id] } } }),
  prisma.user.deleteMany({ where: { id: { in: [u.id, pobre.id, many.id] } } }),
]);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
