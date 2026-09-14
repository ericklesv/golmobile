/**
 * Distintivos ao lado do nome (pedido do dono, 13/09/2026):
 * - cargo no time: P (Presidente) / D (Diretor) — só vale no time em que o jogador está;
 * - top 3 AGORA da hora, da rodada e da temporada (1º ouro, 2º prata, 3º bronze; hora = estrela, rodada =
 *   medalha, temporada = troféu). É ao vivo: se alguém passa na frente, o ícone muda de dono (cache de 15 s);
 * - no perfil, quantas vezes ficou em 1º, 2º, 3º e no top 10 de cada hora/rodada/temporada já fechada
 *   (lê os top 10 congelados em HourResult/Round/Season.topJson).
 */
import { prisma } from '../prisma.js';
import { hourKey } from '../lib/time.js';
import { liveRound, topScorers } from './league.js';

const TOPS_TTL = 15_000, ROLES_TTL = 30_000;
let tops = { at: 0, value: null, pending: null };
let roles = { at: 0, value: null, pending: null };

async function cached(box, ttl, load) {
  if (box.value && Date.now() - box.at < ttl) return box.value;
  if (!box.pending) box.pending = load().then((v) => { box.value = v; box.at = Date.now(); return v; }).finally(() => { box.pending = null; });
  return box.pending;
}

/** Top 3 de agora: { HOUR: [userId 1º, 2º, 3º], ROUND: [...], SEASON: [...] }. */
export const liveTops = () => cached(tops, TOPS_TTL, async () => {
  const live = liveRound();
  const [h, r, s] = await Promise.all([
    topScorers({ hourKey: hourKey() }, 3),
    live ? topScorers({ roundId: live.roundId }, 3) : [],
    live ? topScorers({ seasonId: live.seasonId }, 3) : [],
  ]);
  const ids = (rows) => rows.map((x) => x.userId);
  return { HOUR: ids(h), ROUND: ids(r), SEASON: ids(s) };
});

/** userId → 'PRESIDENTE' | 'DIRETOR' (cargo do time em que ele está hoje). */
const roleMap = () => cached(roles, ROLES_TTL, async () => {
  const list = await prisma.teamRole.findMany({ select: { userId: true, teamId: true, role: true, user: { select: { teamId: true } } } });
  return new Map(list.filter((r) => r.user.teamId === r.teamId).map((r) => [r.userId, r.role]));
});

/** A diretoria mudou (club.js): o P/D aparece na hora, sem esperar o cache. */
export function invalidateRoles() { roles.at = 0; }

/** Função (userId) → { role, tops: [{ scope, pos }] } com o cargo e o top 3 de agora. */
export async function badgeLookup() {
  const [t, r] = await Promise.all([liveTops(), roleMap()]);
  return (id) => {
    const out = [];
    for (const scope of ['HOUR', 'ROUND', 'SEASON']) {
      const i = t[scope].indexOf(id);
      if (i >= 0) out.push({ scope, pos: i + 1 });
    }
    return { role: r.get(id) ?? null, tops: out };
  };
}

export const badgesOf = async (userId) => (await badgeLookup())(userId);

/** Acrescenta { role, tops } em cada linha que tem userId (rankings, página do time...). */
export async function withBadges(rows, idOf = (x) => x.userId) {
  const look = await badgeLookup();
  return rows.map((row) => ({ ...row, ...look(idOf(row)) }));
}

/**
 * Quantas vezes o jogador ficou em 1º, 2º, 3º e no top 10 das horas, rodadas e temporadas já fechadas.
 * O @> usa o índice GIN de HourResult.topJson (só abre as horas em que ele aparece).
 */
export async function topHistory(userId) {
  const probe = JSON.stringify([{ userId }]);
  const rows = await prisma.$queryRaw`
    SELECT 'HOUR' AS scope, (e->>'position')::int AS pos, count(*)::int AS n
      FROM "HourResult" h CROSS JOIN LATERAL jsonb_array_elements(h."topJson") e
     WHERE h."topJson" @> ${probe}::jsonb AND (e->>'userId')::int = ${userId}
     GROUP BY 2
    UNION ALL
    SELECT 'ROUND', (e->>'position')::int, count(*)::int
      FROM "Round" r CROSS JOIN LATERAL jsonb_array_elements(r."topJson") e
     WHERE r.status = 'FINISHED' AND r."topJson" @> ${probe}::jsonb AND (e->>'userId')::int = ${userId}
     GROUP BY 2
    UNION ALL
    SELECT 'SEASON', (e->>'position')::int, count(*)::int
      FROM "Season" s CROSS JOIN LATERAL jsonb_array_elements(s."topJson") e
     WHERE s."topJson" @> ${probe}::jsonb AND (e->>'userId')::int = ${userId}
     GROUP BY 2`;
  const out = {};
  for (const scope of ['HOUR', 'ROUND', 'SEASON']) out[scope] = { gold: 0, silver: 0, bronze: 0, top10: 0 };
  for (const { scope, pos, n } of rows) {
    const o = out[scope];
    if (pos === 1) o.gold += n; else if (pos === 2) o.silver += n; else if (pos === 3) o.bronze += n;
    if (pos <= 10) o.top10 += n;
  }
  return out;
}
