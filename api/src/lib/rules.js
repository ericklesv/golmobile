// Regras do jogo — porta 1:1 do BRGOL original (ver docs/BRGOL_ORIGINAL.md).
// Este arquivo é a fonte da verdade; o cliente recebe os valores via /api/meta.
import { MIN } from './time.js';
import { applyItemCooldown } from './items.js';

// ─── Recargas (não-VIP / VIP) ───────────────────────────────────────────────
export const COOLDOWNS = {
  AUTO:    { normal: 10 * MIN, vip: 5 * MIN },
  PENALTY: { normal: 10 * MIN, vip: 5 * MIN },
  FOUL:    { normal: 10 * MIN, vip: 5 * MIN },
  // Trilha: 10 → 5 min (não-VIP) e 5 → 2:30 (VIP), reduzida pelos níveis
  TRAIL:   { normal: 10 * MIN, vip: 5 * MIN },
};
export const TRAIL_MIN = { normal: 5 * MIN, vip: 2.5 * MIN };
export const COOLDOWN_TOLERANCE_MS = 1500;

// ─── Dinheiro ───────────────────────────────────────────────────────────────
export const MONEY = {
  AUTO: 10,
  PENALTY: 20,
  FOUL: 30,
  TRAIL: 40,
  PARTY_BET: 50,
  PARTY_PRIZE: 150,
  DEXTERITY_PRICE: 1000,
  NERF_PRICE: 1000,
};
export const DEXTERITY_MAX = 30;
export const NERF_MIN_LEVEL = 14;
export const PARTY_WIN_CHANCE = 3 / 8; // roleta de 8 fatias, 3 de GOL

// ─── Chances ────────────────────────────────────────────────────────────────
// Pênalti: goleiro escolhe 1 de 3 cantos → 66,6% base. Destreza soma +1%/ponto,
// reduzindo a chance do goleiro adivinhar. Falta: 50% base + destreza.
export const FOUL_BASE_CHANCE = 0.5;
export const DEXTERITY_BONUS_PER_POINT = 0.01;

// Trilha: linhas [total, errados]. Defesa 4/1, meio 3/1, ataque 3/2 (~17% de gol).
// Ataque com 2 errados desde 12/09/2026 (com 1 estava fácil, ~33%).
export const TRAIL_LINES = [
  { name: 'DEFESA', total: 4, mines: 1 },
  { name: 'MEIO-CAMPO', total: 3, mines: 1 },
  { name: 'ATAQUE', total: 3, mines: 2 },
];

// ─── Premiações (tabela de 2009) ────────────────────────────────────────────
export const PRIZES = {
  round: [
    { from: 1, to: 1, money: 30000, vip: 5 },
    { from: 2, to: 5, money: 15000, vip: 0 },
    { from: 6, to: 10, money: 7000, vip: 0 },
  ],
  season: [
    { from: 1, to: 1, money: 300000, vip: 40 },
    { from: 2, to: 5, money: 150000, vip: 0 },
    { from: 6, to: 10, money: 70000, vip: 0 },
  ],
  roundRecord: { vip: 20 },
  team: {
    A: { champion: 25, runnerUp: 20 },
    B: { champion: 20, runnerUp: 15 },
    C: { champion: 15, runnerUp: 10 },
  },
};

export function prizeFor(table, position) {
  const row = table.find((r) => position >= r.from && position <= r.to);
  return row ? { money: row.money, vip: row.vip } : null;
}

// ─── Níveis (tabela oficial de 2009, por gols) ──────────────────────────────
export const LEVELS = [
  { lvl: 0, name: 'Iniciante', goals: 0, skill: null },
  { lvl: 1, name: 'Pintinho', goals: 22, skill: 'Libera o Party GoL' },
  { lvl: 2, name: 'Frango', goals: 49, skill: 'Som de alerta' },
  { lvl: 3, name: 'Sub-12', goals: 88, skill: 'Libera as Estatísticas' },
  { lvl: 4, name: 'Sub-16', goals: 140, skill: '-25 s na Trilha', trail: 25 },
  { lvl: 5, name: 'Juvenil', goals: 200, skill: '-20 s na Trilha', trail: 20 },
  { lvl: 6, name: 'Profissional em Teste', goals: 273, skill: '-15 s na Trilha', trail: 15 },
  { lvl: 7, name: 'Profissional Reserva', goals: 359, skill: '-15 s na Trilha', trail: 15 },
  { lvl: 8, name: 'Titular', goals: 457, skill: 'Mensagem com cores' },
  { lvl: 9, name: 'Medalha de Bronze', goals: 568, skill: '-15 s na Trilha', trail: 15 },
  { lvl: 10, name: 'Medalha de Prata', goals: 692, skill: '-15 s na Trilha', trail: 15 },
  { lvl: 11, name: 'Medalha de Ouro', goals: 831, skill: '-15 s na Trilha', trail: 15 },
  { lvl: 12, name: 'Veterano', goals: 983, skill: '-15 s na Trilha', trail: 15 },
  { lvl: 13, name: 'Super Veterano', goals: 1151, skill: '-15 s na Trilha', trail: 15 },
  { lvl: 14, name: 'Campeão', goals: 1335, skill: 'Nerfar (aplicar e receber)' },
  { lvl: 15, name: 'Bronze Star', goals: 1536, skill: 'Rebote Pênalti nível 1', rebound: 'PENALTY' },
  { lvl: 16, name: 'Double Bronze Star', goals: 1756, skill: 'Rebote Falta nível 1', rebound: 'FOUL' },
  { lvl: 17, name: 'Triple Bronze Star', goals: 1995, skill: 'Rebote Pênalti nível 2', rebound: 'PENALTY' },
  { lvl: 18, name: 'Silver Star', goals: 2256, skill: 'Rebote Falta nível 2', rebound: 'FOUL' },
  { lvl: 19, name: 'Double Silver Star', goals: 2541, skill: 'Rebote Pênalti nível 3', rebound: 'PENALTY' },
  { lvl: 20, name: 'Triple Silver Star', goals: 2852, skill: 'Rebote Falta nível 3', rebound: 'FOUL' },
  { lvl: 21, name: 'Gold Star', goals: 3194, skill: 'Rebote Pênalti nível 4', rebound: 'PENALTY' },
  { lvl: 22, name: 'Double Gold Star', goals: 3571, skill: 'Rebote Falta nível 4', rebound: 'FOUL' },
  { lvl: 23, name: 'Triple Gold Star', goals: 3989, skill: 'Rebote Pênalti nível 5', rebound: 'PENALTY' },
  { lvl: 24, name: 'Mega Player', goals: 4459, skill: 'Rebote Falta nível 5', rebound: 'FOUL' },
  { lvl: 25, name: 'Ultra Player', goals: 4993, skill: 'Rebote Trilha nível 1', rebound: 'TRAIL' },
  { lvl: 26, name: 'Monster Player', goals: 5618, skill: 'Rebote Trilha nível 2', rebound: 'TRAIL' },
  { lvl: 27, name: 'Chuteira de Bronze', goals: 6379, skill: 'Rebote Trilha nível 3', rebound: 'TRAIL' },
  { lvl: 28, name: 'Chuteira Prateada', goals: 7394, skill: 'Rebote Trilha nível 4', rebound: 'TRAIL' },
  { lvl: 29, name: 'Chuteira Dourada', goals: 10000, skill: 'Rebote Trilha nível 5', rebound: 'TRAIL' },
  { lvl: 30, name: 'Lendário nível 1', goals: 20000, skill: 'Todos os rebotes em nível 6', rebound: 'ALL' },
  { lvl: 31, name: 'Lendário nível 2', goals: 35000, skill: 'Todos os rebotes em nível 7', rebound: 'ALL' },
  { lvl: 32, name: 'Lendário nível 3', goals: 55000, skill: 'Todos os rebotes em nível 8', rebound: 'ALL' },
];

export function levelFor(goals) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (goals >= l.goals) cur = l;
  const next = LEVELS.find((l) => l.lvl === cur.lvl + 1) || null;
  return { ...cur, next };
}

/** Pontos de nível: cada gol vale 1, e os minigames diários dão pontos extras (levelBonus). */
export const levelPoints = (user) => user.goalsTotal + (user.levelBonus ?? 0);
/** Nível do jogador. Use sempre este (e não levelFor(goalsTotal)) — senão o bônus some. */
export const levelOf = (user) => levelFor(levelPoints(user));

/** Segundos descontados da recarga da trilha pelos níveis conquistados. */
export function trailReductionSec(level) {
  return LEVELS.filter((l) => l.lvl <= level && l.trail).reduce((s, l) => s + l.trail, 0);
}

/** Nível de rebote (0..8) por modo, conforme os níveis conquistados. */
export function reboundLevel(level, kind) {
  let n = 0;
  for (const l of LEVELS) {
    if (l.lvl > level) break;
    if (l.rebound === kind) n += 1;
    if (l.rebound === 'ALL') n = Math.max(n, 5) + 1;
  }
  return n;
}
// Chance de rebote por nível de rebote (segunda tentativa automática)
export const REBOUND_CHANCE = [0, 0.05, 0.08, 0.11, 0.14, 0.17, 0.22, 0.27, 0.32];

export function isVip(user, now = Date.now()) {
  return !!user.vipUntil && new Date(user.vipUntil).getTime() > now;
}

/**
 * Recarga efetiva (ms) de um modo para um usuário. Se o usuário veio com `items`
 * (UserItem ativos — ver items.js), a Energia do chute e o Boost Auto entram aqui.
 */
/**
 * Modo livre — SÓ NO PC (MODO_LIVRE=1 no api/.env; ignorado com NODE_ENV=production): chutes sem recarga,
 * sem captcha e minigames sem limite do dia (routes/daily.js apaga as partidas terminadas do jogador).
 * Para testar e gravar vídeo de propaganda (pedido do dono, 14/09/2026). NUNCA pôr no .env da VPS.
 */
export const freeMode = () => process.env.NODE_ENV !== 'production' && process.env.MODO_LIVRE === '1';

export function cooldownFor(user, kind, now = Date.now()) {
  if (freeMode()) return 0;
  return applyItemCooldown(user, kind, baseCooldownFor(user, kind, now), now);
}

/** Recarga sem itens da loja (VIP + níveis da trilha). */
export function baseCooldownFor(user, kind, now = Date.now()) {
  const vip = isVip(user, now);
  const base = COOLDOWNS[kind][vip ? 'vip' : 'normal'];
  if (kind !== 'TRAIL') return base;
  const lvl = levelOf(user).lvl;
  const reduced = base - trailReductionSec(lvl) * 1000;
  return Math.max(TRAIL_MIN[vip ? 'vip' : 'normal'], reduced);
}

export const LAST_FIELD = {
  AUTO: 'lastAutoAt',
  PENALTY: 'lastPenaltyAt',
  FOUL: 'lastFoulAt',
  TRAIL: 'lastTrailAt',
};

// Chutes liberados para todos desde o nível 0 (decisão do dono, 13/09/2026: ter que subir de nível
// para bater falta/trilha desanimava). Só os minigames travam por nível (MINIGAMES.unlock).
export const UNLOCK_LEVEL = { AUTO: 0, PENALTY: 0, FOUL: 0, TRAIL: 0 };

export const KIND_LABEL = {
  AUTO: 'chute direto',
  PENALTY: 'pênalti',
  FOUL: 'falta',
  TRAIL: 'trilha',
  PARTY: 'Party GoL',
  TERMO: 'Termo',
};

// ─── Minigames diários (1x por dia; cada um vira numa hora própria: RESET_HOUR) ────
// Termo do dia: 5 letras, 6 tentativas. Acertar = 1 gol normal (placar do time,
// artilharia e lances) + pontos de nível pela tentativa em que acertou
// (1ª +30 … 6ª +5 — decisão do dono em 12/09/2026). Não dá dinheiro.
export const TERMO = { letters: 5, tries: 6, levelPoints: [30, 25, 20, 15, 10, 5] };
// Quiz do dia: vira ao MEIO-DIA de Brasília. 5 perguntas de 4 alternativas, 20 s cada
// (o relógio corre no servidor; estourou = erro). Cada acerto +6 de nível (até +30);
// 3+ acertos = 1 gol normal. Não dá dinheiro. (Decisão do dono em 13/09/2026.)
export const QUIZ = { questions: 5, seconds: 20, pointsPerHit: 6, goalAt: 3, toleranceMs: 2500 };
export const DAILY_GAMES = ['TERMO', 'QUIZ'];
KIND_LABEL.QUIZ = 'Quiz';

// Hora de virada de cada minigame diário (Brasília): uma por jogo, para sempre ter algum renovando
// (decisão do dono, 13/09/2026). Minigame novo pega a próxima hora livre (18h, 19h…). Termo, Quiz e
// Estatísticas usam as funções próprias em time.js; os demais, dayNumberAt/nextResetAt.
export const RESET_HOUR = { TERMO: 0, QUIZ: 12, STATS: 13, MEMORIA: 14, QUALTIME: 15, CAMISAS: 16, ALVO: 17, HATTRICK: 18, FALTAPRO: 19 };
/** "às 14h" / "ao meio-dia" / "à meia-noite" — para os textos de "volte …". */
export const resetLabel = (game) => ({ 0: 'à meia-noite', 12: 'ao meio-dia' }[RESET_HOUR[game]] ?? `às ${RESET_HOUR[game]}h`);

// ─── Hub de minigames (slider da Home) ─────────────────────────────────────
// Ordem do slider e nível que libera cada um. `soon` = ainda não implementado
// (aparece bloqueado com "EM BREVE"). Os diários entram também em DAILY_GAMES.
export const MINIGAMES = [
  { id: 'TERMO', name: 'Termo do dia', unlock: 0, daily: true, route: '/termo', icon: '/ui/ico-gift_purple.png', desc: 'Acerte a palavra de futebol em até 6 tentativas.', reward: 'gol + até 30 de nível' },
  { id: 'QUIZ', name: 'Quiz do dia', unlock: 0, daily: true, route: '/quiz', icon: '/ui/ico-chesticon_gold01_l.png', desc: '5 perguntas de futebol, 20 s cada.', reward: 'gol + até 30 de nível' },
  { id: 'PARTY', name: 'Party GoL', unlock: 1, daily: false, route: '/partygol', icon: '/ui/ico-coin02.png', desc: 'Aposte R$ 50 na roleta e leve R$ 150. Primeira vitória do dia vale gol.', reward: 'gol + R$ 150' },
  { id: 'MEMORIA', name: 'Memória dos Escudos', unlock: 2, daily: true, route: '/memoria', icon: '/ui/ico-badge.png', desc: 'Ache os 8 pares de escudos com poucas jogadas.', reward: 'gol + até 30 de nível' },
  { id: 'STATS', name: 'Estatísticas', unlock: 3, daily: true, route: '/estatisticas', icon: '/ui/ico-ranking.png', desc: 'Quem tem mais? Acertou, segue; errou, acaba. 5 seguidos é gol.', reward: 'gol + até 30 de nível' },
  { id: 'QUALTIME', name: 'De que time é?', unlock: 4, daily: true, route: '/qualtime', icon: '/ui/ico-clan.png', desc: 'Pista → escudo e escudo → pista. 10 rodadas, 7 s cada; 8 acertos é gol.', reward: 'gol + até 30 de nível' },
  { id: 'CAMISAS', name: 'Camisas', unlock: 5, daily: true, route: '/camisas', icon: '/ui/ico-camisa.svg', desc: 'Maior ou menor? Cada 4 camisas certas é um gol.', reward: '1 gol a cada 4 camisas + até 30 de nível' },
  { id: 'ALVO', name: 'Alvo no Gol', unlock: 6, daily: true, route: '/alvo', icon: '/ui/ico-glove.png', desc: 'Goleiro, zagueiros e cones escondidos no gol. 12 chutes para derrubar todos.', reward: 'gol + até 30 de nível' },
  { id: 'HATTRICK', name: 'Hat Trick', unlock: 7, daily: true, route: '/hat-trick', icon: '/ui/ico-hattrick.svg', desc: 'Chute de longe contra o vento e o goleiro. 3 vidas; 3 gols é hat trick.', reward: '1 gol a cada gol + até 30 de nível' },
  { id: 'FALTAPRO', name: 'Falta PRO', unlock: 8, daily: true, route: '/falta-pro', icon: '/ui/ico-medal_gold.png', desc: 'Arraste a bola: direção, força e efeito. 5 cobranças; 3 gols vence.', reward: 'gol + até 20 de nível + R$ 50 por alvo' },
  { id: 'FUTPREGO', name: 'FutPrego', unlock: 0, daily: false, route: '/futprego', icon: '/ui/ico-futprego.svg', desc: 'Futebol de prego 1x1 ao vivo, uma vez de cada. Cada um põe R$ 200; quem marcar primeiro leva tudo.', reward: '1 gol + R$ 400 (o time do outro perde 1)' },
  { id: 'GANHAPERDE', name: 'Ganha ou Perde', unlock: 9, daily: true, route: '/ganha-ou-perde', icon: '/ui/ico-roleta.svg', desc: 'Gire a roleta: caiu no GANHA é gol e gira de novo. Pague para aumentar a chance até 75%.', reward: '1 gol + 5 de nível a cada acerto' },
  { id: 'BAU', name: 'Baú diário', unlock: 9, daily: true, route: '/bau', icon: '/ui/ico-goldpouch.png', desc: 'Abra o baú do dia e leve dinheiro ou VIP.', reward: 'gol + dinheiro', soon: true },
  { id: 'FRANGACO', name: 'Frangaço', unlock: 10, daily: true, route: '/frangaco', icon: '/ui/ico-crown_silver.png', desc: 'Duelo de pênaltis contra um clube da sua série: bata 5 e defenda 5. Mata-mata de 4 fases.', reward: 'gol + R$ 500 se for campeão', soon: true }, // DESATIVADO (dono, 14/09/2026: "muito bugado") — card EM BREVE e /api/frangaco/* recusa
  { id: 'EMBAIXADINHAS', name: 'Embaixadinhas', unlock: 12, daily: true, route: '/embaixadinhas', icon: '/ui/ico-energy.png', desc: 'Toque no ritmo e não deixe a bola cair.', reward: 'gol + nível', soon: true },
  { id: 'CABECAO', name: 'Cabeção', unlock: 0, daily: false, route: '/cabecao', icon: '/ui/ico-member.png', desc: 'Head soccer 1x1 ao vivo contra outro craque. Vencedor marca 1 gol.', reward: 'gol', soon: true }, // escondido: fica "para depois" (decisão do dono, 13/09/2026)
  { id: 'DISPUTA', name: 'Disputa de pênaltis', unlock: 15, daily: false, route: '/disputa', icon: '/ui/ico-trophy_m.png', desc: 'Cinco pênaltis contra outro craque.', reward: 'gol + dinheiro', soon: true },
];
// Memória dos Escudos (vira às 14h): 8 pares (16 cartas) sorteados por jogador/dia. Fechar em até
// `goalAtMoves` jogadas = 1 gol; os pontos de nível caem conforme o nº de jogadas.
export const MEMORIA = { pairs: 8, goalAtMoves: 14, levelPoints: [[8, 30], [10, 25], [12, 20], [14, 15], [18, 10], [Infinity, 5]] };
DAILY_GAMES.push('MEMORIA');
KIND_LABEL.MEMORIA = 'Memória dos Escudos';
// De que time é?: vira às 15h. 10 pistas alternando "pista → 4 escudos" e "escudo → 4 pistas"
// (estádio, cidade, fundação, cores+estado, apelido, mascote, ídolo, clássico; distratores
// parecidos). 7 s por pista, −0,5 s a cada acerto seguido (mínimo 5 s), relógio no servidor.
// +3 de nível por acerto (até +30); 8 acertos = 1 gol. (Refeito em 13/09/2026: estava fácil demais.)
export const QUALTIME = { questions: 10, seconds: 7, minSeconds: 5, streakStep: 0.5, pointsPerHit: 3, goalAt: 8, toleranceMs: 2500 };
DAILY_GAMES.push('QUALTIME');
KIND_LABEL.QUALTIME = 'De que time é?';
// Alvo no Gol (batalha naval no gol): vira às 17h. O gol é uma grade de 6 x 4 casas; o
// servidor esconde, por jogador/dia (sha256 userId:day), 1 goleiro (3 casas), 2 zagueiros (2) e
// 3 cones (1) = 10 casas ocupadas, sem sobreposição. O jogador tem 12 chutes; cada chute revela
// vazio / acertou / derrubou (todas as casas da peça). Acaba quando os chutes terminam ou tudo
// caiu. Recompensa (nunca mais de 1 gol):
//   derrubou tudo (10/10)  -> 1 gol + 30 de nível
//   8 ou 9 casas acertadas -> 1 gol + 2 por casa (16-18)
//   menos de 8             -> só 2 por casa acertada, sem gol
export const ALVO = {
  cols: 6, rows: 4, shots: 12, // 14 → 12 em 13/09/2026: dono achou fácil
  pieces: [
    { kind: 'goleiro', name: 'Goleiro', size: 3 },
    { kind: 'zagueiro', name: 'Zagueiro', size: 2 }, { kind: 'zagueiro', name: 'Zagueiro', size: 2 },
    { kind: 'cone', name: 'Cone', size: 1 }, { kind: 'cone', name: 'Cone', size: 1 }, { kind: 'cone', name: 'Cone', size: 1 },
  ],
  pointsPerHit: 2, sinkAllPoints: 30, goalAt: 8,
};
DAILY_GAMES.push('ALVO');
KIND_LABEL.ALVO = 'Alvo no Gol';
// Estatísticas: "quem tem mais X?" entre dois jogadores do Brasileirão 2024 (dados reais da
// API-Football; o plano grátis só libera 2022–2024) + duelos históricos escritos pelo dono.
// Acertou, segue; errou, acaba. Vira às 13h de Brasília. UMA partida por dia, valendo: +3 de
// nível por acerto (até +30) e sequência de 5 = 1 gol; sem partida livre pelo recorde (poucos
// duelos do dono). (Decisões do dono em 13/09/2026.)
export const STATS = { pointsPerHit: 3, maxPoints: 30, goalAt: 5, season: 'Brasileirão 2024' };
DAILY_GAMES.push('STATS');
KIND_LABEL.STATS = 'Estatísticas';
// Cabeção (head soccer 1x1 ao vivo): vencedor marca 1 gol. Antifraude: no máximo 3 gols por
// dia, nunca dois no dia contra o mesmo adversário, W.O. antes de 20 s de jogo não vale gol.
export const CABECAO = { maxGoalWinsPerDay: 3, woMinSec: 20 };
KIND_LABEL.CABECAO = 'Cabeção';
// Camisas (maior ou menor): vira às 16h. Uma sequência de 4 camisas numeradas de 1 a 11,
// sem repetir número: a 1ª aparece e o jogador diz se a próxima é maior ou menor. Acertou as 4 =
// 1 gol e começa outra sequência; errou, acaba o jogo do dia. EXCEÇÃO à regra de "1 gol por
// minigame" (decisão do dono, 13/09/2026): aqui dá para marcar vários gols enquanto não errar.
// +3 de nível por acerto (até +30).
export const CAMISAS = { shirts: 4, min: 1, max: 11, pointsPerHit: 3, maxPoints: 30 };
DAILY_GAMES.push('CAMISAS');
KIND_LABEL.CAMISAS = 'Camisas';
// Hat Trick (chute de longe; vira às 18h): física em lib/hattrick.js. 3 vidas; cada gol no minigame
// é 1 gol do time (EXCEÇÃO à regra de 1 gol, como o Camisas — decisão do dono, 13/09/2026); errou,
// o goleiro pegou ou furou = perde 1 vida. +5 de nível por gol (até +30). O 3º gol é o hat trick.
DAILY_GAMES.push('HATTRICK');
KIND_LABEL.HATTRICK = 'Hat Trick';
// Falta PRO (cobrança de falta 3D estilo Free Kick Classic; vira às 19h): física em lib/faltapro.js.
// O jogador ARRASTA a bola (direção + força + efeito/curva); 5 cobranças; 3+ gols = exatamente 1 gol
// do time; +4 de nível por cobrança convertida (até +20); alvo bônus no ângulo = +R$ 50.
DAILY_GAMES.push('FALTAPRO');
KIND_LABEL.FALTAPRO = 'Falta PRO';
// Frangaço (duelo de pênaltis alternado do Managol; vira às 20h): números em lib/frangaco.js.
// Um duelo por dia num mata-mata de 4 fases; venceu = 1 gol (kind FRANGACO); campeão leva
// ainda +R$ 500 e +20 de nível. Perdeu = eliminado, torneio novo no dia seguinte.
RESET_HOUR.FRANGACO = 20;
DAILY_GAMES.push('FRANGACO');
KIND_LABEL.FRANGACO = 'Frangaço';
// Ganha ou Perde (roleta; vira às 21h — pedido do dono, 14/09/2026): o círculo tem GANHA e PERDE. A 1ª
// girada começa com 50% de GANHA; cada acerto baixa o ponto de partida em 5 (50, 45, 40… mínimo 5%).
// Antes de girar, o jogador pode pagar para aumentar o GANHA de 5 em 5 até 75%: cada degrau custa mais
// que o anterior e tudo encarece a cada acerto (ganhaPerdePrice). Caiu no GANHA = 1 gol + 5 de nível e
// gira de novo; caiu no PERDE = acaba o jogo do dia. O dinheiro não compra gol: só aumenta a chance.
export const GANHAPERDE = { start: 50, drop: 5, min: 5, max: 75, step: 5, stepPrice: 50, growth: 0.5, pointsPerHit: 5 };
RESET_HOUR.GANHAPERDE = 21;
DAILY_GAMES.push('GANHAPERDE');
KIND_LABEL.GANHAPERDE = 'Ganha ou Perde';
// FutPrego (futebol de prego 1x1 por turnos, ao vivo — decisões do dono, 14/09/2026): quem desafia
// espera; quem está nas telas com as abas recebe um convite pequeno por 10 s (nunca dentro de minigame
// ou chute). Cada um paga R$ 200 e quem marcar primeiro leva os R$ 400 + 1 gol para o time, e o time
// do perdedor PERDE 1 gol na partida da rodada (nunca abaixo de 0). Travas: times e internets
// diferentes; no máximo 3 gols por dia; a mesma dupla com o mesmo vencedor duas vezes seguidas = o
// 2º não vale gol (nem tira); W.O. antes de cada um jogar 2 vezes = devolve o dinheiro. Sem gol em 10
// jogadas de cada = empate, dinheiro devolvido. Ninguém aceitou em 1 min = oferece treino com bot
// (não vale gol nem dinheiro). Física em lib/futprego.js; fila e partidas em realtime/futprego.js.
export const FUTPREGO = {
  bet: 200, turnSec: 15, maxTurns: 10, inviteSec: 10, botAfterSec: 60, challengeMaxSec: 300,
  maxGoalWinsPerDay: 3, woMinTurns: 2, reconnectSec: 20,
};
KIND_LABEL.FUTPREGO = 'FutPrego';

/** Chance de GANHA (%) sem pagar nada, depois de `wins` acertos no dia. */
export const ganhaPerdeBase = (wins) => Math.max(GANHAPERDE.min, GANHAPERDE.start - GANHAPERDE.drop * wins);
/** Preço (R$) para girar com `chance`% depois de `wins` acertos: o n-ésimo degrau de +5% custa
 * stepPrice × n × (1 + growth × wins). Ex.: 1ª girada 50→75% = 50+100+150+200+250 = R$ 750. */
export function ganhaPerdePrice(wins, chance) {
  const g = GANHAPERDE;
  const steps = Math.max(0, Math.round((chance - ganhaPerdeBase(wins)) / g.step));
  let total = 0;
  for (let n = 1; n <= steps; n++) total += Math.round(g.stepPrice * n * (1 + g.growth * wins));
  return total;
}

// ─── VIP pago (PIX pela Efí) ─────────────────────────────────────────────────
// Decisões do dono (13/09/2026): pacotes de DIAS de VIP — 1 VIP = 1 dia; vão para o banco de VIPs do
// jogador (User.vipDays), que ativa quando quiser (POST /api/me/activate-vip). Pagamento por PIX na Efí
// (services/vip.js, lib/efi.js). PREÇOS aprovados pelo dono em 13/09/2026 — mudar só aqui.
export const VIP_PACKS = [
  { key: 'vip10', days: 10, price: 3.99 },
  { key: 'vip30', days: 30, price: 9.9 },
  { key: 'vip60', days: 60, price: 17.9, tag: 'Mais vendido' },
  { key: 'vip120', days: 120, price: 29.9 },
  { key: 'vip250', days: 250, price: 54.9 },
  { key: 'vip500', days: 500, price: 89.9, tag: 'Melhor preço' },
];
/** O QR do PIX vale 30 min; no máximo 3 cobranças abertas por jogador ao mesmo tempo. */
export const VIP_PIX = { expiresSec: 30 * 60, maxOpen: 3 };
/**
 * Chute direto saindo sozinho com o app FECHADO para VIP ativo (vipOfflineAutoKicks, no scheduler).
 * DESLIGADO por decisão do dono (13/09/2026, "por enquanto"): com o app aberto o chute direto segue
 * automático para todos, como sempre. Para religar: true — o scheduler volta a chutar e a tela do VIP
 * volta a mostrar o benefício "Gol com o app fechado".
 */
export const VIP_OFFLINE_AUTO = false;

// ─── Diretoria e contratações ────────────────────────────────────────────────
// Decisões do dono (13/09/2026, com base no BRGOL original): time sem presidente → um VIP do time que já
// marcou gol por ele assume; o Presidente nomeia até 2 Diretores; os dois fazem propostas com o VIP do
// próprio banco. Aceitou = vai para o time, recebe o VIP e fica com contrato de 1 DIA POR VIP. VIP guardado
// pode ser doado para colega de time (contas na mesma internet não trocam VIP). Regras em services/club.js.
export const CLUB = {
  directors: 2, // Presidente + até 2 Diretores
  roleLossDays: 3, // perde o cargo: 3 dias sem VIP, 3 dias sem entrar, suspenso ou saiu do time
  offerMin: 1, // VIP por proposta (= dias de contrato)
  offerMax: 100,
  offerHours: 48, // proposta sem resposta vence e o VIP volta para quem propôs
  maxOpenOffers: 5, // propostas abertas ao mesmo tempo por dirigente
  messageMax: 140, // recado da proposta
};

// ─── Presença da Semana (login diário) ────────────────────────────────────────
// Decisões do dono (13/09/2026): entrar 1x por dia e tocar em RESGATAR (vira à meia-noite de Brasília);
// pulou um dia, volta ao dia 1. TODO dia dá XP (pontos de nível — "tá muito difícil upar"): 490 por semana;
// para quem começa do zero, cada dia libera um minigame novo. VIP ativo ganha o DOBRO de XP. O VIP do 7º
// dia ATIVA NA HORA (não vai para o banco de VIPs — não dá para passar para outra conta); da 2ª semana
// seguida em diante, o 7º dia dá 2 VIP. Gol NUNCA é prêmio (mexe na liga). Regras em services/pass.js.
export const LOGIN_PASS = {
  days: [
    { xp: 30, money: 1000 },
    { xp: 40, item: { key: 'ENERGY', level: 1 } },
    { xp: 50, money: 2000 },
    { xp: 60, item: { key: 'BOOST_AUTO' } },
    { xp: 70, dexterity: 1 }, // já com destreza no máximo: vira R$ 1.000
    { xp: 90, item: { key: 'ENERGY', level: 2 } },
    { xp: 150, money: 5000, vip: 1 },
  ],
  vipXp: 2, // VIP ativo: XP em dobro
  streakVip: 2, // VIPs do 7º dia a partir da 2ª semana seguida
};

// ─── Convites (link de afiliado) ──────────────────────────────────────────────
// Decisão do dono (14/09/2026, a partir da sugestão de um jogador): cada jogador tem um link de convite;
// quem cria conta por ele vira "convidado" e quem convidou ganha VIP (no banco de VIPs) quando o convidado
// chega a cada marco de GOLS DA CARREIRA (goalsTotal). 16 VIP por convidado que chega a 1000 gols.
// Conta criada na mesma internet (IP) de quem convidou não vira convidado; jogando na mesma internet, o VIP
// do marco espera (conta falsa não junta VIP). Regras em services/referral.js.
export const REFERRAL = {
  milestones: [
    { goals: 25, vip: 1 },
    { goals: 50, vip: 1 },
    { goals: 100, vip: 1 },
    { goals: 200, vip: 1 },
    { goals: 400, vip: 1 },
    { goals: 800, vip: 1 },
    { goals: 1000, vip: 10 },
  ],
};

// ─── Grupo do WhatsApp dos jogadores ─────────────────────────────────────────
// Pedido do dono (14/09/2026): a cada 100 horas, uma janela convida o jogador para o grupo (web/src/components/
// WhatsInvite.tsx; controle no aparelho). Quem toca em "Entrar no grupo" não vê mais; "Agora não" = de novo em
// 100 h. Também há um botão fixo no Perfil. Trocar o link aqui (vai para o site via /api/meta).
export const COMMUNITY = {
  whatsapp: 'https://chat.whatsapp.com/EGNPGEuZMUEBY5HLXl09M8',
  everyHours: 100,
};
