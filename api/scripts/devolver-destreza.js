/**
 * A destreza acabou (dono, 16/09/2026) — devolve o dinheiro de quem comprou.
 *
 * O acerto do pênalti e da falta agora sobe pelas HABILIDADES (Pontaria e Chute, na Loja), então a destreza
 * não vale mais nada. Este script pega todo jogador com `dexterity > 0`, credita R$ 1.000 por ponto
 * (MONEY.DEXTERITY_PRICE, o preço que ele pagava), zera a destreza e manda uma mensagem explicando a mudança.
 * Quem ganhou algum ponto de graça (dia 5 da Presença) também recebe — é pouco e sai mais justo que conferir
 * compra por compra. Zerar a destreza é a própria trava: rodar de novo não paga duas vezes.
 *
 * Uso (pasta api/, na VPS como o usuário brgol):
 *   node scripts/devolver-destreza.js           → só MOSTRA quem receberia o quê (nada muda)
 *   node scripts/devolver-destreza.js --aplicar → credita, zera e manda as mensagens
 */
import 'dotenv/config';
import { prisma } from '../src/prisma.js';
import { MONEY, SKILLS, SKILL_COST, PENALTY_BASE_CHANCE, FOUL_BASE_CHANCE } from '../src/lib/rules.js';
import { sendMessage } from '../src/services/inbox.js';
import { tg } from '../src/lib/telegram.js';

const APPLY = process.argv.includes('--aplicar');
const brl = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const pct = (v) => `${Math.round(v * 100)}%`;
const topo = (s) => pct(Math.min(1, (s.kind === 'PENALTY' ? PENALTY_BASE_CHANCE : FOUL_BASE_CHANCE) + s.max * s.perLevel));

const alvos = await prisma.user.findMany({
  where: { dexterity: { gt: 0 }, deletedAt: null },
  select: { id: true, nick: true, dexterity: true },
  orderBy: { dexterity: 'desc' },
});

if (!alvos.length) { console.log('Ninguém com destreza: nada a devolver.'); await prisma.$disconnect(); process.exit(0); }

const total = alvos.reduce((s, u) => s + u.dexterity * MONEY.DEXTERITY_PRICE, 0);
console.log(`${APPLY ? 'APLICANDO' : 'SIMULAÇÃO (nada muda; use --aplicar)'} — ${alvos.length} jogador(es), ${brl(total)} no total:`);
for (const u of alvos) console.log(`  #${u.id} ${u.nick}: ${u.dexterity} de destreza → ${brl(u.dexterity * MONEY.DEXTERITY_PRICE)}`);

if (APPLY) {
  let done = 0, pago = 0;
  for (const u of alvos) {
    const valor = u.dexterity * MONEY.DEXTERITY_PRICE;
    const text = [
      `Olá, ${u.nick}!`,
      '',
      'A destreza acabou. No lugar dela chegaram as habilidades, que você sobe na [Loja](/loja):',
      ...SKILLS.map((s) => `• ${s.name}: ${s.desc} São ${s.max} níveis, de ${pct(s.kind === 'PENALTY' ? PENALTY_BASE_CHANCE : FOUL_BASE_CHANCE)} até ${topo(s)} de acerto.`),
      '',
      `Cada nível custa 1 ponto de nível, ${brl(SKILL_COST.money)} ou ${SKILL_COST.vip} [vip] VIP guardado — você escolhe como pagar. Cada nível seu dá 1 ponto, então subir de nível voltou a valer a pena.`,
      '',
      `Como a destreza não existe mais, o dinheiro voltou para a sua conta: [coin] ${brl(valor)} pelos seus ${u.dexterity} ponto(s). Já está no seu saldo.`,
      '',
      'O nerf também está desligado por enquanto: ele tirava destreza, que acabou.',
      '',
      'Bons gols!',
      '— Equipe JogaGol',
    ].join('\n');
    await prisma.$transaction(async (tx) => {
      // trava atômica: só paga se a destreza ainda estiver no mesmo valor (rodar duas vezes não paga duas vezes)
      const upd = await tx.user.updateMany({ where: { id: u.id, dexterity: u.dexterity }, data: { dexterity: 0, money: { increment: valor } } });
      if (!upd.count) throw new Error('a destreza mudou no meio do caminho — pulando');
      await sendMessage(u.id, { kind: 'PRESENTE', icon: 'dinheiro', title: `Destreza devolvida: ${brl(valor)}`, text }, tx);
    }).then(() => { done++; pago += valor; console.log(`  ok  ${u.nick}: +${brl(valor)} e mensagem enviada`); })
      .catch((e) => console.error(`  FALHA ${u.nick}: ${e.message}`));
  }
  tg.info(`🎯 Destreza devolvida: ${done} jogador(es), ${brl(pago)} creditados (script devolver-destreza.js)`);
  console.log(`\n${done} de ${alvos.length} devolvido(s) — ${brl(pago)}.`);
  await new Promise((r) => setTimeout(r, 2500)); // a fila do Telegram manda 1 por segundo
}
await prisma.$disconnect();
