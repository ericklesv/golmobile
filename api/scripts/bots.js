/**
 * Bots "quase reais" (dono, 18/09/2026) — administração pela linha de comando (pasta api/, com o .env do banco):
 *
 *   node scripts/bots.js listar            mostra a lista de data/bots.js (nick, time, perfil) — para validar antes de criar
 *   node scripts/bots.js criar             cria as contas da lista que ainda não existem (idempotente; nick de jogador
 *                                          de verdade é pulado com aviso)
 *   node scripts/bots.js status            cada bot: time, perfil, sessões de hoje, online agora, gols nas 24 h e no total
 *   node scripts/bots.js persona           regrava a persona dos bots já criados a partir da lista (mudou o jeito de jogar)
 *
 * O motor que faz os bots jogarem roda dentro da API (services/bots.js, startBots no index.js) — este script só
 * cuida das contas. Vale em produção (é assim que os bots entram na VPS).
 */
import { prisma } from '../src/prisma.js';
import { BOT_LIST } from '../src/data/bots.js';
import { createBots, refreshPersonas, botsStatus } from '../src/services/bots.js';

const cmd = process.argv[2] || 'listar';

async function main() {
  if (cmd === 'listar') {
    console.log(`${BOT_LIST.length} bots na lista:`);
    for (const b of BOT_LIST) console.log(`  ${b.nick.padEnd(15)} ${b.gender}  ${b.team.padEnd(17)} ${b.profile.padEnd(8)} ${b.windows.join('+').padEnd(24)} ${b.bio ? `"${b.bio}"` : ''}`);
    return;
  }
  if (cmd === 'criar') {
    const { created, skipped } = await createBots(BOT_LIST, { log: (l) => console.log(l) });
    console.log(`\n${created.length} criados, ${skipped.length} pulados.`);
    for (const s of skipped) console.log(`  - ${s.nick}: ${s.why}`);
    return;
  }
  if (cmd === 'persona') {
    console.log(`${await refreshPersonas(BOT_LIST)} personas regravadas.`);
    return;
  }
  if (cmd === 'status') {
    const rows = await botsStatus();
    if (!rows.length) { console.log('Nenhum bot criado ainda (node scripts/bots.js criar).'); return; }
    for (const r of rows) console.log(`${r.online ? '●' : '○'} ${r.nick.padEnd(15)} ${r.team.padEnd(17)} ${r.serie} ${String(r.profile).padEnd(8)} nível ${String(r.level).padStart(4)}  gols 24h ${String(r.goals24h).padStart(3)}  total ${String(r.goalsTotal).padStart(4)}  hoje: ${r.today}`);
    console.log(`\n${rows.filter((r) => r.online).length} online agora · ${rows.reduce((s, r) => s + r.goals24h, 0)} gols nas últimas 24 h`);
    return;
  }
  console.error('Uso: node scripts/bots.js listar | criar | status | persona');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
