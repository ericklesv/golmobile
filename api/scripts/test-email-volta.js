/**
 * E-mail de volta (services/emailVolta.js) direto no banco LOCAL: quem entra no público, o VIP do botão caindo uma
 * vez só (inclusive com dois cliques ao mesmo tempo), somando no VIP que a pessoa já tinha, campanha de teste sem
 * crédito, prazo vencido, abertura (aviso do Brevo e imagem de 1 pixel), sair da lista e o aviso de "voltou a jogar". Não manda e-mail
 * nenhum. Cria jogadores ev…
 * e apaga no fim.
 *
 * Uso (na pasta api/):  node scripts/test-email-volta.js   → tem de terminar em "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-email-volta.js só roda no banco LOCAL (cria jogadores de teste).');
  process.exit(1);
}
process.env.TELEGRAM_BOT_TOKEN = ''; // nada de aviso no grupo
process.env.SMTP_HOST = ''; // nada de e-mail
const { prisma } = await import('../src/prisma.js');
const V = await import('../src/services/emailVolta.js');
const { renderVolta } = await import('../src/lib/emailVolta.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const DAY = 24 * 3600_000;
const now = new Date();
const team = await prisma.team.findFirst({ where: { standings: { some: {} } } }) ?? await prisma.team.findFirst();
let seq = 0;
const criados = [];
const mk = async (extra = {}) => {
  const n = `ev${Date.now() % 1e6}${seq++}`;
  const u = await prisma.user.create({ data: { nick: n, nickLower: n, email: `${n}@jogagol-teste.com.br`, passwordHash: 'x', teamId: team.id, lastSeenAt: new Date(now - 20 * DAY), ...extra } });
  criados.push(u.id);
  return u;
};
const linha = async (u, campaign = V.VOLTA.campaign, sentAt = new Date(now - 60_000)) => {
  const raw = `tok${Math.random().toString(36).slice(2)}${Date.now()}${seq++}`.padEnd(32, 'x');
  await prisma.emailSend.create({ data: { campaign, userId: u.id, email: u.email, tokenHash: V.hashToken(raw), sentAt } });
  return raw;
};
const vipOf = async (id) => (await prisma.user.findUnique({ where: { id }, select: { vipUntil: true } })).vipUntil;
const perto = (d, alvo) => d && Math.abs(new Date(d) - alvo) < 60_000;

try {
  // ── público ──
  const sumido = await mk();
  const ativo = await mk({ lastSeenAt: new Date(now - 2 * DAY) });
  const banido = await mk({ bannedUntil: new Date(now.getTime() + DAY) });
  const saiu = await mk({ emailOptOut: new Date() });
  const bot = await mk({ isBot: true });
  const descartavel = await mk({ email: `ev${Date.now() % 1e6}${seq++}@mailinator.com` });
  const teste = await mk({ email: `ev${Date.now() % 1e6}${seq++}@test.com` });
  const semMx = await mk({ email: `ev${Date.now() % 1e6}${seq++}@Hormail.com` });
  const ids = new Set((await V.publico(now)).map((u) => u.id));
  check(ids.has(sumido.id), 'sem entrar há 20 dias: recebe');
  check(!ids.has(ativo.id), 'entrou há 2 dias: não recebe');
  check(!ids.has(banido.id), "banido: não recebe"); check(!ids.has(saiu.id), "quem saiu da lista: não recebe"); check(!ids.has(bot.id), "bot: não recebe");
  check(!ids.has(descartavel.id) && !ids.has(teste.id), 'e-mail descartável (mailinator) e de teste (test.com): não recebem');
  check(!ids.has(semMx.id), 'domínio que voltaria como erro (Hormail.com, maiúscula incluída): não recebe');

  // ── e-mail ──
  const ctx = await V.contexto(now);
  const t = ctx.teams.get(team.id);
  check(!!t && t.pos >= 1 && t.n >= t.pos, `contexto: ${t?.name} em ${t?.pos}º de ${t?.n} na Série ${t?.serie}, rodada ${ctx.roundNumber}/${ctx.roundsTotal}`);
  const m = renderVolta({ ...ctx, nick: sumido.nick, goalsTotal: 1234, lastSeenAt: sumido.lastSeenAt, team: t, expiresAt: V.VOLTA.expiresAt, link: 'https://x/voltar?t=a', unsubLink: 'https://x/sair?t=a' });
  check(m.html.includes(sumido.nick) && m.html.includes('mais vivo do que nunca') && m.text.includes('1.234 gols'), 'e-mail tem o nick, a frase do dono e os gols da carreira');
  check(!/undefined|NaN|\[object/.test(m.html + m.text + m.subject), 'nada de undefined/NaN no e-mail');
  const semSmtp = await V.enviarUm(sumido, ctx);
  const rowFalha = await prisma.emailSend.findUnique({ where: { campaign_userId: { campaign: V.VOLTA.campaign, userId: sumido.id } } });
  check(!semSmtp.ok && /SMTP/.test(semSmtp.error) && rowFalha && !rowFalha.sentAt, 'sem SMTP: não marca como enviado e guarda o erro');
  check((await V.publico(now)).some((u) => u.id === sumido.id), 'quem falhou continua no público (o próximo envio tenta de novo)');
  await prisma.emailSend.delete({ where: { id: rowFalha.id } });

  // ── abriu (aviso do Brevo) ──
  const raw = await linha(sumido);
  check(!(await V.publico(now)).some((u) => u.id === sumido.id), 'quem já recebeu sai do público (rodar o envio de novo não repete)');
  const rowS = await prisma.emailSend.findFirst({ where: { userId: sumido.id } });
  const ts = Math.floor(now.getTime() / 1000);
  const ev = (event, extra = {}) => ({ event, email: sumido.email.toUpperCase(), 'X-Mailin-custom': String(rowS.id), ts_event: ts, ...extra });
  const [ab1, ab2] = await Promise.all([V.eventoBrevo(ev('opened'), now), V.eventoBrevo(ev('unique_opened'), now)]);
  const ab3 = await V.eventoBrevo(ev('opened', { ts_event: ts + 60 }), now);
  const rowAb = await prisma.emailSend.findFirst({ where: { userId: sumido.id } });
  check([ab1, ab2].filter((x) => x === 'aberto').length === 1 && !ab3 && perto(rowAb.openedAt, now), 'abriu: "opened" + "unique_opened" juntos marcam UMA abertura; abrir de novo não avisa');
  const outro = await mk();
  const rowO = await prisma.emailSend.findUnique({ where: { tokenHash: V.hashToken(await linha(outro)) } });
  check(!(await V.eventoBrevo({ event: 'opened', email: 'outra@pessoa.com', 'X-Mailin-custom': String(rowO.id) }, now)) && !(await prisma.emailSend.findUnique({ where: { id: rowO.id } })).openedAt, 'aviso com o e-mail de outra pessoa: ignorado');
  check(!(await V.eventoBrevo({ event: 'opened', email: outro.email }, now)), 'aviso sem o X-Mailin-custom e sem a etiqueta da campanha (outro e-mail da pessoa): ignorado');
  check(await V.eventoBrevo({ event: 'opened', email: outro.email, tags: [V.VOLTA.campaign] }, now) === 'aberto', 'aviso sem o X-Mailin-custom, com a etiqueta: acha a linha pelo e-mail');
  const iphone = await mk();
  await linha(iphone);
  check(!(await V.eventoBrevo({ event: 'proxy_open', email: iphone.email, user_agent: 'Mozilla/5.0' }, now)) && !(await V.eventoBrevo({ event: 'click', email: iphone.email }, now)) && !(await V.eventoBrevo(null)) && !(await V.eventoBrevo('lixo')), 'proxy_open do Mail do iPhone, click e lixo: ignorados, sem erro');
  const gmail = await mk();
  await linha(gmail);
  check(await V.eventoBrevo({ event: 'unique_proxy_open', email: gmail.email, tag: V.VOLTA.campaign, user_agent: 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)' }, now) === 'aberto', 'proxy_open do Gmail (GoogleImageProxy): conta como aberto');

  // ── abriu (imagem de 1 pixel: a 1ª busca é a conferência do Brevo, a seguinte é a abertura) ──
  const px = async (sentAt = new Date(now - 30_000)) => { const u = await mk(); return { u, hash: V.hashToken(await linha(u, V.VOLTA.campaign, sentAt)) }; };
  const rowPx = (u) => prisma.emailSend.findFirst({ where: { userId: u.id } });
  const p1 = await px();
  const c1 = await V.abriuPixel(p1.hash, now);
  const r1a = await rowPx(p1.u);
  check(c1 === 'conferencia' && !!r1a.pixelAt && !r1a.openedAt, 'imagem: a 1ª busca logo depois do envio é a conferência do Brevo, não abertura');
  check(!(await V.abriuPixel(p1.hash, new Date(now.getTime() + 2_000))) && !(await rowPx(p1.u)).openedAt, 'imagem: busca repetida em menos de 5 s (conferência em dobro) não conta');
  const ab = await V.abriuPixel(p1.hash, new Date(now.getTime() + 9_000));
  check(ab === 'aberto' && perto((await rowPx(p1.u)).openedAt, now.getTime() + 9_000), 'imagem: a busca seguinte é a abertura (9 s depois, como no Gmail em 23/10)');
  check(!(await V.abriuPixel(p1.hash, new Date(now.getTime() + 60_000))), 'imagem: abrir de novo não avisa outra vez');
  const p2 = await px(new Date(now - 30 * 60_000));
  check(await V.abriuPixel(p2.hash, now) === 'aberto', 'imagem: 1ª busca 30 min depois do envio (o Brevo não conferiu) já é a abertura');
  const p3 = await px();
  await V.eventoBrevo({ event: 'opened', email: p3.u.email, 'X-Mailin-custom': String((await rowPx(p3.u)).id) }, now);
  await V.abriuPixel(p3.hash, now);
  check(!(await V.abriuPixel(p3.hash, new Date(now.getTime() + 60_000))), 'imagem: já aberta pelo aviso do Brevo, a imagem não avisa de novo');
  check(!(await V.abriuPixel('nao-e-hash', now)) && !(await V.abriuPixel('a'.repeat(64), now)) && !(await V.abriuPixel(null, now)), 'imagem: código ruim ou que não existe é ignorado, sem erro');
  const comPixel = renderVolta({ ...ctx, nick: 'x', goalsTotal: 1, lastSeenAt: now, team: t, expiresAt: V.VOLTA.expiresAt, link: 'https://x/v', unsubLink: 'https://x/s', pixel: 'https://x/api/email/aberto/abc.gif' });
  check(comPixel.html.includes('https://x/api/email/aberto/abc.gif') && !m.html.includes('/api/email/aberto/'), 'e-mail leva a imagem de 1 pixel só quando recebe o endereço dela');
  const spam = await mk();
  await linha(spam);
  check(await V.eventoBrevo({ event: 'spam', email: spam.email }, now) === 'spam' && !!(await prisma.user.findUnique({ where: { id: spam.id } })).emailOptOut, 'marcou como spam: sai da lista');
  const semImagem = await mk();
  await V.resgatar(await linha(semImagem), now);
  check(!!(await prisma.emailSend.findFirst({ where: { userId: semImagem.id } })).openedAt, 'clicou sem a imagem ter carregado: conta como aberto também');

  // ── resgate ──
  const r1 = await V.resgatar(raw, now);
  check(r1.status === 'ok' && perto(r1.vipUntil, now.getTime() + 7 * DAY) && perto(await vipOf(sumido.id), now.getTime() + 7 * DAY), 'botão: 7 dias de VIP ATIVO a partir de agora');
  const msg = await prisma.message.findFirst({ where: { userId: sumido.id }, orderBy: { id: 'desc' } });
  check(msg?.kind === 'PRESENTE' && /7 dias de VIP/.test(msg.title), 'mensagem na caixa do jogador');
  const r2 = await V.resgatar(raw, new Date(now.getTime() + 5000));
  check(r2.status === 'ja-pegou' && perto(await vipOf(sumido.id), now.getTime() + 7 * DAY), '2º clique: "já pegou", o VIP não soma de novo');
  const row = await prisma.emailSend.findFirst({ where: { userId: sumido.id } });
  check(!!row.clickedAt && !!row.claimedAt, 'clique e resgate registrados');

  const comVip = await mk({ vipUntil: new Date(now.getTime() + 3 * DAY) });
  await V.resgatar(await linha(comVip), now);
  check(perto(await vipOf(comVip.id), now.getTime() + 10 * DAY), 'quem já tinha 3 dias de VIP fica com 10');

  const duplo = await mk();
  const rawD = await linha(duplo);
  const rs = await Promise.all([V.resgatar(rawD, now), V.resgatar(rawD, now), V.resgatar(rawD, now)]);
  check(rs.filter((r) => r.status === 'ok').length === 1 && perto(await vipOf(duplo.id), now.getTime() + 7 * DAY), 'três cliques AO MESMO TEMPO: um VIP só');

  const prova = await mk();
  const rT = await V.resgatar(await linha(prova, `${V.VOLTA.campaign}-teste`), now);
  check(rT.status === 'ok' && rT.teste && !(await vipOf(prova.id)), 'campanha -teste: o botão funciona, mas não dá VIP');

  const tarde = await mk();
  const rV = await V.resgatar(await linha(tarde), new Date(V.VOLTA.expiresAt.getTime() + 1000));
  check(rV.status === 'vencido' && !(await vipOf(tarde.id)), 'depois do prazo: "vencido", sem VIP');

  const susp = await mk({ bannedUntil: new Date(now.getTime() + DAY) });
  const rS = await V.resgatar(await linha(susp), now);
  check(rS.status === 'suspenso' && !(await vipOf(susp.id)), 'conta suspensa: não ativa');

  check((await err(V.resgatar('nao-existe-esse-token-aqui-1234', now)))?.code === 'link-invalido', 'token que não existe: "link inválido"');
  check((await err(V.resgatar('<script>', now)))?.code === 'link-invalido', 'token com lixo: "link inválido"');

  // ── sair da lista ──
  const fora = await mk();
  const rawF = await linha(fora, 'outra-campanha');
  await V.sairDaLista(rawF);
  const uF = await prisma.user.findUnique({ where: { id: fora.id } });
  check(!!uF.emailOptOut && !(await V.publico(now)).some((u) => u.id === fora.id), 'sair da lista: não entra mais no público');

  // ── voltou a jogar ──
  await prisma.user.update({ where: { id: sumido.id }, data: { lastSeenAt: new Date(now.getTime() + 60_000) } });
  const naoClicou = await mk();
  await linha(naoClicou, V.VOLTA.campaign, new Date(now.getTime() - 3600_000));
  await prisma.user.update({ where: { id: naoClicou.id }, data: { lastSeenAt: new Date(now.getTime() - 60_000) } });
  await V.voltaSweep();
  const [a1, a2, a3] = await Promise.all([sumido, naoClicou, duplo].map((u) => prisma.emailSend.findFirst({ where: { userId: u.id } })));
  check(!!a1.returnedAt, 'pegou o VIP e entrou no jogo: "voltou a jogar"');
  check(!!a2.returnedAt, 'entrou depois do e-mail sem clicar: também conta como volta');
  check(!a3.returnedAt, 'pegou o VIP mas não entrou: ainda não voltou');
  const antes = a1.returnedAt.getTime();
  await prisma.user.update({ where: { id: sumido.id }, data: { lastSeenAt: new Date(now.getTime() + 120_000) } });
  await V.voltaSweep();
  check((await prisma.emailSend.findFirst({ where: { userId: sumido.id } })).returnedAt.getTime() === antes, 'a volta é avisada uma vez só');

  const rel = await V.relatorio();
  check(rel.enviados >= 5 && rel.abriram >= rel.pegaram && rel.pegaram >= 3 && rel.voltaram >= 2, `relatório: ${JSON.stringify(rel)}`);
} finally {
  await prisma.emailSend.deleteMany({ where: { userId: { in: criados } } });
  await prisma.message.deleteMany({ where: { userId: { in: criados } } });
  await prisma.user.deleteMany({ where: { id: { in: criados } } });
  await prisma.$disconnect();
}

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exitCode = fails ? 1 : 0;
