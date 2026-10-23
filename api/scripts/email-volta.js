/**
 * E-mail "volta pro JogaGol" (services/emailVolta.js). Rodar na pasta api/, com o .env carregado
 * (na VPS: `set -a && . ./.env && set +a`, usuário brgol).
 *
 *   node scripts/email-volta.js listar                  quem vai receber (não manda nada)
 *   node scripts/email-volta.js previa <nick> <arq>     grava o HTML do e-mail desse jogador (não manda nada)
 *   node scripts/email-volta.js teste <email> [nick]    manda a PROVA para <email> com os dados de <nick> (padrão:
 *                                                       o veterano do público com mais gols). Campanha "-teste":
 *                                                       o botão funciona e avisa no Telegram, mas não dá VIP.
 *   node scripts/email-volta.js enviar [--max N] [--seg S]   dispara para o público (pula quem já recebeu), um
 *                                                       e-mail a cada S segundos (padrão 3). Plano grátis do
 *                                                       Brevo = 300/dia.
 *   node scripts/email-volta.js relatorio [--telegram]  enviados, cliques, VIP pegos, voltaram, saíram da lista
 */
import { writeFileSync } from 'fs';
import { prisma } from '../src/prisma.js';
import { tg } from '../src/lib/telegram.js';
import { mailReady } from '../src/lib/mail.js';
import { renderVolta } from '../src/lib/emailVolta.js';
import { VOLTA, publico, contexto, enviarUm, relatorio } from '../src/services/emailVolta.js';

const [cmd, ...args] = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (e) => e.replace(/^(.{2}).*(@.*)$/, '$1***$2');
const FIELDS = { id: true, nick: true, email: true, teamId: true, goalsTotal: true, lastSeenAt: true };

async function porNick(nick) {
  const u = await prisma.user.findFirst({ where: { nickLower: nick.toLowerCase(), deletedAt: null }, select: FIELDS });
  if (!u) throw new Error(`Jogador "${nick}" não encontrado.`);
  return u;
}

async function main() {
  const now = new Date();
  if (cmd === 'listar') {
    const users = await publico(now);
    const dom = {};
    for (const u of users) { const d = u.email.split('@')[1]; dom[d] = (dom[d] || 0) + 1; }
    console.log(`Público da campanha ${VOLTA.campaign}: ${users.length} contas (sem entrar há ${VOLTA.inactiveDays}+ dias, fora quem já recebeu)`);
    console.log('Domínios:', Object.entries(dom).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ${n}`).join(' · '));
    for (const u of users.slice(0, 15)) console.log(`  ${u.nick.padEnd(20)} ${String(u.goalsTotal).padStart(6)} gols · visto ${u.lastSeenAt.toISOString().slice(0, 10)} · ${mask(u.email)}`);
    if (users.length > 15) console.log(`  … e mais ${users.length - 15}`);
    return;
  }
  if (cmd === 'previa') {
    const [nick, file] = args;
    if (!nick || !file) throw new Error('Uso: previa <nick> <arquivo.html>');
    const u = await porNick(nick);
    const ctx = await contexto(now);
    const m = renderVolta({ ...ctx, nick: u.nick, goalsTotal: u.goalsTotal, lastSeenAt: u.lastSeenAt, team: ctx.teams.get(u.teamId),
      expiresAt: VOLTA.expiresAt, link: `${ctx.base}/voltar?t=PREVIA`, unsubLink: `${ctx.base}/sair-dos-emails?t=PREVIA` });
    writeFileSync(file, m.html);
    console.log(`Assunto: ${m.subject}\nPrévia: ${m.preheader}\nHTML em ${file}`);
    return;
  }
  if (cmd === 'teste') {
    const [to, nick] = args;
    if (!to || !to.includes('@')) throw new Error('Uso: teste <email> [nick]');
    if (!mailReady()) throw new Error('SMTP não configurado (SMTP_HOST vazio no .env).');
    const u = nick ? await porNick(nick) : (await publico(now)).sort((a, b) => b.goalsTotal - a.goalsTotal)[0];
    const r = await enviarUm(u, await contexto(now), { campaign: `${VOLTA.campaign}-teste`, to });
    console.log(r.ok ? `Prova mandada para ${to} com os dados de ${u.nick}.\nLink: ${r.link}` : `Falhou: ${r.error}`);
    return;
  }
  if (cmd === 'enviar') {
    if (!mailReady()) throw new Error('SMTP não configurado (SMTP_HOST vazio no .env).');
    if (VOLTA.expiresAt - now < 5 * 24 * 3600_000) throw new Error(`O prazo do VIP (${VOLTA.expiresAt.toISOString()}) está perto demais: mude VOLTA.expiresAt antes de mandar.`);
    const max = Number(opt('max', Infinity));
    const gap = Number(opt('seg', 3)) * 1000;
    const users = (await publico(now)).slice(0, max);
    const ctx = await contexto(now);
    console.log(`Mandando ${users.length} e-mails (1 a cada ${gap / 1000} s)…`);
    let ok = 0, falhas = 0, seguidas = 0;
    for (const [i, u] of users.entries()) {
      const r = await enviarUm(u, ctx);
      if (r.ok) { ok++; seguidas = 0; } else { falhas++; seguidas++; }
      console.log(`[${i + 1}/${users.length}] ${u.nick}: ${r.ok ? 'ok' : `FALHOU — ${r.error}`}`);
      if (seguidas >= 5) { console.log('5 falhas seguidas: parei. Confira o SMTP/Brevo e rode de novo (quem recebeu é pulado).'); break; }
      if (i < users.length - 1) await sleep(gap);
    }
    const rel = await relatorio();
    console.log(`Fim: ${ok} enviados, ${falhas} falhas nesta rodada. Campanha: ${JSON.stringify(rel)}`);
    await tg.raw(`⚽ <b>JogaGol</b> 📧 E-mail de volta disparado: <b>${ok}</b> enviados${falhas ? `, ${falhas} falharam` : ''} (total da campanha: ${rel.enviados}). Cada clique que pegar o VIP e cada volta ao jogo aparecem aqui.`);
    return;
  }
  if (cmd === 'relatorio') {
    const r = await relatorio(opt('campanha', VOLTA.campaign));
    const pct = (n) => (r.enviados ? ` (${Math.round((100 * n) / r.enviados)}%)` : '');
    const txt = `E-mail de volta (${r.campaign}): ${r.enviados} enviados${r.falhas ? `, ${r.falhas} falharam` : ''} · ${r.abriram} abriram${pct(r.abriram)} · ${r.clicaram} clicaram${pct(r.clicaram)} · ${r.pegaram} ficaram com o VIP${pct(r.pegaram)}${r.semClique ? ` (${r.semClique} ao entrar no jogo, sem clicar)` : ''} · ${r.voltaram} voltaram a jogar${pct(r.voltaram)} · ${r.sairam} saíram da lista`;
    console.log(txt);
    if (args.includes('--telegram')) console.log('Telegram:', await tg.raw(`⚽ <b>JogaGol</b> 📧 ${txt}`));
    return;
  }
  console.log('Comandos: listar | previa <nick> <arq> | teste <email> [nick] | enviar [--max N] [--seg S] | relatorio [--telegram]');
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
