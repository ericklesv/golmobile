/**
 * Compensação de quem comprou VIP ANTES de os pacotes virem com saldo (decisão do dono, 15/09/2026).
 *
 * Pega toda compra PAID com `money = 0` (as de antes do bônus — as novas gravam o bônus do pacote na
 * hora), credita no jogador o saldo que o pacote dá HOJE (VIP_PACKS[].money), grava esse valor em
 * VipPurchase.money (assim rodar de novo não paga duas vezes) e manda uma mensagem explicando na caixa
 * do jogador (uma por jogador, somando as compras dele). Tudo numa transação por jogador.
 *
 * Uso (pasta api/ da VPS, como o usuário brgol):
 *   node scripts/compensar-vip.js          → só MOSTRA quem receberia o quê (nada muda)
 *   node scripts/compensar-vip.js --aplicar → credita e manda as mensagens
 */
import 'dotenv/config';
import { prisma } from '../src/prisma.js';
import { VIP_PACKS } from '../src/lib/rules.js';
import { sendMessage } from '../src/services/inbox.js';
import { tg } from '../src/lib/telegram.js';

const APPLY = process.argv.includes('--aplicar');
const brl = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const packOf = (key) => VIP_PACKS.find((p) => p.key === key);

const rows = await prisma.vipPurchase.findMany({ where: { status: 'PAID', money: 0 }, orderBy: { id: 'asc' }, include: { user: { select: { id: true, nick: true, deletedAt: true } } } });
const byUser = new Map();
for (const r of rows) {
  const pack = packOf(r.packKey);
  if (!pack || !pack.money || r.user.deletedAt) continue;
  const u = byUser.get(r.userId) ?? { nick: r.user.nick, purchases: [], total: 0 };
  u.purchases.push({ id: r.id, days: r.days, money: pack.money, paidAt: r.paidAt });
  u.total += pack.money;
  byUser.set(r.userId, u);
}

if (!byUser.size) { console.log('Nada a compensar: nenhuma compra paga sem bônus.'); await prisma.$disconnect(); process.exit(0); }

console.log(`${APPLY ? 'APLICANDO' : 'SIMULAÇÃO (nada muda; use --aplicar)'} — ${byUser.size} jogador(es):`);
for (const [userId, u] of byUser) {
  console.log(`  #${userId} ${u.nick}: ${u.purchases.map((p) => `compra #${p.id} (${p.days} VIP → ${brl(p.money)})`).join(', ')} = ${brl(u.total)}`);
}

if (APPLY) {
  let done = 0;
  for (const [userId, u] of byUser) {
    const lista = u.purchases.map((p) => `• [vip] ${p.days} VIP (compra #${p.id}): [coin] ${brl(p.money)}`).join('\n');
    const title = `Presente: ${brl(u.total)} pelo seu apoio`;
    const text = [
      `Olá, ${u.nick}!`,
      '',
      `Você comprou VIP no JogaGol antes de os pacotes passarem a vir com saldo do jogo — e quem apoiou o jogo primeiro não pode ficar para trás. Por isso colocamos na sua conta, agora, o mesmo bônus que o seu pacote dá hoje:`,
      lista,
      '',
      `Total creditado: [coin] ${brl(u.total)}. Já está no seu saldo.`,
      '',
      'Novidades desta atualização:',
      '• Os pacotes de VIP agora vêm com saldo do jogo.',
      '• Na Loja, cada [vip] VIP guardado pode virar [coin] R$ 50.000 (Saco de dinheiro).',
      '• O Ranking X1 (FutPrego e Futebol de Botão) tem prêmios por rodada e por temporada [caveira].',
      '• Quem entra pelo seu link de convite também ganha [vip] VIP — e você continua ganhando.',
      '• Esta caixa de mensagens: avisos, presentes e novidades chegam aqui.',
      '',
      'Obrigado por jogar e por acreditar no JogaGol desde o começo. Bons gols!',
      '— Equipe JogaGol',
    ].join('\n');
    await prisma.$transaction(async (tx) => {
      // trava: só as compras que ainda estão com money = 0 (rodar duas vezes não paga duas vezes)
      const upd = await tx.vipPurchase.updateMany({ where: { id: { in: u.purchases.map((p) => p.id) }, money: 0 }, data: { money: -1 } });
      if (upd.count !== u.purchases.length) throw new Error(`compra já compensada para ${u.nick} — pulando`);
      for (const p of u.purchases) await tx.vipPurchase.update({ where: { id: p.id }, data: { money: p.money } });
      await tx.user.update({ where: { id: userId }, data: { money: { increment: u.total } } });
      await sendMessage(userId, { kind: 'PRESENTE', icon: 'presente', title, text }, tx);
    }).then(() => { done++; console.log(`  ok  ${u.nick}: +${brl(u.total)} e mensagem enviada`); })
      .catch((e) => console.error(`  FALHA ${u.nick}: ${e.message}`));
  }
  tg.info(`🎁 Compensação de VIP: ${done} jogador(es) receberam o bônus dos pacotes comprados antes (script compensar-vip.js)`);
  console.log(`\n${done} de ${byUser.size} compensado(s).`);
}
await prisma.$disconnect();
