// Estatísticas — duelos escritos pelo dono (13/09/2026): fatos da história do Brasileirão que
// não vêm da API. Entram misturados aos pares da temporada. `value` decide quem vence (o maior,
// ou o menor quando `better: 'low'`); `show` é o que a tela mostra na revelação.
// kind: 'player' (escudo do clube dele), 'club' (escudo) ou 'state' (sigla do estado).
// team = slug do time no BRGOL (escudo); sem slug, a tela mostra a sigla (`abbr`).
// `note` = a linha embaixo da pergunta (fonte/temporada); sem ela, "História do Brasileirão".
const Q_STATE = 'Qual estado tem mais títulos do Brasileirão?';
const Q_PTS25 = 'Quem fez mais pontos no Brasileirão 2025?';
const Q_PART = 'Quem tem mais participações na Série A do Brasileirão (até 2026)?';
const Q_FANS = 'Quem tem a maior torcida?';
const N_FANS = 'Pesquisa CBF 2025';
const club = (name, team, value, abbr) => ({ name, team, value, abbr });

export const CURATED = [
  { id: 'c01', kind: 'player', q: 'Quem sofreu mais pênaltis no Brasileirão desde 2015?',
    a: { name: 'Marinho', sub: 'Vitória', team: 'vitoria', value: 21 }, b: { name: 'Arrascaeta', sub: 'Flamengo', team: 'flamengo', value: 17 } },
  { id: 'c02', kind: 'state', q: Q_STATE, a: { name: 'São Paulo', abbr: 'SP', value: 35 }, b: { name: 'Rio de Janeiro', abbr: 'RJ', value: 19 } },
  { id: 'c03', kind: 'state', q: Q_STATE, a: { name: 'Minas Gerais', abbr: 'MG', value: 7 }, b: { name: 'Rio Grande do Sul', abbr: 'RS', value: 5 } },
  { id: 'c04', kind: 'player', q: 'Quem fez mais gols em uma única partida do Brasileirão?',
    a: { name: 'Edmundo', sub: 'Vasco', team: 'vasco', value: 6, show: '6 gols (1996)' }, b: { name: 'Romário', sub: 'Vasco', team: 'vasco', value: 0, show: 'menos de 6' } },
  { id: 'c05', kind: 'player', q: 'Quem é o jogador mais velho a disputar uma partida do Brasileirão?',
    a: { name: 'Fábio', sub: 'Fluminense', team: 'fluminense', value: 43.5, show: '43 anos e 6 meses' }, b: { name: 'Zé Roberto', sub: 'Palmeiras', team: 'palmeiras', value: 43 + 4 / 12, show: '43 anos e 4 meses' } },
  { id: 'c06', kind: 'club', q: 'Quem tem mais vice-campeonatos brasileiros?', a: club('Santos', 'santos', 7), b: club('São Paulo', 'sao-paulo', 6) },
  { id: 'c07', kind: 'club', q: 'Quem teve a melhor campanha no Brasileirão?', better: 'low',
    a: { ...club('Náutico', 'nautico', 2), show: '2º (1967)' }, b: { ...club('Santa Cruz', 'santa-cruz', 4), show: '4º (1975)' } },
  { id: 'c08', kind: 'club', q: Q_PTS25, a: club('Flamengo', 'flamengo', 79), b: club('Palmeiras', 'palmeiras', 76) },
  { id: 'c09', kind: 'club', q: Q_PTS25, a: club('Mirassol', 'mirassol', 67), b: club('Fluminense', 'fluminense', 64) },
  { id: 'c10', kind: 'club', q: Q_PTS25, a: club('Bahia', 'bahia', 60), b: club('São Paulo', 'sao-paulo', 51) },
  { id: 'c11', kind: 'club', q: Q_PTS25, a: club('Red Bull Bragantino', null, 48, 'RBB'), b: club('Santos', 'santos', 47) },
  { id: 'c12', kind: 'club', q: Q_PTS25, a: club('Vitória', 'vitoria', 45), b: club('Internacional', 'internacional', 44) },
  { id: 'c13', kind: 'club', q: Q_PART, a: club('Grêmio', 'gremio', 66), b: club('Santos', 'santos', 65) },
  { id: 'c14', kind: 'club', q: Q_PART, a: club('Atlético-MG', 'atletico-mg', 64), b: club('Palmeiras', 'palmeiras', 63) },
  { id: 'c15', kind: 'club', q: Q_PART, a: club('Cruzeiro', 'cruzeiro', 63), b: club('Botafogo', 'botafogo', 61) },
  { id: 'c16', kind: 'club', q: Q_PART, a: club('Sport', 'sport', 43), b: club('Vitória', 'vitoria', 42) },
  { id: 'c17', kind: 'club', q: Q_PART, a: club('Náutico', 'nautico', 34), b: club('Ceará', 'ceara', 27) },
  { id: 'c18', kind: 'club', q: Q_PART, a: club('Náutico', 'nautico', 34), b: club('Santa Cruz', 'santa-cruz', 24) },
  // 13/09/2026 (2ª leva do dono)
  { id: 'c19', kind: 'player', q: 'Quem tem mais partidas jogadas?', note: 'Temporada 2024/25',
    a: { name: 'Matheus Cunha', sub: 'Wolverhampton', abbr: 'WOL', value: 71 }, b: { name: 'Harry Kane', sub: 'Bayern de Munique', abbr: 'BAY', value: 70 } },
  { id: 'c20', kind: 'club', q: Q_FANS, note: N_FANS, a: { ...club('Vasco', 'vasco', 5), show: '5%' }, b: { ...club('Internacional', 'internacional', 4), show: '4%' } },
  { id: 'c21', kind: 'club', q: Q_FANS, note: N_FANS, a: { ...club('Cruzeiro', 'cruzeiro', 4), show: '4%' }, b: { ...club('Atlético-MG', 'atletico-mg', 3), show: '3%' } },
  { id: 'c22', kind: 'club', q: Q_FANS, note: N_FANS, a: { ...club('Santos', 'santos', 3), show: '3%' }, b: { ...club('Botafogo', 'botafogo', 2), show: '2%' } },
];
