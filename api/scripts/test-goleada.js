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
const { goleadaState, goleadaStart, goleadaEnd } = await import('../src/services/goleada.js');
const { GOLEADA: C, keeperAt, shoot, judge, phaseOf, flightAt, tempoDeVoo, reactAt, diveAt, periodAt } = await import('../src/lib/goleada.js');
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

/** Acha um instante bom para chutar (goleiro longe de um canto) e devolve o toque. */
function toque(seed, i, t0) {
  let melhor = t0, nota = -1, lado = 1;
  for (let d = 0; d <= 1800; d += 30) {
    const gk = keeperAt(seed, t0 + d + reactAt(t0 + d));
    const dist = Math.abs(gk - 0.5);
    if (dist > nota) { nota = dist; melhor = t0 + d; lado = gk > 0.5 ? -1 : 1; }
  }
  const gk = keeperAt(seed, melhor + reactAt(melhor));
  const anda = (diveAt(melhor) * Math.max(0, tempoDeVoo(0.9, melhor) - reactAt(melhor))) / 1000;
  const borda = lado < 0 ? gk - anda - C.keeper.reach : gk + anda + C.keeper.reach;
  const trave = lado < 0 ? C.aim.margin : 1 - C.aim.margin;
  return { i, x: Number(((borda + trave) / 2).toFixed(4)), y: 0.3, power: 0.9, spin: 0, t: Math.round(melhor) };
}
/** Uma série de `ate` toques bons; `erraNa` manda no meio do gol (o goleiro pega). */
function serie(seed, ate, erraNa = null) {
  const out = [];
  let t = 400;
  for (let i = 1; i <= ate; i++) {
    const s = i === erraNa ? { i, x: 0.5, y: 0.3, power: 0.9, spin: 0, t: Math.round(t) } : toque(seed, i, t);
    out.push(s);
    t = s.t + tempoDeVoo(s.power, s.t) + C.gap + 20;
  }
  return out;
}

// ── a ronda do goleiro
check(Math.abs(keeperAt('a', 0) - keeperAt('b', 0)) > 1e-6, 'cada partida começa com o goleiro num pé diferente (fase sorteada)');
const pontos = [0, 200, 400, 600, 800, 1000, 1400, 1800].map((t) => keeperAt('fixa', t));
check(Math.max(...pontos) - Math.min(...pontos) > 0.3, `ele não fica parado: em 2 s varre ${(Math.max(...pontos) - Math.min(...pontos)).toFixed(2)} da largura do gol`);
check(periodAt(0) > periodAt(60_000) && reactAt(0) > reactAt(60_000) && diveAt(0) < diveAt(60_000),
  `aperta com o relógio: ronda de ${(periodAt(0) / 1000).toFixed(1)}s → ${(periodAt(60_000) / 1000).toFixed(1)}s, reação ${Math.round(reactAt(0))} → ${Math.round(reactAt(60_000))} ms, mergulho ${diveAt(0).toFixed(2)} → ${diveAt(60_000).toFixed(2)}`);
check(flightAt(0) > flightAt(100_000), `e a bola vai mais rápido: ${flightAt(0)} ms no começo, ${flightAt(100_000)} ms no fim`);

// ── o que é gol, defesa e fora
check(shoot('fixa', { x: 0.02, y: 0.3 }, 1000).why === 'fora', 'rente à trave é fora');
check(shoot('fixa', { x: 0.5, y: 0.99 }, 1000).why === 'fora', 'por cima do travessão é fora');
const noGoleiro = keeperAt('fixa', 1000 + reactAt(1000));
check(shoot('fixa', { x: noGoleiro, y: 0.3 }, 1000).why === 'defendeu', 'em cima do goleiro ele pega');
check(shoot('fixa', toque('fixa', 1, 400), toque('fixa', 1, 400).t).goal, 'no canto vazio, na hora certa, é gol');
// esperar demais custa: no mesmo lugar, mais tarde, ele alcança
const cedo = toque('fixa', 1, 400);
check(!shoot('fixa', { x: cedo.x, y: cedo.y }, 150_000).goal, 'o MESMO chute, 2 minutos depois, o goleiro alcança (é o relógio apertando)');

// ── o servidor é quem conta
check(judge('fixa', serie('fixa', 12)).goals === 12, '12 toques bons: 12 gols');
const j2 = judge('fixa', serie('fixa', 12, 5));
check(j2.goals === 4 && j2.stoppedAt === 5, `errou o 5º: o servidor conta ${j2.goals} gols e para na bola ${j2.stoppedAt}`);
check(judge('fixa', [{ i: 2, x: 0.1, y: 0.3, t: 500 }]).goals === 0, 'chute fora de ordem não conta');
check(judge('fixa', [{ i: 1, x: 0.1, y: 0.3, t: 500 }, { i: 2, x: 0.1, y: 0.3, t: 520 }]).goals <= 1, 'dois chutes colados (a bola nem voltou) não contam');

// ── partida inteira pelo serviço
const u = await mk();
const st0 = await goleadaState(u.id);
check(!st0.state.playing && st0.state.best === 0, 'abrir a tela não começa a série');
const ini = await goleadaStart(u.id);
check(ini.state.playing && typeof ini.state.phase === 'number', 'começou: o servidor manda só a fase da ronda (nenhuma ida ao servidor durante a série)');

const seed = (await prisma.dailyGame.findFirst({ where: { userId: u.id, game: 'GOLEADA' } })).state.seed;
const fim = await goleadaEnd(u.id, { shots: serie(seed, 12) });
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
