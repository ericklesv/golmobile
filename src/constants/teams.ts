export const TEAMS = [
  { id: 'flamengo', name: 'Flamengo', abbr: 'FLA', shield: '🔴⚫', color: '#E8000D' },
  { id: 'corinthians', name: 'Corinthians', abbr: 'COR', shield: '⚫⚪', color: '#111111' },
  { id: 'palmeiras', name: 'Palmeiras', abbr: 'PAL', shield: '🟢', color: '#0A7C42' },
  { id: 'sao_paulo', name: 'São Paulo', abbr: 'SAO', shield: '🔴⚪🔵', color: '#D2202B' },
  { id: 'santos', name: 'Santos', abbr: 'SAN', shield: '⚪⚫', color: '#1A1A1A' },
  { id: 'gremio', name: 'Grêmio', abbr: 'GRE', shield: '🔵⚫', color: '#1B72C4' },
  { id: 'fluminense', name: 'Fluminense', abbr: 'FLU', shield: '🔴🟢⚪', color: '#8A1538' },
  { id: 'atletico_mg', name: 'Atlético-MG', abbr: 'CAM', shield: '⚫⚪', color: '#1A1A1A' },
  { id: 'internacional', name: 'Internacional', abbr: 'INT', shield: '🔴', color: '#D2202B' },
  { id: 'botafogo', name: 'Botafogo', abbr: 'BOT', shield: '⚫⚪', color: '#1A1A1A' },
  { id: 'vasco', name: 'Vasco', abbr: 'VAS', shield: '⚫⚪', color: '#1A1A1A' },
  { id: 'cruzeiro', name: 'Cruzeiro', abbr: 'CRU', shield: '🔵', color: '#1B4FA8' },
  { id: 'sport', name: 'Sport', abbr: 'SPT', shield: '🔴⚫', color: '#D2202B' },
  { id: 'bahia', name: 'Bahia', abbr: 'BAH', shield: '🔵⚪🔴', color: '#1B72C4' },
  { id: 'fortaleza', name: 'Fortaleza', abbr: 'FOR', shield: '🔵🔴⚪', color: '#0A5DBF' },
];

// Valores só para exibição de countdown na UI — a validação real é nas
// Cloud Functions (functions/index.js). Manter em sincronia com o servidor.
export const ACTION_COOLDOWNS: Record<string, number> = {
  auto:    1  * 60 * 1000,  // 1 minuto
  penalti: 10 * 60 * 1000,  // 10 minutos
  falta:   5  * 60 * 1000,  // 5 minutos
  trilha:  3  * 60 * 1000,  // 3 minutos
};

// Campo no Firestore para cada tipo
export const ACTION_LAST_TIME_FIELD: Record<string, string> = {
  auto:    'lastAutoTime',
  penalti: 'lastPenaltiTime',
  falta:   'lastFaltaTime',
  trilha:  'lastTrilhaTime',
};
