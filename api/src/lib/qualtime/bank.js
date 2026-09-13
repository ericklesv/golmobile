/**
 * "De que time é?" — banco de pistas sobre os 48 clubes. Cada pista aponta para UM time;
 * a pergunta mostra 4 escudos e o jogador escolhe. Tipos: estádio, estado, apelido e ídolo.
 * Apelidos/ídolos ambíguos (ex.: "Tigre", Romário) ficam de fora de propósito.
 * Pista nova: acrescentar aqui; não precisa de migração.
 */
import { createHash } from 'node:crypto';
import { TEAMS } from '../../data/teams.js';

export const UF = {
  RJ: 'do Rio de Janeiro', SP: 'de São Paulo', RS: 'do Rio Grande do Sul', MG: 'de Minas Gerais', BA: 'da Bahia',
  CE: 'do Ceará', PE: 'de Pernambuco', PR: 'do Paraná', GO: 'de Goiás', SC: 'de Santa Catarina', PA: 'do Pará',
  RN: 'do Rio Grande do Norte', AL: 'de Alagoas', MA: 'do Maranhão', DF: 'do Distrito Federal',
};

const NICKS = {
  flamengo: ['Mengão', 'Rubro-Negro carioca'], corinthians: ['Timão'], palmeiras: ['Verdão', 'Porco'], 'sao-paulo': ['Tricolor Paulista', 'Soberano'],
  santos: ['Peixe', 'Alvinegro Praiano'], gremio: ['Imortal Tricolor'], internacional: ['Colorado'], cruzeiro: ['Raposa'],
  'atletico-mg': ['Galo'], fluminense: ['Tricolor das Laranjeiras', 'Flu'], botafogo: ['Fogão', 'Glorioso'], vasco: ['Gigante da Colina', 'Cruz-Maltino'],
  bahia: ['Esquadrão de Aço'], fortaleza: ['Leão do Pici'], sport: ['Leão da Ilha do Retiro'], 'athletico-pr': ['Furacão'],
  vitoria: ['Leão da Barra'], ceara: ['Vozão'], goias: ['Esmeraldino'], coritiba: ['Coxa'], portuguesa: ['Lusa'],
  'ponte-preta': ['Macaca'], guarani: ['Bugre'], nautico: ['Timbu'], 'santa-cruz': ['Cobra Coral'], 'america-mg': ['Coelho'],
  figueirense: ['Furacão do Estreito'], chapecoense: ['Verdão do Oeste'], paysandu: ['Papão'], remo: ['Leão Azul'],
  juventude: ['Papo'], 'xv-de-jau': ['Galo da Comarca'], 'xv-de-piracicaba': ['Nhô Quim'], 'botafogo-sp': ['Pantera'],
  ferroviaria: ['Locomotiva'], 'atletico-go': ['Dragão'], 'america-rn': ['Mecão'], abc: ['Mais Querido'], crb: ['Galo da Praia'],
  csa: ['Azulão'], 'sampaio-correa': ['Bolívia Querida'], parana: ['Tricolor da Vila'], londrina: ['Tubarão'], brasiliense: ['Jacaré'],
};

const IDOLS = {
  flamengo: ['Zico', 'Júnior', 'Gabigol'], corinthians: ['Sócrates', 'Marcelinho Carioca', 'Cássio'], palmeiras: ['Ademir da Guia', 'Marcos', 'Dudu'],
  'sao-paulo': ['Rogério Ceni', 'Raí', 'Kaká'], santos: ['Pelé', 'Neymar', 'Robinho'], gremio: ['Renato Gaúcho', 'Danrlei', 'Luan'],
  internacional: ['Falcão', "D'Alessandro", 'Fernandão'], cruzeiro: ['Tostão', 'Fábio', 'Dirceu Lopes'], 'atletico-mg': ['Reinaldo', 'Hulk', 'Victor'],
  fluminense: ['Fred', 'Germán Cano', 'Castilho'], botafogo: ['Garrincha', 'Nilton Santos', 'Jefferson'], vasco: ['Roberto Dinamite', 'Juninho Pernambucano', 'Philippe Coutinho'],
  bahia: ['Bobô', 'Charles'], 'athletico-pr': ['Sicupira'], 'ponte-preta': ['Dicá'], guarani: ['Careca'], paysandu: ['Vandick'], 'santa-cruz': ['Grafite'],
};

/** Todas as pistas: { key, type, text, slug }. */
export const CLUES = [];
for (const t of TEAMS) {
  CLUES.push({ key: `stadium:${t.slug}`, type: 'stadium', text: `Qual time manda seus jogos no estádio ${t.stadium}?`, slug: t.slug });
  CLUES.push({ key: `state:${t.slug}`, type: 'state', text: `Qual destes times é ${UF[t.state] ?? `de ${t.state}`}?`, slug: t.slug });
  for (const n of NICKS[t.slug] ?? []) CLUES.push({ key: `nick:${t.slug}:${n}`, type: 'nick', text: `Qual time é conhecido como "${n}"?`, slug: t.slug });
  for (const i of IDOLS[t.slug] ?? []) CLUES.push({ key: `idol:${t.slug}:${i}`, type: 'idol', text: `${i} é ídolo de qual time?`, slug: t.slug });
}
const BY_SLUG = new Map(TEAMS.map((t) => [t.slug, t]));

function rng(seed) {
  let a = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, r) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Times que também serviriam de resposta para a pista (não podem ser distratores). */
function conflicts(clue) {
  const t = BY_SLUG.get(clue.slug);
  // estádio compartilhado (Maracanã, Castelão, Rei Pelé) e estádio com nome de clube ("Santa Cruz") confundem
  if (clue.type === 'stadium') return TEAMS.filter((x) => x.stadium === t.stadium || t.stadium.includes(x.name)).map((x) => x.slug);
  if (clue.type === 'state') return TEAMS.filter((x) => x.state === t.state).map((x) => x.slug);
  return [clue.slug];
}

/**
 * As perguntas do dia — iguais para todo mundo: `count` pistas de times diferentes, misturando
 * os tipos, cada uma com 3 distratores (de preferência da mesma série, pra não ficar óbvio).
 * Devolve [{ key, type, text, answer: slug, options: [slug × 4] (a resposta é a posição 0) }].
 */
export function questionsOfDay(day, count) {
  const r = rng(`qualtime:${day}`);
  const pool = shuffle(CLUES, r);
  const used = new Set();
  const texts = new Set(); // a mesma pergunta (ex.: "é de São Paulo?") não repete no dia
  const typeCount = {};
  const out = [];
  const perType = Math.ceil(count / 4) + 1;
  for (const c of pool) {
    if (out.length >= count) break;
    if (used.has(c.slug) || texts.has(c.text) || (typeCount[c.type] ?? 0) >= perType) continue;
    used.add(c.slug); texts.add(c.text); typeCount[c.type] = (typeCount[c.type] ?? 0) + 1;
    const bad = new Set(conflicts(c));
    const t = BY_SLUG.get(c.slug);
    const sameSerie = shuffle(TEAMS.filter((x) => !bad.has(x.slug) && x.serie === t.serie), r);
    const others = shuffle(TEAMS.filter((x) => !bad.has(x.slug) && x.serie !== t.serie), r);
    const distractors = [...sameSerie.slice(0, 2), ...others].slice(0, 3).map((x) => x.slug);
    out.push({ key: c.key, type: c.type, text: c.text, answer: c.slug, options: [c.slug, ...distractors] });
  }
  return out;
}
