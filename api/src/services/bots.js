/**
 * Bots "quase reais" (dono, 18/09/2026) — contas que o servidor joga sozinho para encher os times da Série A
 * que estavam sem ninguém (a troca automática tirava clube grande da A por falta de gol).
 *
 * Como funciona (números em BOTS de rules.js; lista em data/bots.js):
 *  - Cada bot tem uma PERSONA (perfil casual/regular/assíduo, janelas do dia em que entra, quais chutes usa,
 *    onde gasta ponto de nível, se resgata a Presença) guardada em `User.botJson.persona`.
 *  - Todo dia (meia-noite de Brasília) ganha um PLANO: pode pular o dia; senão, N sessões de tantos minutos em
 *    horários sorteados dentro das janelas dele. Fica em `User.botJson.plan` — reiniciar a API não sorteia de
 *    novo (senão cada restart dava uma leva de sessões novas).
 *  - Dentro da sessão está "online" (lastSeenAt anda como o heartbeat) e chuta pelos MESMOS serviços do
 *    jogador — autoKick/penalty/foul/trailPick de play.js —, então recarga, chance, habilidade, chuteira,
 *    placar da partida, artilharia e lances ao vivo saem iguais aos de um humano. Acabou a recarga, espera um
 *    tempo sorteado (8 s a 4 min) antes de chutar; a trilha vai linha a linha com pausa entre elas.
 *  - Uma ação por bot por volta (20 s), disparada com atraso sorteado dentro da volta: nunca dois bots no
 *    mesmo segundo, nunca todos os chutes de um bot de uma vez.
 *  - Nunca conversa e nunca joga minigame (deixaria o rastro na cara).
 *  - **X1 (dono, 20/09/2026)**: dentro da sessão, de vez em quando um bot VAI AO X1 (`botsX1Round` → x1BotVisit em
 *    realtime/x1.js): aceita um desafio aberto de gente de outro time ou abre o dele e espera alguns minutos —
 *    "para quase sempre ter alguém diferente no X1". Vale tudo (aposta, gol, gol a menos, lances, retrospecto);
 *    só o prêmio do Ranking X1 pula os bots. Um bot por vez (BOTS.x1.concurrent), intervalo sorteado entre um e
 *    outro, cada bot descansa 30–120 min depois de sair e joga no máximo 4 por dia; a MESMA pessoa só pega os
 *    bots 4x em 24 h e com 45 min entre uma e outra ("não o tempo todo com o Xumbera"). Na partida o bot demora
 *    3–8 s para bater, tem uma skill sorteada (nem sempre ganha) e provoca de vez em quando. O tutorial de
 *    boas-vindas usa o mesmo bot (o novato desafia, ninguém aceita em 20 s, um bot entra — 18/09/2026).
 *    Bots não entram na premiação (league.js calcula a artilharia premiada e o VIP do time campeão sem eles;
 *    services/x1.js pula bots no prêmio do X1) nem no relatório diário.
 * Motor: `startBots()` no index.js (1 instância PM2 — estado "o que está pendente" em memória). `BOTS_OFF=1`
 * desliga as voltas (chutes e visitas ao X1); `BOTS_X1_OFF=1` desliga tudo do X1 — visitas E aceites (testes).
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { BOTS, FUTPREGO, cooldownFor, LAST_FIELD, skillPointsLeft, TRAIL_LINES, SKILL_FIELD, SKILL_STEPS } from '../lib/rules.js';
import { x1BotVisit, x1BotsInside, setX1BotPicker } from '../realtime/x1.js';
import { tzParts, fromTz, calendarDay } from '../lib/time.js';
import { activeItemsWhere } from '../lib/items.js';
import { autoKick, penalty, foul, trailPick } from './play.js';
import { passClaim } from './pass.js';
import { buySkill } from './skills.js';
import { tg } from '../lib/telegram.js';

const rnd = Math.random;
const between = (a, b) => a + rnd() * (b - a);
const intBetween = (a, b) => Math.floor(between(a, b + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIRS = { PENALTY: ['left', 'center', 'right'], FOUL: ['left', 'over', 'right'] };

// ─── Plano do dia ─────────────────────────────────────────────────────────────
/**
 * Sorteia as sessões de um dia de Brasília (`day` = calendarDay) para uma persona. Sessões que passariam do
 * dia continuam (a noite de 23h vai até 1h da manhã). Devolve { day, skip, sessions: [{from, to}] } em ms.
 */
export function planDay(persona, day, now = Date.now()) {
  const prof = BOTS.profiles[persona.profile] || BOTS.profiles.casual;
  if (rnd() < prof.skip) return { day, skip: true, sessions: [] };
  const p = tzParts(new Date(now));
  const n = intBetween(prof.sessions[0], prof.sessions[1]);
  const windows = (persona.windows || []).filter((w) => BOTS.windows[w]);
  const sessions = [];
  const clashes = (s) => sessions.some((o) => s.from < o.to + 10 * 60_000 && s.to > o.from - 10 * 60_000); // 10 min de folga entre sessões
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 8; tries++) { // sorteia de novo se cair em cima de outra sessão
      const [h0, h1] = BOTS.windows[pick(windows.length ? windows : Object.keys(BOTS.windows))];
      const startMin = between(h0 * 60, h1 * 60 - 5); // minuto do dia
      const from = fromTz(p.y, p.m, p.d, Math.floor(startMin / 60), Math.floor(startMin % 60)).getTime() + intBetween(0, 59) * 1000;
      const s = { from, to: from + between(prof.minutes[0], prof.minutes[1]) * 60_000 };
      if (!clashes(s)) { sessions.push(s); break; }
    }
  }
  sessions.sort((a, b) => a.from - b.from);
  return { day, skip: false, sessions };
}

/** Garante o plano de hoje no bot (gera e grava quando o dia virou); sessões ainda vivas do plano anterior seguem. */
async function ensurePlan(bot, now) {
  const day = calendarDay(new Date(now));
  const cur = bot.botJson?.plan;
  if (cur?.day === day) return cur;
  const fresh = planDay(bot.botJson?.persona || {}, day, now);
  const alive = (cur?.sessions || []).filter((s) => s.to > now);
  fresh.sessions = [...alive, ...fresh.sessions.filter((s) => !alive.some((a) => s.from < a.to + 10 * 60_000 && s.to > a.from))].sort((a, b) => a.from - b.from);
  const botJson = { ...(bot.botJson || {}), plan: fresh };
  await prisma.user.update({ where: { id: bot.id }, data: { botJson } });
  bot.botJson = botJson;
  return fresh;
}

const inSession = (plan, now) => (plan?.sessions || []).find((s) => now >= s.from && now < s.to) || null;
/** A hora de agora (Brasília) cai numa janela da persona? (sem janelas na persona = qualquer hora) */
function inWindow(persona, now) {
  const ws = (persona?.windows || []).filter((w) => BOTS.windows[w]);
  if (!ws.length) return true;
  const h = tzParts(new Date(now)).h;
  return ws.some((w) => h >= BOTS.windows[w][0] && h < BOTS.windows[w][1]);
}
/**
 * Pode ir ao X1 agora? Em sessão, ou fora dela numa hora que cabe na JANELA da persona e sem ser dia de folga
 * (dono, 20/09/2026: "precisamos movimentar o jogo" — só as sessões de chute deixavam o X1 sem bot a noite inteira).
 */
export const x1Available = (bot, now) => {
  const plan = bot.botJson?.plan;
  if (inSession(plan, now)) return true;
  if (plan?.day === calendarDay(new Date(now)) && plan.skip) return false; // folga: nem X1
  return inWindow(bot.botJson?.persona, now);
};

// ─── Memória do motor (1 instância) ───────────────────────────────────────────
// por bot: { react: { KIND: { readyAt, delay } }, busy, passDay, sessionFrom }
const mem = new Map();
const memOf = (id) => { if (!mem.has(id)) mem.set(id, { react: {}, busy: false }); return mem.get(id); };

/** Quando este chute "quer" sair: fim da recarga + atraso sorteado (um sorteio por recarga). */
function wantsAt(bot, m, kind, now) {
  const last = bot[LAST_FIELD[kind]] ? new Date(bot[LAST_FIELD[kind]]).getTime() : 0;
  const readyAt = last + cooldownFor(bot, kind, now);
  const r = m.react[kind];
  if (!r || r.readyAt !== readyAt) m.react[kind] = { readyAt, delay: between(BOTS.reactSec[0], BOTS.reactSec[1]) * 1000 };
  return readyAt + m.react[kind].delay;
}

// ─── Ações ────────────────────────────────────────────────────────────────────
async function doTrail(bot) {
  // linha a linha, com pausa entre elas (a trilha inteira num piscar de olhos seria o rastro de robô)
  for (let step = 0; step < TRAIL_LINES.length + 2; step++) {
    const u = await prisma.user.findUnique({ where: { id: bot.id }, select: { trailState: true } });
    const st = u.trailState?.active ? u.trailState : null;
    const phase = st ? st.phase : 0;
    const cfg = TRAIL_LINES[phase];
    if (!cfg) return;
    const tried = new Set((st?.revealed || []).filter((r) => r.phase === phase).map((r) => r.index));
    const free = Array.from({ length: cfg.total }, (_, i) => i).filter((i) => !tried.has(i));
    if (!free.length) return;
    const res = await trailPick(bot.id, pick(free));
    if (res.finished) return;
    await sleep(between(BOTS.trailStepSec[0], BOTS.trailStepSec[1]) * 1000);
  }
}

async function act(bot, m, what) {
  try {
    if (what === 'PASS') { await passClaim(bot.id).catch((e) => { if (e?.code !== 'claimed') throw e; }); return; }
    if (what === 'SKILL') {
      const key = nextSkill(bot);
      if (key) await buySkill(bot.id, key, 'point').catch((e) => { if (e?.code !== 'no-points' && e?.status !== 400) throw e; }); // sem ponto / já no máximo: nada
      return;
    }
    if (what === 'AUTO') { await autoKick(bot.id); return; }
    if (what === 'PENALTY') { await penalty(bot.id, pick(DIRS.PENALTY)); return; }
    if (what === 'FOUL') { await foul(bot.id, pick(DIRS.FOUL)); return; }
    if (what === 'TRAIL') { await doTrail(bot); return; }
  } catch (e) {
    if (e?.code === 'cooldown') return; // já saiu (volta anterior ainda no ar) — ignora
    console.error(`[bots] ${bot.nick} ${what}:`, e?.message || e);
    tg.error(`Bots: ${tg.esc(bot.nick)} ${what} — ${tg.esc(String(e?.message || e).slice(0, 200))}`, { key: 'bots', every: 30 * 60_000 });
  } finally {
    m.busy = false;
  }
}

/**
 * Onde o bot gasta o ponto de nível — na ordem que o dono desenhou para a árvore (17/09/2026): primeiro a
 * Recarga (até o 6º degrau, onde o VIP chega ao piso), depois o acerto que a persona prefere (Pontaria,
 * Chute ou os dois alternando), e no fim a Sorte e o resto da Recarga. De vez em quando (1 em 5) escolhe
 * qualquer uma que ainda não está no máximo — gente de verdade não segue receita à risca.
 */
function nextSkill(bot) {
  const lvl = (k) => bot[SKILL_FIELD[k]] ?? 0;
  const pref = bot.botJson?.persona?.skills;
  const order = [];
  if (lvl('CD') < 6) order.push('CD');
  const acerto = pref === 'both' ? (lvl('AIM') <= lvl('SHOT') ? ['AIM', 'SHOT'] : ['SHOT', 'AIM']) : [pref];
  order.push(...acerto, 'LUCK', 'CD', 'AIM', 'SHOT');
  const open = [...new Set(order)].filter((k) => SKILL_FIELD[k] && lvl(k) < SKILL_STEPS);
  if (!open.length) return null;
  return rnd() < 0.2 ? pick(open) : open[0];
}

/** Decide UMA ação para o bot nesta volta (ou nada). */
function choose(bot, m, session, now) {
  const persona = bot.botJson?.persona || {};
  const day = calendarDay(new Date(now));
  if (persona.pass !== false && m.passDay !== day) { m.passDay = day; return 'PASS'; } // entrou: resgata a Presença
  if (bot.trailState?.active) return 'TRAIL'; // trilha pela metade: termina
  const ready = [];
  if (wantsAt(bot, m, 'AUTO', now) <= now) ready.push('AUTO');
  for (const kind of ['PENALTY', 'FOUL', 'TRAIL']) {
    const like = persona.kinds?.[kind] ?? 0;
    if (like <= 0) continue;
    if (wantsAt(bot, m, kind, now) <= now) {
      // "não gosta" tanto deste chute: às vezes deixa passar e sorteia de novo na próxima recarga
      if (m.react[kind].skip === undefined) m.react[kind].skip = rnd() >= like;
      if (!m.react[kind].skip) ready.push(kind);
    }
  }
  if (ready.length) return pick(ready);
  if (persona.skills && skillPointsLeft(bot) > 0 && rnd() < BOTS.skillChance) return 'SKILL';
  return null;
}

// ─── X1 (dono, 20/09/2026) ────────────────────────────────────────────────────
const x1 = { nextAt: 0 }; // quando o próximo bot pode entrar no X1 (intervalo sorteado depois de cada saída)
/** Vontade de jogar X1 (0..1): `x1` na persona; sem ele, pelo perfil (BOTS.x1.appetite). */
const x1Appetite = (bot) => { const p = bot.botJson?.persona || {}; return p.x1 ?? BOTS.x1.appetite[p.profile] ?? 0.4; };
const x1Off = () => process.env.BOTS_X1_OFF === '1';

/**
 * Uma volta do X1: com vaga (BOTS.x1.concurrent) e passado o intervalo, sorteia um bot DISPONÍVEL (x1Available:
 * em sessão ou na janela da persona) que está descansado, tem a aposta e "topa" (persona); confere no banco as
 * partidas das últimas 24 h e o descanso desde a última (sobrevive ao reinício da API) e manda ele ao X1. A visita
 * corre sozinha (x1BotVisit); ao voltar, ele descansa BOTS.x1.restMin e o intervalo até o próximo bot é sorteado.
 */
export async function botsX1Round(bots, now = Date.now()) {
  const X = BOTS.x1;
  if (x1Off() || x1BotsInside().length >= X.concurrent || now < x1.nextAt) return null;
  const pool = bots.filter((b) => x1Available(b, now) && (memOf(b.id).x1RestUntil ?? 0) <= now && x1Appetite(b) > 0 && b.money >= FUTPREGO.bet);
  if (!pool.length) return null;
  const bot = pick(pool), m = memOf(bot.id);
  if (rnd() >= x1Appetite(bot)) { m.x1RestUntil = now + between(5, 15) * 60_000; return null; } // hoje não: chamado de novo mais tarde
  const recent = await prisma.x1Match.findMany({
    where: { status: 'FINISHED', finishedAt: { gte: new Date(now - 24 * 3600_000) }, OR: [{ aId: bot.id }, { bId: bot.id }] },
    select: { finishedAt: true }, orderBy: { finishedAt: 'desc' },
  });
  if (recent.length >= X.maxDay) { m.x1RestUntil = now + 60 * 60_000; return null; }
  const restMs = () => between(X.restMin[0], X.restMin[1]) * 60_000;
  if (recent[0] && recent[0].finishedAt.getTime() > now - X.restMin[0] * 60_000) { m.x1RestUntil = recent[0].finishedAt.getTime() + restMs(); return null; }
  const gapMs = () => between(X.gapMin[0], X.gapMin[1]) * 60_000;
  m.x1RestUntil = now + 30 * 60_000; // enquanto a visita dura (acertado na volta)
  x1.nextAt = now + gapMs();
  const opts = { skill: between(X.skill[0], X.skill[1]), waitMs: between(X.waitMin[0], X.waitMin[1]) * 60_000 };
  const visit = x1BotVisit(bot, opts).then((r) => {
    m.x1RestUntil = Date.now() + restMs();
    x1.nextAt = Math.max(x1.nextAt, Date.now() + gapMs());
    if (r.played) console.log(`[bots] ${bot.nick} jogou X1 contra ${r.opponent}: ${r.won ? 'venceu' : r.draw ? 'empatou' : 'perdeu'} (${r.reason})`);
    return r;
  }).catch((e) => {
    m.x1RestUntil = Date.now() + restMs();
    console.error(`[bots] ${bot.nick} X1:`, e?.message || e);
    tg.error(`Bots: ${tg.esc(bot.nick)} X1 — ${tg.esc(String(e?.message || e).slice(0, 200))}`, { key: 'bots-x1', every: 30 * 60_000 });
    return { played: false, why: 'erro' };
  });
  return { bot: bot.nick, opts, visit };
}

/**
 * Bot que ACEITA o desafio de gente (dono, 20/09/2026: "os bots ativos no momento com possibilidade de aceitar
 * também os X1, principalmente após os primeiros 5 s"; chamado por realtime/x1.js → botAceita, passados
 * BOTS.x1.acceptDelaySec sem ninguém pegar). Candidatos: bots EM SESSÃO agora (pelo plano do dia, direto do banco —
 * não depende da volta do motor), de outro time, com a aposta, que "topam" (persona), fora do X1, sem partida nos
 * últimos acceptRestMin e abaixo de maxDay. Chance acceptChance; sorteia um. Devolve { user, skill, done }.
 */
export async function pickX1Accepter(human, now = Date.now()) {
  const X = BOTS.x1;
  if (x1Off() || rnd() >= X.acceptChance) return null; // (BOTS_OFF desliga as voltas; o aceite só sai com BOTS_X1_OFF)
  const inX1 = new Set(x1BotsInside().map((b) => b.id));
  const bots = await prisma.user.findMany({
    where: { isBot: true, deletedAt: null, money: { gte: FUTPREGO.bet }, teamId: { not: human.teamId }, OR: [{ bannedUntil: null }, { bannedUntil: { lt: new Date(now) } }] },
    include: { team: true },
  });
  const pool = bots.filter((b) => !inX1.has(b.id) && x1Available(b, now) && x1Appetite(b) > 0);
  for (let tries = 0; tries < 3 && pool.length; tries++) {
    const i = Math.floor(rnd() * pool.length);
    const [bot] = pool.splice(i, 1);
    const recent = await prisma.x1Match.findMany({
      where: { status: 'FINISHED', finishedAt: { gte: new Date(now - 24 * 3600_000) }, OR: [{ aId: bot.id }, { bId: bot.id }] },
      select: { finishedAt: true }, orderBy: { finishedAt: 'desc' },
    });
    if (recent.length >= X.maxDay || (recent[0] && recent[0].finishedAt.getTime() > now - X.acceptRestMin * 60_000)) continue;
    const m = memOf(bot.id);
    return {
      user: bot, skill: between(X.skill[0], X.skill[1]),
      done: (r) => {
        if (r?.played) { m.x1RestUntil = Date.now() + between(X.restMin[0], X.restMin[1]) * 60_000; console.log(`[bots] ${bot.nick} aceitou X1 de ${r.opponent}: ${r.won ? 'venceu' : r.draw ? 'empatou' : 'perdeu'} (${r.reason})`); }
      },
    };
  }
  return null;
}
setX1BotPicker(pickX1Accepter);

// ─── Volta do motor ───────────────────────────────────────────────────────────
let ticking = false;
export async function botsTick(now = Date.now()) {
  if (ticking) return { skipped: true };
  ticking = true;
  const out = { online: 0, actions: 0 };
  try {
    const bots = await prisma.user.findMany({
      where: { isBot: true, deletedAt: null, OR: [{ bannedUntil: null }, { bannedUntil: { lt: new Date(now) } }] },
      include: { team: true, items: activeItemsWhere(new Date(now)) },
    });
    const online = [];
    const inX1 = new Set(x1BotsInside().map((b) => b.id));
    for (const bot of bots) {
      const plan = await ensurePlan(bot, now);
      const session = inSession(plan, now);
      if (!session) continue;
      out.online++;
      online.push(bot);
      const m = memOf(bot.id);
      // presença: lastSeenAt anda como o heartbeat do site (a cada ~50 s)
      if (new Date(bot.lastSeenAt).getTime() < now - BOTS.heartbeatSec * 1000) await prisma.user.update({ where: { id: bot.id }, data: { lastSeenAt: new Date(now) } });
      if (m.busy || inX1.has(bot.id)) continue; // no X1 não chuta (está na tela da partida)
      const what = choose(bot, m, session, now);
      if (!what) continue;
      m.busy = true;
      out.actions++;
      setTimeout(() => act(bot, m, what), between(500, BOTS.tickMs - 1500)); // espalhado dentro da volta
    }
    out.x1 = inX1.size;
    const v = await botsX1Round(bots, now); // (x1Available: em sessão OU na janela da persona)
    if (v) { out.x1++; out.x1Sent = v.bot; }
  } catch (e) {
    console.error('[bots] volta:', e);
    tg.error(`Bots (motor): ${tg.esc(String(e?.message || e).slice(0, 300))}`, { key: 'bots-tick', every: 30 * 60_000 });
  } finally {
    ticking = false;
  }
  return out;
}

let timer = null;
export function startBots() {
  if (timer) return;
  timer = setInterval(() => botsTick(), BOTS.tickMs);
  setTimeout(() => botsTick(), 5_000);
}

// ─── Criação (scripts/bots.js) ────────────────────────────────────────────────
/** Persona = os campos da lista que dizem COMO o bot joga (o resto é conta). */
export const personaOf = (b) => ({ profile: b.profile, windows: b.windows, kinds: b.kinds || {}, skills: b.skills ?? null, pass: b.pass !== false, x1: b.x1 ?? null });

/**
 * Cria as contas da lista que ainda não existem (nick em uso por conta de verdade = pulado com aviso).
 * A data de cadastro fica `since` dias atrás, numa hora sorteada dentro das janelas da persona (não é todo
 * mundo "criado às 14:03 do mesmo dia"). E-mail interno (@bots.jogagol.com.br), senha aleatória (ninguém entra).
 */
export async function createBots(list, { now = Date.now(), log = () => {} } = {}) {
  const created = [], skipped = [];
  for (const b of list) {
    const nickLower = b.nick.toLowerCase();
    const clash = await prisma.user.findUnique({ where: { nickLower }, select: { id: true, isBot: true } });
    if (clash) { skipped.push({ nick: b.nick, why: clash.isBot ? 'já criado' : 'NICK DE JOGADOR DE VERDADE' }); continue; }
    const team = await prisma.team.findUnique({ where: { slug: b.team } });
    if (!team) { skipped.push({ nick: b.nick, why: `time ${b.team} não existe` }); continue; }
    const persona = personaOf(b);
    const p = tzParts(new Date(now - (b.since ?? 1) * 86_400_000));
    const [h0, h1] = BOTS.windows[pick(persona.windows?.length ? persona.windows : ['noite'])];
    const createdAt = fromTz(p.y, p.m, p.d, intBetween(h0, h1 - 1), intBetween(0, 59));
    const u = await prisma.user.create({
      data: {
        nick: b.nick, nickLower, email: `${nickLower}@bots.jogagol.com.br`, gender: b.gender === 'F' ? 'F' : 'M',
        passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10),
        teamId: team.id, bio: b.bio ?? null, createdAt, lastSeenAt: createdAt,
        isBot: true, botJson: { persona },
      },
      select: { id: true, nick: true },
    });
    created.push({ id: u.id, nick: u.nick, team: team.name });
    log(`+ ${u.nick} (#${u.id}) → ${team.name}`);
  }
  return { created, skipped };
}

/** Regrava a persona dos bots já criados a partir da lista (mudou o jeito de jogar em data/bots.js). */
export async function refreshPersonas(list) {
  let n = 0;
  for (const b of list) {
    const u = await prisma.user.findUnique({ where: { nickLower: b.nick.toLowerCase() }, select: { id: true, isBot: true, botJson: true } });
    if (!u?.isBot) continue;
    await prisma.user.update({ where: { id: u.id }, data: { botJson: { ...(u.botJson || {}), persona: personaOf(b) } } });
    n++;
  }
  return n;
}

/** Quadro para o script `status`: cada bot, sessões de hoje e gols. */
export async function botsStatus(now = Date.now()) {
  const bots = await prisma.user.findMany({ where: { isBot: true, deletedAt: null }, include: { team: { select: { name: true, serie: true } } }, orderBy: { id: 'asc' } });
  const since = new Date(now - 24 * 3600_000);
  const goals = new Map((await prisma.goal.groupBy({ by: ['userId'], where: { userId: { in: bots.map((b) => b.id) }, createdAt: { gte: since } }, _count: { _all: true } })).map((g) => [g.userId, g._count._all]));
  const hm = (ms) => { const q = tzParts(new Date(ms)); return `${String(q.h).padStart(2, '0')}:${String(q.min).padStart(2, '0')}`; };
  return bots.map((b) => {
    const plan = b.botJson?.plan;
    const session = inSession(plan, now);
    return {
      id: b.id, nick: b.nick, team: b.team.name, serie: b.team.serie, profile: b.botJson?.persona?.profile,
      goalsTotal: b.goalsTotal, goals24h: goals.get(b.id) ?? 0, level: b.goalsTotal + (b.levelBonus ?? 0),
      online: !!session, today: plan?.day === calendarDay(new Date(now)) ? (plan.skip ? 'folga' : plan.sessions.map((s) => `${hm(s.from)}–${hm(s.to)}`).join(' ')) : '(sem plano)',
    };
  });
}
