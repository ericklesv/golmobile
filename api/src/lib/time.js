// Utilitários de tempo no fuso de Brasília.
// Regra original: artilharia da HORA fecha em toda hora cheia; a RODADA fecha às 19:00.
import { config } from '../config.js';

const TZ = config.tz;

export function tzParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  return {
    y: Number(get('year')), m: Number(get('month')), d: Number(get('day')),
    h: Number(get('hour')) % 24, min: Number(get('minute')), s: Number(get('second')),
  };
}

/** Chave da hora atual, ex.: 2026-09-12-19 */
export function hourKey(date = new Date()) {
  const { y, m, d, h } = tzParts(date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${String(h).padStart(2, '0')}`;
}

/** Offset (ms) do fuso de Brasília em relação ao UTC para uma data. */
export function tzOffsetMs(date = new Date()) {
  const p = tzParts(date);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Cria uma Date a partir de campos no horário de Brasília. */
export function fromTz(y, m, d, h = 0, min = 0) {
  // primeira aproximação: trata como UTC e corrige pelo offset do fuso
  const guess = new Date(Date.UTC(y, m - 1, d, h, min, 0));
  const off = tzOffsetMs(guess);
  return new Date(guess.getTime() - off);
}

/** Início da próxima hora cheia. */
export function nextHourStart(date = new Date()) {
  const t = new Date(date.getTime());
  t.setUTCMinutes(0, 0, 0);
  return new Date(t.getTime() + 3600_000);
}

/**
 * Próximo fechamento de rodada: o próximo ROUND_CLOSE_HOUR (19:00 BRT) que esteja
 * pelo menos ~1h à frente de `date` (para não criar rodadas de minutos).
 */
export function nextRoundClose(date = new Date()) {
  const p = tzParts(date);
  let candidate = fromTz(p.y, p.m, p.d, config.roundCloseHour, 0);
  while (candidate.getTime() - date.getTime() < 60 * 60 * 1000) {
    candidate = new Date(candidate.getTime() + 24 * 3600_000);
    // reajusta para exatamente 19:00 (DST não existe mais no Brasil, mas por segurança)
    const q = tzParts(candidate);
    candidate = fromTz(q.y, q.m, q.d, config.roundCloseHour, 0);
  }
  return candidate;
}

// ─── Calendário dos minigames diários (o dia vira à meia-noite de Brasília) ──
const DAY_ONE = Date.UTC(2026, 8, 12); // dia #1 = 12/09/2026

/** Nº do dia no calendário dos minigames. Fora de produção, TERMO_DAY força outro (teste da virada). */
export function dayNumber(date = new Date()) {
  if (process.env.NODE_ENV !== 'production') {
    const forced = Number(process.env.TERMO_DAY);
    if (Number.isInteger(forced) && forced > 0) return forced;
  }
  const { y, m, d } = tzParts(date);
  return Math.round((Date.UTC(y, m - 1, d) - DAY_ONE) / 86_400_000) + 1;
}

/** A próxima meia-noite de Brasília (quando o Termo renova). */
export function nextMidnight(date = new Date()) {
  const { y, m, d } = tzParts(date);
  return fromTz(y, m, d + 1, 0, 0);
}

/** Dia do Quiz: vira ao meio-dia de Brasília (#1 = 12/09/2026 12:00). QUIZ_DAY força outro fora de produção. */
export function quizDayNumber(date = new Date()) {
  if (process.env.NODE_ENV !== 'production') {
    const forced = Number(process.env.QUIZ_DAY);
    if (Number.isInteger(forced) && forced > 0) return forced;
  }
  const { y, m, d } = tzParts(new Date(date.getTime() - 12 * 3600_000));
  return Math.round((Date.UTC(y, m - 1, d) - DAY_ONE) / 86_400_000) + 1;
}

/** O próximo meio-dia de Brasília (quando o Quiz renova). */
export function nextNoon(date = new Date()) {
  const { y, m, d, h } = tzParts(date);
  return fromTz(y, m, h < 12 ? d : d + 1, 12, 0);
}

export const MIN = 60_000;
