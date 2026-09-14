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
import { GameError } from '../lib/errors.js';
import { dayNumberAt, nextResetAt } from '../lib/time.js';
import { MINIGAMES, RESET_HOUR, resetLabel, levelOf, DEXTERITY_MAX } from '../lib/rules.js';
import { FRANGACO as C, parseKick, stepEntry, stepIncoming, stepKick, stepSave, pendingExpired } from '../lib/frangaco.js';
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

/** Cria (se preciso) e tranca a linha do dia `day`. */
async function lockDayRow(tx, userId, day) {
  await tx.$executeRaw`
    INSERT INTO "DailyGame" ("userId", game, day, state, won, "createdAt", "updatedAt")
    VALUES (${userId}, 'FRANGACO', ${day}, '{}'::jsonb, false, now(), now())
    ON CONFLICT ("userId", game, day) DO NOTHING`;
  const [row] = await tx.$queryRaw`
    SELECT id, day, state, won, reward, "finishedAt" FROM "DailyGame"
     WHERE "userId" = ${userId} AND game = 'FRANGACO' AND day = ${day} FOR UPDATE`;
  return row;
}

const freshCtx = (base, row) => ({ ...base, row, st: { ...row.state }, day: row.day, patch: {} });

async function withFrangaco(userId, fn) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  const teams = await allTeams();
  return prisma.$transaction(async (tx) => {
    const base = { tx, now, teams, userId };
    // Torneio começado ANTES da virada das 20h continua na linha de ONTEM. Trocar de linha no
    // meio do run era a CAUSA do "ERRO — defesa não registrada": às 20h em ponto o `day` mudava,
    // nascia uma linha vazia e o /save respondia 409 no-run com o duelo em andamento.
    const [prev] = await tx.$queryRaw`
      SELECT id, day, state, won, reward, "finishedAt" FROM "DailyGame"
       WHERE "userId" = ${userId} AND game = 'FRANGACO' AND day = ${day - 1}
         AND "finishedAt" IS NULL AND state->'run'->>'status' = 'ativo'
       FOR UPDATE`;
    const ctx = prev ? freshCtx(base, prev) : freshCtx(base, await lockDayRow(tx, userId, day));
    // defesa que estourou o tempo com a aba fechada: resolve sozinha como gol da IA (se isso
    // fechar o run de ontem, a linha de ontem é gravada fechada e a PRÓXIMA requisição já cai
    // na linha de hoje — o torneio de hoje continua disponível)
    if (!ctx.row.finishedAt) {
      const fimEntrada = stepEntry(rand, ctx.st, now.getTime());
      if (fimEntrada) await applyFim(ctx, fimEntrada, null);
    }
    const extra = (await fn(ctx)) ?? {};
    await tx.dailyGame.update({ where: { id: ctx.row.id }, data: { state: ctx.st, ...ctx.patch } });
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

/** A linha "corrente": um run ATIVO de ontem (torneio que atravessou a virada das 20h)
 *  tem prioridade sobre a linha de hoje — o MESMO critério do lock em withFrangaco. */
async function findRow(userId, day) {
  const prev = await prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'FRANGACO', day: day - 1 } } });
  if (prev && !prev.finishedAt && prev.state?.run?.status === 'ativo') return prev;
  return prisma.dailyGame.findUnique({ where: { userId_game_day: { userId, game: 'FRANGACO', day } } });
}

export async function frangacoState(userId) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  let row = await findRow(userId, day);
  if (row && !row.finishedAt && row.state?.run?.status === 'ativo' && pendingExpired(row.state.run, now.getTime())) {
    await withFrangaco(userId, async () => ({})); // fecha a defesa vencida pelo relógio
    row = await findRow(userId, day);
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
  // O Unity só pede /state DEPOIS da cerimônia de fim (2,6 s de CAMPEÃO/ELIMINADO) — é o
  // momento em que ele vai para o lobby com o botão JOGAR. Marcamos `lobbyAt` para o wrapper
  // (GET /resultado) cobrir esse lobby com "Voltar ao jogo" em vez de deixar começar outro.
  if (row && row.state?.run && row.state.run.status !== 'ativo' && !row.state.lobbyAt) {
    await prisma.dailyGame.update({ where: { id: row.id }, data: { state: { ...row.state, lobbyAt: now.getTime() } } });
  }
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
    // já servida e ainda no ar (recarregou a página): o step devolve a MESMA, sem zerar o relógio
    const p = stepIncoming(rand, st, now.getTime(), !!(ctx.row.finishedAt ?? ctx.patch.finishedAt));
    const adv = teams.find((t) => t.id === st.run.oppIds[st.run.rodada - 1]);
    return { alvo: p.alvo, janelaMs: p.janelaMs, raio: p.raio, cobrador: adv ? batedorDe(adv) : 'O cobrador' };
  });
}

/* ─────────────────────────── POST /api/frangaco/kick ─────────────────────────── */

export function frangacoKick(userId, body = {}) {
  const aim = parseKick(body);
  return withFrangaco(userId, async (ctx) => {
    const user = await loadUser(ctx.tx, userId);
    const { r, fim } = stepKick(rand, ctx.st, { ...aim, dexterity: user.dexterity },
      !!(ctx.row.finishedAt ?? ctx.patch.finishedAt));
    const mensagem = await applyFim(ctx, fim, user);
    return {
      resultado: { gol: r.gol, xBola: r.xBola, yBola: r.yBola, xGk: r.xGk, motivo: r.motivo, fintou: r.fintou },
      mensagem: mensagem ?? mensagemKick(r),
      run: runView(ctx.row, ctx.st, ctx.teams, user.nick),
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
    // REGRA DE OURO: em jogo legítimo o /save nunca responde erro — o step reprisa a última
    // defesa quando não há pendência (toque duplo, resposta perdida, fechada pelo relógio)
    const res = stepSave(rand, st, body, ctx.now.getTime(), !!(ctx.row.finishedAt ?? ctx.patch.finishedAt));
    const user = await loadUser(ctx.tx, userId);
    if (res.replay) {
      return {
        resultado: res.replay.resultado, mensagem: mensagemSave(res.replay.resultado),
        run: runView(ctx.row, st, ctx.teams, user.nick),
        dueloFinal: res.replay.dueloFinal ?? null, avancou: !!res.replay.avancou,
      };
    }
    const { d, fim } = res;
    const mensagem = await applyFim(ctx, fim, user);
    return {
      resultado: { defendeu: d.defendeu, gol: d.gol, alvo: d.alvo, motivo: d.motivo },
      mensagem: mensagem ?? mensagemSave(d),
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

/* ─────────────────────────── desfecho do lance no mundo ─────────────────────────── */

/**
 * Aplica o desfecho devolvido por advanceRun (via steps da lib): fecha a linha do dia,
 * paga o campeão e monta a mensagem. Devolve a mensagem (ou null se o duelo só segue).
 */
async function applyFim(ctx, fim, user) {
  if (!fim?.outcome) return null;
  const { tx, now, teams } = ctx;
  const adv = teams.find((t) => t.id === fim.advTeamId);
  if (fim.outcome === 'eliminado') {
    ctx.patch = { ...ctx.patch, finishedAt: now, won: false, reward: null };
    return `Fim de linha na ${C.fases[fim.faseIdx]}. Só o campeão pontua — amanhã tem torneio novo.`;
  }
  if (fim.outcome === 'avancou') {
    const prox = teams.find((t) => t.id === fim.proxTeamId);
    return `Bateu o ${adv?.name ?? 'adversário'}! ${C.fases[fim.faseIdx + 1]} contra o ${prox?.name ?? 'próximo'}.`;
  }
  // CAMPEÃO: a única forma de pontuar — 1 gol (kind FRANGACO) + R$ 500 + 20 de nível
  const u = user ?? await loadUser(tx, ctx.userId);
  const placar = `${fim.dueloFinal.golsUser} x ${fim.dueloFinal.golsIa}`;
  const match = await liveMatchForTeam(u.teamId, tx);
  const { text } = await applyResult(tx, u, {
    kind: 'FRANGACO', goal: true, now, match, money: C.championMoney,
    phrase: `é CAMPEÃO do Frangaço: bateu o ${adv?.name ?? 'adversário'} por ${placar} na final`,
  });
  await tx.user.update({ where: { id: u.id }, data: { levelBonus: { increment: C.championLevelPoints } } });
  ctx.patch = {
    ...ctx.patch, finishedAt: now, won: true,
    reward: { goal: true, champion: true, money: C.championMoney, levelPoints: C.championLevelPoints, text },
  };
  return `CAMPEÃO DO FRANGAÇO! +1 gol, R$ ${C.championMoney} e +${C.championLevelPoints} de nível.`;
}

/* ─────────────────────────── GET /api/daily/frangaco (hub) ─────────────────────────── */

/** Estado simples para o slider da Home (o jogo mesmo é o Unity em /tv/). */
export async function frangacoHub(userId) {
  const now = new Date();
  const day = dayNumberAt(HOUR, now);
  const row = await findRow(userId, day); // um run ativo de ontem aparece como CONTINUAR
  const finished = !!row?.finishedAt;
  return {
    day, nextAt: nextResetAt(HOUR, now).getTime(), serverTime: now.getTime(), freePlay: FREE,
    available: !finished, started: !!row?.state?.run && !finished, finished, won: !!row?.won,
    status: row?.state?.run?.status ?? null, reward: row?.reward ?? null,
  };
}

/* ─────────────────────────── GET /api/frangaco/resultado (wrapper) ─────────────────────────── */

/**
 * Fim do torneio para o WRAPPER (Frangaco.tsx), SEM efeito colateral: o Unity não tem
 * botão "sair" — depois do torneio ele volta ao lobby com JOGAR. O wrapper consulta isto a
 * cada 1,5 s e, quando `lobby` vira true (o Unity já pediu /state depois do fim), cobre o
 * jogo com "Voltar ao jogo" (e "Jogar de novo" no modo teste).
 */
export async function frangacoResultado(userId, freePlay = false) {
  const now = new Date();
  const row = await findRow(userId, dayNumberAt(HOUR, now));
  const st = row?.state ?? {};
  const run = st.run ?? null;
  const fim = run && run.status !== 'ativo';
  const ultimo = run?.historico?.length ? run.historico[run.historico.length - 1] : null;
  return {
    finished: !!row?.finishedAt || !!fim,
    status: fim ? run.status : null,
    lobby: !!st.lobbyAt,
    champion: !!st.champion,
    fase: ultimo ? C.fases[ultimo.rodada - 1] ?? null : null,
    golsUser: ultimo?.golsUser ?? null,
    golsIa: ultimo?.golsIa ?? null,
    nextAt: nextResetAt(HOUR, now).getTime(),
    freePlay: FREE || freePlay,
  };
}

/** Modo teste (MINIGAMES_LIVRES ou conta de teste do dono): apaga o torneio terminado para jogar de novo. */
export async function frangacoReset(userId) {
  const r = await prisma.dailyGame.deleteMany({ where: { userId, game: 'FRANGACO', finishedAt: { not: null } } });
  return { ok: true, removed: r.count };
}
