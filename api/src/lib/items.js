/**
 * Loja — catálogo de itens do jogador (estático; regras adaptadas do concorrente,
 * ver docs/CONCORRENTE_BRGOL_ONLINE.md) e os efeitos que cada item tem no jogo.
 *
 * Este arquivo NÃO importa rules.js (rules.js importa daqui) — nada de ciclo.
 * O que o jogador tem fica na tabela UserItem (validade em expiresAt; Caneleira
 * consumida = usedAt; chuteira equipada = equipped). Preços em R$ virtuais.
 */
import { MIN } from './time.js';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Validade padrão dos boosts (28 h, igual ao concorrente) e das chuteiras (30 dias). */
export const BOOST_DURATION_MS = 28 * HOUR;
export const BOOT_DURATION_MS = 30 * DAY;

/** Energia do chute: cada nível tira 10% a mais da recarga de pênalti/falta/trilha. */
export const ENERGY_MAX_LEVEL = 5;
export const ENERGY_REDUCTION_PER_LEVEL = 0.10;
export const ENERGY_PRICES = [0, 3000, 6000, 12000, 20000, 30000]; // índice = nível

/** Boost Auto: −60 s no chute direto (nunca abaixo de 1 min). */
export const BOOST_AUTO_MS = 60_000;
export const BOOST_AUTO_MIN_MS = 60_000;

/** Caneleira: última linha da trilha → 50% 1 ladrão (2 livres), 5% nenhum (3 livres), 45% 2 ladrões (1 livre). */
export const SHIN_GUARD_ROLLS = [
  { chance: 0.50, mines: 1 },
  { chance: 0.05, mines: 0 },
  { chance: 0.45, mines: 2 },
];

/** Cor do nick: habilidade "Mensagem com cores" (nível 8, Titular). */
export const NICK_COLOR_MIN_LEVEL = 8;
export const NICK_COLORS = [
  { key: 'vermelho', name: 'Vermelho', hex: '#E5322D' },
  { key: 'laranja', name: 'Laranja', hex: '#E8641A' },
  { key: 'dourado', name: 'Dourado', hex: '#D19A00' },
  { key: 'verde', name: 'Verde', hex: '#2BA83A' },
  { key: 'roxo', name: 'Roxo', hex: '#8E44AD' },
  { key: 'rosa', name: 'Rosa', hex: '#E0479E' },
  { key: 'marrom', name: 'Marrom', hex: '#8B5A2B' },
  { key: 'preto', name: 'Preto', hex: '#1E1E1E' },
];
export const NICK_RULE = /^[a-zA-Z0-9_.\-]{3,14}$/;

/**
 * Nick em DEGRADÊ — benefício do VIP (pedido do dono, 15/09/2026, estilo speedrun.com): o VIP escolhe
 * duas cores no perfil e o nome aparece com o fade no chat, rankings, partida e perfil. Fica gravado
 * em User.nickFade ("azul>roxo") e só é MOSTRADO enquanto o VIP estiver ativo (nickFadeOf); expirou o
 * VIP, some; renovou, volta. Tem prioridade sobre a cor sólida da loja (nickColor). A tela desenha um
 * brilho atrás do nome (lib/nick.ts), por isso até branco e preto ficam legíveis nos dois fundos.
 */
export const NICK_FADE_COLORS = [
  { key: 'azul', name: 'Azul', hex: '#2EA8FF' },
  { key: 'ciano', name: 'Ciano', hex: '#00C2D1' },
  { key: 'menta', name: 'Menta', hex: '#2ECC9A' },
  { key: 'verde', name: 'Verde', hex: '#4CD137' },
  { key: 'dourado', name: 'Dourado', hex: '#E9A400' },
  { key: 'laranja', name: 'Laranja', hex: '#FF8A2A' },
  { key: 'coral', name: 'Coral', hex: '#FF5470' },
  { key: 'rosa', name: 'Rosa', hex: '#E0479E' },
  { key: 'fucsia', name: 'Fúcsia', hex: '#FF6FD8' },
  { key: 'lavanda', name: 'Lavanda', hex: '#B388FF' },
  { key: 'roxo', name: 'Roxo', hex: '#9B59B6' },
  { key: 'vermelho', name: 'Vermelho', hex: '#E5322D' },
  // 15/09: mais opções, inclusive claras/escuras — a tela põe um brilho atrás (lib/nick.ts) que mantém
  // branco legível no painel branco e preto legível no fundo marinho
  { key: 'branco', name: 'Branco', hex: '#FFFFFF' },
  { key: 'gelo', name: 'Gelo', hex: '#CFEFFF' },
  { key: 'prata', name: 'Prata', hex: '#C9D1D9' },
  { key: 'amarelo', name: 'Amarelo', hex: '#FFD400' },
  { key: 'limao', name: 'Limão', hex: '#A4E020' },
  { key: 'marinho', name: 'Marinho', hex: '#1467D9' },
  { key: 'magenta', name: 'Magenta', hex: '#E020C0' },
  { key: 'preto', name: 'Preto', hex: '#202020' },
];
const FADE_BY_KEY = Object.fromEntries(NICK_FADE_COLORS.map((c) => [c.key, c]));
/** Degradê para a tela: só com VIP ativo (vipUntil no futuro). */
export function nickFadeOf(user, now = Date.now()) {
  if (!user?.nickFade || !user.vipUntil || new Date(user.vipUntil).getTime() <= now) return null;
  return parseNickFade(user.nickFade);
}
/** "azul>roxo" → { a: '#2EA8FF', b: '#9B59B6' } ou null se inválido. */
export function parseNickFade(value) {
  if (typeof value !== 'string') return null;
  const [ka, kb] = value.split('>');
  const a = FADE_BY_KEY[ka], b = FADE_BY_KEY[kb];
  return a && b ? { a: a.hex, b: b.hex } : null;
}

/**
 * Catálogo. `kind`: 'boost' (validade 28 h), 'boot' (chuteira, 30 dias, só uma
 * equipada), 'service' (troca de nick / de time / cor — sem UserItem, efeito imediato).
 * `icon` é um PNG do kit em web/public/ui/ (nada de emoji).
 */
export const ITEMS = [
  {
    key: 'ENERGY', kind: 'boost', category: 'chutes', name: 'Energia do chute', icon: 'ico-energy',
    desc: 'Cada nível tira mais 10% da recarga do pênalti, da falta e da trilha por 28 h. O nível seguinte só com o anterior ativo.',
    levels: ENERGY_PRICES.slice(1).map((price, i) => ({ level: i + 1, price, effect: `-${(i + 1) * 10}% de recarga` })),
    durationMs: BOOST_DURATION_MS,
  },
  {
    key: 'BOOST_AUTO', kind: 'boost', category: 'chutes', name: 'Boost Auto', icon: 'ico-clearstamp_l',
    desc: 'Tira 60 s da recarga do chute direto por 28 h.',
    price: 5000, durationMs: BOOST_DURATION_MS,
  },
  {
    key: 'SHIN_GUARD', kind: 'boost', category: 'chutes', name: 'Caneleira', icon: 'ico-glove',
    desc: 'Na última linha da próxima trilha: 50% de 2 casas livres, 5% de 3 livres, 45% de 1 livre. Gasta quando a trilha termina na última linha (ou vence em 28 h). Só uma por vez.',
    price: 80000, priceVip: 1, durationMs: BOOST_DURATION_MS, single: true,
  },
  { key: 'BOOT_LEATHER', kind: 'boot', category: 'chuteiras', name: 'Chuteira de Couro', icon: 'ico-star01_s', bonus: 0.02, price: 10000, durationMs: BOOT_DURATION_MS },
  { key: 'BOOT_BRONZE', kind: 'boot', category: 'chuteiras', name: 'Chuteira de Bronze', icon: 'ico-medal_bronze', bonus: 0.04, price: 25000, durationMs: BOOT_DURATION_MS },
  { key: 'BOOT_SILVER', kind: 'boot', category: 'chuteiras', name: 'Chuteira Prateada', icon: 'ico-medal_silver', bonus: 0.06, price: 50000, durationMs: BOOT_DURATION_MS },
  { key: 'BOOT_GOLD', kind: 'boot', category: 'chuteiras', name: 'Chuteira Dourada', icon: 'ico-medal_gold', bonus: 0.08, price: 100000, durationMs: BOOT_DURATION_MS },
  { key: 'BOOT_DIAMOND', kind: 'boot', category: 'chuteiras', name: 'Chuteira de Diamante', icon: 'ico-star02_l', bonus: 0.10, price: 200000, durationMs: BOOT_DURATION_MS },
  {
    key: 'NICK_CHANGE', kind: 'service', category: 'perfil', name: 'Troca de nick', icon: 'pi-edit',
    desc: 'Escolha um nick novo (3 a 14 caracteres: letras, números, _ . -). Precisa estar livre.', price: 20000,
  },
  {
    // dono, 15/09/2026: trocar de time passa a custar R$ 50 mil ou 1 VIP (antes era de graça e sem tela) — services/shop.js changeTeam
    key: 'TEAM_CHANGE', kind: 'service', category: 'perfil', name: 'Troca de time', icon: 'flag-green',
    desc: 'Vá jogar por outro clube. Os gols que você já marcou ficam com o time de agora, e quem é da diretoria sai do cargo.',
    price: 50000, priceVip: 1,
  },
  {
    key: 'NICK_COLOR', kind: 'service', category: 'perfil', name: 'Cor do nick', icon: 'ico-emoji',
    desc: `Seu nick colorido nas listas e rankings. Habilidade "Mensagem com cores" (nível ${NICK_COLOR_MIN_LEVEL}).`,
    price: 5000, minLevel: NICK_COLOR_MIN_LEVEL, colors: NICK_COLORS,
  },
];
for (const it of ITEMS) {
  if (it.kind === 'boot') it.desc = `+${Math.round(it.bonus * 100)}% de acerto em pênaltis e faltas por 30 dias. Só uma chuteira equipada por vez.`;
}
export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((it) => [it.key, it]));
export const BOOT_KEYS = ITEMS.filter((it) => it.kind === 'boot').map((it) => it.key);

// ─── Efeitos (funções puras sobre `user.items` = UserItem[] ativos) ─────────
/** Um UserItem está valendo agora? (não venceu e não foi consumido) */
export function itemActive(it, now = Date.now()) {
  return !!it && !it.usedAt && new Date(it.expiresAt).getTime() > now;
}

/** Itens ativos de um usuário carregado com `items` (ou [] se não veio). */
export function activeItems(user, now = Date.now()) {
  return (user?.items || []).filter((it) => itemActive(it, now));
}

/** Nível ativo da Energia do chute (0 = nenhuma). */
export function energyLevel(user, now = Date.now()) {
  const it = activeItems(user, now).find((i) => i.itemKey === 'ENERGY');
  return it ? Math.min(ENERGY_MAX_LEVEL, it.level) : 0;
}

/** Recarga (ms) já com os itens: Energia (pênalti/falta/trilha) e Boost Auto (chute direto). */
export function applyItemCooldown(user, kind, baseMs, now = Date.now()) {
  const items = activeItems(user, now);
  if (!items.length) return baseMs;
  if (kind === 'AUTO') {
    if (items.some((i) => i.itemKey === 'BOOST_AUTO')) return Math.max(BOOST_AUTO_MIN_MS, baseMs - BOOST_AUTO_MS);
    return baseMs;
  }
  const lvl = energyLevel(user, now);
  if (!lvl) return baseMs;
  return Math.round(baseMs * (1 - lvl * ENERGY_REDUCTION_PER_LEVEL));
}

/** Bônus de acerto (0..0,10) da chuteira equipada, para pênalti e falta. */
export function bootBonus(user, now = Date.now()) {
  const boot = activeItems(user, now).find((i) => i.equipped && ITEM_BY_KEY[i.itemKey]?.kind === 'boot');
  return boot ? ITEM_BY_KEY[boot.itemKey].bonus : 0;
}

/** A Caneleira ativa (ainda não consumida) ou null. */
export function shinGuard(user, now = Date.now()) {
  return activeItems(user, now).find((i) => i.itemKey === 'SHIN_GUARD') || null;
}

/** Sorteia quantos ladrões a última linha da trilha terá com a Caneleira. */
export function rollShinGuardMines(rnd = Math.random) {
  let r = rnd();
  for (const roll of SHIN_GUARD_ROLLS) {
    if (r < roll.chance) return roll.mines;
    r -= roll.chance;
  }
  return SHIN_GUARD_ROLLS[SHIN_GUARD_ROLLS.length - 1].mines;
}

/** Projeção dos itens do jogador para o cliente. */
export function itemsView(user, now = Date.now()) {
  return activeItems(user, now).map((i) => ({
    id: i.id, key: i.itemKey, level: i.level, equipped: i.equipped, expiresAt: new Date(i.expiresAt).getTime(),
  }));
}

/** Filtro Prisma dos itens que valem agora (usar em `include: { items: activeItemsWhere() }`). */
export function activeItemsWhere(now = new Date()) {
  return { where: { usedAt: null, expiresAt: { gt: now } } };
}

/** `include` padrão para carregar um usuário que vai virar `meView` (time + itens ativos). */
export function meInclude(now = new Date()) {
  return { team: true, teamRole: true, items: activeItemsWhere(now) };
}

/** Catálogo para o cliente (/api/meta e /api/shop). */
export function catalogView() {
  return ITEMS.map((it) => ({
    key: it.key, kind: it.kind, category: it.category, name: it.name, icon: it.icon, desc: it.desc,
    price: it.price ?? null, priceVip: it.priceVip ?? null, durationMs: it.durationMs ?? null,
    levels: it.levels ?? null, bonus: it.bonus ?? null, minLevel: it.minLevel ?? null, colors: it.colors ?? null, single: !!it.single,
  }));
}
