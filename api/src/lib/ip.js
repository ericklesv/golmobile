/**
 * IP do jogador + geolocalização (painel de admin).
 * O IP entra no banco no cadastro, no login e no heartbeat (User.lastIp/lastIpAt).
 * A geolocalização é resolvida SÓ no servidor, no detalhe do painel, via
 * ip-api.com (grátis, sem chave, limite 45 req/min) com cache em memória de
 * 24 h e timeout curto. Nunca chamar esse serviço do front.
 */

/** Primeiro valor do X-Forwarded-For (Nginx na VPS) ou req.ip. */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = typeof fwd === 'string' && fwd.length ? fwd.split(',')[0].trim() : null;
  const ip = (first || req.ip || '').replace(/^::ffff:/, '');
  return ip || null;
}

// Faixas privadas/locais (IPv4 e IPv6): sem geolocalização possível.
const PRIVATE_RE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;
export const isPrivateIp = (ip) => !ip || PRIVATE_RE.test(ip);

const GEO_TTL_MS = 24 * 3600_000; // acerto vale 24 h
const FAIL_TTL_MS = 5 * 60_000; // falha de rede: tenta de novo em 5 min
const cache = new Map(); // ip -> { until, geo }

/** { country, region, city, isp } ou null (IP privado/ausente ou serviço fora). */
export async function geoForIp(ip) {
  if (isPrivateIp(ip)) return null;
  const hit = cache.get(ip);
  if (hit && hit.until > Date.now()) return hit.geo;
  let geo = null;
  let ok = false;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=pt-BR&fields=status,country,regionName,city,isp,query`,
      { signal: AbortSignal.timeout(3000) },
    );
    const data = await res.json();
    ok = true; // o serviço respondeu (mesmo "fail" para IP inválido: não adianta repetir já)
    if (data?.status === 'success') {
      geo = { country: data.country || null, region: data.regionName || null, city: data.city || null, isp: data.isp || null };
    }
  } catch {
    // rede/timeout: fica sem dados agora e tenta de novo daqui a pouco
  }
  cache.set(ip, { until: Date.now() + (ok ? GEO_TTL_MS : FAIL_TTL_MS), geo });
  if (cache.size > 5000) cache.delete(cache.keys().next().value); // teto de memória
  return geo;
}
