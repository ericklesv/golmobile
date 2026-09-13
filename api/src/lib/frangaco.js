/**
 * Frangaço — regras puras do duelo de pênaltis alternado (transposto do Managol).
 * Tudo em coordenadas 0..1 do gol (x: 0 = trave esquerda do batedor, 1 = direita;
 * y: 0 = chão, 1 = travessão). O serviço (services/frangaco.js) cuida do banco;
 * aqui só matemática e sorteio — SEMPRE com o `rand` injetado (criptográfico).
 */
import { DEXTERITY_MAX } from './rules.js';

export const FRANGACO = {
  kicks: 5,                    // cobranças de cada lado
  suddenMax: 3,                // rodadas de morte súbita (6ª a 8ª)
  phases: ['Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'],
  // Janela de reação da defesa por fase (ms) — aperta rumo à final; morte súbita corta mais 60 ms
  windowMs: [900, 820, 740, 660],
  suddenWindowCut: 60,
  flightMs: 900,               // a bola sai do pé da IA e o ALVO aparece depois disso
  prepMs: 9000,                // folga entre servir a defesa e o alvo aparecer (animação do chute anterior)
  netToleranceMs: 200,         // tolerância de rede na validação do toque
  saveRadiusM: 1.15,           // toque a até essa distância do alvo (em metros no plano do gol) = defesa
  goalW: 7.32, goalH: 2.44,
  spreadBase: 0.13,            // dispersão da cobrança (fração do gol) com destreza 0
  spreadDexCut: 0.5,           // destreza máxima corta metade da dispersão
  keeperReach: 0.11,           // alcance base do goleiro IA (fração da largura do gol)
  frangoChance: 0.05,          // FRANGAÇO! o goleiro engole uma defendível
  announceBias: 0.62,          // chance do goleiro IA acreditar no canto anunciado (finta)
  readChance: 0.3,             // sem finta: chance do goleiro ler o canto real
  fintaReadChance: 0.7,        // desconfiou da finta: chance de ler o chute real (finta tem risco)
  stayChance: 0.16,            // chance do goleiro ficar no meio (castiga a cavadinha preguiçosa)
  dexReachCut: 0.25,           // destreza máxima encurta 25% do alcance efetivo do goleiro
  championMoney: 500,          // prêmio do campeão (4ª vitória)
  championLevelPoints: 20,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Ruído ~gaussiano em [-1, 1] (média de 3 uniformes). */
const noise = (rand) => (rand() + rand() + rand()) / 1.5 - 1;

/**
 * Resolve a MINHA cobrança. `x`/`y` = mira 0..1; `anunciado` = canto anunciado da
 * finta (x 0..1) ou null; a destreza aperta a dispersão (como no pênalti/falta).
 * Devolve { gol, motivo, xBola, yBola, xGk, fintou, keeperMs }.
 */
export function resolveKick(rand, { x, y, anunciado, dexterity = 0 }) {
  const spread = FRANGACO.spreadBase * (1 - FRANGACO.spreadDexCut * clamp(dexterity / DEXTERITY_MAX, 0, 1));
  const xBola = x + noise(rand) * spread;
  const yBola = clamp(y + noise(rand) * spread * 0.8, 0.02, 1.2);
  const fintou = anunciado != null;

  // Goleiro IA escolhe o canto: acredita na finta (e vai no anunciado), desconfia dela
  // (e tende a ler o chute real — fintar tem risco), lê a bola ou chuta um canto
  let xGk;
  const guess = () => (rand() < FRANGACO.stayChance ? 0.5 + noise(rand) * 0.05 : rand() < 0.5 ? 0.12 + rand() * 0.18 : 0.7 + rand() * 0.18);
  const read = () => clamp(xBola + noise(rand) * 0.1, 0.05, 0.95);
  if (fintou) {
    if (rand() < FRANGACO.announceBias) xGk = clamp(anunciado + noise(rand) * 0.06, 0.05, 0.95);
    else xGk = rand() < FRANGACO.fintaReadChance ? read() : guess();
  } else {
    xGk = rand() < FRANGACO.readChance ? read() : guess();
  }

  if (xBola < -0.02 || xBola > 1.02 || yBola > 1.03) {
    return { gol: false, motivo: 'PRA FORA!', xBola: clamp(xBola, -0.1, 1.1), yBola: clamp(yBola, 0, 1.2), xGk, fintou, keeperMs: null };
  }
  // Alcance do goleiro: rasteira é mais fácil de pegar; no ângulo (y > 0.92) não chega;
  // a destreza do batedor "seca" o goleiro (chute mais forte e colocado)
  const reach = FRANGACO.keeperReach * (1 + (1 - clamp(yBola, 0, 1)) * 0.9)
    * (1 - FRANGACO.dexReachCut * clamp(dexterity / DEXTERITY_MAX, 0, 1));
  const alcancou = Math.abs(xBola - xGk) <= reach && yBola <= 0.92;
  if (alcancou && rand() >= FRANGACO.frangoChance) {
    // defesa da IA: reação simulada (usada no desempate de "defesas mais rápidas")
    const keeperMs = Math.round(320 + rand() * 380);
    return { gol: false, motivo: 'DEFENDEU!', xBola, yBola, xGk, fintou, keeperMs };
  }
  return { gol: true, motivo: alcancou ? 'FRANGAÇO DO GOLEIRO!' : 'GOL!', xBola, yBola, xGk, fintou, keeperMs: null };
}

/** Sorteia a cobrança da IA (a MINHA defesa): alvo no gol + janela de reação. */
export function newDefense(rand, phaseIdx, sudden) {
  const corner = rand() < 0.5 ? -1 : 1;
  const x = clamp(0.5 + corner * (0.16 + rand() * 0.3), 0.06, 0.94);
  const y = 0.12 + rand() * 0.78;
  const windowMs = (FRANGACO.windowMs[clamp(phaseIdx, 0, FRANGACO.windowMs.length - 1)] ?? 900) - (sudden ? FRANGACO.suddenWindowCut : 0);
  return { target: { x, y }, windowMs, flightMs: FRANGACO.flightMs };
}

/**
 * Valida a MINHA defesa. `pending` = { target, windowMs, flightMs, servedAt };
 * `click` = { x, y, ms } (ms relativo ao alvo aparecer; null = não tocou);
 * `elapsedMs` = agora - servedAt no relógio DO SERVIDOR. Devolve { defendeu, motivo, timing }.
 */
export function resolveSave(pending, click, elapsedMs) {
  const { target, windowMs, flightMs } = pending;
  if (!click || !Number.isFinite(click.ms)) return { defendeu: false, motivo: 'NEM SE MEXEU!', timing: 'none' };
  const { x, y, ms } = click;
  // janela: dentro do tempo declarado E coerente com o relógio do servidor (tolerância de rede)
  const budget = FRANGACO.prepMs + flightMs + windowMs + FRANGACO.netToleranceMs;
  if (ms < 0 || ms > windowMs || elapsedMs > budget || ms > elapsedMs + FRANGACO.netToleranceMs) {
    return { defendeu: false, motivo: 'TARDE DEMAIS!', timing: 'late' };
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { defendeu: false, motivo: 'GOL DA IA!', timing: 'ok' };
  const dx = (x - target.x) * FRANGACO.goalW;
  const dy = (y - target.y) * FRANGACO.goalH;
  const perto = Math.hypot(dx, dy) <= FRANGACO.saveRadiusM;
  return perto
    ? { defendeu: true, motivo: 'DEFENDEU!', timing: 'ok' }
    : { defendeu: false, motivo: 'LONGE DA BOLA!', timing: 'ok' };
}

/**
 * Situação do duelo depois de cada lance. `kicks`/`defenses` = lances resolvidos.
 * Devolve { golsUser, golsIa, over, venceu } — com "regra da misericórdia" nas 5
 * primeiras rodadas (como numa disputa real) e morte súbita da 6ª à 8ª; na 8ª
 * empatada, decide quem teve a defesa mais rápida (IA sem defesa perde).
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
    if (kicks.length === N && defenses.length === N) return { golsUser, golsIa, over: false, venceu: null }; // 5x5: morte súbita
    return { golsUser, golsIa, over: false, venceu: null };
  }
  // morte súbita: rodada completa (mesmo nº de cobranças e defesas) com placar diferente encerra
  if (kicks.length === defenses.length) {
    if (golsUser !== golsIa) return { golsUser, golsIa, over: true, venceu: golsUser > golsIa };
    if (kicks.length >= N + FRANGACO.suddenMax) {
      // persistiu o empate: defesas mais rápidas decidem (a minha melhor vs. a melhor da IA)
      const my = defenses.filter((d) => d.defendeu && Number.isFinite(d.ms)).map((d) => d.ms);
      const ia = kicks.filter((k) => Number.isFinite(k.keeperMs)).map((k) => k.keeperMs);
      const myBest = my.length ? Math.min(...my) : Infinity;
      const iaBest = ia.length ? Math.min(...ia) : Infinity;
      return { golsUser, golsIa, over: true, venceu: myBest <= iaBest }; // empate total: fica com o craque
    }
  }
  return { golsUser, golsIa, over: false, venceu: null };
}
