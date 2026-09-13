/**
 * Baixa as estatísticas reais dos jogadores do Brasileirão (API-Football) para o minigame
 * Estatísticas e grava em src/lib/stats/brasileirao-<temporada>.json — o jogo lê SÓ esse
 * arquivo (não chama a API em produção).
 *
 * Uso (na pasta api/):  node scripts/import-stats.js [temporada=2024] [liga=71]
 * A chave vem de API_FOOTBALL_KEY (no api/.env local — NUNCA no git nem na VPS).
 *
 * Plano grátis (100 req/dia, temporadas 2022–2024, no máximo 3 páginas por consulta): por isso
 * vai TIME POR TIME (1 req para a lista de times + até 3 páginas por time ≈ 61 req), devagar
 * (1 req a cada 7 s) e guardando cada resposta em disco (pasta temporária do sistema) — se cair
 * no meio, rodar de novo não gasta de novo o que já veio.
 */
import 'dotenv/config';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SEASON = Number(process.argv[2] || 2024);
const LEAGUE = Number(process.argv[3] || 71); // 71 = Brasileirão Série A
const KEY = process.env.API_FOOTBALL_KEY;
if (!KEY) { console.error('Falta API_FOOTBALL_KEY no api/.env'); process.exit(1); }
const CACHE = join(tmpdir(), `brgol-apifootball-${LEAGUE}-${SEASON}`);
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
async function get(path, cacheName) {
  const file = join(CACHE, `${cacheName}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  if (calls > 0) await sleep(7000);
  calls++;
  const res = await fetch(`https://v3.football.api-sports.io/${path}`, { headers: { 'x-apisports-key': KEY } });
  const body = await res.json();
  const errs = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
  if (!res.ok || (errs && errs.length)) throw new Error(`API (${path}): HTTP ${res.status} ${JSON.stringify(body.errors)}`);
  writeFileSync(file, JSON.stringify(body));
  return body;
}

const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
const players = new Map();
const seen = new Set(); // (jogador, time) já somado — o mesmo jogador pode vir em dois times

function ingest(body) {
    for (const { player, statistics } of body.response) {
      for (const s of statistics.filter((x) => x.league?.id === LEAGUE)) {
        const key = `${player.id}:${s.team?.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const p = players.get(player.id) ?? {
          id: player.id, name: player.name, photo: player.photo, team: s.team?.name, teamId: s.team?.id, _teamMinutes: -1, _teams: new Set(),
          position: s.games?.position ?? null, apps: 0, minutes: 0, goals: 0, assists: 0, shots: 0, keyPasses: 0,
          tackles: 0, interceptions: 0, dribbles: 0, foulsCommitted: 0, foulsDrawn: 0, yellow: 0, red: 0, saves: 0, conceded: 0,
        };
        if (num(s.games?.appearences) > 0) p._teams.add(s.team?.id);
        if (num(s.games?.minutes) > p._teamMinutes) { p.team = s.team?.name; p.teamId = s.team?.id; p._teamMinutes = num(s.games?.minutes); p.position = s.games?.position ?? p.position; }
        p.apps += num(s.games?.appearences); p.minutes += num(s.games?.minutes);
        p.goals += num(s.goals?.total); p.assists += num(s.goals?.assists); p.saves += num(s.goals?.saves); p.conceded += num(s.goals?.conceded);
        p.shots += num(s.shots?.total); p.keyPasses += num(s.passes?.key);
        p.tackles += num(s.tackles?.total); p.interceptions += num(s.tackles?.interceptions);
        p.dribbles += num(s.dribbles?.success); p.foulsCommitted += num(s.fouls?.committed); p.foulsDrawn += num(s.fouls?.drawn);
        p.yellow += num(s.cards?.yellow) + num(s.cards?.yellowred); p.red += num(s.cards?.red) + num(s.cards?.yellowred);
        players.set(player.id, p);
      }
    }
}

const teams = (await get(`teams?league=${LEAGUE}&season=${SEASON}`, 'teams')).response.map((t) => t.team);
console.log(`${teams.length} times na liga ${LEAGUE}/${SEASON}`);
for (const team of teams) {
  for (let page = 1; page <= 3; page++) {
    const body = await get(`players?league=${LEAGUE}&season=${SEASON}&team=${team.id}&page=${page}`, `team-${team.id}-p${page}`);
    ingest(body);
    const total = body.paging?.total ?? 1;
    console.log(`${team.name}: página ${page}/${Math.min(total, 3)}${total > 3 ? ` (tem ${total}; o plano grátis lê só 3)` : ''} — ${players.size} jogadores até aqui`);
    if (page >= total) break;
  }
}

// nomes conhecidos que caíram na 4ª página de algum time (o plano grátis só lê 3): busca por nome
const EXTRA = ['Memphis', 'Thiago Silva', 'Gabriel Barbosa'];
for (const name of EXTRA) ingest(await get(`players?league=${LEAGUE}&season=${SEASON}&search=${encodeURIComponent(name)}`, `search-${name.replace(/\W+/g, '_')}`));

// Quem aparece com jogos por mais de um time fica de fora: a API às vezes põe na temporada
// antiga os números do time novo (ex.: um jogador que só mudou de clube no ano seguinte).
const multi = [...players.values()].filter((p) => p._teams.size > 1);
console.log(`fora por aparecer em mais de um time: ${multi.length}`);
const list = [...players.values()].filter((p) => p._teams.size <= 1).map(({ _teamMinutes, _teams, ...p }) => p).filter((p) => p.apps > 0).sort((a, b) => b.minutes - a.minutes);
mkdirSync(new URL('../src/lib/stats/', import.meta.url), { recursive: true });
const out = new URL(`../src/lib/stats/brasileirao-${SEASON}.json`, import.meta.url);
writeFileSync(out, JSON.stringify({ source: 'API-Football', league: LEAGUE, season: SEASON, fetchedAt: new Date().toISOString(), players: list }, null, 1));
console.log(`\n${calls} requisições novas nesta rodada. Gravado: ${list.length} jogadores com jogos em ${out.pathname}`);
