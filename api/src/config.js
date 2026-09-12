import 'dotenv/config';

function must(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 4100),
  jwtSecret: must('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret'),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  adminKey: process.env.ADMIN_KEY || '',
  // Duração da rodada (ms). Padrão: 24h, fechando às 19:00 de Brasília (ver time.js).
  roundHours: Number(process.env.ROUND_HOURS || 24),
  roundCloseHour: Number(process.env.ROUND_CLOSE_HOUR ?? 19),
  totalRounds: Number(process.env.TOTAL_ROUNDS || 30),
  tz: 'America/Sao_Paulo',
};
