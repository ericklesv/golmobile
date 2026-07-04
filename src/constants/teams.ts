export const TEAMS = [
  { id: 'flamengo', name: 'Flamengo', shield: '🔴⚫', color: '#E8000D' },
  { id: 'corinthians', name: 'Corinthians', shield: '⚫⚪', color: '#1A1A1A' },
  { id: 'palmeiras', name: 'Palmeiras', shield: '🟢', color: '#006437' },
  { id: 'sao_paulo', name: 'São Paulo', shield: '🔴⚪🔵', color: '#CC0000' },
  { id: 'santos', name: 'Santos', shield: '⚪⚫', color: '#1A1A1A' },
  { id: 'gremio', name: 'Grêmio', shield: '🔵⚫', color: '#1B3A6E' },
  { id: 'fluminense', name: 'Fluminense', shield: '🔴🟢⚪', color: '#8A1538' },
  { id: 'atletico_mg', name: 'Atlético-MG', shield: '⚫⚪', color: '#1A1A1A' },
  { id: 'internacional', name: 'Internacional', shield: '🔴', color: '#CC0000' },
  { id: 'botafogo', name: 'Botafogo', shield: '⚫⚪', color: '#1A1A1A' },
  { id: 'vasco', name: 'Vasco', shield: '⚫⚪', color: '#1A1A1A' },
  { id: 'cruzeiro', name: 'Cruzeiro', shield: '🔵', color: '#1B3A6E' },
  { id: 'sport', name: 'Sport', shield: '🔴⚫', color: '#CC0000' },
  { id: 'bahia', name: 'Bahia', shield: '🔵⚪🔴', color: '#1B3A6E' },
  { id: 'fortaleza', name: 'Fortaleza', shield: '🔵🔴⚪', color: '#003E8F' },
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
