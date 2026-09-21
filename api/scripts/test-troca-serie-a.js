/**
 * Troca automática na Série A (SERIE_A_SWAP em rules.js; dono, 15/09/2026: "nenhum jogo da Série A sem gols") pelo
 * código REAL (league.js + applyResult), num schema separado do banco LOCAL (`troca_sim`, criado e apagado aqui — os
 * dados do `public` não são tocados). Cenários:
 *   R1: 1 time da A sem gol; fora da A, candidatos com 60 (B), 55 (C) e minGoals−1 (B) → só o de 60 sobe, o da A vai
 *       para a B; a rodada 2 já sai com as séries novas; pontos e gols vão junto; mensagem só para quem trocou.
 *   R2: 2 times da A sem gol e 1 candidato só (o de 55, da C) → sobe no lugar do PIOR da tabela; o outro fica; como
 *       veio da C, desce para a C o time da B com menos gols — nunca o que acabou de cair da A (0 gols).
 *   R3: todos da A marcaram → ninguém troca, mesmo com candidato de 60.
 *   R4: gol de BOT não conta (dono, 21/09/2026): time da A só com gol de bot cai; time de fora com 60 gols de bot NÃO sobe.
 *   R5–R29: rodadas sem gol nenhum (nenhum candidato) → nada muda.
 *   R30 (última): time da A sem gol + candidato de 60 → NÃO troca (a temporada fecha com o sobe-e-desce normal).
 * Em toda rodada: Team.serie = Standing.serie, 16 por série, cada time 1 jogo e na série dele, tabela = soma das partidas.
 *
 * Uso (na pasta api/):  node scripts/test-troca-serie-a.js   → "TUDO OK". Recusa rodar fora do localhost.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = process.env.DATABASE_URL || '';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(base)) {
  console.error('RECUSADO: o teste só roda no banco LOCAL (DATABASE_URL com localhost).');
  process.exit(1);
}
process.env.DATABASE_URL = /[?&]schema=/.test(base)
  ? base.replace(/([?&])schema=[^&]*/, '$1schema=troca_sim')
  : `${base}${base.includes('?') ? '&' : '?'}schema=troca_sim`;
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const { prisma } = await import('../src/prisma.js');
await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS troca_sim CASCADE');
execSync('npx prisma migrate deploy', { cwd: API_DIR, env: process.env, stdio: 'ignore' });
execSync('node prisma/seed.js', { cwd: API_DIR, env: process.env, stdio: 'ignore' });

const L = await import('../src/services/league.js');
const { applyResult } = await import('../src/services/play.js');
const { SERIE_A_SWAP } = await import('../src/lib/rules.js');
const MIN = SERIE_A_SWAP.minGoals;

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };

// um jogador por time (quem marca os gols do time) + um parado em cada (recebe a mensagem, nunca marca)
const teams = await prisma.team.findMany({ orderBy: { id: 'asc' } });
const name = new Map(teams.map((t) => [t.id, t.name]));
const scorer = new Map(), idle = new Map(), bot = new Map();
for (const t of teams) {
  scorer.set(t.id, await prisma.user.create({ data: { nick: `tr${t.id}`, nickLower: `tr${t.id}`, email: `tr${t.id}@sim.test`, passwordHash: 'x', teamId: t.id } }));
  idle.set(t.id, await prisma.user.create({ data: { nick: `tp${t.id}`, nickLower: `tp${t.id}`, email: `tp${t.id}@sim.test`, passwordHash: 'x', teamId: t.id } }));
  bot.set(t.id, await prisma.user.create({ data: { nick: `tb${t.id}`, nickLower: `tb${t.id}`, email: `tb${t.id}@sim.test`, passwordHash: 'x', teamId: t.id, isBot: true } })); // gol dele NÃO conta na troca
}

async function score(teamId, k, at, from = scorer) {
  for (let i = 0; i < k; i++) {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: from.get(teamId).id }, include: { team: true } });
      const match = await L.liveMatchForTeam(user.teamId, tx);
      await applyResult(tx, user, { kind: 'AUTO', goal: true, now: at, match, phrase: 'sim', money: 0 });
    });
  }
}
const serieNow = async () => new Map((await prisma.team.findMany()).map((t) => [t.id, t.serie]));
const inSerie = (map, s) => [...map].filter(([, v]) => v === s).map(([id]) => id);
const live = () => prisma.round.findFirst({ where: { status: 'LIVE' }, include: { season: true } });

/** Marca os gols pedidos ({teamId: gols}) na rodada viva e fecha; devolve o que o settleDueRounds devolveu. */
async function playRound(plan, planBot = new Map()) {
  const round = await live();
  const at = new Date(round.startsAt.getTime() + 60_000);
  for (const [teamId, k] of plan) await score(teamId, k, at);
  for (const [teamId, k] of planBot) await score(teamId, k, at, bot);
  const settled = await L.settleDueRounds(new Date(round.endsAt.getTime() + 10_000));
  return { round, r: settled[0] };
}

/** Conferências de sempre depois de um fechamento (rodada nova já criada). */
async function invariants(tag) {
  const teamSerie = await serieNow();
  const cur = await live();
  const st = await prisma.standing.findMany({ where: { seasonId: cur.seasonId } });
  check(st.length === 48 && st.every((s) => s.serie === teamSerie.get(s.teamId)), `${tag}: a série é a mesma no time e na tabela (Team.serie = Standing.serie)`);
  const count = { A: 0, B: 0, C: 0 };
  for (const s of teamSerie.values()) count[s]++;
  check(count.A === 16 && count.B === 16 && count.C === 16, `${tag}: 16 times por série (${JSON.stringify(count)})`);
  const ms = await prisma.match.findMany({ where: { roundId: cur.id } });
  const seen = new Map();
  let inOwn = true;
  for (const m of ms) for (const id of [m.homeTeamId, m.awayTeamId]) { seen.set(id, (seen.get(id) || 0) + 1); if (teamSerie.get(id) !== m.serie) inOwn = false; }
  check(ms.length === 24 && seen.size === 48 && [...seen.values()].every((v) => v === 1) && inOwn, `${tag}: rodada ${cur.number} com 24 jogos, cada time 1 vez e na série NOVA dele`);
  // tabela da temporada = soma das partidas encerradas (os pontos e gols foram junto na troca)
  const exp = new Map();
  const add = (id, gf, ga) => { const s = exp.get(id) || { points: 0, played: 0, goalsFor: 0, goalsAgainst: 0 }; s.played++; s.goalsFor += gf; s.goalsAgainst += ga; s.points += gf > ga ? 3 : gf === ga ? 1 : 0; exp.set(id, s); };
  for (const m of await prisma.match.findMany({ where: { status: 'FINISHED', round: { seasonId: cur.seasonId } } })) { add(m.homeTeamId, m.homeGoals, m.awayGoals); add(m.awayTeamId, m.awayGoals, m.homeGoals); }
  check(st.every((s) => !exp.get(s.teamId) || ['points', 'played', 'goalsFor', 'goalsAgainst'].every((k) => s[k] === exp.get(s.teamId)[k])), `${tag}: tabela = soma das partidas (pontos e gols foram junto)`);
}
const msgs = async (userId) => prisma.message.findMany({ where: { userId }, orderBy: { id: 'asc' } });

await L.ensureSeason();
const S0 = await serieNow();
const A = inSerie(S0, 'A'), B = inSerie(S0, 'B'), C = inSerie(S0, 'C');

// ── R1: A0 sem gol; Bx 60, Cy 55, Bz MIN−1; o resto 1 gol ──────────────────────
const A0 = A[0], Bx = B[0], Bz = B[1], Cy = C[0];
{
  const plan = new Map(teams.map((t) => [t.id, 1]));
  plan.set(A0, 0); plan.set(Bx, 60); plan.set(Cy, 55); plan.set(Bz, MIN - 1);
  const { r } = await playRound(plan);
  const S1 = await serieNow();
  check(r.swaps?.length === 1 && r.swaps[0].up.id === Bx && r.swaps[0].down.id === A0 && r.swaps[0].from === 'B' && r.swaps[0].goals === 60 && !r.swaps[0].drop,
    `R1: ${name.get(Bx)} (60 gols, Série B) sobe no lugar do ${name.get(A0)} (0 gols) — só 1 troca`);
  check(S1.get(Bx) === 'A' && S1.get(A0) === 'B', `R1: ${name.get(Bx)} agora na A e ${name.get(A0)} na B`);
  check(S1.get(Cy) === 'C' && S1.get(Bz) === 'B', `R1: ${name.get(Cy)} (55, mas não tinha outro da A sem gol) e ${name.get(Bz)} (${MIN - 1} gols, abaixo do mínimo) ficam`);
  const changed = [...S1].filter(([id, s]) => S0.get(id) !== s).map(([id]) => id);
  check(changed.length === 2, `R1: só os 2 times da troca mudaram de série (${changed.length})`);
  await invariants('R1');
  const up = await msgs(idle.get(Bx).id), down = await msgs(idle.get(A0).id), other = await msgs(idle.get(Cy).id);
  check(up.some((m) => m.title === 'Seu time subiu para a Série A!' && m.text.includes('60 gols') && m.text.includes(name.get(A0))), `R1: o parado do ${name.get(Bx)} recebeu "Seu time subiu para a Série A!"`);
  check(down.some((m) => m.title === 'Seu time caiu para a Série B'), `R1: o parado do ${name.get(A0)} recebeu "Seu time caiu para a Série B"`);
  check(other.length === 0, 'R1: time que não trocou não recebe mensagem');
}

// ── R2: A1 e A2 sem gol; só Cy (C) com 55; na B, Bw com 1 gol e o resto 2 (o que caiu da A com 0 NÃO desce) ──
const A1 = A[1], A2 = A[2], Bw = B[2];
{
  const plan = new Map(teams.map((t) => [t.id, 1]));
  for (const id of inSerie(await serieNow(), 'B')) plan.set(id, 2);
  plan.set(A1, 0); plan.set(A2, 0); plan.set(Cy, 55); plan.set(Bz, MIN - 1); plan.set(Bw, 1);
  const { round, r } = await playRound(plan);
  const st = await prisma.standing.findMany({ where: { seasonId: round.seasonId, teamId: { in: [A1, A2] } }, include: { team: true } });
  const worse = [...st].sort((x, y) => L.standingOrder(y, x))[0].teamId, better = worse === A1 ? A2 : A1;
  const S2 = await serieNow();
  check(r.swaps?.length === 1 && r.swaps[0].up.id === Cy && r.swaps[0].down.id === worse && r.swaps[0].from === 'C',
    `R2: 2 times da A sem gol e 1 candidato: ${name.get(Cy)} (55, Série C) sobe no lugar do pior da tabela, ${name.get(worse)}`);
  check(S2.get(Cy) === 'A' && S2.get(worse) === 'B' && S2.get(better) === 'A', `R2: ${name.get(worse)} vai para a B e ${name.get(better)} (também sem gol, mas sem candidato) fica na A`);
  check(r.swaps[0].drop?.id === Bw && S2.get(Bw) === 'C' && r.swaps[0].dropGoals === 1, `R2: veio da C, então desce para a C o time da B com menos gols: ${name.get(Bw)} (1 gol)`);
  check(S2.get(worse) === 'B', `R2: o time que acabou de cair da A (0 gols) não desce de novo para a C`);
  await invariants('R2');
  const dropMsg = await msgs(idle.get(Bw).id);
  check(dropMsg.some((m) => m.title === 'Seu time foi para a Série C' && m.text.includes(name.get(Cy)) && m.text.includes('1 gol')), `R2: o parado do ${name.get(Bw)} recebeu "Seu time foi para a Série C"`);
}

// ── R3: todo mundo da A marcou → ninguém troca, mesmo com candidato de 60 ────────
{
  const before = await serieNow();
  const plan = new Map(teams.map((t) => [t.id, 1]));
  plan.set(Bz, 60);
  const { r } = await playRound(plan);
  const after = await serieNow();
  check((r.swaps ?? []).length === 0 && [...after].every(([id, s]) => before.get(id) === s), 'R3: todos da A marcaram — nenhuma troca, mesmo com um de 60 gols na B');
  await invariants('R3');
}

// ── R4: gol de BOT não conta (dono, 21/09/2026) ────────────────────────────────
// Ab (Série A) só marca com bot → conta como sem gol e cai; Bb (fora da A) faz 60 SÓ com bot → não sobe;
// quem sobe é Bh, com MIN gols de gente de verdade. O bot do time que caiu não recebe mensagem.
{
  const S = await serieNow();
  const Ab = inSerie(S, 'A')[0], Bb = inSerie(S, 'B')[0], Bh = inSerie(S, 'B')[1];
  const plan = new Map(teams.map((t) => [t.id, 1]));
  plan.set(Ab, 0); plan.set(Bb, 0); plan.set(Bh, MIN);
  const { r } = await playRound(plan, new Map([[Ab, 10], [Bb, 60]]));
  const S4 = await serieNow();
  check(r.swaps?.length === 1 && r.swaps[0].up.id === Bh && r.swaps[0].down.id === Ab && r.swaps[0].goals === MIN,
    `R4: ${name.get(Ab)} (10 gols, todos de bot) conta como sem gol e ${name.get(Bh)} (${MIN} de gente de verdade) sobe`);
  check(S4.get(Bb) === 'B', `R4: ${name.get(Bb)} fez 60 gols SÓ com bot e NÃO sobe`);
  check(S4.get(Bh) === 'A' && S4.get(Ab) === 'B', `R4: ${name.get(Bh)} na A e ${name.get(Ab)} na B`);
  check(r.swaps[0].downBotGoals === 10, 'R4: a troca guarda quantos gols de bot o time que caiu tinha (para o Telegram)');
  const down = await msgs(idle.get(Ab).id), up = await msgs(idle.get(Bh).id);
  const last = down[down.length - 1], lastUp = up[up.length - 1];
  check(last?.title === 'Seu time caiu para a Série B' && !last.text.includes('não marcou nenhum gol'),
    'R4: o time tinha gols de bot no placar — a mensagem não diz "não marcou nenhum gol"');
  check(lastUp?.title === 'Seu time subiu para a Série A!' && lastUp.text.includes(name.get(Ab)) && !lastUp.text.includes('não marcou nenhum gol'),
    'R4: a mensagem de quem subiu também não afirma que o outro zerou');
  check((await msgs(bot.get(Ab).id)).length === 0 && (await msgs(bot.get(Bh).id)).length === 0, 'R4: bot não recebe mensagem na caixa');
  await invariants('R4');
}

// ── R5–R29: rodadas sem gol nenhum (nenhum candidato) ──────────────────────────
{
  const before = await serieNow();
  let swaps = 0;
  for (let cur = await live(); cur.number < cur.season.totalRounds; cur = await live()) { const { r } = await playRound(new Map()); swaps += (r.swaps ?? []).length; }
  const after = await serieNow();
  check(swaps === 0 && [...after].every(([id, s]) => before.get(id) === s), 'R5–R29: sem candidato com o mínimo de gols, nada muda (a A inteira sem gol)');
  await invariants('R29');
}

// ── R30 (última): time da A sem gol + candidato de 60 → não troca; a temporada fecha com o sobe-e-desce normal ──
{
  const cur = await live();
  check(cur.number === cur.season.totalRounds, `R30: é a última rodada da temporada (${cur.number}/${cur.season.totalRounds})`);
  const inA = inSerie(await serieNow(), 'A');
  const plan = new Map(teams.map((t) => [t.id, 1]));
  plan.set(inA[0], 0); plan.set(inSerie(await serieNow(), 'C')[0], 60);
  const s1 = cur.seasonId;
  const stEnd = await prisma.standing.findMany({ where: { seasonId: s1 }, include: { team: true } });
  const { r } = await playRound(plan);
  check(r.seasonFinished && r.swaps === undefined, 'R30: na última rodada não tem troca (a temporada fechou)');
  // o sobe-e-desce da temporada é o de sempre: pela tabela final de cada série
  const final = await prisma.standing.findMany({ where: { seasonId: s1 }, include: { team: true } });
  const newSerie = await serieNow();
  let ok = true;
  for (const serie of ['A', 'B', 'C']) {
    const tab = final.filter((x) => x.serie === serie).sort(L.standingOrder);
    if (serie !== 'A') ok &&= tab.slice(0, 2).every((x) => newSerie.get(x.teamId) === (serie === 'B' ? 'A' : 'B'));
    if (serie !== 'C') ok &&= tab.slice(-2).every((x) => newSerie.get(x.teamId) === (serie === 'A' ? 'B' : 'C'));
    ok &&= tab.slice(2, -2).every((x) => newSerie.get(x.teamId) === serie);
  }
  check(ok && stEnd.length === 48, 'R30: acesso e rebaixamento da temporada pela tabela final, como sempre');
  await invariants('TEMP 2');
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS troca_sim CASCADE');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
