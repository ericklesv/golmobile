/**
 * E-mail "volta pro JogaGol" (Guilherme, 22/10/2026): chama de volta quem não entra há 10+ dias, com 7 dias de VIP
 * no botão. O texto e o visual estão em lib/emailVolta.js; o envio é manual (scripts/email-volta.js), o resgate é
 * a página /voltar (routes/emailVolta.js) e o rastreio fica em EmailSend.
 *
 * - O VIP entra JÁ ATIVO (soma em `vipUntil`, como o 7º dia da Presença): não vai para o banco de dias, então não
 *   dá para doar nem trocar por saldo. Uma vez por jogador por campanha (`claimedAt` muda de null uma vez só).
 * - Telegram (pedido do Guilherme): quem ABRIU o e-mail (aviso do Brevo, `eventoBrevo`) e cada clique que pega o VIP
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

// domínios de teste/varredura que estão no banco e não recebem nada (os descartáveis vêm da lista do cadastro)
const NAO_MANDA = /@(test\.com|teste\.brgol|local\.test|example\.(com|org)|bots\.jogagol\.com\.br|jobscai\.com|meonvr\.com|minitts\.net|gmailsmkd\.com)$/i;

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
    ? await prisma.emailSend.update({ where: { id: old.id }, data: { tokenHash: hashToken(raw), email: to, error: null, sentAt: null, openedAt: null, clickedAt: null, claimedAt: null, returnedAt: null, unsubAt: null } })
    : await prisma.emailSend.create({ data: { campaign, userId: user.id, email: to, tokenHash: hashToken(raw) } });
  const utm = `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
  const link = `${ctx.base}/voltar?t=${raw}&${utm}`;
  const unsubLink = `${ctx.base}/sair-dos-emails?t=${raw}`;
  const mail = renderVolta({
    ...ctx, nick: user.nick, goalsTotal: user.goalsTotal, lastSeenAt: user.lastSeenAt, team,
    expiresAt: VOLTA.expiresAt, link, unsubLink,
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

async function linhaDoToken(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(raw)) throw badRequest('Esse link está incompleto.', 'link-invalido');
  const row = await prisma.emailSend.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, nick: true, deletedAt: true, bannedUntil: true, vipUntil: true, goalsTotal: true, lastSeenAt: true, team: { select: { name: true } } } } },
  });
  if (!row || row.user.deletedAt) throw badRequest('Esse link não vale mais.', 'link-invalido');
  return row;
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
  if (row.claimedAt) return { ...base, status: 'ja-pegou', vipUntil: user.vipUntil };
  const perfil = `${tg.esc(user.team.name)} · ${user.goalsTotal.toLocaleString('pt-BR')} gols · não entrava desde ${quando(user.lastSeenAt)}`;
  if (now > VOLTA.expiresAt) {
    tg.info(`📧 <b>${tg.esc(user.nick)}</b> clicou no e-mail de volta, mas o prazo do VIP já tinha acabado.\n${perfil}`);
    return { ...base, status: 'vencido' };
  }
  if (user.bannedUntil && user.bannedUntil > now) return { ...base, status: 'suspenso' };

  const res = await prisma.$transaction(async (tx) => {
    const won = await tx.emailSend.updateMany({ where: { id: row.id, claimedAt: null }, data: { claimedAt: now } });
    if (!won.count) return null; // outro clique chegou antes (dois toques, duas abas)
    if (teste) return { until: null };
    // trava a linha: o VIP pode estar chegando por outro caminho ao mesmo tempo (PIX, doação, Presença)
    const [u] = await tx.$queryRaw`SELECT "vipUntil" FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const from = u.vipUntil && new Date(u.vipUntil) > now ? new Date(u.vipUntil) : now;
    const until = new Date(from.getTime() + VOLTA.vipDays * DAY);
    await tx.user.update({ where: { id: user.id }, data: { vipUntil: until } });
    await sendMessage(user.id, {
      kind: 'PRESENTE', icon: 'vip', title: `${VOLTA.vipDays} dias de VIP ativados`,
      text: `Que bom te ver de novo! [vip] Seus ${VOLTA.vipDays} dias de VIP do e-mail já estão valendo, até ${quando(until)}. Recargas pela metade, chute direto saindo sozinho mesmo com o jogo fechado e X1 sem espera. [Jogar agora](/)`,
    }, tx);
    return { until };
  });
  if (!res) {
    const again = await prisma.user.findUnique({ where: { id: user.id }, select: { vipUntil: true } });
    return { ...base, status: 'ja-pegou', vipUntil: again?.vipUntil ?? null };
  }
  const [claims, sent] = await Promise.all([
    prisma.emailSend.count({ where: { campaign: row.campaign, claimedAt: { not: null } } }),
    prisma.emailSend.count({ where: { campaign: row.campaign, sentAt: { not: null } } }),
  ]);
  const depois = row.sentAt ? ` · ${tempo(now - row.sentAt)} depois do envio` : '';
  tg.info(`📧 ${teste ? '<i>(teste)</i> ' : ''}<b>${tg.esc(user.nick)}</b> clicou no e-mail de volta e pegou ${VOLTA.vipDays} dias de VIP.\n${perfil}\nClique ${claims} de ${sent} e-mails enviados${depois}`);
  return { ...base, status: 'ok', vipUntil: res.until };
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
 * e-mail. Só a 1ª abertura avisa.
 */
const ABRIU = ['opened', 'unique_opened'];
const PROXY = ['proxy_open', 'unique_proxy_open'];
export async function eventoBrevo(ev, now = new Date()) {
  if (!ev || typeof ev !== 'object' || ![...ABRIU, ...PROXY, 'spam'].includes(ev.event)) return null;
  if (PROXY.includes(ev.event) && !/GoogleImageProxy/i.test(String(ev.user_agent ?? ''))) return null;
  const email = typeof ev.email === 'string' ? ev.email.trim().toLowerCase() : '';
  const id = /^\d{1,9}$/.test(String(ev['X-Mailin-custom'] ?? '')) ? Number(ev['X-Mailin-custom']) : null;
  const sel = { id: true, campaign: true, email: true, userId: true, sentAt: true, openedAt: true, user: { select: { nick: true } } };
  const row = id
    ? await prisma.emailSend.findUnique({ where: { id }, select: sel })
    : email ? await prisma.emailSend.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, sentAt: { not: null } }, orderBy: { sentAt: 'desc' }, select: sel }) : null;
  if (!row?.sentAt || (email && row.email.toLowerCase() !== email)) return null;
  const teste = isTeste(row.campaign) ? '<i>(teste)</i> ' : '';

  if (ev.event === 'spam') {
    await prisma.emailSend.updateMany({ where: { id: row.id, unsubAt: null }, data: { unsubAt: now } });
    await prisma.user.updateMany({ where: { id: row.userId, emailOptOut: null }, data: { emailOptOut: now } });
    tg.warn(`🚫 ${teste}<b>${tg.esc(row.user.nick)}</b> marcou o e-mail de volta como SPAM (saiu da lista).`);
    return 'spam';
  }
  // ts_event = quando a pessoa abriu (segundos, UTC); o aviso pode chegar um pouco depois
  const at = Number.isFinite(ev.ts_event) && Math.abs(ev.ts_event * 1000 - now) < 7 * DAY ? new Date(ev.ts_event * 1000) : now;
  if (row.openedAt) return null;
  const won = await prisma.emailSend.updateMany({ where: { id: row.id, openedAt: null }, data: { openedAt: at } });
  if (!won.count) return null; // "opened" e "unique_opened" da mesma abertura chegam juntos
  const [opened, sent] = await Promise.all([
    prisma.emailSend.count({ where: { campaign: row.campaign, openedAt: { not: null } } }),
    prisma.emailSend.count({ where: { campaign: row.campaign, sentAt: { not: null } } }),
  ]);
  tg.info(`👀 ${teste}<b>${tg.esc(row.user.nick)}</b> abriu o e-mail de volta (${tempo(at - row.sentAt)} depois do envio).\nAbriram ${opened} de ${sent} e-mails enviados`);
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
 */
export async function voltaSweep() {
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
  const [linhas, enviados, falhas, abriram, clicaram, pegaram, voltaram, sairam] = await Promise.all([
    c({}), c({ sentAt: { not: null } }), c({ sentAt: null, error: { not: null } }), c({ openedAt: { not: null } }),
    c({ clickedAt: { not: null } }), c({ claimedAt: { not: null } }), c({ returnedAt: { not: null } }), c({ unsubAt: { not: null } }),
  ]);
  return { campaign, linhas, enviados, falhas, abriram, clicaram, pegaram, voltaram, sairam };
}
