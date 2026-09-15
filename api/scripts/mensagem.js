/**
 * Manda uma mensagem da caixa (services/inbox.js) a partir de um arquivo JSON {kind, icon, title, text}:
 *   node scripts/mensagem.js scripts/mensagens/<arquivo>.json --nick MVGIC     → só para esse jogador (revisão)
 *   node scripts/mensagem.js scripts/mensagens/<arquivo>.json --todos          → para TODOS os jogadores vivos
 * kind: ADMIN | AVISO | COMPRA | PRESENTE | PREMIO · icon: vip, coin, gol, trofeu, caveira, presente, estrela, aviso…
 * No texto, [vip] [coin] [gol] [trofeu] [medalha] [estrela] [presente] [caveira] [energia] [alvo] viram ícones.
 * Uso na VPS (pasta api/, como o usuário brgol). O aviso para todos fica registrado no Telegram.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from '../src/prisma.js';
import { sendMessage, broadcast } from '../src/services/inbox.js';
import { tg } from '../src/lib/telegram.js';

const [file, mode, arg] = process.argv.slice(2);
if (!file || !['--nick', '--todos'].includes(mode)) { console.error('uso: node scripts/mensagem.js <arquivo.json> --nick <nick> | --todos'); process.exit(1); }
const msg = JSON.parse(readFileSync(file, 'utf8'));
if (!msg.title || !msg.text) { console.error('o JSON precisa de title e text'); process.exit(1); }
console.log(`"${msg.title}" (${msg.kind ?? 'AVISO'}, ícone ${msg.icon ?? '—'}, ${msg.text.length} caracteres)`);

if (mode === '--nick') {
  const u = await prisma.user.findFirst({ where: { nickLower: String(arg ?? '').toLowerCase(), deletedAt: null }, select: { id: true, nick: true } });
  if (!u) { console.error(`jogador "${arg}" não encontrado`); process.exit(1); }
  const m = await sendMessage(u.id, { kind: msg.kind ?? 'AVISO', icon: msg.icon ?? null, title: msg.title, text: msg.text });
  console.log(`enviada para ${u.nick} (mensagem #${m.id})`);
} else {
  const n = await broadcast({ kind: msg.kind ?? 'AVISO', icon: msg.icon ?? null, title: msg.title, text: msg.text });
  console.log(`enviada para ${n} jogadores`);
  tg.info(`📣 Aviso para todos (${n} jogadores): <b>${tg.esc(msg.title)}</b> (scripts/mensagem.js)`);
  await new Promise((r) => setTimeout(r, 2500));
}
await prisma.$disconnect();
