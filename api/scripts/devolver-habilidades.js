/**
 * Devolução EM DOBRO de quem subiu habilidade com dinheiro ou VIP (decisão do dono, 17/09/2026: habilidade
 * agora sobe só com ponto de nível — "quem comprou com dinheiro/vip vai ser devolvido em dobro").
 *
 * O que faz, por jogador, lendo o histórico real de compras (`ShopLog`, itemKey SKILL_*):
 *  - desfaz os níveis que foram COMPRADOS (os pagos com ponto de nível ficam de pé);
 *  - devolve 2x o que ele pagou: dinheiro em R$ e VIP no banco de VIPs;
 *  - deixa recibo no `AdminAction` e manda uma mensagem para o jogador explicando.
 *
 * Roda em produção (é lá que estão as compras). Sem `--aplicar` ele só MOSTRA o que faria.
 *   node scripts/devolver-habilidades.js              # simulação
 *   node scripts/devolver-habilidades.js --aplicar    # grava
 */
import 'dotenv/config';
const { prisma } = await import('../src/prisma.js');
const { SKILL_FIELD, SKILL_BY_KEY } = await import('../src/lib/rules.js');
const { sendMessage } = await import('../src/services/inbox.js');

const aplicar = process.argv.includes('--aplicar');
const real = (n) => `R$ ${n.toLocaleString('pt-BR')}`;

const logs = await prisma.shopLog.findMany({
  where: { itemKey: { startsWith: 'SKILL_' }, currency: { in: ['money', 'vip'] } },
  orderBy: { id: 'asc' },
});
if (!logs.length) { console.log('Ninguém subiu habilidade com dinheiro ou VIP. Nada a devolver.'); await prisma.$disconnect(); process.exit(0); }

// junta por jogador: quanto pagou e quantos níveis de cada habilidade saíram do bolso
const porJogador = new Map();
for (const l of logs) {
  const key = l.itemKey.slice('SKILL_'.length);
  if (!SKILL_BY_KEY[key]) { console.log(`aviso: compra de habilidade desconhecida (${l.itemKey}) no log ${l.id} — ignorada`); continue; }
  const j = porJogador.get(l.userId) ?? { money: 0, vip: 0, niveis: {} };
  if (l.currency === 'money') j.money += l.price; else j.vip += l.price;
  j.niveis[key] = (j.niveis[key] ?? 0) + 1;
  porJogador.set(l.userId, j);
}

const admin = await prisma.user.findFirst({ where: { isAdmin: true }, orderBy: { id: 'asc' } }); // o recibo precisa de um autor
const users = await prisma.user.findMany({ where: { id: { in: [...porJogador.keys()] } } });
console.log(`${users.length} jogador(es) compraram nível de habilidade com dinheiro ou VIP.\n`);
let totalMoney = 0, totalVip = 0;

for (const u of users) {
  const j = porJogador.get(u.id);
  const data = { money: { increment: j.money * 2 }, vipDays: { increment: j.vip * 2 } };
  const tirados = [];
  for (const [key, qtd] of Object.entries(j.niveis)) {
    const campo = SKILL_FIELD[key];
    const agora = u[campo] ?? 0;
    // o teto caiu de 10 para 9 na migração 0039, então nunca tira mais do que ele tem hoje
    const tira = Math.min(qtd, agora);
    if (tira > 0) { data[campo] = agora - tira; tirados.push(`${SKILL_BY_KEY[key].name} ${agora} → ${agora - tira}`); }
  }
  totalMoney += j.money * 2; totalVip += j.vip * 2;
  console.log(`${u.nick.padEnd(14)} pagou ${real(j.money)} + ${j.vip} VIP → devolve ${real(j.money * 2)} + ${j.vip * 2} VIP` + (tirados.length ? ` | ${tirados.join(', ')}` : ' | nenhum nível para tirar'));

  if (!aplicar) continue;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data });
    await tx.adminAction.create({
      data: {
        adminId: admin.id, targetId: u.id, action: 'devolucao-habilidades',
        payload: { pagou: { money: j.money, vip: j.vip }, devolvido: { money: j.money * 2, vip: j.vip * 2 }, niveis: j.niveis, motivo: 'habilidade passou a ser só com ponto de nível (dono, 17/09/2026)' },
      },
    });
    await sendMessage(u.id, {
      kind: 'PRESENTE', icon: 'presente',
      title: 'Habilidade agora é só com ponto de nível',
      text: `As habilidades deixaram de ser compradas com dinheiro ou VIP: agora cada nível custa 1 ponto de nível, ganho subindo de nível. Os níveis que você tinha comprado foram desfeitos e você recebeu O DOBRO do que pagou de volta: [coin] ${real(j.money * 2)}${j.vip ? ` e [vip] ${j.vip * 2} VIP` : ''}. Seus níveis pagos com ponto continuam do jeito que estavam.`,
    }, tx);
  });
}

console.log(`\nTotal a devolver: ${real(totalMoney)} e ${totalVip} VIP`);
console.log(aplicar ? 'APLICADO.' : 'Simulação — rode com --aplicar para gravar.');
await prisma.$disconnect();
