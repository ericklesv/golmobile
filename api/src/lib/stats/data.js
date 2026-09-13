/**
 * Estatísticas — os dados (brasileirao-2024.json, baixado da API-Football por
 * scripts/import-stats.js) e as categorias de "quem tem mais?". Sem o arquivo, o minigame
 * fica desligado (não aparece na Home).
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TEAMS } from '../../data/teams.js';

// Fora de produção, STATS_FILE aponta para um arquivo de teste (dados fictícios, fora do repo).
const FILE = process.env.NODE_ENV !== 'production' && process.env.STATS_FILE
  ? pathToFileURL(process.env.STATS_FILE)
  : new URL('./brasileirao-2024.json', import.meta.url);
let cache;
export function dataset() {
  if (cache !== undefined) return cache;
  cache = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
  if (cache) cache.byId = new Map(cache.players.map((p) => [p.id, p]));
  return cache;
}
export const statsReady = () => !!dataset()?.players?.length;

/** Categorias. `gk`: 'only' = só goleiros; 'no' = sem goleiros; 'any' = todos. */
export const CATEGORIES = [
  { key: 'goals', label: 'gols', gk: 'no' },
  { key: 'assists', label: 'assistências', gk: 'no' },
  { key: 'shots', label: 'finalizações', gk: 'no' },
  { key: 'keyPasses', label: 'passes decisivos', gk: 'no' },
  { key: 'tackles', label: 'desarmes', gk: 'no' },
  { key: 'interceptions', label: 'interceptações', gk: 'no' },
  { key: 'dribbles', label: 'dribles certos', gk: 'no' },
  { key: 'foulsCommitted', label: 'faltas cometidas', gk: 'no' },
  { key: 'foulsDrawn', label: 'faltas sofridas', gk: 'no' },
  { key: 'yellow', label: 'cartões amarelos', gk: 'no' },
  { key: 'apps', label: 'jogos disputados', gk: 'any' },
  { key: 'minutes', label: 'minutos em campo', gk: 'any' },
  { key: 'saves', label: 'defesas', gk: 'only' },
  { key: 'conceded', label: 'gols sofridos', gk: 'only' },
];
export const categoryOf = (key) => CATEGORIES.find((c) => c.key === key);
const MIN_APPS = 8; // jogador precisa ter jogado um pouco para entrar nos pares

/**
 * Filtro de confiança nos dados da API: fora quem tem jogos mas quase nenhum minuto (a API
 * conta banco de reserva como jogo em alguns goleiros), goleiro sem defesa nem gol sofrido e
 * jogador de linha com muitos minutos e tudo zerado (dado faltando).
 */
function trustworthy(p) {
  if (p.minutes < 180) return false;
  if (p.position === 'Goalkeeper') return p.saves + p.conceded > 0;
  return p.minutes < 900 || p.tackles + p.shots + p.foulsCommitted + p.foulsDrawn + p.keyPasses > 0;
}

export function eligible(cat) {
  const ds = dataset();
  ds.pool ??= ds.players.filter((p) => p.apps >= MIN_APPS && trustworthy(p));
  return ds.pool.filter((p) => cat.gk === 'any' || (cat.gk === 'only') === (p.position === 'Goalkeeper'));
}

// ─── Times: liga o nome da API ao escudo do BRGOL ───────────────────────────
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ALIAS = { 'fortaleza-ec': 'fortaleza', 'sport-recife': 'sport', 'vasco-da-gama': 'vasco', 'athletico-paranaense': 'athletico-pr', 'atletico-paranaense': 'athletico-pr', 'atletico-goianiense': 'atletico-go', 'america-mineiro': 'america-mg' };
const BY_KEY = new Map();
for (const t of TEAMS) { BY_KEY.set(t.slug, t); BY_KEY.set(norm(t.name), t); }
export function teamFor(apiName) {
  const k = norm(apiName);
  const t = BY_KEY.get(ALIAS[k] ?? k);
  if (t) return { slug: t.slug, name: t.name, abbr: t.abbr, colorPrimary: t.c1, colorSecondary: t.c2 };
  const abbr = String(apiName ?? '?').replace(/[^A-Za-zÀ-ú ]/g, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '?';
  return { slug: null, name: apiName ?? '', abbr, colorPrimary: '#6B86B3', colorSecondary: '#FFFFFF' };
}

const POS = { Goalkeeper: 'Goleiro', Defender: 'Defensor', Midfielder: 'Meio-campista', Attacker: 'Atacante' };
/** O jogador como a tela vê (sem os números). */
export function playerCard(p) {
  const team = teamFor(p.team);
  const position = POS[p.position] ?? '';
  return { id: p.id, name: p.name, position, subtitle: [position, team.name].filter(Boolean).join(', '), team, photo: p.photo ?? null };
}
