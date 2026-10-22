/**
 * Galeria de troféus (services/gallery.js) no banco LOCAL: cria duas temporadas fechadas de mentira (números 9001 e
 * 9002, com campeões, vices, top da artilharia, Ranking X1, recordes e rodadas fechadas), confere o que a galeria
 * devolve e apaga tudo no fim. `--manter` deixa as temporadas no banco (para olhar a tela); `--limpar` só apaga.
 *
 * Uso (na pasta api/):  node scripts/test-galeria.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-galeria.js só roda no banco LOCAL (cria temporadas de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { gallery } = await import('../src/services/gallery.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const NUMS = [9001, 9002];

async function limpar() {
  const ids = (await prisma.season.findMany({ where: { number: { in: NUMS } }, select: { id: true } })).map((s) => s.id);
  if (!ids.length) return 0;
  await prisma.$transaction([
    prisma.title.deleteMany({ where: { seasonId: { in: ids } } }),
    prisma.record.deleteMany({ where: { seasonId: { in: ids } } }),
    prisma.round.deleteMany({ where: { seasonId: { in: ids } } }),
    prisma.season.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return ids.length;
}

await limpar(); // sobra de uma rodada anterior com --manter
if (process.argv.includes('--limpar')) { console.log('temporadas de teste apagadas'); await prisma.$disconnect(); process.exit(0); }

// ── as temporadas de mentira, com jogadores e times de verdade do banco local
const users = await prisma.user.findMany({ where: { isBot: false, deletedAt: null, nick: { not: { startsWith: 'excluido-' } } }, orderBy: [{ goalsTotal: 'desc' }], take: 4, include: { team: true } });
const teams = await prisma.team.findMany({ orderBy: { id: 'asc' }, take: 6 });
if (users.length < 4 || teams.length < 6) { console.error('o banco local precisa de 4 jogadores e 6 times'); process.exit(1); }
const [u0, u1, u2, u3] = users;
const [T0, T1, T2, T3, T4, T5] = teams;
const linha = (u, goals, position) => ({ position, userId: u.id, nick: u.nick, avatarUrl: u.avatarUrl ?? null, nickColor: u.nickColor ?? null, nickFade: null, goals, vip: false, team: { slug: u.team.slug, name: u.team.name, abbr: u.team.abbr, colorPrimary: u.team.colorPrimary, colorSecondary: u.team.colorSecondary } });
const x1Linha = (u, position, points, wins, draws, losses) => ({ position, userId: u.id, nick: u.nick, teamId: u.teamId, wins, draws, losses, played: wins + draws + losses, points, streak: 0, best: 7, eligible: true });
const dia = 86_400_000;
const agora = Date.now();

const s1 = await prisma.season.create({ data: {
  number: 9001, status: 'FINISHED', totalRounds: 30, startsAt: new Date(agora - 60 * dia), endsAt: new Date(agora - 30 * dia),
  topJson: [linha(u0, 3200, 1), linha(u1, 2900, 2), linha(u2, 2100, 3), linha(u3, 900, 4)],
  x1Json: null, // temporada de antes do X1: a galeria mostra sem o pódio do X1
} });
const s2 = await prisma.season.create({ data: {
  number: 9002, status: 'FINISHED', totalRounds: 30, startsAt: new Date(agora - 30 * dia), endsAt: new Date(agora - 1 * dia),
  topJson: [linha(u1, 3500, 1), linha(u0, 3100, 2), linha(u3, 1800, 3)],
  x1Json: { from: null, to: null, rows: [x1Linha(u2, 1, 105, 40, 5, 10), x1Linha(u3, 2, 88, 33, 9, 11), x1Linha(u0, 3, 70, 26, 8, 6)], paid: [{ userId: u2.id, nick: u2.nick, position: 1, money: 50000, vip: 10 }, { userId: u3.id, nick: u3.nick, position: 2, money: 30000, vip: 5 }, { userId: u0.id, nick: u0.nick, position: 3, money: 10000, vip: 0 }] },
} });
const titulo = (season, team, competition, place) => ({ seasonId: season.id, teamId: team.id, competition, place });
await prisma.title.createMany({ data: [
  titulo(s1, T0, 'Série A', 1), titulo(s1, T1, 'Série A', 2), titulo(s1, T2, 'Série B', 1), titulo(s1, T3, 'Série B', 2), titulo(s1, T4, 'Série C', 1), titulo(s1, T5, 'Série C', 2),
  titulo(s2, T0, 'Série A', 1), titulo(s2, T2, 'Série A', 2), titulo(s2, T1, 'Série B', 1), titulo(s2, T5, 'Série B', 2), titulo(s2, T3, 'Série C', 1), titulo(s2, T4, 'Série C', 2),
] });
await prisma.record.createMany({ data: [
  { scope: 'HOUR', seasonId: s1.id, userId: u2.id, goals: 58 }, { scope: 'ROUND', seasonId: s1.id, userId: u0.id, goals: 420 }, { scope: 'SEASON', seasonId: s1.id, userId: u0.id, goals: 3200 },
  { scope: 'HOUR', seasonId: s2.id, userId: u1.id, goals: 61 }, { scope: 'ROUND', seasonId: s2.id, userId: u3.id, goals: 390 }, { scope: 'SEASON', seasonId: s2.id, userId: u1.id, goals: 3500 },
] });
const rodada = (season, number, top) => ({ seasonId: season.id, number, status: 'FINISHED', startsAt: new Date(agora - (40 - number) * dia), endsAt: new Date(agora - (39 - number) * dia), topJson: top });
await prisma.round.createMany({ data: [
  rodada(s1, 1, [linha(u2, 200, 1)]), rodada(s1, 2, [linha(u0, 250, 1)]),
  rodada(s2, 1, [linha(u0, 410, 1), linha(u1, 300, 2)]), rodada(s2, 2, [linha(u1, 380, 1)]), rodada(s2, 3, [linha(u0, 300, 1)]), rodada(s2, 4, []),
] });

// ── o que a galeria devolve
const g = await gallery();
const g1 = g.seasons.find((s) => s.number === 9001);
const g2 = g.seasons.find((s) => s.number === 9002);
check(g.seasons.findIndex((s) => s.number === 9002) < g.seasons.findIndex((s) => s.number === 9001), 'temporadas da mais nova para a mais antiga');
check(g2.titles.map((t) => t.competition).join(',') === 'Série A,Série B,Série C', 'campeões na ordem A, B, C');
check(g2.titles[0].champion.slug === T0.slug && g2.titles[0].vice.slug === T2.slug && g2.titles[2].champion.slug === T3.slug, `T9002: Série A ${g2.titles[0].champion.name} (vice ${g2.titles[0].vice.name}), Série C ${g2.titles[2].champion.name}`);
check(g2.scorers.length === 3 && g2.scorers.map((r) => r.position).join() === '1,2,3' && g2.scorers[0].nick === u1.nick && g2.scorers[0].goals === 3500, `artilharia da T9002: ${g2.scorers.map((r) => `${r.nick} ${r.goals}`).join(' · ')}`);
check(g1.scorers.length === 3, 'o top congelado tem 4, o pódio mostra 3');
check(g2.x1.length === 3 && g2.x1[0].nick === u2.nick && g2.x1[0].goals === 105 && g2.x1[0].team?.slug === u2.team.slug && g2.x1[0].fp?.wins === 40, `Ranking X1 da T9002: ${g2.x1.map((r) => `${r.nick} ${r.goals} pts`).join(' · ')}`);
check(Array.isArray(g1.x1) && g1.x1.length === 0, 'temporada sem Ranking X1 fechado: pódio do X1 vazio, sem erro');

const todos = await prisma.record.findMany();
for (const scope of ['HOUR', 'ROUND', 'SEASON']) {
  const maior = Math.max(...todos.filter((r) => r.scope === scope).map((r) => r.goals));
  const r = g.records.find((x) => x.scope === scope);
  check(r && r.goals === maior, `recorde de todos os tempos (${scope}): ${r?.goals} gols, ${r?.nick}${r?.season ? `, T${r.season}` : ''}`);
}
check(g.records.find((x) => x.scope === 'SEASON')?.season === 9002 || g.records.find((x) => x.scope === 'SEASON').goals > 3500, 'o recorde diz de qual temporada é');

const t0 = g.hall.find((h) => h.team.slug === T0.slug);
check(g.hall[0].team.slug === T0.slug && t0.champion === 2 && t0.titles[0]?.competition === 'Série A' && t0.titles[0]?.count === 2, `maiores campeões: ${g.hall.slice(0, 3).map((h) => `${h.team.name} ${h.champion}x`).join(' · ')}`);
check(g.hall.every((h, i) => i === 0 || h.champion <= g.hall[i - 1].champion), 'ordem: quem tem mais títulos primeiro');
const t1 = g.hall.find((h) => h.team.slug === T1.slug);
check(t1.champion === 1 && t1.vice === 1, `${T1.name}: 1 título (Série B) e 1 vice`);

const k0 = g.kings.find((k) => k.userId === u0.id);
check(k0 && k0.goals >= 3, `${u0.nick} foi artilheiro de ${k0?.goals} rodadas (3 nas temporadas de teste)`);
check(g.kings.every((k, i) => i === 0 || k.goals <= g.kings[i - 1].goals) && g.kings.length <= 5, 'mais vezes artilheiro da rodada: top 5, em ordem');
const ativa = await prisma.season.findFirst({ where: { status: 'ACTIVE' }, orderBy: { number: 'desc' } });
check(!ativa || (g.current?.number === ativa.number && g.current.kings.every((k, i) => i === 0 || k.round < g.current.kings[i - 1].round)), `temporada em andamento: T${g.current?.number}, rodada ${g.current?.round}, ${g.current?.kings.length} artilheiros de rodada (a mais recente primeiro)`);
check(!g.current || g.current.kings.every((k) => k.goals > 0 && k.nick), 'rodada sem gol não entra na lista de artilheiros');

if (process.argv.includes('--manter')) console.log('\n(--manter: as temporadas 9001 e 9002 ficaram no banco; apague com --limpar)');
else await limpar();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
