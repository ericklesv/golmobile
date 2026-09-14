/**
 * Frangaço — o TORNEIO de pênaltis do Managol, portado 1:1: o jogo é o cliente
 * Unity WebGL (/tv/?mode=penalty) e esta API fala O CONTRATO dele em
 * /api/frangaco/* (routes/frangacoTv.js). O torneio INTEIRO acontece numa
 * sessão: 5 clubes da MESMA SÉRIE no caminho (sorteio aqui, sem repetir),
 * duelo de 5 cobranças alternadas (você bate, depois defende), morte súbita no
 * empate — e SÓ O CAMPEÃO pontua: 1 gol (kind FRANGACO) + R$ 500 + 20 de nível.
 * Eliminado = nada; torneio novo no dia seguinte (vira às 20h: RESET_HOUR).
 *
 * 1 torneio (run) por dia via DailyGame (game 'FRANGACO'); o estado do run
 * inteiro fica no `state` JSON da linha:
 *   { champion, run: { status: 'ativo'|'campeao'|'eliminado', rodada (1..5),
 *     oppIds: [5 ids], duel: { turn: 'user'|'ia', kicks, defenses, pending },
 *     historico: [{ rodada, teamId, golsUser, golsIa, venceu }] } }
 * `champion` fica no topo por causa da query jsonb do ranking de títulos.
 * A matemática do lance fica em lib/frangaco.js; o Unity só encena.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '../prisma.js';
import { GameError, badRequest } from '../lib/errors.js';
import { dayNumberAt, nextResetAt } from '../lib/time.js';
import { MINIGAMES, RESET_HOUR, resetLabel, levelOf, DEXTERITY_MAX } from '../lib/rules.js';
import { FRANGACO as C, resolveKick, newIncoming, resolveSave, duelStatus } from '../lib/frangaco.js';
import { applyResult, loadUser } from './play.js';
import { liveMatchForTeam, currentRound } from './league.js';

const HOUR = RESET_HOUR.FRANGACO;
const DONE = () => `Você já disputou o Frangaço. Ele renova ${resetLabel('FRANGACO')}!`;
const rand = () => randomInt(0, 2 ** 32) / 2 ** 32; // sorteio criptográfico (não dá para prever)
// Teste local (MINIGAMES_LIVRES=1 no api/.env, NUNCA em produção): joga de novo sem esperar as 20h.
const FREE = process.env.NODE_ENV !== 'production' && process.env.MINIGAMES_LIVRES === '1';

let teamsCache = { at: 0, list: [] };
async function allTeams() {
  if (Date.now() - teamsCache.at > 5 * 60_000) teamsCache = { at: Date.now(), list: await prisma.team.findMany({ orderBy: { id: 'asc' } }) };
  return teamsCache.list;
}

/* ─────────────────────────── projeções (contrato do Unity/Flutter) ─────────────────────────── */

// Escudos reais em web/public/escudos/<slug>.svg|png. O Unity só decodifica PNG
// (UnityWebRequestTexture); os SVG caem no fallback dele (sem escudo, sem erro).
// Mesma lista do Shield.tsx — mudou lá, mudar aqui.
const PNG = new Set(['fortaleza', 'juventude', 'ferroviaria', 'mirassol', 'america-rn', 'csa', 'brasiliense']);
const crest = (slug) => `/escudos/${slug}.${PNG.has(slug) ? 'png' : 'svg'}`;

/** Kit no formato do TraceKit.From (ManagolTrace.cs): shirt/shorts/socks {model, primary, secondary}. */
const kitOf = (p, s) => ({
  shirt: { model: 'solid', primary: p, secondary: s },
  shorts: { model: 'solid', primary: s, secondary: p },
  socks: { model: 'solid', primary: p, secondary: s },
});

// Elenco fictício dos clubes IA (nome estável por time — o Unity anuncia "FULANO vai bater...")
const NOMES = ['Ademir', 'Bira', 'Careca', 'Dedé', 'Edmilson', 'Fumaça', 'Gerson', 'Índio', 'Juba', 'Kléber', 'Lima', 'Maranhão', 'Nenê', 'Orelha', 'Pituca', 'Russo', 'Sombra', 'Tonhão', 'Valdo', 'Xandão', 'Zé Roberto'];
const batedorDe = (t) => NOMES[(t.id * 7 + 3) % NOMES.length];
const goleiroDe = (t) => NOMES[(t.id * 11 + 5) % NOMES.length];

const clubView = (t) => (t ? { clube: t.name, logo: crest(t.slug), sigla: t.abbr, slug: t.slug } : { clube: '—' });
const advView = (t) => (t ? {
  ...clubView(t),
  kitHome: kitOf(t.colorPrimary, t.colorSecondary),
  kitAway: kitOf(t.colorSecondary, t.colorPrimary), // cores invertidas
  batedorNome: batedorDe(t), goleiroNome: goleiroDe(t),
} : { clube: '—' });

/** O `run` como o ManagolPenalty.cs / frangaco_models.dart parseiam. */
function runView(row, st, teams, meNick) {
  const r = st?.run;
  if (!r) return null;
  const byId = new Map(teams.map((t) => [t.id, t]));
  const adv = byId.get(r.oppIds[r.rodada - 1]);
  const golsUser = r.duel.kicks.filter((k) => k.gol).length;
  const golsIa = r.duel.defenses.filter((d) => d.gol).length;
  return {
    id: row.id, status: r.status, rodada: r.rodada, totalRodadas: C.fases.length,
    fase: C.fases[r.rodada - 1],
    adversario: advView(adv),
    proximos: r.oppIds.slice(r.rodada).map((id) => clubView(byId.get(id))),
    duelo: {
      vez: r.duel.turn, user: r.duel.kicks, ia: r.duel.defenses,
      golsUser, golsIa, aguardandoDefesa: !!r.duel.pending,
    },
    historico: r.historico.map((h) => ({
      fase: C.fases[h.rodada - 1], adversario: byId.get(h.teamId)?.name ?? '—',
      placar: `${h.golsUser}x${h.golsIa}`, venceu: h.venceu,
    })),
    meuBatedor: meNick, meuGoleiro: meNick, batedorDesignado: true,
  };
}

/* ─────────────────────────── transação padrão dos minigames ─────────────────────────── */

const expired = (pending, now) => !!pending && now.getTime() - pending.servedAt > C.pendingBudgetMs;

async function withFrangaco(userId, fn) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  const teams = await allTeams();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
      VALUES (${userId}, 'FRANGACO', ${day}, '{}'::jsonb, false, now(), now())
      ON CONFLICT ("userId", game, day) DO NOTHING`;
    const [row] = await tx.$queryRaw`
      SELECT id, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'FRANGACO' AND day = ${day} FOR UPDATE`;
    const ctx = { tx, row, st: { ...row.state }, now, day, teams, userId, patch: {} };
    // defesa que estourou o tempo com a aba fechada: resolve sozinha como gol da IA
    if (!row.finishedAt && ctx.st.run?.status === 'ativo' && expired(ctx.st.run.duel?.pending, now)) {
      await applySave(ctx, null);
    }
    const extra = (await fn(ctx)) ?? {};
    await tx.dailyGame.update({ where: { id: row.id }, data: { state: ctx.st, ...ctx.patch } });
    return extra;
  });
}

function requireUnlocked(user) {
  const g = MINIGAMES.find((m) => m.id === 'FRANGACO');
  if (g && levelOf(user).lvl < g.unlock) throw new GameError(403, 'locked', `Frangaço libera no nível ${g.unlock}.`);
}

/* ─────────────────────────── GET /api/frangaco/state ─────────────────────────── */

/** Temporada do Frangaço = a temporada da LIGA do JogaGol (fim estimado: 24h por rodada restante). */
async function temporadaView(now) {
  const round = await currentRound();
  if (!round) return { numero: 1, fim: null, diasRestantes: 0 };
  const fimMs = round.endsAt.getTime() + (round.season.totalRounds - round.number) * 86_400_000;
  return {
    numero: round.season.number,
    fim: new Date(fimMs).toISOString(),
    diasRestantes: Math.max(0, Math.ceil((fimMs - now.getTime()) / 86_400_000)),
    inicio: round.season.startsAt,
  };
}

/** Títulos do Frangaço na temporada corrente, agrupados por jogador (projeto pequeno: agrega em JS). */
async function titulosDaTemporada(desde) {
  const rows = await prisma.$queryRaw`
    SELECT "userId", COUNT(*)::int AS titulos FROM "DailyGame"
     WHERE game = 'FRANGACO' AND state->>'champion' = 'true' AND "finishedAt" >= ${desde}
     GROUP BY "userId" ORDER BY titulos DESC, "userId" ASC`;
  return rows;
}

export async function frangacoState(userId) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  let row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'FRANGACO', day } } });
  if (row && !row.finishedAt && row.state?.run?.status === 'ativo' && expired(row.state.run.duel?.pending, now)) {
    await withFrangaco(userId, async () => ({})); // fecha a defesa vencida pelo relógio
    row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'FRANGACO', day } } });
  }
  const [user, teams, temporada] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { team: true } }),
    allTeams(),
    temporadaView(now),
  ]);
  const desde = temporada.inicio ?? new Date(0);
  delete temporada.inicio;
  const titulos = await titulosDaTemporada(desde);
  const meus = titulos.find((t) => t.userId === userId)?.titulos ?? 0;
  const top = titulos.slice(0, 10);
  const players = top.length
    ? await prisma.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, include: { team: true } })
    : [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const lvl = levelOf(user).lvl;
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    temporada,
    meuTime: { ...clubView(user.team), kitHome: kitOf(user.team.colorPrimary, user.team.colorSecondary) },
    // batedor e goleiro = o PRÓPRIO jogador: precisão pela destreza, reflexo pelo nível (0,35–0,8)
    meuBatedor: { nome: user.nick, precisao: r2(0.4 + 0.6 * Math.min(1, user.dexterity / DEXTERITY_MAX)), designado: true },
    meuGoleiro: { nome: user.nick, reflexo: r2(0.35 + 0.45 * Math.min(1, lvl / 20)), designado: true },
    meusTitulos: meus,
    minhaPosicao: meus > 0 ? titulos.findIndex((t) => t.userId === userId) + 1 : null,
    ranking: top.map((t, i) => {
      const p = byId.get(t.userId);
      return { posicao: i + 1, userId: t.userId, titulos: t.titulos, nick: p?.nick ?? '—', ...clubView(p?.team) };
    }),
    run: row ? runView(row, row.state, teams, user.nick) : null,
  };
}

/* ─────────────────────────── POST /api/frangaco/run ─────────────────────────── */

export function frangacoRun(userId) {
  return withFrangaco(userId, async (ctx) => {
    const { st, row, tx, teams } = ctx;
    const user = await loadUser(tx, userId);
    if (st.run?.status === 'ativo') return { run: runView(row, st, teams, user.nick) }; // retoma
    const done = row.finishedAt ?? ctx.patch.finishedAt; // o patch cobre a defesa recém-fechada pelo relógio
    if (done && !FREE) throw new GameError(409, 'finished', DONE());
    if (done) ctx.patch = { finishedAt: null, won: false, reward: null }; // teste local
    requireUnlocked(user);
    // 5 clubes da MESMA série no caminho, sem repetir (série curta completa com o resto da liga)
    const pool = teams.filter((t) => t.serie === user.team.serie && t.id !== user.teamId);
    const outros = teams.filter((t) => t.serie !== user.team.serie && t.id !== user.teamId);
    const sorteados = [];
    for (const fonte of [pool, outros]) {
      const resto = [...fonte];
      while (sorteados.length < C.fases.length && resto.length) {
        sorteados.push(resto.splice(randomInt(resto.length), 1)[0].id);
      }
    }
    st.run = {
      status: 'ativo', rodada: 1, oppIds: sorteados,
      duel: { turn: 'user', kicks: [], defenses: [], pending: null },
      historico: [],
    };
    st.champion = false;
    return { run: runView(row, st, teams, user.nick) };
  });
}

/* ─────────────────────────── POST /api/frangaco/incoming ─────────────────────────── */

export function frangacoIncoming(userId) {
  return withFrangaco(userId, async (ctx) => {
    const { st, teams, now } = ctx;
    const run = st.run;
    if (run?.status !== 'ativo') throw new GameError(409, 'no-run', ctx.row.finishedAt ? DONE() : 'Comece um torneio do Frangaço.');
    if (run.duel.turn !== 'ia') throw new GameError(409, 'not-your-defense', 'Agora é a sua vez de BATER.');
    const adv = teams.find((t) => t.id === run.oppIds[run.rodada - 1]);
    // já servida e ainda no ar (recarregou a página): devolve a MESMA, sem zerar o relógio
    if (!run.duel.pending) {
      const sudden = run.duel.defenses.length >= C.kicks;
      run.duel.pending = { n: run.duel.defenses.length + 1, ...newIncoming(rand, run.rodada - 1, sudden), servedAt: now.getTime() };
    }
    const p = run.duel.pending;
    return { alvo: p.alvo, janelaMs: p.janelaMs, raio: p.raio, cobrador: adv ? batedorDe(adv) : 'O cobrador' };
  });
}

/* ─────────────────────────── POST /api/frangaco/kick ─────────────────────────── */

const num01 = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

export function frangacoKick(userId, body = {}) {
  const xAnunciado = num01(body.xAnunciado);
  if (xAnunciado === null) throw badRequest('Mire dentro do gol.', 'bad-aim');
  const xReal = body.xReal == null ? null : num01(body.xReal);
  if (body.xReal != null && xReal === null) throw badRequest('Finta inválida.', 'bad-aim');
  return withFrangaco(userId, async (ctx) => {
    const { st } = ctx;
    const run = st.run;
    if (run?.status !== 'ativo') throw new GameError(409, 'no-run', ctx.row.finishedAt ? DONE() : 'Comece um torneio do Frangaço.');
    if (run.duel.turn !== 'user') throw new GameError(409, 'not-your-kick', 'Agora é a sua vez de DEFENDER.');
    const user = await loadUser(ctx.tx, userId);
    const r = resolveKick(rand, { xAnunciado, xReal, dexterity: user.dexterity });
    run.duel.kicks.push({
      n: run.duel.kicks.length + 1, gol: r.gol, motivo: r.motivo, fintou: r.fintou,
      xAnunciado, xReal, xBola: r.xBola, yBola: r.yBola, xGk: r.xGk, keeperMs: r.keeperMs ?? null,
    });
    const fim = await advance(ctx, user);
    return {
      resultado: { gol: r.gol, xBola: r.xBola, yBola: r.yBola, xGk: r.xGk, motivo: r.motivo, fintou: r.fintou },
      mensagem: fim.mensagem ?? mensagemKick(r),
      run: runView(ctx.row, st, ctx.teams, user.nick),
      dueloFinal: fim.dueloFinal, avancou: fim.avancou,
    };
  });
}

const mensagemKick = (r) => {
  if (r.gol) return r.fintou ? 'A finta enganou o goleiro!' : 'No canto certo!';
  if (r.motivo === 'defendeu') return r.fintou ? 'O goleiro desconfiou da finta.' : 'Sem finta o goleiro leu fácil.';
  if (r.motivo === 'travessao') return 'Explodiu no ferro!';
  return 'Mandou pra fora.';
};

/* ─────────────────────────── POST /api/frangaco/save ─────────────────────────── */

export function frangacoSave(userId, body = {}) {
  return withFrangaco(userId, async (ctx) => {
    const { st } = ctx;
    const run = st.run;
    // a defesa pode ter sido fechada pelo relógio na entrada do withFrangaco (ou é um
    // toque duplo): devolve o último resultado em vez de erro — o Unity segue o run
    if (run?.duel?.defenses?.length && !run.duel.pending && (run.status !== 'ativo' || run.duel.turn === 'user')) {
      const d = run.duel.defenses.at(-1);
      const user = await loadUser(ctx.tx, userId);
      return {
        resultado: { defendeu: d.defendeu, gol: d.gol, alvo: d.alvo, motivo: d.motivo },
        mensagem: mensagemSave(d),
        run: runView(ctx.row, st, ctx.teams, user.nick), dueloFinal: null, avancou: false,
      };
    }
    if (run?.status !== 'ativo') throw new GameError(409, 'no-run', ctx.row.finishedAt ? DONE() : 'Comece um torneio do Frangaço.');
    if (run.duel.turn !== 'ia' || !run.duel.pending) throw new GameError(409, 'not-your-defense', 'Agora é a sua vez de BATER.');
    const ms = typeof body.ms === 'number' && Number.isFinite(body.ms) ? Math.round(body.ms) : null;
    const click = ms === null ? null : { x: num01(body.x) ?? NaN, y: num01(body.y) ?? NaN, ms };
    const user = await loadUser(ctx.tx, userId);
    const fim = await applySave(ctx, click, user);
    const d = run.duel.defenses.at(-1);
    return {
      resultado: { defendeu: d.defendeu, gol: d.gol, alvo: d.alvo, motivo: d.motivo },
      mensagem: fim.mensagem ?? mensagemSave(d),
      run: runView(ctx.row, st, ctx.teams, user.nick),
      dueloFinal: fim.dueloFinal, avancou: fim.avancou,
    };
  });
}

const mensagemSave = (d) => {
  if (d.defendeu) return d.motivo === 'esticou' ? 'Esticou tudo e pegou!' : 'Defesa firme!';
  if (d.motivo === 'tarde') return 'Reagiu tarde demais.';
  if (d.motivo === 'antecipou') return 'Pulou antes da hora.';
  if (d.motivo === 'parado') return 'A janela passou com você parado.';
  if (d.motivo === 'vazou') return 'Tocou na bola... e ela escapou.';
  return 'A bola morreu no canto.';
};

/** Resolve a defesa pendente (click null = não clicou) e move o duelo adiante. */
async function applySave(ctx, click, user = null) {
  const { st, tx, now } = ctx;
  const run = st.run;
  const pending = run.duel.pending;
  const r = resolveSave(rand, pending, click, now.getTime() - pending.servedAt);
  run.duel.defenses.push({
    n: pending.n, gol: r.gol, defendeu: r.defendeu, motivo: r.motivo,
    alvo: pending.alvo, clique: click && Number.isFinite(click.x) ? { x: click.x, y: click.y } : null,
    ms: click?.ms ?? null, janelaMs: pending.janelaMs,
  });
  run.duel.pending = null;
  return advance(ctx, user ?? await loadUser(tx, ctx.userId));
}

/* ─────────────────────────── avanço do torneio ─────────────────────────── */

/**
 * Depois de cada lance: duelo segue (troca a vez), avança de fase, consagra o
 * campeão ou elimina. Devolve { dueloFinal, avancou, mensagem } para a resposta.
 */
async function advance(ctx, user) {
  const { st, tx, now, teams } = ctx;
  const run = st.run;
  const status = duelStatus(run.duel.kicks, run.duel.defenses);
  if (!status.over) {
    run.duel.turn = run.duel.turn === 'user' ? 'ia' : 'user';
    return { dueloFinal: null, avancou: false, mensagem: null };
  }
  const advId = run.oppIds[run.rodada - 1];
  const adv = teams.find((t) => t.id === advId);
  run.historico.push({ rodada: run.rodada, teamId: advId, golsUser: status.golsUser, golsIa: status.golsIa, venceu: status.venceu });
  const dueloFinal = { golsUser: status.golsUser, golsIa: status.golsIa, vencedor: status.venceu ? 'user' : 'ia' };

  if (!status.venceu) {
    run.status = 'eliminado';
    ctx.patch = { ...ctx.patch, finishedAt: now, won: false, reward: null };
    return { dueloFinal, avancou: false, mensagem: `Fim de linha na ${C.fases[run.rodada - 1]}. Só o campeão pontua — amanhã tem torneio novo.` };
  }
  if (run.rodada < C.fases.length) {
    run.rodada += 1;
    run.duel = { turn: 'user', kicks: [], defenses: [], pending: null };
    const prox = teams.find((t) => t.id === run.oppIds[run.rodada - 1]);
    return { dueloFinal, avancou: true, mensagem: `Bateu o ${adv?.name ?? 'adversário'}! ${C.fases[run.rodada - 1]} contra o ${prox?.name ?? 'próximo'}.` };
  }
  // CAMPEÃO: a única forma de pontuar — 1 gol (kind FRANGACO) + R$ 500 + 20 de nível
  run.status = 'campeao';
  st.champion = true;
  const placar = `${status.golsUser} x ${status.golsIa}`;
  const match = await liveMatchForTeam(user.teamId, tx);
  const { text } = await applyResult(tx, user, {
    kind: 'FRANGACO', goal: true, now, match, money: C.championMoney,
    phrase: `é CAMPEÃO do Frangaço: bateu o ${adv?.name ?? 'adversário'} por ${placar} na final`,
  });
  await tx.user.update({ where: { id: user.id }, data: { levelBonus: { increment: C.championLevelPoints } } });
  ctx.patch = {
    ...ctx.patch, finishedAt: now, won: true,
    reward: { goal: true, champion: true, money: C.championMoney, levelPoints: C.championLevelPoints, text },
  };
  return { dueloFinal, avancou: false, mensagem: `CAMPEÃO DO FRANGAÇO! +1 gol, R$ ${C.championMoney} e +${C.championLevelPoints} de nível.` };
}

/* ─────────────────────────── GET /api/daily/frangaco (hub) ─────────────────────────── */

/** Estado simples para o slider da Home (o jogo mesmo é o Unity em /tv/). */
export async function frangacoHub(userId) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  const row = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'FRANGACO', day } } });
  const finished = !!row?.finishedAt;
  return {
    day, nextAt: nextResetAt(HOUR, now).getTime(), serverTime: now.getTime(), freePlay: FREE,
    available: !finished, started: !!row?.state?.run && !finished, finished, won: !!row?.won,
    status: row?.state?.run?.status ?? null, reward: row?.reward ?? null,
  };
}
