/**
 * Paredão (lib/paredao.js + services/paredao.js) no banco LOCAL: as bolas são sempre as mesmas para a
 * mesma semente, o SERVIDOR é quem conta as defesas (o cliente não), rastro impossível é recusado, 10
 * defesas seguidas valem 1 gol + dinheiro, cada defesa dá 3 de nível (até 30), o recorde fica guardado e
 * as defesas somam no placar do time na rodada. Cria jogadores tp…
 *
 * Uso (na pasta api/):  node scripts/test-paredao.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-paredao.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { paredaoState, paredaoStart, paredaoMore, paredaoEnd } = await import('../src/services/paredao.js');
const { PAREDAO: C, shot, shots, judge, traceProblem, reachAt } = await import('../src/lib/paredao.js');
const { MINIGAME_MONEY, levelOf } = await import('../src/lib/rules.js');
const { refreshLiveRound, liveRound } = await import('../src/services/league.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const team = await prisma.team.findFirst({ where: { slug: 'nautico' } }) ?? await prisma.team.findFirst();
let seq = 0;
const mk = (extra = {}) => { const n = `tp${Date.now() % 1e6}${seq++}`; return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, levelBonus: 400, ...extra } }); };
const U = (id) => prisma.user.findUnique({ where: { id } });
await refreshLiveRound();

/**
 * Monta o rastro de um goleiro que defende as `ate` primeiras bolas: ele anda até o alvo respeitando a
 * velocidade máxima, com amostras de 30 por segundo — é o que o celular manda de verdade.
 * `falhaNa` = a bola em que ele fica parado de propósito (para testar o gol).
 */
function rastro(seed, ate, falhaNa = null) {
  const pts = [[0, C.keeper.start]];
  const crossings = [];
  let t = 0, x = C.keeper.start;
  for (let i = 1; i <= ate; i++) {
    const s = shot(seed, i);
    const alvo = i === falhaNa ? (s.to.x > 0.5 ? 0.02 : 0.98) : s.to.x; // longe de propósito
    const chegada = t + s.T;
    const passos = Math.max(1, Math.round(s.T / 33));
    for (let k = 1; k <= passos; k++) {
      const tt = t + (s.T * k) / passos;
      const limite = (C.keeper.speed * (tt - pts.at(-1)[0])) / 1000;
      const alvoParcial = x + (alvo - x) * (k / passos);
      const passo = Math.max(-limite, Math.min(limite, alvoParcial - pts.at(-1)[1]));
      pts.push([Math.round(tt), pts.at(-1)[1] + passo]);
    }
    x = pts.at(-1)[1];
    crossings.push({ i, t: Math.round(chegada) });
    t = chegada + C.gap;
    pts.push([Math.round(t), x]);
  }
  return { trace: pts.map(([a, b]) => [a, Number(b.toFixed(4))]), crossings };
}

// ── as bolas
const s1 = shots('semente-fixa', 1, 5);
const s2 = shots('semente-fixa', 1, 5);
check(JSON.stringify(s1) === JSON.stringify(s2), 'a mesma semente devolve sempre as mesmas bolas (o servidor confere depois sem guardar nada)');
check(shots('outra', 1, 5)[0].to.x !== s1[0].to.x, 'sementes diferentes, bolas diferentes');
check(s1[0].T === C.flight.first && shot('x', 40).T < shot('x', 5).T, `a bola acelera: ${shot('x', 1).T} ms na 1ª, ${shot('x', 20).T} ms na 20ª, ${shot('x', 40).T} ms na 40ª`);
check(shot('x', 3).curve === 0 && shot('x', 20).curve !== 0, `a curva só aparece da ${C.curveFrom}ª bola em diante`);
check(reachAt(0.3) > reachAt(0.9), `bola no alto é mais difícil: alcance ${(reachAt(0.3) * 100).toFixed(1)}% do gol embaixo e ${(reachAt(0.9) * 100).toFixed(1)}% em cima`);

// ── o servidor é quem conta
const r12 = rastro('sem-1', 12);
check(judge('sem-1', r12.trace, r12.crossings).saves === 12, 'goleiro que chega no alvo: 12 defesas');
const r5 = rastro('sem-1', 12, 6); // ficou parado na 6ª
const j5 = judge('sem-1', r5.trace, r5.crossings);
check(j5.saves === 5 && j5.goalAt === 6, `errou a 6ª: o servidor conta ${j5.saves} defesas e o gol na bola ${j5.goalAt}`);
const mentira = judge('sem-1', r5.trace, r5.crossings.map((c) => ({ ...c, t: c.t })));
check(mentira.saves === 5, 'o cliente não consegue dizer que defendeu: a conta sai do rastro do dedo');

// ── rastro impossível é recusado
check(traceProblem([[0, 0.5], [30, 0.95]]) === 'goleiro rápido demais', 'teletransporte é recusado');
check(traceProblem([[0, 0.5], [30, 2]]) === 'goleiro fora do gol', 'goleiro fora do gol é recusado');
check(traceProblem([[100, 0.5], [50, 0.5]]) === 'tempo andando para trás', 'relógio de trás para frente é recusado');
check(traceProblem(r12.trace) === null, 'o rastro de uma partida de verdade passa');

// ── partida inteira pelo serviço
const u = await mk();
const st0 = await paredaoState(u.id);
check(st0.state.playing === false && st0.state.best === 0, 'abrir a tela não começa a partida');
const ini = await paredaoStart(u.id);
check(ini.shots.length === C.batch && ini.state.playing, `começou: o servidor mandou ${ini.shots.length} bolas de uma vez (nenhuma ida ao servidor durante a partida)`);
const mais = await paredaoMore(u.id, C.batch + 1);
check(mais.shots[0].i === C.batch + 1, 'quem vai longe pede mais bolas antes de acabar o lote');

const seed = (await prisma.dailyGame.findFirst({ where: { userId: u.id, game: 'PAREDAO' } })).state.seed;
const partida = rastro(seed, 12, 13);
const fim = await paredaoEnd(u.id, partida);
check(fim.saves === 12, `fim de jogo: ${fim.saves} defesas`);
check(!!fim.goal, `passou das ${C.goalTarget} defesas e marcou o gol do dia: "${fim.goal?.text?.slice(0, 60)}…"`);
check(fim.levelPoints === Math.min(C.maxPoints, 12 * C.pointsPerSave), `XP: ${fim.levelPoints} (3 por defesa, teto ${C.maxPoints})`);
check(fim.record && fim.best === 12, 'bateu o recorde (era 0) — é o que acende a faixa NOVA MAIOR PONTUAÇÃO');
const me = await U(u.id);
check(me.money === MINIGAME_MONEY.PAREDAO, `dinheiro do minigame: R$ ${me.money.toLocaleString('pt-BR')}`);
check(me.paredaoBest === 12, 'o recorde ficou guardado no jogador');
check((await prisma.goal.count({ where: { userId: u.id, kind: 'PAREDAO' } })) === 1, 'exatamente 1 gol (a regra da casa)');

// ── uma partida por dia
const e2 = await err(paredaoEnd(u.id, partida));
check(e2?.status === 409, `mandar o rastro de novo é recusado: "${e2?.message}"`);
// com MINIGAMES_LIVRES=1 no .env local dá para jogar de novo (nunca em produção): o teste respeita isso
const livre = process.env.MINIGAMES_LIVRES === '1';
const e3 = await err(paredaoStart(u.id));
check(livre ? !e3 : e3?.status === 409 && e3?.code === 'finished',
  livre ? 'MINIGAMES_LIVRES=1 no .env local: dá para recomeçar (em produção seria recusado)' : `e o dia acabou: "${e3?.message}"`);

// ── placar do time na rodada
const round = liveRound();
if (round?.roundId) {
  const linha = await prisma.paredaoTeam.findUnique({ where: { roundId_teamId: { roundId: round.roundId, teamId: team.id } } });
  check(linha?.saves >= 12, `as 12 defesas entraram no placar do ${team.name} na rodada (${linha?.saves} no total)`);
  const st = await paredaoState(u.id);
  check(st.scoreboard?.mine?.saves >= 12, 'a tela recebe o placar do meu time contra o adversário da rodada');
} else check(true, '(sem rodada ao vivo no banco local: placar do time não conferido)');

// ── quem não chega às 10 não ganha gol
const u2 = await mk();
await paredaoStart(u2.id);
const seed2 = (await prisma.dailyGame.findFirst({ where: { userId: u2.id, game: 'PAREDAO' } })).state.seed;
const curta = rastro(seed2, 4, 5);
const fim2 = await paredaoEnd(u2.id, curta);
check(fim2.saves === 4 && !fim2.goal, `4 defesas: sem gol (a meta é ${C.goalTarget})`);
check((await U(u2.id)).money === 0 && (await U(u2.id)).paredaoBest === 4, 'sem dinheiro, mas o recorde de 4 ficou');
check(fim2.levelPoints === 12, `e ainda assim levou ${fim2.levelPoints} de nível pelas defesas`);

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
