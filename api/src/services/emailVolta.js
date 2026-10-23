/**
 * E-mail "volta pro JogaGol" (Guilherme, 22/10/2026): chama de volta quem não entra há 10+ dias, com 7 dias de VIP
 * no botão. O texto e o visual estão em lib/emailVolta.js; o envio é manual (scripts/email-volta.js), o resgate é
 * a página /voltar (routes/emailVolta.js) e o rastreio fica em EmailSend.
 *
 * - O VIP entra JÁ ATIVO (soma em `vipUntil`, como o 7º dia da Presença): não vai para o banco de dias, então não
 *   dá para doar nem trocar por saldo. Uma vez por jogador por campanha (`claimedAt` muda de null uma vez só).
 *   Desde 23/10/2026 cai também ao ENTRAR no jogo sem tocar no botão (`vipAoEntrar`).
 * - Telegram (pedido do Guilherme): quem ABRIU o e-mail (aviso do Brevo, `eventoBrevo`, ou a imagem de 1 pixel do
 *   rodapé, `abriuPixel` — o que chegar primeiro) e cada clique que pega o VIP
 *   viram aviso com quem foi; o scheduler avisa também
 *   quando a pessoa ENTRA no jogo depois do e-mail (o lastSeenAt passou do clique ou do envio) — é o que diz se o
 *   e-mail trouxe gente de volta.
 * - Campanha que termina em "-teste" (o e-mail de prova mandado para um admin) roda o caminho inteiro, mas não
 *   credita VIP nenhum.
 *
 * Mexeu? `node scripts/test-email-volta.js` (pasta api/, banco LOCAL; tem de dar "TUDO OK").
 */
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../prisma.js';
import { tg } from '../lib/telegram.js';
import { badRequest } from '../lib/errors.js';
import { isDisposableEmail } from '../lib/security.js';
import { sendMail } from '../lib/mail.js';
import { nextMidnight } from '../lib/time.js';
import { renderVolta } from '../lib/emailVolta.js';
import { sendMessage } from './inbox.js';
import { standingOrder } from './league.js';

const DAY = 24 * 3600_000;

export const VOLTA = {
  campaign: 'volta-out26',
  vipDays: 7,
  inactiveDays: 10,
  expiresAt: new Date('2026-11-06T23:59:59-03:00'), // o e-mail diz "vale até 6 de novembro"
};

// domínios de teste/varredura que estão no banco e não recebem nada (os descartáveis vêm da lista do cadastro) +
// os que voltariam como erro e queimam a reputação do Brevo (conferidos pelo MX em 23/10/2026): domínio que não
// existe ou sem MX (haj.ckm, hormail.com, cartolafc.com.br, jogagol.com.br), caixa inventada em empresa (aa.com,
// evs.com, xi.com), e-mail temporário (duidir.com, findize.com) e domínio de piada (tuamaeaquelaursa.com)
const NAO_MANDA = /@(test\.com|teste\.brgol|local\.test|example\.(com|org)|bots\.jogagol\.com\.br|jobscai\.com|meonvr\.com|minitts\.net|gmailsmkd\.com|haj\.ckm|hormail\.com|cartolafc\.com\.br|jogagol\.com\.br|aa\.com|evs\.com|xi\.com|duidir\.com|findize\.com|tuamaeaquelaursa\.com)$/i;

export const hashToken = (t) => createHash('sha256').update(t).digest('hex');
export const isTeste = (campaign) => campaign.endsWith('-teste');
const webBase = () => (process.env.PUBLIC_WEB_URL || 'https://jogagol.com.br').replace(/\/+$/, '');
const quando = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
/** "3 min", "5 h", "2 dias" */
const tempo = (ms) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 120) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} dias`;
};

export const emailBarrado = (email) => !email || NAO_MANDA.test(email) || isDisposableEmail(email);

/** Quem recebe: humano, vivo, sem ban, que não saiu da lista, sem entrar há `inactiveDays` dias e com e-mail de verdade. */
export async function publico(now = new Date(), campaign = VOLTA.campaign) {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null, isBot: false, isAdmin: false, emailOptOut: null,
      lastSeenAt: { lt: new Date(now.getTime() - VOLTA.inactiveDays * DAY) },
      OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }],
      emailSends: { none: { campaign, sentAt: { not: null } } }, // rodar de novo pula quem já recebeu
    },
    select: { id: true, nick: true, email: true, teamId: true, goalsTotal: true, lastSeenAt: true },
    orderBy: { id: 'asc' },
  });
  return users.filter((u) => !emailBarrado(u.email));
}

/** O que é igual para todos os e-mails do envio: rodada, tabela, números do jogo. */
export async function contexto(now = new Date()) {
  const season = await prisma.season.findFirst({ where: { status: 'ACTIVE' }, orderBy: { id: 'desc' } });
  const round = season ? await prisma.round.findFirst({ where: { seasonId: season.id }, orderBy: { number: 'desc' } }) : null;
  const standings = season ? await prisma.standing.findMany({ where: { seasonId: season.id }, include: { team: true } }) : [];
  const teams = new Map();
  for (const serie of new Set(standings.map((s) => s.serie))) {
    const rows = standings.filter((s) => s.serie === serie).sort(standingOrder);
    rows.forEach((s, i) => teams.set(s.teamId, {
      name: s.team.name, slug: s.team.slug, serie, pos: i + 1, n: rows.length, points: s.points, leaderPts: rows[0].points, played: s.played,
    }));
  }
  const today = new Date(nextMidnight(now).getTime() - DAY);
  const [newPlayers, x1Yesterday] = await Promise.all([
    prisma.user.count({ where: { isBot: false, deletedAt: null, createdAt: { gt: new Date(now.getTime() - 10 * DAY) } } }),
    prisma.x1Match.count({ where: { status: 'FINISHED', finishedAt: { gte: new Date(today.getTime() - DAY), lt: today } } }),
  ]);
  return { base: webBase(), roundNumber: round?.number ?? 1, roundsTotal: season?.totalRounds ?? 30, teams, newPlayers, x1Yesterday };
}

/**
 * Manda o e-mail para um jogador (`to` troca o destinatário: o e-mail de prova). Cria a linha da campanha com um
 * token novo; se já existe uma linha sem envio (falhou antes), troca o token e tenta de novo. Devolve o resultado.
 */
export async function enviarUm(user, ctx, { campaign = VOLTA.campaign, to = user.email } = {}) {
  const team = ctx.teams.get(user.teamId);
  if (!team) return { ok: false, error: 'time fora da tabela' };
  const raw = randomBytes(24).toString('base64url');
  const old = await prisma.emailSend.findUnique({ where: { campaign_userId: { campaign, userId: user.id } } });
  if (old?.sentAt && !isTeste(campaign)) return { ok: false, error: 'já recebeu' };
  const row = old
    ? await prisma.emailSend.update({ where: { id: old.id }, data: { tokenHash: hashToken(raw), email: to, error: null, sentAt: null, openedAt: null, pixelAt: null, clickedAt: null, claimedAt: null, returnedAt: null, unsubAt: null } })
    : await prisma.emailSend.create({ data: { campaign, userId: user.id, email: to, tokenHash: hashToken(raw) } });
  const utm = `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
  const link = `${ctx.base}/voltar?t=${raw}&${utm}`;
  const unsubLink = `${ctx.base}/sair-dos-emails?t=${raw}`;
  const mail = renderVolta({
    ...ctx, nick: user.nick, goalsTotal: user.goalsTotal, lastSeenAt: user.lastSeenAt, team,
    // o pixel leva o HASH do código (o que o banco guarda), nunca o código que dá o VIP
    expiresAt: VOLTA.expiresAt, link, unsubLink, pixel: `${ctx.base}/api/email/aberto/${hashToken(raw)}.gif`,
  });
  try {
    const sent = await sendMail({
      to, subject: mail.subject, html: mail.html, text: mail.text,
      // "cancelar inscrição" de um clique do Gmail/Yahoo (RFC 8058): POST nesse endereço tira da lista
      headers: {
        'List-Unsubscribe': `<${ctx.base}/api/email/sair?t=${raw}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        // o Brevo devolve esse número no aviso de abertura (eventoBrevo) e agrupa a campanha nos relatórios dele
        'X-Mailin-custom': String(row.id), 'X-Mailin-Tag': campaign,
      },
    });
    if (!sent) throw new Error('SMTP não configurado (SMTP_HOST vazio)');
    await prisma.emailSend.update({ where: { id: row.id }, data: { sentAt: new Date() } });
    return { ok: true, link };
  } catch (e) {
    const error = String(e?.message || e).slice(0, 300);
    await prisma.emailSend.update({ where: { id: row.id }, data: { error } });
    return { ok: false, error };
  }
}

const USER_SEL = { id: true, nick: true, deletedAt: true, bannedUntil: true, vipUntil: true, goalsTotal: true, lastSeenAt: true, team: { select: { name: true } } };

async function linhaDoToken(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(raw)) throw badRequest('Esse link está incompleto.', 'link-invalido');
  const row = await prisma.emailSend.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: { select: USER_SEL } } });
  if (!row || row.user.deletedAt) throw badRequest('Esse link não vale mais.', 'link-invalido');
  return row;
}

/** "Flamengo · 1.234 gols · não entrava desde 10/10 às 21:30" (a última parte só enquanto o lastSeenAt é de antes do e-mail) */
const perfilTg = (user, sentAt) => `${tg.esc(user.team.name)} · ${user.goalsTotal.toLocaleString('pt-BR')} gols${!sentAt || user.lastSeenAt < sentAt ? ` · não entrava desde ${quando(user.lastSeenAt)}` : ''}`;
const contagem = (campaign) => Promise.all([
  prisma.emailSend.count({ where: { campaign, claimedAt: { not: null } } }),
  prisma.emailSend.count({ where: { campaign, sentAt: { not: null } } }),
]);

/**
 * Ativa os dias de VIP da linha (uma vez: `claimedAt` muda de null uma vez só — dois cliques, duas abas ou o botão e
 * o VIP ao entrar chegando juntos dão um VIP só) e manda a mensagem na caixa. Devolve `{until}` ou null (já pegou).
 */
async function ativarVip(row, now) {
  return prisma.$transaction(async (tx) => {
    const won = await tx.emailSend.updateMany({ where: { id: row.id, claimedAt: null }, data: { claimedAt: now } });
    if (!won.count) return null;
    if (isTeste(row.campaign)) return { until: null };
    // trava a linha: o VIP pode estar chegando por outro caminho ao mesmo tempo (PIX, doação, Presença)
    const [u] = await tx.$queryRaw`SELECT "vipUntil" FROM "User" WHERE id = ${row.userId} FOR UPDATE`;
    const from = u.vipUntil && new Date(u.vipUntil) > now ? new Date(u.vipUntil) : now;
    const until = new Date(from.getTime() + VOLTA.vipDays * DAY);
    await tx.user.update({ where: { id: row.userId }, data: { vipUntil: until } });
    await sendMessage(row.userId, {
      kind: 'PRESENTE', icon: 'vip', title: `${VOLTA.vipDays} dias de VIP ativados`,
      text: `Que bom te ver de novo! [vip] Seus ${VOLTA.vipDays} dias de VIP do e-mail já estão valendo, até ${quando(until)}. Recargas pela metade, chute direto saindo sozinho mesmo com o jogo fechado e X1 sem espera. [Jogar agora](/)`,
    }, tx);
    return { until };
  });
}

/** O botão do e-mail: marca o clique e ativa o VIP (uma vez). Devolve o que a página /voltar mostra. */
export async function resgatar(raw, now = new Date()) {
  const row = await linhaDoToken(raw);
  const { user } = row;
  const teste = isTeste(row.campaign);
  const base = { nick: user.nick, days: VOLTA.vipDays, teste };
  if (!row.clickedAt) await prisma.emailSend.updateMany({ where: { id: row.id, clickedAt: null }, data: { clickedAt: now } });
  // clicou sem a abertura ter sido medida (Outlook bloqueia imagem de remetente novo): abriu também, sem outro aviso
  if (!row.openedAt) await prisma.emailSend.updateMany({ where: { id: row.id, openedAt: null }, data: { openedAt: now } });
  // o VIP já caiu ao entrar no jogo (vipAoEntrar) — no 1º clique a página comemora igual: o VIP está valendo
  if (row.claimedAt) return { ...base, status: row.clickedAt ? 'ja-pegou' : 'ok', vipUntil: user.vipUntil };
  const perfil = perfilTg(user, row.sentAt);
  if (now > VOLTA.expiresAt) {
    tg.info(`📧 <b>${tg.esc(user.nick)}</b> clicou no e-mail de volta, mas o prazo do VIP já tinha acabado.\n${perfil}`);
    return { ...base, status: 'vencido' };
  }
  if (user.bannedUntil && user.bannedUntil > now) return { ...base, status: 'suspenso' };

  const res = await ativarVip(row, now);
  if (!res) { // outro clique (dois toques, duas abas) ou o VIP ao entrar chegou antes: o VIP está valendo
    const again = await prisma.user.findUnique({ where: { id: user.id }, select: { vipUntil: true } });
    return { ...base, status: 'ok', vipUntil: again?.vipUntil ?? null };
  }
  const [claims, sent] = await contagem(row.campaign);
  const depois = row.sentAt ? ` · ${tempo(now - row.sentAt)} depois do envio` : '';
  tg.info(`📧 ${teste ? '<i>(teste)</i> ' : ''}<b>${tg.esc(user.nick)}</b> clicou no e-mail de volta e pegou ${VOLTA.vipDays} dias de VIP.\n${perfil}\nVIP entregue a ${claims} de ${sent} e-mails enviados${depois}`);
  return { ...base, status: 'ok', vipUntil: res.until };
}

/**
 * VIP AO ENTRAR (Guilherme, 23/10/2026): quem recebeu o e-mail e entrou no jogo ganha os dias de VIP como se tivesse
 * tocado no botão — o EberVita abriu o e-mail, entrou pelo app 1 min depois e ficou sem o VIP porque não clicou.
 * Chamado no login, no GET /api/me (o site abre com ele; a sessão dura 30 dias, então quem volta quase nunca passa pelo
 * login) e no `voltaSweep` (quem só entrou pelo X1 e quem voltou antes desta regra). Mesmas travas do botão: uma vez
 * por campanha, nada depois do prazo, nada para conta suspensa, a campanha "-teste" não conta. Entrar = voltou a
 * jogar: marca `returnedAt` junto e o aviso no Telegram é um só. Devolve quantos VIPs ativou (0 quase sempre).
 */
export async function vipAoEntrar(userId, now = new Date()) {
  if (now > VOLTA.expiresAt) return 0; // passado o prazo nem consulta (o GET /api/me chama isto)
  const rows = await prisma.emailSend.findMany({
    where: { userId, sentAt: { not: null }, claimedAt: null, NOT: { campaign: { endsWith: '-teste' } } },
    include: { user: { select: USER_SEL } },
  });
  let n = 0;
  for (const row of rows) {
    const { user } = row;
    if (user.deletedAt || (user.bannedUntil && user.bannedUntil > now)) continue;
    if (!(await ativarVip(row, now))) continue; // o botão chegou antes
    n++;
    const entrou = user.lastSeenAt > row.sentAt ? user.lastSeenAt : now;
    const voltouAgora = !row.returnedAt && (await prisma.emailSend.updateMany({ where: { id: row.id, returnedAt: null }, data: { returnedAt: entrou } })).count > 0;
    const [claims, sent] = await contagem(row.campaign);
    tg.info(voltouAgora
      ? `✅ <b>${tg.esc(user.nick)}</b> voltou a jogar ${tempo(entrou - row.sentAt)} depois do e-mail, sem tocar no botão, e ganhou os ${VOLTA.vipDays} dias de VIP ao entrar.\n${perfilTg(user, row.sentAt)}\nVIP entregue a ${claims} de ${sent} e-mails enviados`
      : `🎁 <b>${tg.esc(user.nick)}</b> ganhou os ${VOLTA.vipDays} dias de VIP do e-mail ao entrar (já tinha voltado a jogar sem tocar no botão).\nVIP entregue a ${claims} de ${sent} e-mails enviados`);
  }
  return n;
}

/**
 * Aviso do Brevo (webhook dos e-mails transacionais, `POST /api/email/brevo/<segredo>`): quem ABRIU o e-mail (pedido
 * do Guilherme: aviso no Telegram de quem abriu) e quem marcou como spam (sai da lista).
 *
 * Por que o Brevo e não uma imagem nossa: o Brevo troca TODAS as imagens do e-mail por cópias dele, baixadas na hora
 * do envio (testado em 22/10/2026: a nossa imagem de 1 pixel foi buscada 40 s depois do envio, antes de qualquer
 * pessoa abrir) — todo e-mail ia aparecer como aberto. A imagem de rastreio do PRÓPRIO Brevo é de cada e-mail e só
 * carrega quando a pessoa abre; ele avisa aqui. E não dá para desligar o rastreio dele no plano grátis.
 * É aproximado: o Gmail carrega as imagens quando a pessoa abre (abrir de novo não conta); o Outlook pode bloquear
 * imagem de remetente novo (o clique marca a abertura também). `proxy_open` = a imagem foi carregada por um servidor
 * de imagens no meio do caminho: conta só quando é o do Gmail (`GoogleImageProxy`, que carrega quando a pessoa abre —
 * em 22/10/2026 a abertura de uma prova no Gmail não chegou como `opened`); o do Mail do iPhone carrega sozinho na
 * entrega, sem a pessoa abrir, e não conta.
 * A linha vem do `X-Mailin-custom` (o id da EmailSend, mandado no envio); sem ele (o `proxy_open` não traz), do
 * e-mail — mas só se o aviso traz a etiqueta da campanha (`tag`/`tags` = o `X-Mailin-Tag` do envio): em 23/10/2026 a
 * abertura de um e-mail de teste avulso, sem etiqueta, foi parar na linha da campanha da mesma pessoa. Só a 1ª
 * abertura avisa.
 * ATENÇÃO (medido em 23/10/2026): com o e-mail na aba Promoções do Gmail — onde a campanha cai — o Brevo NÃO registrou
 * a abertura (três provas abertas, nenhum aviso); um e-mail pequeno na Principal, sim. Quem mede de verdade é
 * `abriuPixel`; este aviso fica como segunda fonte (e para o spam).
 */
const ABRIU = ['opened', 'unique_opened'];
const PROXY = ['proxy_open', 'unique_proxy_open'];
export async function eventoBrevo(ev, now = new Date()) {
  if (!ev || typeof ev !== 'object' || ![...ABRIU, ...PROXY, 'spam'].includes(ev.event)) return null;
  if (PROXY.includes(ev.event) && !/GoogleImageProxy/i.test(String(ev.user_agent ?? ''))) return null;
  const email = typeof ev.email === 'string' ? ev.email.trim().toLowerCase() : '';
  const id = /^\d{1,9}$/.test(String(ev['X-Mailin-custom'] ?? '')) ? Number(ev['X-Mailin-custom']) : null;
  const tags = [ev.tag, ...(Array.isArray(ev.tags) ? ev.tags : [])].filter((t) => typeof t === 'string');
  const sel = { id: true, campaign: true, email: true, userId: true, sentAt: true, openedAt: true, user: { select: { nick: true } } };
  const row = id
    ? await prisma.emailSend.findUnique({ where: { id }, select: sel })
    : email ? await prisma.emailSend.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, sentAt: { not: null } }, orderBy: { sentAt: 'desc' }, select: sel }) : null;
  if (!row?.sentAt || (email && row.email.toLowerCase() !== email)) return null;
  const teste = isTeste(row.campaign) ? '<i>(teste)</i> ' : '';

  if (ev.event === 'spam') { // qualquer e-mail nosso marcado como spam tira a pessoa da lista, com ou sem etiqueta
    await prisma.emailSend.updateMany({ where: { id: row.id, unsubAt: null }, data: { unsubAt: now } });
    await prisma.user.updateMany({ where: { id: row.userId, emailOptOut: null }, data: { emailOptOut: now } });
    tg.warn(`🚫 ${teste}<b>${tg.esc(row.user.nick)}</b> marcou o e-mail de volta como SPAM (saiu da lista).`);
    return 'spam';
  }
  if (!id && !tags.includes(row.campaign)) return null; // abertura de outro e-mail da mesma pessoa (esqueci a senha, teste avulso)
  // ts_event = quando a pessoa abriu (segundos, UTC); o aviso pode chegar um pouco depois
  const at = Number.isFinite(ev.ts_event) && Math.abs(ev.ts_event * 1000 - now) < 7 * DAY ? new Date(ev.ts_event * 1000) : now;
  if (row.openedAt) return null;
  if (at - row.sentAt < PIXEL.graceMs) return null; // a mesma regra da imagem: no 1º minuto e meio é a entrega, não a pessoa
  return marcarAberto(row, at); // "opened" e "unique_opened" da mesma abertura chegam juntos: só um marca
}

/**
 * A imagem de 1 pixel do rodapé (`GET /api/email/aberto/<hash>.gif`). O Brevo troca as imagens do e-mail por cópias
 * dele que vêm buscar a NOSSA a cada exibição — sem dizer quem pediu (a busca da entrega e a da pessoa abrindo chegam
 * com os mesmos cabeçalhos, "Go-http-client/2.0" de um IP do Brevo). O que separa as duas é o RELÓGIO: buscas nos
 * primeiros `graceMs` depois do envio são a entrega (o Brevo/Gmail conferindo; às vezes acontece, às vezes não) e não
 * contam; a 1ª busca depois disso é a abertura. `pixelAt` guarda a 1ª busca, venha quando vier (só registro).
 * Medido em 23/10/2026 no Gmail (5 envios): buscas da entrega de 3 a 61 s depois do envio; aberturas confirmadas de
 * 2 a 10 min. Quem abre nos primeiros 90 s não conta (o Gmail guarda a imagem e não busca de novo): é um PISO, nunca
 * conta quem não abriu. (Em 22/10 o pixel contava a 1ª busca e todo e-mail aparecia como aberto no envio.) Também
 * conta como aberto: alguém do JogaGol abrindo a pré-visualização desse e-mail no painel do Brevo.
 */
export const PIXEL = { graceMs: 90_000 };
export async function abriuPixel(hash, now = new Date()) {
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return null;
  const row = await prisma.emailSend.findUnique({ where: { tokenHash: hash }, select: { id: true, campaign: true, sentAt: true, pixelAt: true, openedAt: true, user: { select: { nick: true } } } });
  if (!row || row.openedAt) return null;
  if (!row.pixelAt) await prisma.emailSend.updateMany({ where: { id: row.id, pixelAt: null }, data: { pixelAt: now } });
  if (!row.sentAt || now - row.sentAt < PIXEL.graceMs) return 'entrega';
  return marcarAberto(row, now);
}

/** Marca a 1ª abertura (uma vez só, venha de onde vier) e avisa no Telegram. */
async function marcarAberto(row, at) {
  const won = await prisma.emailSend.updateMany({ where: { id: row.id, openedAt: null }, data: { openedAt: at } });
  if (!won.count) return null;
  const [opened, sent] = await Promise.all([
    prisma.emailSend.count({ where: { campaign: row.campaign, openedAt: { not: null } } }),
    prisma.emailSend.count({ where: { campaign: row.campaign, sentAt: { not: null } } }),
  ]);
  tg.info(`👀 ${isTeste(row.campaign) ? '<i>(teste)</i> ' : ''}<b>${tg.esc(row.user.nick)}</b> abriu o e-mail de volta (${tempo(at - row.sentAt)} depois do envio).\nAbriram ${opened} de ${sent} e-mails enviados`);
  return 'aberto';
}

/** "Sair da lista" (rodapé e cancelar de um clique do Gmail): para de receber e-mail de campanha. */
export async function sairDaLista(raw, now = new Date()) {
  const row = await linhaDoToken(raw);
  if (!row.unsubAt) await prisma.emailSend.update({ where: { id: row.id }, data: { unsubAt: now } });
  const r = await prisma.user.updateMany({ where: { id: row.userId, emailOptOut: null }, data: { emailOptOut: now } });
  if (r.count) tg.info(`📭 ${tg.esc(row.user.nick)} saiu da lista de e-mails do JogaGol.`, { key: 'email-sair', every: 10 * 60_000 });
  return { nick: row.user.nick };
}

/**
 * Scheduler (a cada 2 min): quem recebeu o e-mail e ENTROU no jogo depois (lastSeenAt passou do clique ou, sem
 * clique, do envio) ganha `returnedAt` e vira aviso no Telegram. Só a 1ª volta conta. UPDATE … RETURNING: o mesmo
 * jogador nunca é avisado duas vezes, nem com duas instâncias.
 * Antes, quem entrou sem o VIP recebe o VIP ao entrar (`vipAoEntrar`): quem só passou pelo X1 (o lastSeenAt anda sem
 * o GET /api/me) e quem voltou antes de essa regra existir (23/10/2026).
 */
export async function voltaSweep(now = new Date()) {
  if (now <= VOLTA.expiresAt) {
    const semVip = await prisma.$queryRaw`
      SELECT DISTINCT e."userId" FROM "EmailSend" e JOIN "User" u ON u.id = e."userId"
      WHERE e."sentAt" IS NOT NULL AND e."claimedAt" IS NULL AND e.campaign NOT LIKE '%-teste' AND u."lastSeenAt" > e."sentAt"`;
    for (const { userId } of semVip) await vipAoEntrar(userId, now);
  }
  const rows = await prisma.$queryRaw`
    UPDATE "EmailSend" e SET "returnedAt" = u."lastSeenAt"
    FROM "User" u
    WHERE u.id = e."userId" AND e."sentAt" IS NOT NULL AND e."returnedAt" IS NULL
      AND u."lastSeenAt" > COALESCE(e."claimedAt", e."sentAt")
    RETURNING e.campaign, e."sentAt", e."claimedAt", u.nick, u."lastSeenAt"`;
  for (const r of rows) {
    const desde = r.claimedAt ?? r.sentAt;
    const teste = isTeste(r.campaign) ? '<i>(teste)</i> ' : '';
    tg.info(r.claimedAt
      ? `✅ ${teste}<b>${tg.esc(r.nick)}</b> voltou a jogar: entrou ${tempo(new Date(r.lastSeenAt) - new Date(desde))} depois de pegar o VIP do e-mail.`
      : `✅ ${teste}<b>${tg.esc(r.nick)}</b> voltou a jogar depois do e-mail (entrou ${tempo(new Date(r.lastSeenAt) - new Date(desde))} depois do envio, sem tocar no botão do VIP).`);
  }
  return rows.length;
}

/** Números da campanha (script e Telegram). */
export async function relatorio(campaign = VOLTA.campaign) {
  const c = (where) => prisma.emailSend.count({ where: { campaign, ...where } });
  const [linhas, enviados, falhas, abriram, clicaram, pegaram, semClique, voltaram, sairam] = await Promise.all([
    c({}), c({ sentAt: { not: null } }), c({ sentAt: null, error: { not: null } }), c({ openedAt: { not: null } }),
    c({ clickedAt: { not: null } }), c({ claimedAt: { not: null } }), c({ claimedAt: { not: null }, clickedAt: null }),
    c({ returnedAt: { not: null } }), c({ unsubAt: { not: null } }),
  ]);
  // pegaram = ficaram com o VIP (botão ou ao entrar); semClique = desses, os que ganharam ao entrar e não clicaram
  return { campaign, linhas, enviados, falhas, abriram, clicaram, pegaram, semClique, voltaram, sairam };
}
