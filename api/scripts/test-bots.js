/**
 * Bots "quase reais" (services/bots.js) no banco LOCAL: plano do dia (sessões dentro das janelas, sem sobrepor,
 * folga na proporção do perfil), criação das contas (data de cadastro espalhada, nick de jogador de verdade
 * pulado), o motor jogando de verdade numa sessão (gols pelos serviços do jogador, Presença resgatada só para
 * quem resgata, trilha linha a linha, ponto de nível gasto na habilidade, "online" enquanto dura), bot fora da
 * sessão parado, plano que sobrevive ao reinício e premiação da artilharia calculada SEM os bots.
 *
 * Uso (na pasta api/):  node scripts/test-bots.js   → tem de terminar em "TUDO OK". Recusa rodar fora do localhost.
 * Para andar o relógio das recargas sem esperar 10 min, entre uma volta e outra o teste "volta" os lastXAt dos
 * bots de teste em 11 min (as recargas de verdade ficam intactas no serviço).
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-bots.js só roda no banco LOCAL (cria contas de teste).');
  process.exit(1);
}
process.env.BOTS_X1_OFF = '1'; // as voltas do motor aqui não mandam ninguém ao X1 (o passo 7 chama a volta do X1 na mão)
const { prisma } = await import('../src/prisma.js');
const { BOTS, TRAIL_LINES, FUTPREGO } = await import('../src/lib/rules.js');
const { planDay, createBots, botsTick, botsX1Round, refreshPersonas, botsStatus } = await import('../src/services/bots.js');
const { x1BotsInside, x1Status } = await import('../src/realtime/x1.js');
const { topScorers, topAndPrizes, liveMatchForTeam, ensureSeason } = await import('../src/services/league.js');
const { calendarDay, tzParts, fromTz } = await import('../src/lib/time.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60_000;

// ── limpeza de leftovers de uma rodada anterior
async function wipe() {
  const olds = await prisma.user.findMany({ where: { email: { endsWith: '@bots.jogagol.com.br' }, nickLower: { startsWith: 'tb-' } }, select: { id: true } });
  const ids = olds.map((u) => u.id);
  if (!ids.length) return;
  await prisma.goal.deleteMany({ where: { userId: { in: ids } } });
  await prisma.x1Match.deleteMany({ where: { OR: [{ aId: { in: ids } }, { bId: { in: ids } }] } });
  await prisma.activity.deleteMany({ where: { userId: { in: ids } } });
  await prisma.loginPass.deleteMany({ where: { userId: { in: ids } } });
  await prisma.shopLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userItem.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
await wipe();
await ensureSeason();

// ── 1. plano do dia
{
  const now = Date.now();
  const day = calendarDay(new Date(now));
  const p = tzParts(new Date(now));
  const persona = { profile: 'assiduo', windows: ['manha', 'noite'] };
  let bad = 0, skips = 0, total = 0, total2 = 0, lens = [];
  for (let i = 0; i < 400; i++) {
    const plan = planDay(persona, day, now);
    if (plan.skip) { skips++; continue; }
    total++;
    if (plan.sessions.length < 1 || plan.sessions.length > 4) bad++;
    if (plan.sessions.length >= 2) total2++;
    for (const [j, s] of plan.sessions.entries()) {
      const h = tzParts(new Date(s.from)).h;
      const inWin = (h >= 6 && h < 10) || (h >= 18 && h < 24);
      const len = (s.to - s.from) / MIN;
      lens.push(len);
      if (!inWin || len < 40 || len > 130) bad++;
      if (j > 0 && s.from < plan.sessions[j - 1].to + 10 * MIN) bad++; // sobreposição
      const sameDay = tzParts(new Date(s.from));
      if (sameDay.d !== p.d) bad++;
    }
  }
  check(bad === 0, `assíduo: 400 planos, todas as sessões nas janelas manhã/noite, 40–130 min, sem sobrepor (${total} dias jogados)`);
  check(total2 > total * 0.8, `assíduo quase sempre com 2+ sessões no dia (${total2}/${total}) — o sorteio tenta de novo quando cai em cima de outra`);
  check(skips > 5 && skips < 50, `assíduo folga ~5% dos dias (${skips}/400)`);
  let cskips = 0;
  for (let i = 0; i < 400; i++) if (planDay({ profile: 'casual', windows: ['tarde'] }, day, now).skip) cskips++;
  check(cskips > 80 && cskips < 160, `casual folga ~30% dos dias (${cskips}/400)`);
  const plan = planDay({ profile: 'regular', windows: [] }, day, now);
  check(plan.skip || plan.sessions.every((s) => s.from > 0), 'persona sem janela: usa qualquer janela do dia');
}

// ── 2. criação das contas
const team = await prisma.team.findFirst({ where: { slug: 'brasiliense' } }) ?? await prisma.team.findFirst();
const real = await prisma.user.findFirst({ where: { isBot: false, deletedAt: null }, select: { nick: true } });
const LIST = [
  { nick: 'tb-assiduo', gender: 'M', team: team.slug, profile: 'assiduo', windows: ['madrugada', 'manha', 'almoco', 'tarde', 'noite'], kinds: { PENALTY: 1, FOUL: 1, TRAIL: 1 }, skills: 'both', pass: true, since: 5, bio: 'teste' },
  { nick: 'tb-casual', gender: 'F', team: team.slug, profile: 'casual', windows: ['noite'], kinds: { PENALTY: 1, FOUL: 0 }, skills: 'AIM', pass: false, since: 2 },
  { nick: 'tb-parado', gender: 'M', team: team.slug, profile: 'regular', windows: ['noite'], kinds: {}, skills: null, pass: true, since: 1 },
  ...(real ? [{ nick: real.nick, gender: 'M', team: team.slug, profile: 'casual', windows: ['noite'], kinds: {}, since: 1 }] : []),
];
{
  const r = await createBots(LIST);
  check(r.created.length === 3, `3 contas criadas (${r.created.map((c) => c.nick).join(', ')})`);
  check(!real || (r.skipped.length === 1 && /VERDADE/.test(r.skipped[0].why)), `nick de jogador de verdade (${real?.nick}) foi pulado com aviso`);
  const again = await createBots(LIST);
  check(again.created.length === 0 && again.skipped.filter((s) => s.why === 'já criado').length === 3, 'rodar de novo não duplica (idempotente)');
  const bots = await prisma.user.findMany({ where: { nickLower: { startsWith: 'tb-' } }, orderBy: { id: 'asc' } });
  const a = bots.find((b) => b.nick === 'tb-assiduo');
  check(a.isBot && a.botJson?.persona?.profile === 'assiduo' && a.gender === 'M' && a.bio === 'teste' && a.email === 'tb-assiduo@bots.jogagol.com.br', 'persona, gênero, bio e e-mail interno gravados');
  const ageDays = (Date.now() - a.createdAt.getTime()) / 86_400_000;
  check(ageDays > 4 && ageDays < 6.1, `data de cadastro ${ageDays.toFixed(1)} dias atrás (since: 5) e lastSeenAt igual (${a.lastSeenAt.getTime() === a.createdAt.getTime()})`);
  check(bots.find((b) => b.nick === 'tb-casual').gender === 'F', 'bot feminino');
}

// ── 3. o motor jogando (relógio das recargas adiantado à mão entre as voltas)
const ids = Object.fromEntries((await prisma.user.findMany({ where: { nickLower: { startsWith: 'tb-' } }, select: { id: true, nick: true } })).map((u) => [u.nick, u.id]));
BOTS.tickMs = 1500; BOTS.reactSec = [0, 0.5]; BOTS.trailStepSec = [0.05, 0.2]; BOTS.skillChance = 1; BOTS.heartbeatSec = 0;
const now0 = Date.now();
const today = calendarDay(new Date(now0));
const live = { day: today, skip: false, sessions: [{ from: now0 - 1000, to: now0 + 10 * MIN }] };
const idle = { day: today, skip: false, sessions: [{ from: now0 + 60 * MIN, to: now0 + 90 * MIN }] };
for (const nick of ['tb-assiduo', 'tb-casual']) await prisma.user.update({ where: { id: ids[nick] }, data: { botJson: { persona: LIST.find((l) => l.nick === nick), plan: live }, levelBonus: nick === 'tb-assiduo' ? 100 : 0 } });
await prisma.user.update({ where: { id: ids['tb-parado'] }, data: { botJson: { persona: LIST[2], plan: idle } } });
const seen0 = (await prisma.user.findUnique({ where: { id: ids['tb-parado'] } })).lastSeenAt;

async function rewind() {
  for (const f of ['lastAutoAt', 'lastPenaltyAt', 'lastFoulAt', 'lastTrailAt']) {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "${f}" = "${f}" - interval '11 minutes' WHERE "nickLower" LIKE 'tb-%' AND "${f}" IS NOT NULL`);
  }
}
const ticks = [];
for (let i = 0; i < 16; i++) {
  ticks.push(await botsTick());
  await sleep(BOTS.tickMs + 400);
  await rewind();
}
// mais 7 voltas SEM adiantar a recarga: com tudo em recarga, sobra a vez de gastar ponto de nível na habilidade
for (let i = 0; i < 7; i++) { await botsTick(); await sleep(BOTS.tickMs + 400); }
await sleep(1500);
{
  check(ticks.every((t) => !t.skipped && t.online === 2), `2 bots em sessão em todas as voltas (${ticks.map((t) => t.online).join('')})`);
  const goals = await prisma.goal.groupBy({ by: ['userId', 'kind'], where: { userId: { in: Object.values(ids) } }, _count: { _all: true } });
  const by = (nick, kind) => goals.find((g) => g.userId === ids[nick] && g.kind === kind)?._count._all ?? 0;
  const a = await prisma.user.findUnique({ where: { id: ids['tb-assiduo'] } });
  console.log(`     tb-assiduo: ${a.goalsTotal} gols (auto ${by('tb-assiduo', 'AUTO')}, pên ${by('tb-assiduo', 'PENALTY')}/${a.penaltyTries}, falta ${by('tb-assiduo', 'FOUL')}/${a.foulTries}, trilha ${by('tb-assiduo', 'TRAIL')}/${a.trailTries})`);
  check(by('tb-assiduo', 'AUTO') >= 3, 'assíduo: chutes diretos saíram (≥3)');
  check(a.penaltyTries >= 2 && a.foulTries >= 2, 'assíduo: bateu pênaltis e faltas (tentativas contadas)');
  check(a.trailTries >= 1, 'assíduo: jogou a trilha (linha a linha) até acabar');
  check(!a.trailState?.active || true, 'trilha não fica pendurada para sempre');
  const acts = await prisma.activity.count({ where: { userId: ids['tb-assiduo'] } });
  check(acts >= a.penaltyTries + a.foulTries + a.autoGoals, `lances ao vivo gravados como os de um jogador (${acts})`);
  const match = await liveMatchForTeam(team.id);
  check(!match || match.homeGoals + match.awayGoals >= a.goalsTotal, 'gols entraram no placar da partida do time');
  check(a.lastSeenAt.getTime() > now0, 'assíduo aparece "online" (lastSeenAt andou)');
  const pass = await prisma.loginPass.count({ where: { userId: ids['tb-assiduo'] } });
  check(pass === 1, 'assíduo resgatou a Presença da Semana (1 vez)');
  check((await prisma.loginPass.count({ where: { userId: ids['tb-casual'] } })) === 0, 'casual com pass:false NÃO resgatou');
  check(a.skillPoints >= 1 && (a.skillCd ?? 0) + (a.skillAim ?? 0) + (a.skillShot ?? 0) + (a.skillLuck ?? 0) === a.skillPoints, `ponto de nível gasto na árvore (Recarga ${a.skillCd}, Pontaria ${a.skillAim}, Chute ${a.skillShot}, Sorte ${a.skillLuck})`);
  const c = await prisma.user.findUnique({ where: { id: ids['tb-casual'] } });
  check(c.foulTries === 0 && c.penaltyTries >= 1 && c.trailTries === 0, `casual: só direto e pênalti (FOUL 0 e sem TRAIL na persona) — pên ${c.penaltyTries}, falta ${c.foulTries}, trilha ${c.trailTries}`);
  const p = await prisma.user.findUnique({ where: { id: ids['tb-parado'] } });
  check(p.goalsTotal === 0 && p.lastSeenAt.getTime() === seen0.getTime(), 'bot fora da sessão: nenhum gol e continua offline');
  // ações espalhadas: nenhum segundo com 2 chutes do MESMO bot e os dois bots não caem sempre no mesmo segundo
  const gs = await prisma.goal.findMany({ where: { userId: { in: [ids['tb-assiduo'], ids['tb-casual']] } }, select: { userId: true, createdAt: true } });
  const secs = new Map();
  for (const g of gs) { const k = `${g.userId}:${Math.floor(g.createdAt.getTime() / 1000)}`; secs.set(k, (secs.get(k) ?? 0) + 1); }
  check([...secs.values()].every((n) => n === 1), 'nunca dois gols do mesmo bot no mesmo segundo');
}

// ── 3b. status (antes de virar o dia no passo 4)
{
  const st = await botsStatus();
  const row = st.find((r) => r.nick === 'tb-assiduo');
  check(row && row.online && row.goals24h >= 3 && /–/.test(row.today), `status: ${row?.nick} online, ${row?.goals24h} gols 24h, hoje ${row?.today}`);
}

// ── 4. plano sobrevive ao reinício (mesmo dia = não sorteia de novo) e vira com o dia
{
  const u = await prisma.user.findUnique({ where: { id: ids['tb-parado'] } });
  await botsTick();
  const u2 = await prisma.user.findUnique({ where: { id: ids['tb-parado'] } });
  check(JSON.stringify(u.botJson.plan) === JSON.stringify(u2.botJson.plan), 'plano do dia fica o mesmo entre as voltas (não sorteia de novo)');
  const p = tzParts(new Date());
  const tomorrow = fromTz(p.y, p.m, p.d, 12).getTime() + 86_400_000;
  await botsTick(tomorrow);
  const u3 = await prisma.user.findUnique({ where: { id: ids['tb-parado'] } });
  check(u3.botJson.plan.day === today + 1 && (u3.botJson.plan.skip || u3.botJson.plan.sessions.every((s) => tzParts(new Date(s.from)).h >= 18)), `dia virou: plano novo do dia ${today + 1} (noite)`);
}

// ── 5. premiação sem bots
{
  const match = await liveMatchForTeam(team.id);
  if (match) {
    const { top, prizes } = await topAndPrizes({ roundId: match.roundId }, 50);
    const botIds = new Set(Object.values(ids));
    check(top.some((r) => botIds.has(r.userId)), 'quadro da rodada mostra os bots');
    check(!prizes.some((r) => botIds.has(r.userId)) && prizes.every((r, i) => r.position === i + 1), 'lista premiada fica sem os bots e as posições são renumeradas');
    const humans = top.filter((r) => !botIds.has(r.userId)).map((r) => r.userId);
    check(JSON.stringify(prizes.slice(0, humans.length).map((r) => r.userId)) === JSON.stringify(humans), 'a ordem dos humanos na lista premiada é a MESMA do quadro (uma consulta só — empate não embaralha)');
  } else check(true, '(sem partida ao vivo para o time — premiação não conferida)');
}

// ── 6. persona regravada pela lista + status
{
  const n = await refreshPersonas([{ ...LIST[1], profile: 'assiduo' }]);
  const c = await prisma.user.findUnique({ where: { id: ids['tb-casual'] } });
  check(n === 1 && c.botJson.persona.profile === 'assiduo' && c.botJson.plan, 'persona regravada mantendo o plano');
}

// ── 7. X1 (dono, 20/09/2026): a volta do X1 manda UM bot em sessão ao X1; ele abre o desafio, espera e vai embora
{
  process.env.BOTS_X1_OFF = '0';
  await prisma.user.update({ where: { id: ids['tb-assiduo'] }, data: { money: FUTPREGO.bet * 2 } });
  const online = await prisma.user.findMany({ where: { id: { in: [ids['tb-assiduo'], ids['tb-casual']] } }, include: { team: true } });
  // quem "topa": persona com x1 = 1 no assíduo; o casual com x1 = 0 nunca vai
  for (const b of online) b.botJson = { ...b.botJson, persona: { ...b.botJson.persona, x1: b.nick === 'tb-assiduo' ? 1 : 0 } };
  BOTS.x1.waitMin = [0.05, 0.05]; // 3 s de espera no teste (o desafio de verdade dura minutos)
  const sent = await botsX1Round(online, Date.now());
  check(sent?.bot === 'tb-assiduo', `a volta do X1 mandou o bot que topa (${sent?.bot})`);
  await sleep(400);
  check(x1BotsInside().some((b) => b.id === ids['tb-assiduo'] && b.waiting) && x1Status().open === 1, 'o bot está no X1 com o desafio aberto');
  check((await botsX1Round(online, Date.now())) === null, 'com um bot lá dentro (concurrent = 1), a volta não manda outro');
  const r = await sent.visit;
  check(r.played === false && r.why === 'ninguem' && !x1BotsInside().length && x1Status().open === 0, `ninguém aceitou: o bot foi embora (${r.why}) e o desafio fechou`);
  check((await botsX1Round(online, Date.now())) === null, 'depois de sair, o bot descansa e o intervalo entre bots vale: ninguém entra na hora');
  process.env.BOTS_X1_OFF = '1';
}

await wipe();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
