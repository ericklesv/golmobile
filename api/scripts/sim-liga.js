/**
 * Simulação da liga: uma temporada inteira (30 rodadas) + a virada para a temporada 2, pelo
 * código REAL (league.js, applyResult, scheduler), num schema separado do banco LOCAL
 * (`liga_sim`, criado e apagado aqui — os dados de teste do `public` não são tocados).
 * Confere a cada rodada: calendário (19:00), jogos, placar = gols, tabela = soma das partidas,
 * artilharia, prêmios e recorde, contador "Rodada: X gols" na virada. No fim: campeão/vice,
 * acesso/rebaixamento, turno e returno, prêmios da temporada, temporada 2. Também chuta gols NO
 * INSTANTE do fechamento (corrida) e confere que o relógio fecha a rodada no segundo exato.
 *
 * Uso (na pasta api/):  node scripts/sim-liga.js        (SEED=123 para outro sorteio)
 * Recusa rodar se o DATABASE_URL do .env não for localhost.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(base)) {
  console.error('RECUSADO: a simulação só roda no banco LOCAL (DATABASE_URL com localhost).');
  process.exit(1);
}
process.env.DATABASE_URL = /[?&]schema=/.test(base)
  ? base.replace(/([?&])schema=[^&]*/, '$1schema=liga_sim')
  : `${base}${base.includes('?') ? '&' : '?'}schema=liga_sim`;
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const { prisma } = await import('../src/prisma.js');
await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS liga_sim CASCADE');
execSync('npx prisma migrate deploy', { cwd: API_DIR, env: process.env, stdio: 'ignore' });
execSync('node prisma/seed.js', { cwd: API_DIR, env: process.env, stdio: 'ignore' });

const L = await import('../src/services/league.js');
const { applyResult } = await import('../src/services/play.js');
const { meView } = await import('../src/services/view.js');
const { startScheduler } = await import('../src/services/scheduler.js');
const { tzParts } = await import('../src/lib/time.js');
const { PRIZES, prizeFor, MONEY } = await import('../src/lib/rules.js');

// ─── utilidades ─────────────────────────────────────────────────────────────
let seed = Number(process.env.SEED || 7);
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const fails = [];
let oks = 0;
const check = (ok, label) => { if (ok) oks++; else { fails.push(label); console.log('FALHOU', label); } };
const brt = (d) => { const p = tzParts(d); return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')} ${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`; };
const H = 3600_000;
const KINDS = ['AUTO', 'AUTO', 'AUTO', 'PENALTY', 'FOUL', 'TRAIL'];

{ // empate em tudo: decide o nome do time (a mesma ordem da tela)
  const x = { points: 10, goalsFor: 5, goalsAgainst: 5, team: { name: 'Bahia' } }, y = { ...x, team: { name: 'Avaí' } };
  check([x, y].sort(L.standingOrder)[0].team.name === 'Avaí', 'empate em tudo: desempata pelo nome do time');
}

// ─── elenco de mentira: 1/4 dos times sem ninguém (empates 0x0, como no jogo real) ──
const teams = await prisma.team.findMany({ orderBy: { id: 'asc' } });
const users = [];
for (const [i, t] of teams.entries()) {
  const n = i % 4 === 0 ? 0 : ri(1, 3);
  for (let k = 0; k < n; k++) {
    const nick = `sim${t.id}_${k}`;
    users.push(await prisma.user.create({ data: { nick, nickLower: nick, email: `${nick}@sim.test`, passwordHash: 'x', teamId: t.id } }));
  }
}
console.log(`elenco: ${users.length} jogadores em ${new Set(users.map((u) => u.teamId)).size} times (os outros sem ninguém)`);

async function kick(userId, at) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { team: true } });
    const match = await L.liveMatchForTeam(user.teamId, tx);
    const kind = KINDS[ri(0, KINDS.length - 1)];
    const out = await applyResult(tx, user, { kind, goal: true, now: at, match, phrase: 'sim', money: MONEY[kind] ?? 0 });
    return out.match ? { matchId: out.match.id, side: out.match.homeTeamId === user.teamId ? 'home' : 'away', moved: out.match.id !== match?.id } : null;
  });
}

await L.ensureSeason();
const TOTAL = (await prisma.season.findFirst({ where: { status: 'ACTIVE' } })).totalRounds;
let expRecord = null; // recorde da rodada (maior artilheiro de uma rodada) na temporada
let prevSettle = null;

for (let r = 1; r <= TOTAL; r++) {
  const round = await prisma.round.findFirst({ where: { status: 'LIVE' }, include: { season: true, matches: true } });
  const tag = `R${r}`;
  check(round && round.number === r && round.season.number === 1, `${tag}: rodada viva é a ${r} da temporada 1`);
  // calendário
  const ep = tzParts(round.endsAt);
  check(ep.h === 19 && ep.min === 0 && ep.s === 0, `${tag}: fecha às 19:00 de Brasília (veio ${brt(round.endsAt)})`);
  if (prevSettle) {
    check(round.startsAt.getTime() === prevSettle.getTime(), `${tag}: começa no fechamento da anterior`);
    const dur = round.endsAt.getTime() - prevSettle.getTime();
    check(dur >= H && dur <= 25 * H, `${tag}: dura entre 1h e ~24h (veio ${(dur / H).toFixed(1)}h)`);
  }
  // jogos: 8 por série, cada time 1 vez, na série dele
  const curTeams = new Map((await prisma.team.findMany()).map((t) => [t.id, t]));
  const seen = new Map();
  for (const m of round.matches) for (const id of [m.homeTeamId, m.awayTeamId]) {
    seen.set(id, (seen.get(id) || 0) + 1);
    check(curTeams.get(id).serie === m.serie, `${tag}: ${curTeams.get(id).name} joga na série dele`);
  }
  check(round.matches.length === 24 && seen.size === 48 && [...seen.values()].every((v) => v === 1), `${tag}: 24 jogos, cada time exatamente 1 vez`);

  // gols em sequência, com o tempo simulado dentro da rodada
  const exp = new Map(round.matches.map((m) => [m.id, { home: m.homeGoals, away: m.awayGoals }])); // gols da corrida anterior podem ter caído aqui
  const span = round.endsAt.getTime() - round.startsAt.getTime() - 60_000;
  const events = [];
  for (const u of users) { const k = rnd() < 0.2 ? 0 : ri(0, 4); for (let j = 0; j < k; j++) events.push({ u: u.id, at: new Date(round.startsAt.getTime() + Math.floor(rnd() * span)) }); }
  events.sort((a, b) => a.at - b.at);
  for (const e of events) { const res = await kick(e.u, e.at); check(!!res, `${tag}: gol achou a partida do time`); if (res) exp.get(res.matchId)[res.side]++; }

  // fechamento: 19:00:10; na 12 o servidor ficou 26h fora do ar; a 20 fecha às 18:30 do dia seguinte
  const late = r === 12 ? 26 * H : r === 20 ? 23.5 * H : 10_000;
  const settleAt = new Date(round.endsAt.getTime() + late);
  const before = new Map((await prisma.user.findMany({ select: { id: true, money: true, vipDays: true } })).map((u) => [u.id, u]));
  // corrida: em 4 rodadas, metade dos jogadores chuta AO MESMO TEMPO que o fechamento
  const racing = [5, 10, 15, 25].includes(r);
  const raceKicks = racing ? users.filter(() => rnd() < 0.5).map((u) => kick(u.id, new Date(round.endsAt.getTime() + 5_000)).catch((e) => ({ err: e.code || e.message }))) : [];
  const settled = await L.settleDueRounds(settleAt);
  const raceRes = await Promise.all(raceKicks);
  check(settled.length === 1, `${tag}: fechou exatamente 1 rodada (fechou ${settled.length})`);
  if (racing) console.log(`   ${tag}: ${raceRes.length} chutes durante o fechamento (${raceRes.filter((x) => x?.err).length} com erro; ${raceRes.filter((x) => x?.moved).length} chegaram depois e foram para a rodada nova)`);

  // partidas encerradas: placar = gols registrados (e = o simulado, fora da corrida)
  for (const m of await prisma.match.findMany({ where: { roundId: round.id }, include: { goals: true } })) {
    const gh = m.goals.filter((g) => g.teamId === m.homeTeamId).length, ga = m.goals.filter((g) => g.teamId === m.awayTeamId).length;
    check(m.status === 'FINISHED', `${tag}: partida ${m.id} encerrada`);
    check(m.homeGoals === gh && m.awayGoals === ga, `${tag}: placar ${m.homeGoals}x${m.awayGoals} bate com os gols registrados (${gh}x${ga})`);
    if (!racing) check(m.homeGoals === exp.get(m.id).home && m.awayGoals === exp.get(m.id).away, `${tag}: placar ${m.homeGoals}x${m.awayGoals} = o simulado (${exp.get(m.id).home}x${exp.get(m.id).away})`);
  }
  // classificação = soma de todas as partidas ENCERRADAS da temporada
  const expSt = new Map();
  const add = (id, gf, ga) => {
    const s = expSt.get(id) || { points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
    s.played++; s.goalsFor += gf; s.goalsAgainst += ga;
    if (gf > ga) { s.wins++; s.points += 3; } else if (gf === ga) { s.draws++; s.points += 1; } else s.losses++;
    expSt.set(id, s);
  };
  for (const m of await prisma.match.findMany({ where: { status: 'FINISHED', round: { seasonId: round.seasonId } } })) { add(m.homeTeamId, m.homeGoals, m.awayGoals); add(m.awayTeamId, m.awayGoals, m.homeGoals); }
  const st = await prisma.standing.findMany({ where: { seasonId: round.seasonId }, include: { team: true } });
  let stOk = true;
  for (const s of st) for (const k of ['points', 'played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst']) if (s[k] !== expSt.get(s.teamId)[k]) { stOk = false; console.log(`   ${tag} ${s.team.name}: ${k} ${s[k]} ≠ ${expSt.get(s.teamId)[k]}`); }
  check(stOk, `${tag}: classificação = soma exata das partidas (vitória 3, empate 1; J/V/E/D/GP/GC)`);
  check(st.every((s) => s.played === r), `${tag}: os 48 times com ${r} jogos`);

  // artilharia da rodada, prêmios e recorde
  const closed = await prisma.round.findUnique({ where: { id: round.id } });
  check(closed.status === 'FINISHED', `${tag}: rodada encerrada`);
  const top = closed.topJson || [];
  const goalsByUser = new Map();
  for (const g of await prisma.goal.findMany({ where: { roundId: round.id } })) goalsByUser.set(g.userId, (goalsByUser.get(g.userId) || 0) + 1);
  const ranked = [...goalsByUser.values()].sort((a, b) => b - a).slice(0, 10);
  check(JSON.stringify(top.map((t) => t.goals)) === JSON.stringify(ranked) && top.every((t, i) => t.position === i + 1 && goalsByUser.get(t.userId) === t.goals), `${tag}: top 10 da rodada certo`);
  const after = new Map((await prisma.user.findMany({ select: { id: true, money: true, vipDays: true } })).map((u) => [u.id, u]));
  const expMoney = new Map(), expVip = new Map();
  for (const t of top) { const p = prizeFor(PRIZES.round, t.position); expMoney.set(t.userId, (expMoney.get(t.userId) || 0) + p.money); expVip.set(t.userId, (expVip.get(t.userId) || 0) + p.vip); }
  if (top[0] && (expRecord === null || top[0].goals > expRecord)) { expRecord = top[0].goals; expVip.set(top[0].userId, (expVip.get(top[0].userId) || 0) + PRIZES.roundRecord.vip); }
  const delta = new Map();
  for (const [id, b] of before) delta.set(id, { m: after.get(id).money - b.money - (expMoney.get(id) || 0), v: after.get(id).vipDays - b.vipDays - (expVip.get(id) || 0) });
  if (!racing && r !== TOTAL) check([...delta.values()].every((d) => d.m === 0 && d.v === 0), `${tag}: prêmios da rodada pagos certinho`);
  const rec = await prisma.record.findUnique({ where: { scope_seasonId: { scope: 'ROUND', seasonId: round.seasonId } } });
  check(rec?.goals === expRecord, `${tag}: recorde da rodada = ${expRecord} (veio ${rec?.goals})`);

  // na tela, "Rodada: X gols" zera na virada para quem ainda não marcou na rodada nova
  if (r < TOTAL) {
    const u = await prisma.user.findFirst({ where: { roundId: round.id, goalsRound: { gt: 0 } }, include: { team: true, items: true } });
    if (u) check(meView(u, settleAt.getTime() + 60_000).goalsRound === 0, `${tag}: "Rodada: X gols" zera na virada`);
  }

  if (r === TOTAL) {
    const s1 = await prisma.season.findFirst({ where: { number: 1 } });
    const s2 = await prisma.season.findFirst({ where: { number: 2 }, include: { rounds: true, standings: true } });
    check(s1.status === 'FINISHED' && s1.endsAt, 'FIM: temporada 1 encerrada');
    check(s2?.status === 'ACTIVE' && s2.rounds.length === 1 && s2.rounds[0].status === 'LIVE', 'FIM: temporada 2 começou com a rodada 1 ao vivo');
    check(s2?.standings.length === 48 && s2.standings.every((x) => x.points === 0 && x.played === 0), 'FIM: tabela da temporada 2 zerada com os 48 times');
    // títulos, acesso e rebaixamento pela MESMA ordem da tela
    const titles = await prisma.title.findMany({ where: { seasonId: s1.id } });
    const newSerie = new Map((await prisma.team.findMany()).map((t) => [t.id, t.serie]));
    for (const serie of ['A', 'B', 'C']) {
      const tab = st.filter((x) => x.serie === serie).sort(L.standingOrder);
      const champ = titles.find((t) => t.competition === `Série ${serie}` && t.place === 1), vice = titles.find((t) => t.competition === `Série ${serie}` && t.place === 2);
      check(champ?.teamId === tab[0].teamId && vice?.teamId === tab[1].teamId, `FIM Série ${serie}: campeão ${tab[0].team.name} (${tab[0].points} pts) e vice ${tab[1].team.name}`);
      if (serie !== 'A') check(tab.slice(0, 2).every((x) => newSerie.get(x.teamId) === (serie === 'B' ? 'A' : 'B')), `FIM Série ${serie}: os 2 primeiros subiram`);
      if (serie !== 'C') check(tab.slice(-2).every((x) => newSerie.get(x.teamId) === (serie === 'A' ? 'B' : 'C')), `FIM Série ${serie}: os 2 últimos caíram`);
      check(tab.slice(2, -2).every((x) => newSerie.get(x.teamId) === serie), `FIM Série ${serie}: o meio da tabela ficou`);
    }
    const count = { A: 0, B: 0, C: 0 };
    for (const s of newSerie.values()) count[s]++;
    check(count.A === 16 && count.B === 16 && count.C === 16, `FIM: 16 times por série depois do sobe-e-desce (${JSON.stringify(count)})`);
    // prêmios da temporada (quem empata na fronteira pode cair em qualquer ordem: confere por grupo de empate)
    const sg = new Map();
    for (const g of await prisma.goal.findMany({ where: { seasonId: s1.id } })) sg.set(g.userId, (sg.get(g.userId) || 0) + 1);
    const seasonTop = [...sg.entries()].sort((a, b) => b[1] - a[1]);
    const slots = Array.from({ length: 10 }, (_, i) => prizeFor(PRIZES.season, i + 1));
    let pos = 0, seasonOk = true;
    for (let i = 0; i < seasonTop.length;) {
      let j = i; while (j < seasonTop.length && seasonTop[j][1] === seasonTop[i][1]) j++;
      const want = slots.slice(pos, Math.min(pos + (j - i), 10)).map((p) => `${p.money}/${p.vip}`);
      while (want.length < j - i) want.push('0/0');
      const got = seasonTop.slice(i, j).map(([id]) => `${delta.get(id).m}/${delta.get(id).v}`);
      if (JSON.stringify(want.sort()) !== JSON.stringify(got.sort())) { seasonOk = false; console.log(`   temporada: grupo com ${seasonTop[i][1]} gols esperava ${want} e recebeu ${got}`); }
      pos += j - i; i = j;
    }
    check(seasonOk, 'FIM: prêmios da temporada pagos certinho');
    const srec = await prisma.record.findUnique({ where: { scope_seasonId: { scope: 'SEASON', seasonId: s1.id } } });
    check(srec?.goals === seasonTop[0][1], `FIM: recorde da temporada = ${seasonTop[0][1]} gols`);
    // turno e returno: cada par 2x, uma em casa de cada; 15 jogos em casa por time
    const ms = await prisma.match.findMany({ where: { round: { seasonId: s1.id } } });
    for (const serie of ['A', 'B', 'C']) {
      const pairs = new Map(), home = new Map();
      for (const m of ms.filter((x) => x.serie === serie)) {
        const k = [m.homeTeamId, m.awayTeamId].sort((a, b) => a - b).join('-');
        pairs.set(k, [...(pairs.get(k) || []), m.homeTeamId]);
        home.set(m.homeTeamId, (home.get(m.homeTeamId) || 0) + 1);
      }
      check(pairs.size === 120 && [...pairs.values()].every((v) => v.length === 2 && v[0] !== v[1]), `FIM Série ${serie}: turno e returno completos`);
      check([...home.values()].every((v) => v === 15), `FIM Série ${serie}: cada time 15 jogos em casa e 15 fora`);
    }
    // temporada 2: o primeiro gol já conta nela, com as séries novas
    const r2 = s2.rounds[0];
    const res = await kick(users[0].id, new Date(r2.startsAt.getTime() + 60_000));
    const uu = await prisma.user.findUnique({ where: { id: users[0].id } });
    const g = await prisma.goal.findFirst({ where: { userId: users[0].id }, orderBy: { id: 'desc' } });
    check(res && g.seasonId === s2.id && g.roundId === r2.id && uu.goalsSeason === 1 && uu.goalsRound === 1, 'TEMP 2: o primeiro gol conta na temporada 2');
    const m2 = await prisma.match.findUnique({ where: { id: res.matchId }, include: { homeTeam: true, awayTeam: true } });
    check(m2.homeTeam.serie === m2.serie && m2.awayTeam.serie === m2.serie, 'TEMP 2: jogos já com as séries novas');
  }
  prevSettle = settleAt;
  if ([1, 12, 20, TOTAL].includes(r)) console.log(`${tag} ok — fechou ${brt(settleAt)}; ${events.length} gols; a próxima fecha ${brt((await prisma.round.findFirst({ where: { status: 'LIVE' } })).endsAt)}`);
}

// relógio: a rodada fecha no segundo exato (antes podia atrasar até 30 s)
const live = await prisma.round.findFirst({ where: { status: 'LIVE' } });
const endsAt = new Date(Date.now() + 6_000);
await prisma.round.update({ where: { id: live.id }, data: { endsAt } });
startScheduler();
let lateMs = null;
for (let i = 0; i < 40 && lateMs === null; i++) {
  await new Promise((res) => setTimeout(res, 500));
  if ((await prisma.round.findUnique({ where: { id: live.id } })).status === 'FINISHED') lateMs = (await prisma.round.findFirst({ where: { status: 'LIVE' } })).startsAt.getTime() - endsAt.getTime();
}
check(lateMs !== null && lateMs >= 0 && lateMs < 2_000, `relógio: fechou ${lateMs === null ? 'nunca' : (lateMs / 1000).toFixed(2) + ' s'} depois da hora`);

console.log(`\n${oks} conferências OK, ${fails.length} falha(s)`);
await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS liga_sim CASCADE');
await prisma.$disconnect();
process.exit(fails.length ? 1 : 0);
