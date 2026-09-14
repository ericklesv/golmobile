/**
 * Frangaço — regras puras do torneio de pênaltis do Managol (cliente Unity WebGL
 * em /tv/?mode=penalty; contrato JSON lido de ManagolPenalty.cs). Tudo em
 * coordenadas 0..1 do gol (x: 0 = trave esquerda do batedor, 1 = direita;
 * y: 0 = chão, 1 = travessão). O serviço (services/frangaco.js) cuida do banco;
 * aqui só matemática e sorteio — SEMPRE com o `rand` injetado (criptográfico).
 *
 * COBRANÇA (a mecânica do Penalty Fever): a seta do Unity varre a LARGURA do
 * gol; o 1º clique trava `xAnunciado` (o canto que o goleiro lê) e o 2º clique,
 * opcional, trava `xReal` (a finta). Sem `xReal` a bola vai na anunciada e o
 * goleiro quase sempre pega. A ALTURA da bola é sorteada aqui.
 * DEFESA: o servidor sorteia um alvo + janela de reação; o clique chega em
 * {ms, x, y} e é validado pelo relógio DO SERVIDOR (tolerância de rede).
 */
import { DEXTERITY_MAX } from './rules.js';
import { GameError, badRequest } from './errors.js';

export const FRANGACO = {
  kicks: 5,                    // cobranças de cada lado
  suddenMax: 3,                // rodadas de morte súbita (6ª a 8ª)
  // Nomes IGUAIS aos NomesFases do ManagolPenaltyTelas.cs (o chaveamento rotula por eles)
  fases: ['Primeira Fase', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'],
  // Janela de reação da defesa por fase (ms) — aperta rumo à final; morte súbita corta mais 60 ms.
  // Rebalanceada em 14/09/2026 junto com o alvo pequeno: mirar um círculo de ~16 cm pede tempo
  // de MIRA além do reflexo (era 900→660 com o alvo gigante de 1,68 m, fácil demais).
  windowMs: [1250, 1180, 1110, 1040, 970],
  suddenWindowCut: 60,
  // Raio NORMALIZADO do alvo POR FASE. O Unity desenha um CÍRCULO em metros com diâmetro
  // max(0,15, raio×7,32×2) — DimensionarAlvo no ManagolPenalty.cs — e a validação aqui usa
  // EXATAMENTE esse círculo (distância em metros no plano do gol). Exigência do dono
  // (14/09/2026): no mínimo 1/10 do 0,115 antigo (1,68 m de diâmetro!) → ~16 cm na 1ª fase,
  // encolhendo por fase até o piso de desenho do Unity (15 cm).
  saveRadiusFase: [0.011, 0.0102, 0.0095, 0.0088, 0.008],
  minAlvoDiametroM: 0.15,      // piso do desenho no Unity (DimensionarAlvo) — a validação espelha
  netToleranceMs: 250,         // tolerância de rede na validação do toque
  incomingGraceMs: 4500,       // latência + suspense do Unity até o alvo aparecer (~0,3–0,7 s + rede lenta)
  pendingBudgetMs: 20_000,     // aba fechada: passou disso desde o /incoming, resolve como gol da IA
  goalW: 7.32, goalH: 2.44,
  // Cobrança
  spreadBase: 0.11,            // dispersão em x (fração do gol) com destreza 0
  spreadDexCut: 0.5,           // destreza máxima corta metade da dispersão
  fintaMin: 0.12,              // |xReal - xAnunciado| a partir daqui conta como finta de verdade
  keeperReach: 0.11,           // alcance base do goleiro IA (fração da largura do gol)
  dexReachCut: 0.25,           // destreza máxima encurta 25% do alcance efetivo do goleiro
  trustAnnounced: 0.88,        // sem finta: o goleiro "quase sempre pega" (vai no anunciado)
  announceBias: 0.62,          // com finta: chance do goleiro ACREDITAR no canto anunciado
  fintaReadChance: 0.7,        // desconfiou da finta: chance de ler o chute real (fintar tem risco)
  frangoChance: 0.05,          // FRANGAÇO! o goleiro engole uma defendível (motivo 'vazou')
  championMoney: 500,          // prêmio do campeão (5ª vitória)
  championLevelPoints: 20,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
/** Ruído ~gaussiano em [-1, 1] (média de 3 uniformes). */
const noise = (rand) => (rand() + rand() + rand()) / 1.5 - 1;

/**
 * Resolve a MINHA cobrança. `xAnunciado` 0..1 (o canto que o goleiro lê);
 * `xReal` 0..1 ou null (a finta — sem ela a bola vai na anunciada); a destreza
 * aperta a dispersão e "seca" o goleiro, como no pênalti/falta.
 * Devolve { gol, motivo, xBola, yBola, xGk, fintou } — motivos que o Unity
 * traduz: gol em 'gol' | 'tirou-tinta' | 'rebote-trave' | 'vazou' (frango);
 * perdeu em 'travessao' | 'fora' | 'defendeu'.
 */
export function resolveKick(rand, { xAnunciado, xReal, dexterity = 0 }) {
  const dex = clamp(dexterity / DEXTERITY_MAX, 0, 1);
  const fintou = xReal != null && Math.abs(xReal - xAnunciado) >= FRANGACO.fintaMin;
  const aim = xReal ?? xAnunciado;

  // dispersão: a bola não vai EXATAMENTE onde a seta parou; altura é sorteada
  const spread = FRANGACO.spreadBase * (1 - FRANGACO.spreadDexCut * dex);
  const xBola = aim + noise(rand) * spread;
  // altura sorteada do chão ao ângulo: de vez em quando beija o travessão (e às vezes passa)
  const yBola = clamp(0.08 + rand() * 0.9 + noise(rand) * spread * 0.8, 0.03, 1.08);

  // Goleiro IA: sem finta ele lê o anúncio e quase sempre vai certo; com finta,
  // ou acredita no anunciado (e come a finta), ou desconfia e tende a ler o real
  const guess = () => (rand() < 0.5 ? 0.10 + rand() * 0.2 : 0.7 + rand() * 0.2);
  const read = (x) => clamp(x + noise(rand) * 0.07, 0.04, 0.96);
  let xGk;
  if (!fintou) xGk = rand() < FRANGACO.trustAnnounced ? read(xAnunciado) : guess();
  else if (rand() < FRANGACO.announceBias) xGk = read(xAnunciado);
  else xGk = rand() < FRANGACO.fintaReadChance ? read(xBola) : guess();

  // fora (passou da trave ou por cima)
  if (xBola < -0.02 || xBola > 1.02 || yBola > 1.04) {
    return { gol: false, motivo: 'fora', xBola: clamp(xBola, -0.12, 1.12), yBola: clamp(yBola, 0, 1.2), xGk, fintou };
  }
  // no ferro: metade volta ('travessao'), metade explode e ENTRA ('rebote-trave')
  if (yBola > 0.94) {
    const entrou = rand() < 0.5;
    return { gol: entrou, motivo: entrou ? 'rebote-trave' : 'travessao', xBola: clamp01(xBola), yBola: clamp(yBola, 0, 1.04), xGk, fintou };
  }
  // alcance do goleiro: rasteira é mais fácil de pegar; a destreza "seca" o goleiro
  const reach = FRANGACO.keeperReach * (1 + (1 - clamp01(yBola)) * 0.9) * (1 - FRANGACO.dexReachCut * dex);
  const alcancou = Math.abs(xBola - xGk) <= reach && yBola <= 0.92;
  if (alcancou) {
    if (rand() < FRANGACO.frangoChance) {
      return { gol: true, motivo: 'vazou', xBola: clamp01(xBola), yBola, xGk, fintou }; // FRANGAÇO!
    }
    // defesa da IA: reação simulada (usada no desempate de "defesas mais rápidas")
    const keeperMs = Math.round(320 + rand() * 380);
    return { gol: false, motivo: 'defendeu', xBola: clamp01(xBola), yBola, xGk, fintou, keeperMs };
  }
  const naTinta = xBola < 0.06 || xBola > 0.94; // raspou o poste e entrou
  return { gol: true, motivo: naTinta ? 'tirou-tinta' : 'gol', xBola: clamp01(xBola), yBola, xGk, fintou };
}

/** Sorteia a cobrança da IA (a MINHA defesa): alvo no gol + janela de reação. */
export function newIncoming(rand, faseIdx, sudden) {
  const corner = rand() < 0.5 ? -1 : 1;
  const x = clamp(0.5 + corner * (0.16 + rand() * 0.3), 0.06, 0.94);
  const y = 0.12 + rand() * 0.72;
  const fase = clamp(faseIdx, 0, FRANGACO.windowMs.length - 1);
  const janelaMs = (FRANGACO.windowMs[fase] ?? 1250) - (sudden ? FRANGACO.suddenWindowCut : 0);
  return { alvo: { x, y }, janelaMs, raio: FRANGACO.saveRadiusFase[fase] ?? FRANGACO.saveRadiusFase.at(-1) };
}

/** Raio EM METROS que vale para um `raio` normalizado servido — o mesmo círculo que o
 *  Unity desenha (DimensionarAlvo: diâmetro = max(0,15, raio×7,32×2) m). */
export const raioMetros = (raio) => Math.max(FRANGACO.minAlvoDiametroM / 2, raio * FRANGACO.goalW);

/**
 * Valida a MINHA defesa. `pending` = { alvo, janelaMs, raio, servedAt };
 * `click` = { x, y, ms } (ms relativo ao alvo APARECER; null = não clicou);
 * `elapsedMs` = agora - servedAt no relógio DO SERVIDOR.
 * Devolve { defendeu, gol, motivo } com os motivos que o Unity traduz:
 * 'tarde' | 'antecipou' | 'parado' | 'esticou' | 'tirou-tinta' | 'rebote-trave' | 'vazou'.
 */
export function resolveSave(rand, pending, click, elapsedMs) {
  const { alvo, janelaMs, raio } = pending;
  // gol da IA com sabor pelo canto do alvo (usado quando a defesa falha)
  const golIa = () => {
    if (alvo.x < 0.1 || alvo.x > 0.9) return 'tirou-tinta';
    if (alvo.y > 0.8) return 'rebote-trave';
    return 'gol';
  };
  if (!click || !Number.isFinite(click.ms)) return { defendeu: false, gol: true, motivo: 'parado' };
  const { x, y, ms } = click;
  // janela: dentro do tempo declarado E coerente com o relógio do servidor
  const budget = FRANGACO.incomingGraceMs + janelaMs + FRANGACO.netToleranceMs;
  if (ms > janelaMs || elapsedMs > budget || ms > elapsedMs + FRANGACO.netToleranceMs) {
    return { defendeu: false, gol: true, motivo: 'tarde' };
  }
  if (ms < 120) return { defendeu: false, gol: true, motivo: 'antecipou' }; // pulou antes da bola sair
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { defendeu: false, gol: true, motivo: golIa() };
  // distância em METROS no plano do gol = exatamente o círculo que o Unity desenha
  // (antes era a distância NORMALIZADA: virava uma elipse achatada — clique na borda
  // de cima/baixo do círculo desenhado era recusado)
  const raioM = raioMetros(raio);
  const dist = Math.hypot((x - alvo.x) * FRANGACO.goalW, (y - alvo.y) * FRANGACO.goalH);
  if (dist > raioM) return { defendeu: false, gol: true, motivo: golIa() };
  // pegou: no limite do alcance foi "esticando" — e ali mora o frango ('vazou')
  if (dist > raioM * 0.8) {
    if (rand() < 0.18) return { defendeu: false, gol: true, motivo: 'vazou' }; // escapou das luvas
    return { defendeu: true, gol: false, motivo: 'esticou' };
  }
  return { defendeu: true, gol: false, motivo: 'defendeu' };
}

/**
 * Situação do duelo depois de cada lance (regra da misericórdia nas 5 primeiras
 * rodadas + morte súbita da 6ª à 8ª; na 8ª empatada, a defesa mais rápida decide
 * — a minha melhor contra a melhor da IA).
 * `kicks`/`defenses` = lances resolvidos. Devolve { golsUser, golsIa, over, venceu }.
 */
export function duelStatus(kicks, defenses) {
  const N = FRANGACO.kicks;
  const golsUser = kicks.filter((k) => k.gol).length;
  const golsIa = defenses.filter((d) => d.gol).length;
  const restUser = Math.max(0, N - kicks.length);
  const restIa = Math.max(0, N - defenses.length);
  // fase regular: acabou quando um lado não alcança mais o outro
  if (kicks.length <= N && defenses.length <= N) {
    if (golsUser > golsIa + restIa) return { golsUser, golsIa, over: true, venceu: true };
    if (golsIa > golsUser + restUser) return { golsUser, golsIa, over: true, venceu: false };
    if (kicks.length === N && defenses.length === N && golsUser !== golsIa) {
      return { golsUser, golsIa, over: true, venceu: golsUser > golsIa };
    }
    return { golsUser, golsIa, over: false, venceu: null }; // segue (5x5 = morte súbita)
  }
  // morte súbita: rodada completa (mesmo nº de cobranças e defesas) com placar diferente encerra
  if (kicks.length === defenses.length) {
    if (golsUser !== golsIa) return { golsUser, golsIa, over: true, venceu: golsUser > golsIa };
    if (kicks.length >= N + FRANGACO.suddenMax) {
      // persistiu o empate: defesas mais rápidas decidem (IA sem defesa registrada perde)
      const my = defenses.filter((d) => d.defendeu && Number.isFinite(d.ms)).map((d) => d.ms);
      const ia = kicks.filter((k) => Number.isFinite(k.keeperMs)).map((k) => k.keeperMs);
      const myBest = my.length ? Math.min(...my) : Infinity;
      const iaBest = ia.length ? Math.min(...ia) : Infinity;
      return { golsUser, golsIa, over: true, venceu: myBest <= iaBest }; // empate total: fica com o craque
    }
  }
  return { golsUser, golsIa, over: false, venceu: null };
}

/* ────────────────── máquina de estados por requisição (pura, sem banco) ──────────────────
 * `st` é o JSON da linha DailyGame ({ champion, run }); os steps MUTAM o `st` e devolvem o
 * que a resposta precisa. O serviço só cuida de transação, mensagens e prêmios. REGRA DE
 * OURO (dono, 14/09/2026): em jogo legítimo o /save NUNCA responde erro — caso degenerado
 * (demorou, toque duplo, reload, aba fechada) resolve graciosamente DENTRO do jogo; erro de
 * verdade só para requisição fora de contexto (sem run e sem nada para reprisar). */

const noRun = (finished) => new GameError(409, 'no-run',
  finished ? 'Você já disputou o Frangaço de hoje.' : 'Comece um torneio do Frangaço.');

export const pendingExpired = (run, nowMs) =>
  !!run?.duel?.pending && nowMs - run.duel.pending.servedAt > FRANGACO.pendingBudgetMs;

/**
 * Avança o torneio depois de um lance: troca a vez, fecha o duelo, sobe de fase, consagra
 * ou elimina. Devolve { dueloFinal, avancou, outcome, advTeamId, proxTeamId, faseIdx } —
 * outcome: null (duelo segue) | 'avancou' | 'eliminado' | 'campeao'.
 */
export function advanceRun(st) {
  const run = st.run;
  const status = duelStatus(run.duel.kicks, run.duel.defenses);
  if (!status.over) {
    run.duel.turn = run.duel.turn === 'user' ? 'ia' : 'user';
    return { dueloFinal: null, avancou: false, outcome: null };
  }
  const faseIdx = run.rodada - 1;
  const advTeamId = run.oppIds[faseIdx];
  run.historico.push({ rodada: run.rodada, teamId: advTeamId, golsUser: status.golsUser, golsIa: status.golsIa, venceu: status.venceu });
  const dueloFinal = { golsUser: status.golsUser, golsIa: status.golsIa, vencedor: status.venceu ? 'user' : 'ia' };
  if (!status.venceu) {
    run.status = 'eliminado';
    return { dueloFinal, avancou: false, outcome: 'eliminado', advTeamId, faseIdx };
  }
  if (run.rodada < FRANGACO.fases.length) {
    run.rodada += 1;
    run.duel = { turn: 'user', kicks: [], defenses: [], pending: null };
    return { dueloFinal, avancou: true, outcome: 'avancou', advTeamId, proxTeamId: run.oppIds[run.rodada - 1], faseIdx };
  }
  run.status = 'campeao';
  st.champion = true;
  return { dueloFinal, avancou: false, outcome: 'campeao', advTeamId, faseIdx };
}

/** Resolve a defesa pendente (click null = não clicou), grava a reprise e avança o duelo. */
function settleSave(rand, st, click, nowMs) {
  const run = st.run;
  const pending = run.duel.pending;
  const r = resolveSave(rand, pending, click, nowMs - pending.servedAt);
  const d = {
    n: pending.n, gol: r.gol, defendeu: r.defendeu, motivo: r.motivo,
    alvo: pending.alvo, clique: click && Number.isFinite(click.x) ? { x: click.x, y: click.y } : null,
    ms: click?.ms ?? null, janelaMs: pending.janelaMs,
  };
  run.duel.defenses.push(d);
  run.duel.pending = null;
  const fim = advanceRun(st);
  // reprise do último /save: toque duplo, resposta perdida ou pendência fechada pelo relógio
  // devolvem ISTO em vez de erro (o duelo pode ter avançado e zerado `defenses` — era o 409
  // que virava "ERRO — defesa não registrada" no Unity)
  run.lastSave = {
    resultado: { defendeu: d.defendeu, gol: d.gol, alvo: d.alvo, motivo: d.motivo },
    dueloFinal: fim.dueloFinal, avancou: fim.avancou,
  };
  return { d, fim };
}

/** Entrada de TODA requisição: defesa pendente vencida (aba fechada) vira gol da IA sozinha. */
export function stepEntry(rand, st, nowMs) {
  const run = st.run;
  if (run?.status !== 'ativo' || !pendingExpired(run, nowMs)) return null;
  return settleSave(rand, st, null, nowMs).fim;
}

/** POST /incoming: prepara (ou re-serve, no reload) a cobrança da IA. */
export function stepIncoming(rand, st, nowMs, finished) {
  const run = st.run;
  if (run?.status !== 'ativo') throw noRun(finished);
  if (run.duel.turn !== 'ia') throw new GameError(409, 'not-your-defense', 'Agora é a sua vez de BATER.');
  if (!run.duel.pending) {
    const sudden = run.duel.defenses.length >= FRANGACO.kicks;
    run.duel.pending = { n: run.duel.defenses.length + 1, ...newIncoming(rand, run.rodada - 1, sudden), servedAt: nowMs };
  }
  return run.duel.pending;
}

const num01 = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/** Valida o corpo do /kick (400 só para mira fora do contrato — o Unity sempre manda 0..1). */
export function parseKick(body = {}) {
  const xAnunciado = num01(body.xAnunciado);
  if (xAnunciado === null) throw badRequest('Mire dentro do gol.', 'bad-aim');
  const xReal = body.xReal == null ? null : num01(body.xReal);
  if (body.xReal != null && xReal === null) throw badRequest('Finta inválida.', 'bad-aim');
  return { xAnunciado, xReal };
}

/** POST /kick: resolve a MINHA cobrança e avança o duelo. */
export function stepKick(rand, st, { xAnunciado, xReal, dexterity }, finished) {
  const run = st.run;
  if (run?.status !== 'ativo') throw noRun(finished);
  if (run.duel.turn !== 'user') throw new GameError(409, 'not-your-kick', 'Agora é a sua vez de DEFENDER.');
  const r = resolveKick(rand, { xAnunciado, xReal, dexterity });
  run.duel.kicks.push({
    n: run.duel.kicks.length + 1, gol: r.gol, motivo: r.motivo, fintou: r.fintou,
    xAnunciado, xReal, xBola: r.xBola, yBola: r.yBola, xGk: r.xGk, keeperMs: r.keeperMs ?? null,
  });
  return { r, fim: advanceRun(st) };
}

/**
 * POST /save: resolve a defesa — ou REPRISA a última quando não há pendência (toque duplo,
 * resposta perdida, defesa fechada pelo relógio na entrada). Devolve { replay } OU { d, fim }.
 * Só lança erro sem run e sem nada para reprisar (requisição fora de contexto).
 */
export function stepSave(rand, st, body = {}, nowMs, finished) {
  const run = st.run;
  if (run && !run.duel?.pending && run.lastSave) return { replay: run.lastSave };
  // linha gravada pelo código antigo (sem lastSave): reprisa a última defesa do duelo atual
  const last = run?.duel?.defenses?.at(-1);
  if (run && !run.duel?.pending && last && (run.status !== 'ativo' || run.duel.turn === 'user')) {
    return { replay: { resultado: { defendeu: last.defendeu, gol: last.gol, alvo: last.alvo, motivo: last.motivo }, dueloFinal: null, avancou: false } };
  }
  if (run?.status !== 'ativo') throw noRun(finished);
  if (run.duel.turn !== 'ia' || !run.duel.pending) throw new GameError(409, 'not-your-defense', 'Agora é a sua vez de BATER.');
  const ms = typeof body.ms === 'number' && Number.isFinite(body.ms) ? Math.round(body.ms) : null;
  const click = ms === null ? null : { x: num01(body.x) ?? NaN, y: num01(body.y) ?? NaN, ms };
  return settleSave(rand, st, click, nowMs);
}
