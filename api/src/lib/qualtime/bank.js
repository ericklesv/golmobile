/**
 * "De que time é?" — banco de fatos sobre os 48 clubes e a montagem das perguntas do dia.
 *
 * Dois formatos, alternados ao longo da partida:
 *  - `crest`: uma pista em texto e 4 escudos — qual é o time?
 *  - `name`:  um escudo e 4 pistas do MESMO tipo — qual delas é sobre esse time?
 *
 * Tipos de fato: estádio, cidade, ano de fundação, cores + estado (perfil), apelido,
 * mascote, ídolo e clássico. Só entra fato certo e estável: nada de série (muda com
 * acesso/rebaixamento), títulos ou apelidos que servem para mais de um clube ("Tigre",
 * "Verdão", "Leão", "Galo"). Cidade fica de fora quando está no nome do clube (Santos,
 * Criciúma…) e o perfil quando o estado está no nome (Bahia, Ceará, Paraná, Goiás).
 *
 * Os distratores são escolhidos por semelhança (mesmas cores, mesmo estado, mesmo mando de
 * campo…), nunca ao acaso, e nunca um time para quem a pista também valeria (Maracanã é
 * de dois; 1943 é de Goiás e Vila Nova; "clássico contra o Vasco" serve para três).
 *
 * Fato novo: acrescentar na tabela do tipo; não precisa de migração.
 */
import { createHash } from 'node:crypto';
import { TEAMS } from '../../data/teams.js';

const BY_SLUG = new Map(TEAMS.map((t) => [t.slug, t]));

const STATE_ADJ = {
  RJ: 'carioca', SP: 'paulista', RS: 'gaúcho', MG: 'mineiro', BA: 'baiano', CE: 'cearense', PE: 'pernambucano',
  PR: 'paranaense', GO: 'goiano', SC: 'catarinense', PA: 'paraense', RN: 'potiguar', AL: 'alagoano', MA: 'maranhense',
  DF: 'do Distrito Federal',
};

const COLOR_NAME = {
  '#C3131A': 'vermelho', '#FE0000': 'vermelho', '#E5050F': 'vermelho', '#E30613': 'vermelho', '#E4002B': 'vermelho',
  '#D20A11': 'vermelho', '#C8102E': 'vermelho', '#D0021B': 'vermelho',
  '#000000': 'preto', '#FFFFFF': 'branco',
  '#006437': 'verde', '#006E3F': 'verde', '#0B7A3B': 'verde', '#00553F': 'verde', '#00843D': 'verde', '#0B6B3A': 'verde',
  '#0A7A3B': 'verde', '#0B8A3B': 'verde',
  '#0D80BF': 'azul', '#003399': 'azul', '#0057A8': 'azul', '#0A3D91': 'azul', '#0072BB': 'azul', '#0A2A8F': 'azul',
  '#7A1830': 'grená', '#F2C400': 'amarelo',
};
const colorsOf = (t) => [COLOR_NAME[t.c1.toUpperCase()] ?? 'outra', COLOR_NAME[t.c2.toUpperCase()] ?? 'outra'];
const colorKey = (t) => [...colorsOf(t)].sort().join('/');

// Cidade-sede (só a cidade, não o estado).
const CITY = {
  flamengo: 'Rio de Janeiro', corinthians: 'São Paulo', palmeiras: 'São Paulo', 'sao-paulo': 'São Paulo', santos: 'Santos',
  gremio: 'Porto Alegre', internacional: 'Porto Alegre', cruzeiro: 'Belo Horizonte', 'atletico-mg': 'Belo Horizonte',
  fluminense: 'Rio de Janeiro', botafogo: 'Rio de Janeiro', vasco: 'Rio de Janeiro', bahia: 'Salvador', fortaleza: 'Fortaleza',
  sport: 'Recife', 'athletico-pr': 'Curitiba', vitoria: 'Salvador', ceara: 'Fortaleza', goias: 'Goiânia', coritiba: 'Curitiba',
  portuguesa: 'São Paulo', 'ponte-preta': 'Campinas', guarani: 'Campinas', nautico: 'Recife', 'santa-cruz': 'Recife',
  'america-mg': 'Belo Horizonte', avai: 'Florianópolis', figueirense: 'Florianópolis', chapecoense: 'Chapecó', paysandu: 'Belém',
  remo: 'Belém', juventude: 'Caxias do Sul', 'xv-de-jau': 'Jaú', 'xv-de-piracicaba': 'Piracicaba', 'botafogo-sp': 'Ribeirão Preto',
  ferroviaria: 'Araraquara', mirassol: 'Mirassol', criciuma: 'Criciúma', 'vila-nova': 'Goiânia', 'atletico-go': 'Goiânia',
  'america-rn': 'Natal', abc: 'Natal', crb: 'Maceió', csa: 'Maceió', 'sampaio-correa': 'São Luís', parana: 'Curitiba',
  londrina: 'Londrina', brasiliense: 'Taguatinga',
};
// Cidades que entregam a resposta pelo nome do clube (ou pelo sufixo -MG/-PR/-GO/-RN, já que os
// vizinhos de cidade não podem ser distratores) ficam de fora.
const CITY_OBVIOUS = new Set(['santos', 'sao-paulo', 'fortaleza', 'sport', 'coritiba', 'chapecoense', 'criciuma', 'mirassol', 'londrina',
  'xv-de-jau', 'xv-de-piracicaba', 'brasiliense', 'atletico-mg', 'america-mg', 'athletico-pr', 'atletico-go', 'america-rn']);

// Ano de fundação (só os que não têm disputa de data: São Paulo e Botafogo ficam de fora).
const FOUNDED = {
  flamengo: 1895, corinthians: 1910, palmeiras: 1914, santos: 1912, gremio: 1903, internacional: 1909, cruzeiro: 1921,
  'atletico-mg': 1908, fluminense: 1902, vasco: 1898, bahia: 1931, fortaleza: 1918, sport: 1905, 'athletico-pr': 1924,
  vitoria: 1899, ceara: 1914, goias: 1943, coritiba: 1909, portuguesa: 1920, 'ponte-preta': 1900, guarani: 1911, nautico: 1901,
  'santa-cruz': 1914, 'america-mg': 1912, avai: 1923, figueirense: 1921, chapecoense: 1973, paysandu: 1914, remo: 1905,
  juventude: 1913, 'xv-de-jau': 1924, 'xv-de-piracicaba': 1913, 'botafogo-sp': 1918, ferroviaria: 1950, mirassol: 1925,
  criciuma: 1947, 'vila-nova': 1943, 'atletico-go': 1937, 'america-rn': 1915, abc: 1915, crb: 1912, csa: 1913,
  'sampaio-correa': 1923, parana: 1989, londrina: 1956, brasiliense: 2000,
};

// Apelidos que só servem para um clube destes 48 (nada de "Verdão", "Tigre", "Leão", "Galo").
const NICKS = {
  flamengo: ['Mengão', 'Urubu'], corinthians: ['Timão', 'Todo-Poderoso'], palmeiras: ['Porco', 'Palestra'],
  'sao-paulo': ['Soberano', 'Tricolor do Morumbi'], santos: ['Peixe', 'Alvinegro Praiano'], gremio: ['Imortal', 'Tricolor Gaúcho'],
  internacional: ['Colorado'], cruzeiro: ['Raposa', 'Cabuloso'], 'atletico-mg': ['Galo Mineiro'],
  fluminense: ['Tricolor das Laranjeiras', 'Pó de Arroz'], botafogo: ['Fogão', 'Glorioso', 'Estrela Solitária'],
  vasco: ['Gigante da Colina', 'Cruz-Maltino', 'Almirante'], bahia: ['Esquadrão de Aço'], fortaleza: ['Leão do Pici'],
  sport: ['Leão da Ilha do Retiro'], 'athletico-pr': ['Furacão'], vitoria: ['Leão da Barra', 'Rubro-Negro Baiano'],
  ceara: ['Vozão', 'Alvinegro de Porangabuçu'], goias: ['Esmeraldino'], coritiba: ['Coxa', 'Coxa-Branca'], portuguesa: ['Lusa'],
  'ponte-preta': ['Macaca'], guarani: ['Bugre'], nautico: ['Timbu'], 'santa-cruz': ['Cobra Coral', 'Tricolor do Arruda'],
  'america-mg': ['Coelho'], figueirense: ['Furacão do Estreito'], chapecoense: ['Verdão do Oeste'], paysandu: ['Papão'],
  remo: ['Leão Azul'], juventude: ['Papo', 'Jaconero'], 'xv-de-jau': ['Galo da Comarca'], 'xv-de-piracicaba': ['Nhô Quim'],
  'botafogo-sp': ['Pantera'], ferroviaria: ['Locomotiva'], 'atletico-go': ['Dragão'], 'america-rn': ['Mecão'],
  abc: ['Mais Querido'], crb: ['Galo da Praia'], csa: ['Azulão'], 'sampaio-correa': ['Bolívia Querida'],
  parana: ['Tricolor da Vila', 'Gralha Azul'], londrina: ['Tubarão'], brasiliense: ['Jacaré'],
};

// Mascotes sem sósia entre os 48 (tigre, leão, galo, periquito e mosqueteiro servem a mais de um).
const MASCOTS = {
  flamengo: 'um urubu', palmeiras: 'um porco', internacional: 'um saci', cruzeiro: 'uma raposa',
  bahia: 'o Super-Homem', ceara: 'um vovô', 'ponte-preta': 'uma macaca', guarani: 'um bugre', nautico: 'um timbu',
  'santa-cruz': 'uma cobra coral', 'america-mg': 'um coelho', chapecoense: 'o Índio Condá', juventude: 'um papagaio',
  'botafogo-sp': 'uma pantera', ferroviaria: 'uma locomotiva', 'atletico-go': 'um dragão', abc: 'um elefante',
  parana: 'uma gralha-azul', londrina: 'um tubarão', brasiliense: 'um jacaré',
};

// Ídolos sem ambiguidade — quem é ídolo em dois clubes destes 48 fica de fora (Sócrates e Raí
// também são do Botafogo-SP; Renato Gaúcho, do Fluminense; Fernandão, do Goiás; Grafite, do São Paulo).
const IDOLS = {
  flamengo: ['Zico', 'Júnior'], corinthians: ['Marcelinho Carioca', 'Neto'], palmeiras: ['Ademir da Guia', 'Marcos', 'Dudu'],
  'sao-paulo': ['Rogério Ceni', 'Kaká'], santos: ['Pelé', 'Neymar'], gremio: ['Danrlei', 'Tarciso'],
  internacional: ['Falcão', "D'Alessandro"], cruzeiro: ['Tostão', 'Dirceu Lopes'], 'atletico-mg': ['Reinaldo', 'Hulk'],
  fluminense: ['Fred', 'Germán Cano', 'Castilho'], botafogo: ['Garrincha', 'Nilton Santos', 'Jefferson'],
  vasco: ['Roberto Dinamite', 'Juninho Pernambucano'], bahia: ['Bobô', 'Charles'], 'athletico-pr': ['Sicupira'],
  goias: ['Harlei'], coritiba: ['Dirceu Krüger'], 'ponte-preta': ['Dicá'], nautico: ['Kuki'], paysandu: ['Vandick'],
};

// Clássicos com nome consagrado: [time, adversário, nome]. Cada linha vira pista para os dois lados.
// Só estados com 3+ clubes no jogo que se enfrentam em clássicos nomeados (RJ, SP, PE): aí os
// distratores são os outros rivais do mesmo adversário e é preciso saber o NOME do clássico.
// Gre-Nal, Ba-Vi, Re-Pa etc. ficam de fora porque o adversário já entrega a resposta.
const CLASSICS = [
  ['flamengo', 'fluminense', 'Fla-Flu'], ['flamengo', 'vasco', 'Clássico dos Milhões'], ['flamengo', 'botafogo', 'Clássico da Rivalidade'],
  ['botafogo', 'fluminense', 'Clássico Vovô'], ['botafogo', 'vasco', 'Clássico da Amizade'], ['fluminense', 'vasco', 'Clássico dos Gigantes'],
  ['corinthians', 'palmeiras', 'Derby Paulista'], ['corinthians', 'sao-paulo', 'Majestoso'], ['corinthians', 'santos', 'Clássico Alvinegro'],
  ['santos', 'sao-paulo', 'San-São'], ['palmeiras', 'santos', 'Clássico da Saudade'], ['palmeiras', 'sao-paulo', 'Choque-Rei'],
  ['sport', 'santa-cruz', 'Clássico das Multidões'], ['sport', 'nautico', 'Clássico dos Clássicos'], ['nautico', 'santa-cruz', 'Clássico das Emoções'],
];

/**
 * Fatos: FACTS[type] = Map(slug → [{ key, text, opt, value, about }]).
 *  text  = pergunta no formato `crest` ("Qual time …?")
 *  opt   = rótulo curto no formato `name` (uma das 4 alternativas)
 *  value = o que a pista afirma (dois times com o mesmo value se confundem)
 *  about = times citados na pista (não podem estar entre os escudos nem ser o escudo mostrado)
 */
export const FACTS = {};
function add(type, slug, f) {
  const m = (FACTS[type] ??= new Map());
  const list = m.get(slug) ?? [];
  list.push({ key: `${type}:${slug}:${list.length}`, type, slug, about: [slug], ...f });
  m.set(slug, list);
}
for (const t of TEAMS) {
  add('stadium', t.slug, { text: `Qual time manda seus jogos no estádio ${t.stadium}?`, opt: `Manda no ${t.stadium}`, value: t.stadium.replace(/\s*\(.*\)$/, '') });
  if (CITY[t.slug] && !CITY_OBVIOUS.has(t.slug)) add('city', t.slug, { text: `Qual destes clubes tem sede em ${CITY[t.slug]}?`, opt: CITY[t.slug], value: CITY[t.slug] });
  if (FOUNDED[t.slug]) add('founded', t.slug, { text: `Qual destes clubes foi fundado em ${FOUNDED[t.slug]}?`, opt: `Fundado em ${FOUNDED[t.slug]}`, value: FOUNDED[t.slug] });
  if (!/bahia|ceará|paraná|goiás|brasiliense|-(MG|PR|GO|RN|SP)$/i.test(t.name)) {
    const [a, b] = colorsOf(t);
    add('profile', t.slug, { text: `Qual destes é o clube ${STATE_ADJ[t.state]} de ${a} e ${b}?`, opt: `${STATE_ADJ[t.state]}, ${a} e ${b}`, value: `${t.state}:${colorKey(t)}` });
  }
  for (const n of NICKS[t.slug] ?? []) add('nick', t.slug, { text: `Qual time é conhecido como "${n}"?`, opt: `"${n}"`, value: n });
  if (MASCOTS[t.slug]) add('mascot', t.slug, { text: `Qual time tem ${MASCOTS[t.slug]} como mascote?`, opt: `Mascote: ${MASCOTS[t.slug]}`, value: MASCOTS[t.slug] });
  for (const i of IDOLS[t.slug] ?? []) add('idol', t.slug, { text: `${i} é ídolo de qual time?`, opt: i, value: i });
}
for (const [a, b, name] of CLASSICS) {
  for (const [me, rival] of [[a, b], [b, a]]) {
    const r = BY_SLUG.get(rival);
    add('classic', me, { text: `Qual time faz o ${name} contra o ${r.name}?`, opt: `${name} contra o ${r.name}`, value: `${name}:${rival}`, about: [me, rival] });
  }
}
export const TYPES = Object.keys(FACTS);
/** Todas as pistas, em lista. */
export const CLUES = TYPES.flatMap((type) => [...FACTS[type].values()].flat());

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

/** Times para quem a pista também valeria (não podem ser escudo-distrator nem escudo mostrado). */
export function conflicts(clue) {
  const t = BY_SLUG.get(clue.slug);
  const out = new Set(clue.about);
  for (const x of TEAMS) {
    if (clue.type === 'stadium' && (t.stadium.includes(x.name) || x.stadium.includes(t.name))) out.add(x.slug); // estádio "Santa Cruz"
    for (const f of FACTS[clue.type].get(x.slug) ?? []) {
      if (f.value === clue.value) out.add(x.slug);
      // "Furacão" × "Furacão do Estreito"
      if (clue.type === 'nick' && (String(f.value).includes(clue.value) || String(clue.value).includes(f.value))) out.add(x.slug);
    }
  }
  return out;
}

/** Quanto `x` se parece com `t` (quanto maior, melhor distrator). */
function similarity(t, x) {
  let s = 0;
  if (colorKey(x) === colorKey(t)) s += 3;
  else if (colorsOf(x).includes(colorsOf(t)[0])) s += 1;
  if (x.state === t.state) s += 3;
  if (CITY[x.slug] === CITY[t.slug]) s += 2;
  if (FOUNDED[x.slug] && FOUNDED[t.slug] && Math.abs(FOUNDED[x.slug] - FOUNDED[t.slug]) <= 5) s += 1;
  return s;
}

/** 3 distratores: os 2 mais parecidos + 1 entre os 6 seguintes (para não ser sempre o mesmo trio). */
function pickDistractors(t, candidates, r) {
  const ranked = shuffle(candidates, r).map((x) => ({ x, s: similarity(t, x) })).sort((a, b) => b.s - a.s).map((o) => o.x);
  const top = ranked.slice(0, 2);
  const rest = shuffle(ranked.slice(2, 8), r);
  return [...top, ...rest].slice(0, 3);
}

/** Uma pista do time `x` do mesmo tipo que `clue`, que não fale do time-resposta e não valha para ele. */
function optionFor(x, clue, answerSlug, r) {
  const list = (FACTS[clue.type].get(x.slug) ?? []).filter((f) => !f.about.includes(answerSlug) && f.value !== clue.value);
  return list.length ? list[Math.floor(r() * list.length)] : null;
}

/**
 * As perguntas do dia — iguais para todo mundo: `count` pistas de times e tipos variados,
 * alternando o formato (`crest`: pista → 4 escudos; `name`: escudo → 4 pistas do mesmo tipo).
 * Devolve [{ key, type, mode, text, answer: slug, options }], onde `options[0]` é sempre a
 * resposta certa: no `crest` são slugs; no `name` são { slug, text }.
 */
export function questionsOfDay(day, count) {
  const r = rng(`qualtime:${day}`);
  const pool = shuffle(CLUES, r);
  const usedTeams = new Set();
  const texts = new Set();
  const typeCount = {};
  const perType = Math.max(2, Math.ceil(count / TYPES.length) + 1);
  const out = [];
  for (const c of pool) {
    if (out.length >= count) break;
    const mode = out.length % 2 === 0 ? 'crest' : 'name';
    if (mode === 'name' && c.type === 'profile') continue; // o escudo já mostra as cores
    if (usedTeams.has(c.slug) || texts.has(c.text) || (typeCount[c.type] ?? 0) >= perType) continue;
    const t = BY_SLUG.get(c.slug);
    const bad = conflicts(c);
    let candidates = TEAMS.filter((x) => !bad.has(x.slug) && !usedTeams.has(x.slug));
    let options;
    if (mode === 'crest') {
      options = pickDistractors(t, candidates, r).map((x) => x.slug);
      if (options.length < 3) continue;
      options = [c.slug, ...options];
    } else {
      // no formato `name` os distratores são pistas de outros times, do mesmo tipo
      const picks = [];
      candidates = candidates.filter((x) => (FACTS[c.type].get(x.slug) ?? []).length);
      for (const x of pickDistractors(t, candidates, r)) { const f = optionFor(x, c, c.slug, r); if (f) picks.push({ slug: x.slug, text: f.opt }); }
      if (picks.length < 3 || new Set(picks.map((p) => p.text)).size < 3) continue;
      options = [{ slug: c.slug, text: c.opt }, ...picks];
    }
    usedTeams.add(c.slug); texts.add(c.text); typeCount[c.type] = (typeCount[c.type] ?? 0) + 1;
    out.push({ key: c.key, type: c.type, mode, text: mode === 'crest' ? c.text : 'Qual destas pistas é sobre este time?', answer: c.slug, options });
  }
  return out;
}
