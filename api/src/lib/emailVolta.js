/**
 * E-mail "volta pro JogaGol" (campanha de 22/10/2026, Guilherme): chama de volta quem não entra há 10+ dias,
 * com 7 dias de VIP no botão. Função pura: recebe os dados de UM jogador e devolve assunto, html e texto.
 *
 * HTML de e-mail, não de site: tabelas, estilo na linha, imagens em PNG com endereço absoluto
 * (`/email/*`, geradas por scripts/email-assets.js) e nenhuma fonte que dependa de carregar — o Lilita One
 * aparece no Apple Mail/iOS e o resto cai no Arial Black. O texto evita cara de propaganda gerada: frases
 * curtas, fatos do próprio jogador (time, posição, gols, a data em que ele saiu) e nada de emoji.
 */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TZ = 'America/Sao_Paulo';
const partes = (d) => {
  const [dia, mes] = new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric', month: 'numeric' }).split('/').map(Number);
  return { dia, mes };
};
/** "19 de setembro" */
export const dataLonga = (d) => { const { dia, mes } = partes(d); return `${dia} de ${MESES[mes - 1]}`; };
const n = (x) => Number(x).toLocaleString('pt-BR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// datas do que mudou no jogo (a lista do e-mail só mostra o que a pessoa ainda não viu)
const FUTGOLF_EM = new Date('2026-09-24T22:00:00Z');

// times que levam "a" (a Ponte Preta); o resto é "o" (o Ceará, o Santa Cruz)
const FEMININOS = new Set(['ponte-preta', 'chapecoense', 'portuguesa', 'ferroviaria']);

/** A frase do time na tabela: posição, pontos e o que está em jogo para ele. */
export function linhaDoTime(t) {
  const pos = `${t.pos}º`;
  const nome = `${FEMININOS.has(t.slug) ? 'A' : 'O'} ${t.name}`;
  const base = t.pos === 1 ? `lidera a Série ${t.serie}` : `está em ${pos} na Série ${t.serie}`;
  const placar = `${t.points} ponto${t.points === 1 ? '' : 's'} em ${t.played} jogo${t.played === 1 ? '' : 's'}`;
  let jogo;
  if (t.serie !== 'A' && t.pos <= 2) jogo = `Se a temporada acabasse hoje, ${FEMININOS.has(t.slug) ? 'ela' : 'ele'} subia para a Série ${t.serie === 'B' ? 'A' : 'B'}.`;
  else if (t.pos > t.n - 2 && t.serie !== 'C') jogo = `Se a temporada acabasse hoje, ${FEMININOS.has(t.slug) ? 'ela' : 'ele'} caía. Os 2 últimos descem.`;
  else if (t.serie === 'A') jogo = t.pos === 1 ? 'Ninguém fez mais pontos até aqui.' : `O líder tem ${t.leaderPts} pontos.`;
  else jogo = `Os 2 primeiros sobem. O líder tem ${t.leaderPts} pontos.`;
  return { titulo: `${nome} ${base}`, placar, jogo };
}

export function renderVolta(d) {
  const base = d.base.replace(/\/+$/, '');
  const img = (p) => `${base}/email/${p}`;
  const nick = esc(d.nick);
  const saiu = dataLonga(d.lastSeenAt);
  const vence = dataLonga(d.expiresAt);
  const time = linhaDoTime(d.team);
  const faltam = d.roundsTotal - d.roundNumber + 1;

  const novidades = [
    { icon: 'recarga.png', titulo: 'Gol com o jogo fechado', texto: 'Com VIP, o chute direto sai sozinho a cada 5 minutos, mesmo com o JogaGol fechado. Nos seus 7 dias isso já vale.' },
    ...(new Date(d.lastSeenAt) < FUTGOLF_EM ? [{ icon: 'x1.png', titulo: 'Futgolf no X1', texto: 'Golfe de chute contra outro jogador, ao vivo, com vento, rampas e bueiros. Entrou no rodízio com o FutPrego e o Futebol de Botão.' }] : []),
    { icon: 'drible.png', titulo: 'Drible, habilidade nova', texto: 'Na Trilha, quando roubam sua bola, ela pode sobrar de novo para você. Cada nível vale um ponto para gastar nas habilidades.' },
  ];

  const subject = `${d.nick}, seus 7 dias de VIP estão guardados`;
  const preheader = `O JogaGol está mais vivo do que nunca! ${time.titulo}.`;

  // ── texto puro (vai junto: alguns leitores e filtros de spam olham só ele) ──
  const text = [
    `Oi, ${d.nick}.`,
    '',
    'Guardamos 7 dias de VIP para você.',
    '',
    'O JogaGol está mais vivo do que nunca!',
    `Só nos últimos 10 dias chegaram ${n(d.newPlayers)} jogadores novos, e ontem foram ${n(d.x1Yesterday)} partidas de X1. Sua última visita foi em ${saiu}.`,
    '',
    'Pegar meu VIP (ativa na hora, vale até ' + vence + ', funciona uma vez):',
    d.link,
    '',
    `${time.titulo}: ${time.placar}. ${time.jogo} A temporada ainda tem ${faltam} rodadas.`,
    ...(d.goalsTotal >= 20 ? [`Seus ${n(d.goalsTotal)} gols continuam na sua conta.`] : []),
    '',
    `O que mudou desde ${saiu}:`,
    ...novidades.map((x) => `- ${x.titulo}: ${x.texto}`),
    '',
    `Esqueceu a senha? ${base}/esqueci-senha`,
    '',
    `Você recebeu este e-mail porque tem a conta ${d.nick} no JogaGol. Para não receber mais: ${d.unsubLink}`,
  ].join('\n');

  // ── HTML ──
  const F_TITULO = `'Lilita One','Arial Black',Arial,sans-serif`;
  const F_TEXTO = `Nunito,'Segoe UI',Arial,sans-serif`;
  const INK = '#14335F';
  const MUTED = '#5F7BA8';

  // faixa de gramado com as listras do corte, embaixo do céu
  const grama = Array.from({ length: 12 }, (_, i) => `<td height="16" style="height:16px;line-height:16px;font-size:0;background:${i % 2 ? '#3FBF2E' : '#4CD137'}">&nbsp;</td>`).join('');

  const novidadeRow = (x, ultimo) => `
              <tr>
                <td width="56" valign="top" style="padding:0 14px ${ultimo ? 0 : 18}px 0"><img src="${img(x.icon)}" width="44" height="44" alt="" style="display:block;border:0"></td>
                <td valign="top" style="padding:0 0 ${ultimo ? 0 : 18}px 0;font-family:${F_TEXTO};font-size:15px;line-height:22px;color:${INK}">
                  <b style="font-family:${F_TITULO};font-weight:normal;font-size:17px;letter-spacing:0.2px;color:#0B2D6B">${esc(x.titulo)}</b><br>${esc(x.texto)}
                </td>
              </tr>`;

  const perk = (t) => `
                    <tr>
                      <td width="22" valign="top" style="padding:3px 8px 6px 0"><img src="${img('check.png')}" width="16" height="16" alt="" style="display:block;border:0"></td>
                      <td style="padding:0 0 6px 0;font-family:${F_TEXTO};font-size:14px;line-height:21px;color:${INK}">${t}</td>
                    </tr>`;

  const html = `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;background:#D9EEFF}
  a{color:#1467D9}
  @media (max-width:620px){
    .card{border-radius:0!important}
    .pad{padding-left:20px!important;padding-right:20px!important}
    .btn a{display:block!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#D9EEFF">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#D9EEFF">${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#D9EEFF" style="background:#D9EEFF">
  <tr>
    <td align="center" style="padding:24px 0 32px">
      <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-radius:18px;overflow:hidden;background:#FFFFFF">
        <!-- céu com o logo -->
        <tr>
          <td align="center" bgcolor="#2EA8FF" style="background:#2EA8FF;background-image:linear-gradient(180deg,#5CC0FF 0%,#2EA8FF 55%,#1F8BEA 100%);padding:26px 20px 26px">
            <a href="${esc(d.link)}" style="text-decoration:none"><img src="${img('logo.png')}" width="190" alt="JogaGol" style="display:block;border:0;width:190px;max-width:55%;height:auto;margin:0 auto"></a>
            <h1 style="margin:20px 0 0;padding:0;font-size:0;line-height:0"><img src="${img('titulo.png')}" width="400" alt="Guardamos 7 dias de VIP para você" style="display:block;border:0;width:400px;max-width:92%;height:auto;margin:0 auto;font-family:${F_TITULO};font-size:28px;line-height:32px;color:#FFFFFF"></h1>
          </td>
        </tr>
        <tr><td style="padding:0;font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${grama}</tr></table></td></tr>

        <!-- o presente -->
        <tr>
          <td class="pad" style="padding:30px 36px 8px;font-family:${F_TEXTO};color:${INK}">
            <p style="margin:0 0 8px;font-size:17px;line-height:24px;font-weight:800">Oi, ${nick}.</p>
            <p style="margin:0 0 8px;font-family:${F_TITULO};font-size:23px;line-height:28px;color:#0B2D6B">O JogaGol está mais vivo do que nunca!</p>
            <p style="margin:0;font-size:16px;line-height:25px">Só nos últimos 10 dias chegaram <b>${n(d.newPlayers)} jogadores novos</b>, e ontem foram <b>${n(d.x1Yesterday)} partidas de X1</b>. Sua última visita foi em ${saiu}.</p>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:22px 36px 6px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF7DE;border:2px solid #FFC63D;border-bottom:5px solid #E9A400;border-radius:16px">
              <tr>
                <td style="padding:18px 20px 12px">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="68" valign="middle" style="padding-right:14px"><img src="${img('vip.png')}" width="56" height="56" alt="" style="display:block;border:0"></td>
                      <td valign="middle" style="font-family:${F_TEXTO};color:${INK}">
                        <img src="${img('vip-titulo.png')}" width="202" alt="7 DIAS DE VIP" style="display:block;border:0;width:202px;height:auto;margin:0 0 4px;font-family:${F_TITULO};font-size:24px;color:#8A4B00">
                        <div style="font-size:14px;line-height:20px;color:#8A5A12;font-weight:700">Começa a contar quando você tocar no botão.</div>
                      </td>
                    </tr>
                  </table>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px">${perk('<b>Recargas pela metade:</b> chute direto a cada 5 minutos, não 10.')}${perk('<b>Gol com o jogo fechado:</b> o chute direto sai sozinho.')}${perk('<b>X1 sem espera</b> entre as partidas e todas as provocações.')}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" class="pad btn" style="padding:22px 36px 6px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#FF8A2A" style="background:#FF8A2A;border-radius:14px;border-bottom:5px solid #C9560F">
                  <a href="${esc(d.link)}" style="display:inline-block;padding:16px 40px;font-family:${F_TITULO};font-size:21px;line-height:24px;color:#FFFFFF;text-decoration:none;letter-spacing:0.5px">PEGAR MEU VIP</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-family:${F_TEXTO};font-size:13px;line-height:19px;color:${MUTED}">O link é só seu, vale até ${vence} e funciona uma vez.</p>
          </td>
        </tr>

        <!-- o time dele -->
        <tr>
          <td class="pad" style="padding:28px 36px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF6FF;border-radius:14px">
              <tr>
                <td width="80" valign="middle" style="padding:16px 4px 16px 16px"><img src="${img(`escudos/${d.team.slug}.png`)}" width="64" height="64" alt="${esc(d.team.name)}" style="display:block;border:0"></td>
                <td valign="middle" style="padding:16px 18px 16px 10px;font-family:${F_TEXTO};font-size:15px;line-height:22px;color:${INK}">
                  <div style="font-family:${F_TITULO};font-size:19px;line-height:23px;color:#0B2D6B">${esc(time.titulo)}</div>
                  ${esc(time.placar)}. ${esc(time.jogo)} A temporada ainda tem ${faltam} rodadas.${d.goalsTotal >= 20 ? `<br><span style="color:${MUTED}">Seus ${n(d.goalsTotal)} gols continuam na sua conta.</span>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- o que mudou -->
        <tr>
          <td class="pad" style="padding:30px 36px 6px">
            <div style="font-family:${F_TITULO};font-size:14px;line-height:18px;letter-spacing:1.5px;color:#1F8BEA;margin:0 0 16px">O QUE MUDOU DESDE ${esc(saiu.toUpperCase())}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${novidades.map((x, i) => novidadeRow(x, i === novidades.length - 1)).join('')}
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:26px 36px 32px;font-family:${F_TEXTO};font-size:14px;line-height:21px;color:${MUTED}">
            Esqueceu a senha? <a href="${base}/esqueci-senha" style="color:#1467D9;font-weight:700">Peça uma nova aqui</a>.
          </td>
        </tr>
      </table>

      <!-- rodapé -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
        <tr>
          <td class="pad" align="center" style="padding:18px 36px 0;font-family:${F_TEXTO};font-size:12px;line-height:18px;color:${MUTED}">
            Você recebeu este e-mail porque tem a conta <b>${nick}</b> no JogaGol.<br>
            Não quer mais receber? <a href="${esc(d.unsubLink)}" style="color:${MUTED}">Sair da lista</a>.<br><br>
            JogaGol · <a href="${base}" style="color:${MUTED}">jogagol.com.br</a>${d.pixel ? `<img src="${esc(d.pixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, preheader, html, text };
}
