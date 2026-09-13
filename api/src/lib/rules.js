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
  { lvl: 1, name: 'Pintinho', goals: 22, skill: 'Libera a Falta' },
  { lvl: 2, name: 'Frango', goals: 49, skill: 'Som de alerta' },
  { lvl: 3, name: 'Sub-12', goals: 88, skill: 'Libera a Trilha' },
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
export function cooldownFor(user, kind, now = Date.now()) {
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

export const UNLOCK_LEVEL = { AUTO: 0, PENALTY: 0, FOUL: 1, TRAIL: 3 };

export const KIND_LABEL = {
  AUTO: 'chute direto',
  PENALTY: 'pênalti',
  FOUL: 'falta',
  TRAIL: 'trilha',
  PARTY: 'Party GoL',
  TERMO: 'Termo',
};

// ─── Minigames diários (1x por dia; o dia vira à meia-noite de Brasília) ────
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

// ─── Hub de minigames (slider da Home) ─────────────────────────────────────
// Ordem do slider e nível que libera cada um. `soon` = ainda não implementado
// (aparece bloqueado com "EM BREVE"). Os diários entram também em DAILY_GAMES.
export const MINIGAMES = [
  { id: 'TERMO', name: 'Termo do dia', unlock: 0, daily: true, route: '/termo', icon: '/ui/ico-gift_purple.png', desc: 'Acerte a palavra de futebol em até 6 tentativas.', reward: 'gol + até 30 de nível' },
  { id: 'QUIZ', name: 'Quiz do dia', unlock: 0, daily: true, route: '/quiz', icon: '/ui/ico-chesticon_gold01_l.png', desc: '5 perguntas de futebol, 20 s cada.', reward: 'gol + até 30 de nível' },
  { id: 'PARTY', name: 'Party GoL', unlock: 1, daily: false, route: '/partygol', icon: '/ui/ico-coin02.png', desc: 'Aposte R$ 50 na roleta e leve R$ 150. Primeira vitória do dia vale gol.', reward: 'gol + R$ 150' },
  { id: 'MEMORIA', name: 'Memória dos Escudos', unlock: 2, daily: true, route: '/memoria', icon: '/ui/ico-badge.png', desc: 'Ache os 8 pares de escudos com poucas jogadas.', reward: 'gol + até 30 de nível' },
  { id: 'STATS', name: 'Estatísticas', unlock: 3, daily: true, route: '/estatisticas', icon: '/ui/ico-ranking.png', desc: 'Quem tem mais? Acertou, segue; errou, acaba. 5 seguidos é gol.', reward: 'gol + até 30 de nível' },
  { id: 'QUALTIME', name: 'De que time é?', unlock: 4, daily: true, route: '/qualtime', icon: '/ui/ico-clan.png', desc: 'Estádio, apelido ou ídolo: qual é o time? 8 rodadas, 10 s cada.', reward: 'gol + até 32 de nível' },
  { id: 'ALVO', name: 'Alvo no Gol', unlock: 6, daily: true, route: '/alvo', icon: '/ui/ico-glove.png', desc: 'Goleiro, zagueiros e cones escondidos no gol. 14 chutes para derrubar todos.', reward: 'gol + até 30 de nível' },
  { id: 'BAU', name: 'Baú diário', unlock: 9, daily: true, route: '/bau', icon: '/ui/ico-goldpouch.png', desc: 'Abra o baú do dia e leve dinheiro ou VIP.', reward: 'gol + dinheiro', soon: true },
  { id: 'EMBAIXADINHAS', name: 'Embaixadinhas', unlock: 12, daily: true, route: '/embaixadinhas', icon: '/ui/ico-energy.png', desc: 'Toque no ritmo e não deixe a bola cair.', reward: 'gol + nível', soon: true },
  { id: 'CABECAO', name: 'Cabeção', unlock: 0, daily: false, route: '/cabecao', icon: '/ui/ico-member.png', desc: 'Head soccer 1x1 ao vivo contra outro craque. Vencedor marca 1 gol.', reward: 'gol' },
  { id: 'DISPUTA', name: 'Disputa de pênaltis', unlock: 15, daily: false, route: '/disputa', icon: '/ui/ico-trophy_m.png', desc: 'Cinco pênaltis contra outro craque.', reward: 'gol + dinheiro', soon: true },
];
// Memória dos Escudos: 8 pares (16 cartas) sorteados por jogador/dia. Fechar em até
// `goalAtMoves` jogadas = 1 gol; os pontos de nível caem conforme o nº de jogadas.
export const MEMORIA = { pairs: 8, goalAtMoves: 14, levelPoints: [[8, 30], [10, 25], [12, 20], [14, 15], [18, 10], [Infinity, 5]] };
DAILY_GAMES.push('MEMORIA');
KIND_LABEL.MEMORIA = 'Memória dos Escudos';
// De que time é?: vira à meia-noite. 8 pistas (estádio, estado, apelido, ídolo) com 4 escudos,
// 10 s cada (relógio no servidor). +4 de nível por acerto (até +32); 6 acertos = 1 gol.
export const QUALTIME = { questions: 8, seconds: 10, pointsPerHit: 4, goalAt: 6, toleranceMs: 2500 };
DAILY_GAMES.push('QUALTIME');
KIND_LABEL.QUALTIME = 'De que time é?';
// Alvo no Gol (batalha naval no gol): vira à meia-noite. O gol é uma grade de 6 x 4 casas; o
// servidor esconde, por jogador/dia (sha256 userId:day), 1 goleiro (3 casas), 2 zagueiros (2) e
// 3 cones (1) = 10 casas ocupadas, sem sobreposição. O jogador tem 14 chutes; cada chute revela
// vazio / acertou / derrubou (todas as casas da peça). Acaba quando os chutes terminam ou tudo
// caiu. Recompensa (nunca mais de 1 gol):
//   derrubou tudo (10/10)  -> 1 gol + 30 de nível
//   8 ou 9 casas acertadas -> 1 gol + 2 por casa (16-18)
//   menos de 8             -> só 2 por casa acertada, sem gol
export const ALVO = {
  cols: 6, rows: 4, shots: 14,
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
