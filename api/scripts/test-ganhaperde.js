/**
 * Ganha ou Perde (services/ganhaperde.js) direto no banco LOCAL: preços (cada degrau mais caro e tudo
 * encarecendo a cada acerto), base caindo 50 → 45 → 40…, chances inválidas recusadas, cobrança exata do
 * aumento, sem dinheiro = recusado sem cobrar, acerto = gol (kind GANHAPERDE) + 5 de nível, erro = fim do
 * dia, dois toques ao mesmo tempo, nível travado, e o sorteio: ~50% e ~75% em milhares de giradas, com a
 * seta sempre parando dentro da fatia certa. Cria jogadores tg…
 *
 * Uso (na pasta api/):  node scripts/test-ganhaperde.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-ganhaperde.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { ganhaPerdeState, ganhaPerdeSpin } = await import('../src/services/ganhaperde.js');
const { GANHAPERDE, ganhaPerdeBase, ganhaPerdePrice, levelOf } = await import('../src/lib/rules.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const team = await prisma.team.findFirst({ where: { slug: 'nautico' } }) ?? await prisma.team.findFirst();
let seq = 0;
// nível 9 = 568 pontos de nível (levelBonus conta)
const mk = (extra = {}) => { const n = `tg${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, levelBonus: 600, ...extra } }); };
const U = (id) => prisma.user.findUnique({ where: { id } });
const resetDay = (userId) => prisma.dailyGame.deleteMany({ where: { userId, game: 'GANHAPERDE' } }); // só do jogador de teste

// ── regras de preço e base
check([0, 1, 2, 9, 10, 20].map(ganhaPerdeBase).join(',') === '50,45,40,5,5,5', `base por acertos: ${[0, 1, 2, 9, 10].map(ganhaPerdeBase).join(' → ')} (mínimo 5)`);
check(ganhaPerdePrice(0, 50) === 0 && ganhaPerdePrice(0, 55) === 50 && ganhaPerdePrice(0, 60) === 150 && ganhaPerdePrice(0, 75) === 750, `1ª girada: 55% = R$ 50, 60% = R$ 150, 75% = R$ ${ganhaPerdePrice(0, 75)}`);
check(ganhaPerdePrice(1, 50) === 75 && ganhaPerdePrice(1, 75) === 1575, `depois de 1 acerto (base 45%): 50% = R$ ${ganhaPerdePrice(1, 50)}, 75% = R$ ${ganhaPerdePrice(1, 75)}`);
const full = [0, 1, 2, 3, 4].map((w) => ganhaPerdePrice(w, 75));
check(full.every((p, i) => i === 0 || p > full[i - 1]), `ir até 75% encarece a cada acerto: ${full.map((p) => `R$ ${p}`).join(' → ')}`);

// ── fluxo com um jogador
const u = await mk({ money: 5000 });
let st = (await ganhaPerdeState(u.id)).state;
check(!st.finished && !st.started && st.base === 50 && st.options.length === 6 && st.options[5].chance === 75 && st.options[5].price === 750, 'abrir a tela não começa o jogo; opções 50…75%');
for (const bad of [undefined, 'abc', 45, 52, 80, 50.5]) {
  const e = await err(ganhaPerdeSpin(u.id, bad));
  check(e?.status === 400, `chance inválida (${bad}) recusada`);
}
check((await U(u.id)).money === 5000 && !(await prisma.dailyGame.findFirst({ where: { userId: u.id, game: 'GANHAPERDE', finishedAt: { not: null } } })), 'nada cobrado nem terminado pelas recusas');

// joga até perder (várias vezes, para ver acerto e erro), conferindo cobrança e recompensa
let sawWin = false, sawLoss = false, rounds = 0;
while ((!sawWin || !sawLoss) && rounds < 40) {
  rounds++;
  await resetDay(u.id);
  await prisma.user.update({ where: { id: u.id }, data: { money: 5000 } });
  let wins = 0;
  for (;;) {
    const before = await U(u.id);
    const goalsBefore = await prisma.goal.count({ where: { userId: u.id, kind: 'GANHAPERDE' } });
    const chance = Math.min(GANHAPERDE.max, ganhaPerdeBase(wins) + 10); // compra 2 degraus
    const price = ganhaPerdePrice(wins, chance);
    if (before.money < price) break;
    const r = await ganhaPerdeSpin(u.id, chance);
    const after = await U(u.id);
    const goalsAfter = await prisma.goal.count({ where: { userId: u.id, kind: 'GANHAPERDE' } });
    const inSector = r.win ? r.at >= 0 && r.at < chance : r.at >= chance && r.at < 100;
    if (!inSector) check(false, `seta fora da fatia: at=${r.at} chance=${chance} win=${r.win}`);
    if (after.money !== before.money - price) check(false, `cobrança errada: ${before.money} → ${after.money} (preço ${price})`);
    if (r.win) {
      wins++;
      if (!sawWin) {
        sawWin = true;
        check(goalsAfter === goalsBefore + 1 && after.goalsTotal === before.goalsTotal + 1 && after.levelBonus === before.levelBonus + 5 && r.goal?.text?.includes('GANHA'),
          `acerto com ${chance}% (pagou R$ ${price}): 1 gol GANHAPERDE, +1 no total e +5 de nível — "${r.goal?.text?.slice(0, 70)}…"`);
        check(!r.state.finished && r.state.base === ganhaPerdeBase(wins) && r.state.wins === wins && r.state.options[0].chance === r.state.base, `depois do acerto: segue jogando, base agora ${r.state.base}%`);
      }
    } else {
      if (!sawLoss) {
        sawLoss = true;
        check(r.state.finished && goalsAfter === goalsBefore && after.levelBonus === before.levelBonus && r.goal === null, `erro com ${chance}%: acabou o dia, sem gol nem nível`);
        check((await err(ganhaPerdeSpin(u.id, r.state.base)))?.status === 409, 'girar de novo depois de perder: recusado (409)');
        const row = await prisma.dailyGame.findFirst({ where: { userId: u.id, game: 'GANHAPERDE' } });
        check(!!row.finishedAt && row.reward?.goals === wins && row.reward?.spent === r.state.spent, `resultado guardado: ${wins} gols, gastou R$ ${r.state.spent}`);
      }
      break;
    }
  }
}
check(sawWin && sawLoss, `viu acerto e erro (${rounds} dias simulados)`);

// ── sem dinheiro: recusado sem cobrar e sem gastar a girada
await resetDay(u.id);
await prisma.user.update({ where: { id: u.id }, data: { money: 100 } });
const noMoney = await err(ganhaPerdeSpin(u.id, 60)); // R$ 150
check(noMoney?.status === 402 && (await U(u.id)).money === 100 && !(await prisma.dailyGame.findFirst({ where: { userId: u.id, game: 'GANHAPERDE', finishedAt: { not: null } } })), 'sem dinheiro para 60%: recusado (402), nada cobrado');

// ── dois toques ao mesmo tempo: cada girada cobra uma vez e o estado fica certo
await resetDay(u.id);
await prisma.user.update({ where: { id: u.id }, data: { money: 1000 } });
const both = await Promise.allSettled([ganhaPerdeSpin(u.id, 55), ganhaPerdeSpin(u.id, 55)]);
const ok = both.filter((x) => x.status === 'fulfilled').map((x) => x.value);
const row2 = await prisma.dailyGame.findFirst({ where: { userId: u.id, game: 'GANHAPERDE' } });
const m2 = (await U(u.id)).money;
check(row2.state.spins === ok.length && m2 === 1000 - row2.state.spent && ok.length >= 1, `dois toques juntos: ${ok.length} girada(s) valeram, cobrado R$ ${1000 - m2} = gasto registrado`);

// ── a tela desatualizada (viu outra quantidade de giradas): recusa em vez de cobrar outro preço
await resetDay(u.id);
await prisma.user.update({ where: { id: u.id }, data: { money: 1000 } });
const stale = await err(ganhaPerdeSpin(u.id, 55, 3));
check(stale?.status === 409 && stale.code === 'stale' && (await U(u.id)).money === 1000, 'girada com a tela desatualizada: recusada (409), nada cobrado');
const fresh = await ganhaPerdeSpin(u.id, 55, 0);
check(fresh.price === 50 && fresh.state.spins === 1, 'com a contagem certa (0): girou e cobrou R$ 50');

// ── nível travado
const low = await mk({ levelBonus: 0, money: 5000 });
check(levelOf(low).lvl < 9 && (await err(ganhaPerdeSpin(low.id, 50)))?.status === 403, 'abaixo do nível 9: recusado (403)');

// ── o sorteio: ~50% de graça e ~75% no máximo (milhares de giradas; cada uma num "dia" novo)
async function rate(chance, n) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    await resetDay(u.id);
    const r = await ganhaPerdeSpin(u.id, chance);
    if (r.win) w++;
    if (r.win ? !(r.at >= 0 && r.at < chance) : !(r.at >= chance && r.at < 100)) check(false, `seta fora da fatia (${chance}%): ${r.at}`);
  }
  return w / n;
}
await prisma.user.update({ where: { id: u.id }, data: { money: 10_000_000 } });
const r50 = await rate(50, 1500), r75 = await rate(75, 1500);
check(Math.abs(r50 - 0.5) < 0.04, `50% de graça: ganhou ${(r50 * 100).toFixed(1)}% em 1500`);
check(Math.abs(r75 - 0.75) < 0.04, `75% pago: ganhou ${(r75 * 100).toFixed(1)}% em 1500`);

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
