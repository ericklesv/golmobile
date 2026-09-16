/**
 * A destreza acabou (dono, 16/09/2026) — devolve o dinheiro de quem comprou e avisa TODO MUNDO.
 *
 * O acerto do pênalti e da falta agora sobe pelas HABILIDADES (Pontaria e Chute, na Loja), então a destreza
 * não vale mais nada. Este script:
 *  1. pega todo jogador com `dexterity > 0`, credita R$ 1.000 por ponto (MONEY.DEXTERITY_PRICE, o preço que
 *     ele pagava), zera a destreza e manda a mensagem com o valor devolvido;
 *  2. manda a MESMA mensagem (sem a parte do dinheiro) para os outros jogadores vivos, em lotes — assim
 *     ninguém recebe duas e todo mundo fica sabendo da mudança.
 * Quem ganhou algum ponto de graça (dia 5 da Presença) também recebe — é pouco e sai mais justo que conferir
 * compra por compra. Zerar a destreza é a própria trava do dinheiro: rodar de novo não paga duas vezes (mas
 * mandaria a mensagem de novo — rodar UMA vez com --aplicar).
 *
 * Uso (pasta api/, na VPS como o usuário brgol):
 *   node scripts/devolver-destreza.js           → só MOSTRA quem receberia o quê (nada muda)
 *   node scripts/devolver-destreza.js --aplicar → credita, zera e manda as mensagens
 */
import 'dotenv/config';
import { prisma } from '../src/prisma.js';
import { MONEY, SKILLS, SKILL_COST, COOLDOWN_MIN, PENALTY_BASE_CHANCE, FOUL_BASE_CHANCE } from '../src/lib/rules.js';
import { sendMessage } from '../src/services/inbox.js';
import { tg } from '../src/lib/telegram.js';

const APPLY = process.argv.includes('--aplicar');
const brl = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const pct = (v) => `${Math.round(v * 100)}%`;
const baseOf = (s) => (s.kind === 'PENALTY' ? PENALTY_BASE_CHANCE : FOUL_BASE_CHANCE);
const topo = (s) => pct(Math.min(1, baseOf(s) + s.max * s.perLevel));
const minutos = `${Math.floor(COOLDOWN_MIN / 60000)}:${String(Math.round((COOLDOWN_MIN % 60000) / 1000)).padStart(2, '0')}`;
const TITULO = 'As habilidades chegaram';

/** A mensagem que todo jogador recebe; `devolvido` só existe para quem tinha destreza. */
const mensagem = (nick, devolvido = null) => [
  `Olá, ${nick}!`,
  '',
  'A destreza acabou. No lugar dela chegaram as habilidades, que você sobe na [Loja](/loja):',
  ...SKILLS.map((s) => `• ${s.name}: ${s.desc} São ${s.max} níveis, de ${pct(baseOf(s))} até ${topo(s)} de acerto.`),
  '',
  `Cada nível custa 1 ponto de nível, ${brl(SKILL_COST.money)} ou ${SKILL_COST.vip} [vip] VIP guardado — você escolhe como pagar. Cada nível seu dá 1 ponto, então subir de nível voltou a valer a pena.`,
  '',
  'Por que mudamos: com a destreza dava para chegar a quase 100% de acerto em dois dias, e depois disso não sobrava nada para conquistar. Agora o acerto é uma caminhada longa — tem o que perseguir por semanas e cada nível seu vale alguma coisa de novo. É isso que dá vida longa ao JogaGol.',
  ...(devolvido ? ['', `Como a destreza não existe mais, o dinheiro voltou para a sua conta: [coin] ${brl(devolvido.valor)} pelos seus ${devolvido.pontos} ponto(s). Já está no seu saldo.`] : []),
  '',
  `Mudou também: nenhum chute recarrega em menos de ${minutos}, nem com VIP e Energia juntos, e o nerf está desligado por enquanto (ele tirava destreza).`,
  '',
  'Bons gols!',
  '— Equipe JogaGol',
].join('\n');

const alvos = await prisma.user.findMany({
  where: { dexterity: { gt: 0 }, deletedAt: null },
  select: { id: true, nick: true, dexterity: true },
  orderBy: { dexterity: 'desc' },
});
const vivos = await prisma.user.count({ where: { deletedAt: null } });
const total = alvos.reduce((s, u) => s + u.dexterity * MONEY.DEXTERITY_PRICE, 0);

console.log(`${APPLY ? 'APLICANDO' : 'SIMULAÇÃO (nada muda; use --aplicar)'} — ${alvos.length} jogador(es) com destreza, ${brl(total)} no total; aviso para ${vivos} jogador(es):`);
for (const u of alvos) console.log(`  #${u.id} ${u.nick}: ${u.dexterity} de destreza → ${brl(u.dexterity * MONEY.DEXTERITY_PRICE)}`);
if (!APPLY) console.log('\nPrévia da mensagem:\n---\n' + mensagem(alvos[0]?.nick ?? 'jogador', alvos[0] ? { valor: alvos[0].dexterity * MONEY.DEXTERITY_PRICE, pontos: alvos[0].dexterity } : null) + '\n---');

if (APPLY) {
  // 1) quem tinha destreza: dinheiro de volta + mensagem com o valor
  let done = 0, pago = 0;
  for (const u of alvos) {
    const valor = u.dexterity * MONEY.DEXTERITY_PRICE;
    const text = mensagem(u.nick, { valor, pontos: u.dexterity });
    await prisma.$transaction(async (tx) => {
      // trava atômica: só paga se a destreza ainda estiver no mesmo valor (rodar duas vezes não paga duas vezes)
      const upd = await tx.user.updateMany({ where: { id: u.id, dexterity: u.dexterity }, data: { dexterity: 0, money: { increment: valor } } });
      if (!upd.count) throw new Error('a destreza mudou no meio do caminho — pulando');
      await sendMessage(u.id, { kind: 'PRESENTE', icon: 'dinheiro', title: `Destreza devolvida: ${brl(valor)}`, text }, tx);
    }).then(() => { done++; pago += valor; console.log(`  ok  ${u.nick}: +${brl(valor)} e mensagem enviada`); })
      .catch((e) => console.error(`  FALHA ${u.nick}: ${e.message}`));
  }

  // 2) todos os outros: só o aviso, em lotes de 500 (uma mensagem por jogador)
  const jaAvisados = new Set(alvos.map((u) => u.id));
  let avisos = 0, cursor = 0;
  for (;;) {
    const lote = await prisma.user.findMany({ where: { deletedAt: null, id: { gt: cursor } }, select: { id: true, nick: true }, orderBy: { id: 'asc' }, take: 500 });
    if (!lote.length) break;
    cursor = lote[lote.length - 1].id;
    const novos = lote.filter((u) => !jaAvisados.has(u.id));
    if (novos.length) {
      await prisma.message.createMany({ data: novos.map((u) => ({ userId: u.id, kind: 'AVISO', icon: '/ui/ico-target.png', title: TITULO, text: mensagem(u.nick) })) });
      avisos += novos.length;
    }
  }

  tg.info(`🎯 Habilidades no ar: ${done} jogador(es) receberam a destreza de volta (${brl(pago)}) e ${avisos} receberam o aviso (script devolver-destreza.js)`);
  console.log(`\n${done} de ${alvos.length} devolvido(s) — ${brl(pago)}. Aviso para outros ${avisos} jogador(es).`);
  await new Promise((r) => setTimeout(r, 2500)); // a fila do Telegram manda 1 por segundo
}
await prisma.$disconnect();
