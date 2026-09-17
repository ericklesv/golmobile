/**
 * Goleada (lib/goleada.js + services/goleada.js) no banco LOCAL: os goleiros são sempre os mesmos para a
 * mesma semente, o SERVIDOR é quem conta os gols (o cliente não), bola na trave/por cima é fora, 10 gols
 * seguidos valem 1 gol + dinheiro, cada gol dá 3 de nível (até 30), o recorde fica guardado e os gols
 * somam no placar do time na rodada. Cria jogadores tg…
 *
 * Uso (na pasta api/):  node scripts/test-goleada.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-goleada.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { goleadaState, goleadaStart, goleadaMore, goleadaEnd } = await import('../src/services/goleada.js');
const { GOLEADA: C, keeperOf, keepers, shoot, judge, flightOf } = await import('../src/lib/goleada.js');
const { MINIGAME_MONEY } = await import('../src/lib/rules.js');
const { refreshLiveRound, liveRound } = await import('../src/services/league.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const team = await prisma.team.findFirst({ where: { slug: 'nautico' } }) ?? await prisma.team.findFirst();
let seq = 0;
const mk = (extra = {}) => { const n = `tg${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, levelBonus: 400, ...extra } }); };
const U = (id) => prisma.user.findUnique({ where: { id } });
await refreshLiveRound();

/** Mira no meio do vão que sobra (é o que um jogador bom faz): do lado contrário ao pulo do goleiro. */
function mirar(seed, i, forca = 0.95) {
  const k = keeperOf(seed, i);
  const lado = k.lean !== 0 ? -k.lean : -1;
  const T = flightOf(forca);
  const anda = (k.speed * Math.max(0, T - k.react)) / 1000;
  const partida = 0.5 + k.lean * C.keeper.leanHelp * 0.5;
  const borda = lado < 0 ? partida - anda - C.keeper.reach : partida + anda + C.keeper.reach;
  const trave = lado < 0 ? C.aim.margin : 1 - C.aim.margin;
  return { i, x: Number(((borda + trave) / 2).toFixed(4)), y: 0.3, power: forca };
}
const serie = (seed, ate, erraNa = null) => Array.from({ length: ate }, (_, k) => {
  const i = k + 1;
  return i === erraNa ? { i, x: 0.5, y: 0.3, power: 0.3 } : mirar(seed, i); // no meio e fraco = o goleiro pega
});

// ── os goleiros
const k1 = keepers('fixa', 1, 5), k2 = keepers('fixa', 1, 5);
check(JSON.stringify(k1) === JSON.stringify(k2), 'a mesma semente devolve sempre os mesmos goleiros (o servidor reconfere sem guardar nada)');
check(keeperOf('fixa', 1).react > keeperOf('fixa', 20).react && keeperOf('fixa', 20).speed > keeperOf('fixa', 1).speed,
  `o goleiro melhora: reage em ${keeperOf('fixa', 1).react} ms e corre ${keeperOf('fixa', 1).speed.toFixed(2)} na 1ª; ${keeperOf('fixa', 20).react} ms e ${keeperOf('fixa', 20).speed.toFixed(2)} na 20ª`);
check([1, 2, 3].every((i) => keeperOf('fixa', i).lean === 0), 'nas 3 primeiras ele espera parado (o jogo ensina antes de cobrar)');
check(flightOf(1) === C.shot.fast && flightOf(0) === C.shot.slow, `chute forte chega em ${flightOf(1)} ms e o fraco em ${flightOf(0)} ms`);

// ── o que é gol, o que é defesa e o que é fora
check(shoot('fixa', 1, { x: 0.02, y: 0.3, power: 1 }).why === 'fora', 'rente à trave é fora');
check(shoot('fixa', 1, { x: 0.5, y: 0.99, power: 1 }).why === 'fora', 'por cima do travessão é fora');
check(shoot('fixa', 1, { x: 0.5, y: 0.3, power: 0.2 }).why === 'defendeu', 'no meio e sem força o goleiro pega');
check(shoot('fixa', 1, mirar('fixa', 1)).goal, 'no cantinho, com força, é gol');
const comLean = [...Array(40)].map((_, i) => keeperOf('fixa', i + 1)).find((k) => k.lean !== 0);
const contra = shoot('fixa', comLean.i, { x: comLean.lean < 0 ? 0.8 : 0.2, y: 0.3, power: 0.95 });
const junto = shoot('fixa', comLean.i, { x: comLean.lean < 0 ? 0.2 : 0.8, y: 0.3, power: 0.95 });
check(contra.goal && !junto.goal, `o pulo do goleiro decide: no canto contrário é gol, no canto em que ele caiu é defesa (bola ${comLean.i})`);

// ── o servidor é quem conta
const j = judge('fixa', serie('fixa', 12));
check(j.goals === 12, `12 chutes bem mirados: ${j.goals} gols`);
const j2 = judge('fixa', serie('fixa', 12, 5));
check(j2.goals === 4 && j2.stoppedAt === 5, `errou o 5º: o servidor conta ${j2.goals} gols e para na bola ${j2.stoppedAt}`);
check(judge('fixa', [{ i: 2, x: 0.1, y: 0.3, power: 1 }]).goals === 0, 'chute fora de ordem não conta');
check(judge('fixa', [{ i: 1, x: 'x', y: null, power: 1 }]).goals === 0, 'chute inválido não conta');

// ── partida inteira pelo serviço
const u = await mk();
const st0 = await goleadaState(u.id);
check(!st0.state.playing && st0.state.best === 0, 'abrir a tela não começa a série');
const ini = await goleadaStart(u.id);
check(ini.keepers.length === C.batch && ini.state.playing, `começou: ${ini.keepers.length} goleiros de uma vez (nenhuma ida ao servidor durante a série)`);
check((await goleadaMore(u.id, C.batch + 1)).keepers[0].i === C.batch + 1, 'quem vai longe pede mais goleiros antes de acabar o lote');

const seed = (await prisma.dailyGame.findFirst({ where: { userId: u.id, game: 'GOLEADA' } })).state.seed;
const fim = await goleadaEnd(u.id, { shots: serie(seed, 12, 13) });
check(fim.goals === 12, `fim de série: ${fim.goals} gols`);
check(!!fim.goal, `passou dos ${C.goalTarget} e marcou o gol do dia: "${fim.goal?.text?.slice(0, 60)}…"`);
check(fim.levelPoints === C.maxPoints, `XP: ${fim.levelPoints} (3 por gol, teto ${C.maxPoints})`);
check(fim.record && fim.best === 12, 'bateu o recorde (era 0) — é o que acende a faixa NOVA MAIOR PONTUAÇÃO');
const me = await U(u.id);
check(me.money === MINIGAME_MONEY.GOLEADA, `dinheiro do minigame: R$ ${me.money.toLocaleString('pt-BR')}`);
check(me.goleadaBest === 12, 'o recorde ficou guardado no jogador');
check((await prisma.goal.count({ where: { userId: u.id, kind: 'GOLEADA' } })) === 1, 'exatamente 1 gol (a regra da casa)');

const e2 = await err(goleadaEnd(u.id, { shots: serie(seed, 12) }));
check(e2?.status === 409, `mandar os chutes de novo é recusado: "${e2?.message}"`);

// ── placar do time na rodada
const round = liveRound();
if (round?.roundId) {
  const linha = await prisma.goleadaTeam.findUnique({ where: { roundId_teamId: { roundId: round.roundId, teamId: team.id } } });
  check(linha?.goals >= 12, `os 12 gols entraram no placar do ${team.name} na rodada (${linha?.goals} no total)`);
  check((await goleadaState(u.id)).scoreboard?.mine?.goals >= 12, 'a tela recebe o placar do meu time contra o adversário da rodada');
} else check(true, '(sem rodada ao vivo no banco local: placar do time não conferido)');

// ── quem não chega aos 10 não ganha gol
const u2 = await mk();
await goleadaStart(u2.id);
const seed2 = (await prisma.dailyGame.findFirst({ where: { userId: u2.id, game: 'GOLEADA' } })).state.seed;
const fim2 = await goleadaEnd(u2.id, { shots: serie(seed2, 4, 5) });
check(fim2.goals === 4 && !fim2.goal, `4 gols: sem gol do dia (a meta é ${C.goalTarget})`);
check((await U(u2.id)).money === 0 && (await U(u2.id)).goleadaBest === 4, 'sem dinheiro, mas o recorde de 4 ficou');
check(fim2.levelPoints === 12, `e ainda assim levou ${fim2.levelPoints} de nível pelos gols`);

const ids = [u.id, u2.id];
await prisma.$transaction([
  prisma.goal.deleteMany({ where: { userId: { in: ids } } }),
  prisma.activity.deleteMany({ where: { userId: { in: ids } } }),
  prisma.dailyGame.deleteMany({ where: { userId: { in: ids } } }),
  prisma.user.deleteMany({ where: { id: { in: ids } } }),
]);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
