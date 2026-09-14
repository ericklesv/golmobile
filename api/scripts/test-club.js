/**
 * Diretoria e contratações (services/club.js) direto no banco LOCAL: presidência, diretores, propostas
 * (VIP preso e devolvido), contrato de 1 dia por VIP, dois "aceitar" ao mesmo tempo, perda de cargo,
 * doação e a trava da mesma internet. Cria jogadores de teste (nicks tc…) em 3 times sem diretoria.
 *
 * Uso (na pasta api/):  node scripts/test-club.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-club.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
const { prisma } = await import('../src/prisma.js');
const C = await import('../src/services/club.js');
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const DAY = 86_400_000;

// times sem ninguém na diretoria (o teste pode rodar várias vezes sem apagar nada)
const free = await prisma.team.findMany({ where: { roles: { none: {} } }, take: 3, orderBy: { id: 'desc' } });
const [T1, T2, T3] = free;
console.log(`times do teste: ${T1.name} · ${T2.name} · ${T3.name}`);
let seq = 0;
const mk = async (team, extra = {}) => {
  const n = `tc${Date.now() % 1e6}${seq++}`;
  return prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@local.test`, passwordHash: 'x', teamId: team.id, lastIp: `10.0.${seq}.1`, ...extra } });
};
const vipOn = { vipUntil: new Date(Date.now() + 5 * DAY) };
const goal = (u, team) => prisma.goal.create({ data: { userId: u.id, teamId: team.id, hourKey: 'teste', kind: 'AUTO' } });
const U = (id) => prisma.user.findUnique({ where: { id } });
const bank = async (id) => (await U(id)).vipDays;

// ── presidência
const p = await mk(T1, vipOn);
let e = await err(C.claimPresidency(p.id));
check(e?.status === 403 && /Marque pelo menos 1 gol/.test(e.message), `sem gol pelo time não assume ("${e?.message}")`);
const semVip = await mk(T1); await goal(semVip, T1);
e = await err(C.claimPresidency(semVip.id));
check(e?.status === 403 && /Só VIP/.test(e.message), 'sem VIP não assume');
await goal(p, T1);
let st = await C.claimPresidency(p.id);
check(st.role === 'PRESIDENTE' && st.board.president?.nick === p.nick, `VIP com gol assumiu a presidência do ${T1.name}`);
const q = await mk(T1, vipOn); await goal(q, T1);
e = await err(C.claimPresidency(q.id));
check(e?.status === 403 && /já tem presidente/.test(e.message), 'segundo VIP não toma a presidência de quem já é presidente');
const qs = await C.clubState(q.id);
check(qs.claim.ok === false && qs.role === null, 'tela do outro jogador: sem botão de assumir');

// ── diretores
e = await err(C.appointDirector(p.id, semVip.nick));
check(e?.status === 400 && /Só VIP/.test(e.message), 'não nomeia diretor sem VIP');
e = await err(C.appointDirector(q.id, semVip.nick));
check(e?.status === 403, 'quem não é presidente não nomeia');
const cand = await C.candidates(p.id);
check(cand.some((c) => c.nick === q.nick) && !cand.some((c) => c.nick === semVip.nick), 'lista para nomear: só VIPs do time sem cargo');
const d1 = await mk(T1, vipOn), d2 = await mk(T1, vipOn), d3 = await mk(T1, vipOn);
await C.appointDirector(p.id, d1.nick);
st = await C.appointDirector(p.id, d2.nick);
check(st.board.directors.map((d) => d?.nick).join(',') === `${d1.nick},${d2.nick}`, 'nomeou 2 diretores');
e = await err(C.appointDirector(p.id, d3.nick));
check(e?.status === 409, 'terceiro diretor: recusado (máximo 2)');
e = await err(C.appointDirector(p.id, d1.nick));
check(e?.status === 400, 'quem já tem cargo não é nomeado de novo');

// ── propostas
const alvo = await mk(T2, { lastIp: '200.1.1.1' });
e = await err(C.makeOffer(p.id, alvo.nick, 10));
check(e?.status === 402, 'proposta sem VIP guardado suficiente: recusada');
await prisma.user.update({ where: { id: p.id }, data: { vipDays: 50 } });
for (const [v, label] of [[0, '0 VIP'], [101, '101 VIP'], [2.5, '2,5 VIP → vira 2']]) {
  const r = await err(C.makeOffer(p.id, alvo.nick, v));
  if (v === 2.5) { check(r === null && (await bank(p.id)) === 48, `proposta de ${label}: aceita como 2 VIP`); await C.cancelOffer(p.id, (await prisma.transferOffer.findFirst({ where: { fromUserId: p.id, status: 'PENDING' } })).id); }
  else check(r?.status === 400, `proposta de ${label}: recusada`);
}
check((await bank(p.id)) === 50, 'cancelou: o VIP voltou (50)');
e = await err(C.makeOffer(p.id, alvo.nick, 5, 'vem pro time www.site.com'));
check(e?.status === 400, 'recado com link: recusado');
e = await err(C.makeOffer(q.id, alvo.nick, 5));
check(e?.status === 403, 'jogador sem cargo não faz proposta');
e = await err(C.makeOffer(p.id, q.nick, 5));
check(e?.status === 400, 'não faz proposta para quem já é do time');
st = await C.makeOffer(p.id, alvo.nick, 10, 'Vem ser nosso artilheiro!');
check((await bank(p.id)) === 40 && st.sent[0]?.status === 'PENDING' && st.sent[0]?.to.nick === alvo.nick, 'proposta de 10 VIP enviada: o VIP saiu do banco do presidente (50 → 40)');
e = await err(C.makeOffer(d1.id, alvo.nick, 3));
check(e?.status === 409, 'o mesmo time não manda duas propostas abertas para o mesmo jogador');
const vizinho = await mk(T2, { lastIp: p.lastIp });
await prisma.user.update({ where: { id: d1.id }, data: { vipDays: 20 } });
e = await err(C.makeOffer(d1.id, vizinho.nick, 3));
check(e === null, 'diretor também faz proposta');
e = await err(C.makeOffer(p.id, vizinho.nick, 3));
check(e?.status === 403 || e?.status === 409, 'presidente para o mesmo jogador: recusado (proposta do time já aberta / mesma internet)');
const vizinho2 = await mk(T2, { lastIp: p.lastIp });
e = await err(C.makeOffer(p.id, vizinho2.nick, 3));
check(e?.status === 403 && /mesma internet/.test(e.message), 'conta na mesma internet do presidente: não negocia');
check((await C.pendingOffers(alvo.id)) === 1, 'o alvo tem 1 proposta aberta (selo na aba Time)');

// outro time também quer o alvo
const p3 = await mk(T3, { ...vipOn, vipDays: 30 }); await goal(p3, T3); await C.claimPresidency(p3.id);
await C.makeOffer(p3.id, alvo.nick, 7);
let as = await C.clubState(alvo.id);
check(as.received.length === 2 && as.received.every((o) => o.days === o.vip) && as.received.some((o) => o.message === 'Vem ser nosso artilheiro!'), 'o alvo vê as 2 propostas (VIP, contrato em dias e recado)');

// aceita a do T1
const oT1 = as.received.find((o) => o.team.slug === T1.slug);
as = await C.acceptOffer(alvo.id, oT1.id);
const a2 = await U(alvo.id);
const dias = Math.round((a2.contractUntil.getTime() - Date.now()) / DAY);
check(a2.teamId === T1.id && a2.vipDays === 10 && dias === 10, `aceitou: joga no ${T1.name}, +10 VIP e contrato de ${dias} dias`);
check((await bank(p3.id)) === 30 && as.received.length === 0, `a outra proposta foi cancelada e o VIP voltou para o presidente do ${T3.name} (30)`);
const feed = await prisma.activity.findFirst({ where: { userId: alvo.id }, orderBy: { id: 'desc' } });
check(/contratad[oa] pelo .* por 10 VIP \(saiu do /.test(feed?.text ?? ''), `lance no feed: "${feed?.text}"`);
e = await err(C.makeOffer(p3.id, alvo.nick, 5));
check(e?.status === 409 && /contrato/.test(e.message), 'com contrato: ninguém consegue fazer proposta');
const b1 = await C.boardView(T1.id), b2 = await C.boardView(T2.id);
check(b1.moves[0]?.nick === alvo.nick && b1.moves[0].arrived && b2.moves[0]?.nick === alvo.nick && !b2.moves[0].arrived, 'movimentações: "chegou" no time novo e "saiu" no antigo');
e = await err(C.acceptOffer(alvo.id, oT1.id));
check(e?.status === 409, 'aceitar a mesma proposta de novo: nada');

// recusar / cancelar / vencer
const r1 = await mk(T2);
await C.makeOffer(p.id, r1.nick, 5);
const o1 = (await C.clubState(r1.id)).received[0];
await C.refuseOffer(r1.id, o1.id);
check((await bank(p.id)) === 40, 'recusou: o VIP voltou para o presidente');
e = await err(C.refuseOffer(r1.id, o1.id));
check(e?.status === 409 && (await bank(p.id)) === 40, 'recusar de novo: não devolve em dobro');
await C.makeOffer(p.id, r1.nick, 4);
const o2 = await prisma.transferOffer.findFirst({ where: { toUserId: r1.id, status: 'PENDING' } });
await prisma.transferOffer.update({ where: { id: o2.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
await C.clubSweep(); await C.clubSweep();
check((await prisma.transferOffer.findUnique({ where: { id: o2.id } })).status === 'EXPIRED' && (await bank(p.id)) === 40, 'venceu em 48 h: encerrada e o VIP voltou uma vez só');
e = await err(C.acceptOffer(r1.id, o2.id));
check(e?.status === 409, 'proposta vencida não pode ser aceita');

// diretor removido: a proposta dele deixa de valer e o VIP volta
const r2 = await mk(T2);
await C.makeOffer(d1.id, r2.nick, 6);
const d1b = await bank(d1.id);
const preso = (await prisma.transferOffer.findMany({ where: { fromUserId: d1.id, status: 'PENDING' } })).reduce((a, o) => a + o.vip, 0);
await C.removeDirector(p.id, d1.nick);
check(preso === 9 && (await bank(d1.id)) === d1b + preso && (await C.pendingOffers(r2.id)) === 0, `diretor removido: as 2 propostas dele caíram e os ${preso} VIP voltaram para ele`);
check((await prisma.teamRole.findUnique({ where: { userId: d1.id } })) === null, 'e ele saiu da diretoria');

// dois "aceitar" ao mesmo tempo
const z = await mk(T2);
await C.makeOffer(p.id, z.nick, 8);
await C.makeOffer(p3.id, z.nick, 9);
const zs = await C.clubState(z.id);
const bp = await bank(p.id), bp3 = await bank(p3.id);
const res = await Promise.allSettled(zs.received.map((o) => C.acceptOffer(z.id, o.id)));
const zf = await U(z.id);
const won = zf.teamId === T1.id ? 8 : 9;
check(res.filter((r) => r.status === 'fulfilled').length === 1 && zf.vipDays === won && (await bank(p.id)) + (await bank(p3.id)) === bp + bp3 + (17 - won), `dois "aceitar" ao mesmo tempo: fechou 1 só (+${won} VIP), o VIP da outra voltou`);

// perda de cargo por 3 dias sem entrar / sem VIP
await prisma.user.update({ where: { id: d2.id }, data: { lastSeenAt: new Date(Date.now() - 4 * DAY) } });
await C.clubSweep();
check((await prisma.teamRole.findUnique({ where: { userId: d2.id } })) === null, 'diretor 3 dias sem entrar: perdeu o cargo');
await prisma.user.update({ where: { id: p.id }, data: { vipUntil: new Date(Date.now() - 2 * DAY) } });
await C.clubSweep();
check((await prisma.teamRole.findUnique({ where: { userId: p.id } }))?.role === 'PRESIDENTE', 'presidente com VIP vencido há 2 dias: ainda no cargo');
await prisma.user.update({ where: { id: p.id }, data: { vipUntil: new Date(Date.now() - 4 * DAY) } });
await C.clubSweep();
check((await C.boardView(T1.id)).president === null, 'VIP vencido há mais de 3 dias: perdeu a presidência (time vago)');
st = await C.claimPresidency(q.id);
check(st.role === 'PRESIDENTE', 'time vago: outro VIP com gol assumiu');

// passar a presidência
e = await err(C.passPresidency(q.id, d3.nick));
check(e?.status === 400 && /ainda não marcou gol/.test(e.message), 'não passa a presidência para quem não marcou pelo time');
await goal(d3, T1);
st = await C.passPresidency(q.id, d3.nick);
check(st.role === null && st.board.president?.nick === d3.nick, 'passou a presidência');

// doação
await prisma.user.update({ where: { id: q.id }, data: { vipDays: 12 } });
let g = await C.giftVip(q.id, d3.nick, 5);
check(g.ok && (await bank(q.id)) === 7 && (await prisma.vipGift.count({ where: { fromUserId: q.id } })) === 1, 'doou 5 VIP para colega de time');
check((await C.clubState(d3.id)).gifts[0]?.nick === q.nick, 'quem recebeu vê de quem veio');
e = await err(C.giftVip(q.id, r1.nick, 1));
check(e?.status === 400, 'para jogador de outro time: não');
e = await err(C.giftVip(q.id, d3.nick, 8));
check(e?.status === 402 && (await bank(q.id)) === 7, 'mais do que tem guardado: não');
const mesmaNet = await mk(T1, { lastIp: q.lastIp });
e = await err(C.giftVip(q.id, mesmaNet.nick, 1));
check(e?.status === 403, 'conta na mesma internet: não');
const giftRace = await Promise.allSettled([1, 2, 3].map(() => C.giftVip(q.id, d3.nick, 3)));
check(giftRace.filter((r) => r.status === 'fulfilled').length === 2 && (await bank(q.id)) === 1, '3 doações de 3 ao mesmo tempo com 7 guardados: só 2 passam (nunca fica negativo)');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
await prisma.$disconnect();
process.exit(fails ? 1 : 0);
