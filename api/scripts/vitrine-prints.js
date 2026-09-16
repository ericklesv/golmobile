/**
 * Mundo de VITRINE para as fotos de divulgação (pedido do dono, 16/09/2026) — SÓ NO BANCO LOCAL.
 *
 * As telas do jogo só fazem sentido com o jogo cheio: ranking com gente, tabela com gols, perfil com
 * nível e habilidades. Este script prepara isso no PC — nicks inventados (nenhum jogador de verdade
 * entra nas fotos), gols plausíveis e uma conta principal (senha teste123) para tirar as telas.
 *
 * Uso (pasta api/):  node scripts/vitrine-prints.js
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('vitrine-prints.js só roda no banco LOCAL.');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const { hourKey } = await import('../src/lib/time.js');
const bcrypt = (await import('bcryptjs')).default;

const HERO = { nick: 'Rafa10', team: 'flamengo' };
// nicks inventados para a vitrine (nenhum é de jogador real), com o time e os gols da temporada
const ELENCO = [
  ['GabiGol_09', 'flamengo', 812], ['Zeca77', 'corinthians', 795], ['MineiroBH', 'cruzeiro', 744],
  ['TricoloRR', 'sao-paulo', 701], ['VascaoDaGema', 'vasco-da-gama', 688], ['Juninho_PE', 'sport-recife', 640],
  ['ArtilheiroBA', 'bahia', 612], ['Gauchinho', 'gremio', 588], ['ColoradoRS', 'internacional', 561],
  ['PaulistaSP', 'palmeiras', 540], ['CearaMor', 'ceara', 522], ['NauticoNet', 'nautico', 498],
  ['FortalGOL', 'fortaleza', 470], ['MengoRJ', 'flamengo', 455], ['TimaoZL', 'corinthians', 431],
  ['CanarinhoGO', 'goias', 402], ['Peixe13', 'santos', 388], ['CoxaPR', 'coritiba', 355],
];

const teams = new Map((await prisma.team.findMany()).map((t) => [t.slug, t]));
const round = await prisma.round.findFirst({ where: { status: 'LIVE' }, orderBy: { id: 'desc' }, include: { season: true } })
  ?? await prisma.round.findFirst({ orderBy: { id: 'desc' }, include: { season: true } });
const hk = hourKey();
const senha = await bcrypt.hash('teste123', 10);
const dia = 86_400_000;
let usados = 0;

/** Cria (ou atualiza) um jogador da vitrine com números plausíveis. */
async function vitrine(nick, slug, gols, extra = {}) {
  const team = teams.get(slug) ?? teams.get('flamengo') ?? [...teams.values()][0];
  const nickLower = nick.toLowerCase();
  const base = {
    nick, nickLower, teamId: team.id, passwordHash: senha, gender: 'M',
    goalsTotal: gols * 3 + 120, goalsSeason: gols, goalsRound: Math.round(gols * 0.14), goalsHour: Math.max(1, Math.round(gols * 0.012)),
    seasonId: round?.seasonId ?? null, roundId: round?.id ?? null, hourKey: hk,
    autoGoals: Math.round(gols * 1.4), penaltyGoals: Math.round(gols * 0.7), penaltyTries: Math.round(gols * 1.1),
    foulGoals: Math.round(gols * 0.5), foulTries: Math.round(gols * 1.0),
    trailGoals: Math.round(gols * 0.3), trailTries: Math.round(gols * 1.4),
    lastSeenAt: new Date(Date.now() - Math.round(Math.random() * 20) * 60_000),
    ...extra,
  };
  const u = await prisma.user.upsert({
    where: { nickLower }, create: { ...base, email: `${nickLower}@vitrine.local` }, update: base,
  });
  usados++;
  return u;
}

// ── a conta das fotos: nível alto, habilidades subidas, VIP ativo e dinheiro no bolso
const hero = await vitrine(HERO.nick, HERO.team, 430, {
  levelBonus: 520, skillAim: 6, skillShot: 4, skillPoints: 5,
  money: 148_500, vipDays: 3, vipUntil: new Date(Date.now() + 2 * dia),
  bio: 'Rubro-negro desde sempre. Bati 200 pênaltis pra chegar aqui.',
  goalsHour: 7, goalsRound: 61,
});
for (const [nick, slug, gols] of ELENCO) await vitrine(nick, slug, gols);

// ── tabela com cara de temporada rolando (só a Série A, que é a que aparece nas fotos)
if (round) {
  const serieA = await prisma.standing.findMany({ where: { seasonId: round.seasonId, serie: 'A' }, include: { team: true } });
  const gols = [954, 851, 806, 744, 701, 688, 640, 612, 588, 561, 540, 522, 498, 470, 455, 431, 402, 388, 355, 340];
  let i = 0;
  for (const s of serieA.sort((a, b) => (b.goalsFor - a.goalsFor) || a.teamId - b.teamId)) {
    const g = gols[i] ?? 300 - i * 5;
    const pontos = Math.max(3, 12 - Math.floor(i * 0.6));
    await prisma.standing.update({ where: { id: s.id }, data: { points: pontos, played: 4, wins: Math.floor(pontos / 3), draws: pontos % 3, losses: Math.max(0, 4 - Math.floor(pontos / 3) - (pontos % 3)), goalsFor: g, goalsAgainst: Math.round(g * 0.75) } });
    i++;
  }
  console.log(`tabela da Série A com ${i} times`);
}

console.log(`vitrine pronta: ${usados} jogadores (conta principal: ${HERO.nick} / teste123), rodada ${round?.number ?? '?'} da temporada ${round?.season?.number ?? '?'}`);
await prisma.$disconnect();
