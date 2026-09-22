/**
 * "Gracinha" — alguém testando o jogo por baixo: injeção de SQL na busca, HTML no texto, id gigante na rota,
 * varredura de endereços (/api/swagger.json, /api/.env…), chave de admin errada, token de sessão forjado, rajada
 * de senhas no login… Pedido do dono, 22/09/2026, depois da varredura de 17/09 do IP 107.150.41.226 (582 pedidos
 * em 8 min, contas gol36930 e jogador22276): "precisamos de aviso no Telegram sempre que alguém tentar alguma
 * gracinha e explicar no aviso se passou ou conseguiu bloquear".
 *
 * Como funciona: `gracinha` é middleware de TODO pedido da API (index.js, antes das rotas). Olha o endereço, a
 * query e o corpo (JSON) atrás dos padrões de lib/codigo.js (o mesmo filtro do chat) e de alguns que só fazem
 * sentido na API; no fim do pedido (`finish`) olha o status e diz o RESULTADO:
 *   🛡️ BARRADA (4xx) · ✅ SEM EFEITO (2xx numa injeção de SQL: as consultas são parametrizadas, virou texto comum)
 *   · ⚠️ PASSOU (2xx no resto — conferir) · 💥 QUEBROU (5xx — a API caiu nesse pedido, corrigir).
 * Aviso por IP: a PRIMEIRA gracinha sai na hora, com quem é (IP, cidade/VPN, aparelho, conta logada e as outras
 * contas desse IP); as seguintes juntam por 10 min e saem num RESUMO (quantas, resultado, tipos, as que passaram).
 * Tudo em memória, nada no banco. O chat e o texto pessoal têm o próprio aviso (🧪, com o nick, em routes/chat.js
 * e routes/me.js) — o corpo deles não é olhado aqui para não avisar duas vezes.
 * Mexeu? `node scripts/test-gracinha.js` (pasta api/, sem banco).
 */
import { pareceCodigo } from './codigo.js';
import { MAX_ID } from './errors.js';
import { clientIp, geoForIp } from './ip.js';
import { deviceOf } from './device.js';
import { tg } from './telegram.js';
import { prisma } from '../prisma.js';

export const JANELA_MS = Number(process.env.GRACINHA_JANELA_MS) || 10 * 60_000; // as gracinhas de um IP juntam por 10 min depois da primeira (env: só para teste)
export const LIMITE_404 = 6; // pedidos a endereços inexistentes da API em 10 min = varredura
export const LIMITE_LOGIN = 10; // senhas erradas de um IP em 10 min = rajada (a trava por CONTA é de lib/security.js)

/** Tipos de gracinha — a chave vai no resumo, o texto no aviso. */
export const TIPOS = {
  sql: 'injeção de SQL', xss: 'HTML/JavaScript (XSS)', template: 'molde de template', caminho: 'caminho de arquivo',
  nosql: 'operador de consulta (NoSQL/Prisma)', numero: 'número gigante', proto: 'poluição de protótipo',
  rota: 'varredura de endereços', admin: 'chave de admin errada', painel: 'painel de admin sem ser admin',
  token: 'token de sessão forjado', login: 'rajada de senhas no login',
};
/** O motivo de lib/codigo.js → tipo daqui. */
const TIPO_DO_CODIGO = {
  'tag HTML': 'xss', 'evento de JavaScript': 'xss', 'javascript:': 'xss', 'data: com HTML': 'xss',
  'UNION SELECT': 'sql', 'SELECT … FROM': 'sql', 'comando de SQL': 'sql', 'tautologia de SQL': 'sql', 'função de banco': 'sql', 'comentário de SQL depois de aspas': 'sql',
  'molde de template': 'template', 'caminho de arquivo': 'caminho',
};
const RE_NOSQL = /["']?\$(gt|gte|lt|lte|ne|nin|in|or|and|not|where|regex|exists|expr)["']?\s*:|"(where|OR|AND|NOT|select|include)"\s*:\s*[[{]/i;
const RE_CAMINHO = /\.\.[\\/]|%2e%2e|\/etc\/(passwd|shadow)|%00|\0/i;
const RE_PROTO = /^(__proto__|constructor|prototype)$/;
/** Endereços que só quem está vasculhando pede (avaliado quando a API responde 404). */
const RE_DESCOBERTA = /\.(env|git|php|asp|aspx|jsp|sql|zip|bak|old|log|key|pem|yml|yaml|ini|conf|json)(\?|$)|\/(swagger|openapi|graphql|docs|debug|config|metrics|actuator|console|manager|phpmyadmin|pma|wp-|cgi-bin|xmlrpc|\.well-known|\.git|\.env)/i;
/** Chaves de número em que um valor acima do INT4 só pode ser de propósito (não é relógio nem valor de jogo). */
const RE_CHAVE_ID = /^(id|.*Id|page|index|i|n|qtd|day|slot|limit|after|choice|pack|round|number)$/;
/** Rotas com filtro próprio de texto (aviso 🧪 com o nick): o corpo não é olhado aqui. Eventos de uso: telemetria do site. */
const RE_CORPO_PROPRIO = /^\/api\/(chat\/|me\/bio$|events$)/;
/** Campos que NUNCA vão para o aviso (senha com aspas não é gracinha — e não pode vazar no Telegram). */
const RE_CHAVE_SECRETA = /password|senha|token|secret|captcha|authorization/i;

const decodificar = (s) => { try { return decodeURIComponent(String(s)); } catch { return String(s); } };
const numeroGigante = (s) => /^\d{10,}$/.test(s) && Number(s) > MAX_ID;

/** Um texto solto (pedaço da rota, valor da query, string do corpo): que gracinha é? */
function tipoDoTexto(texto) {
  const t = String(texto);
  if (!t) return null;
  if (RE_CAMINHO.test(t)) return 'caminho';
  const motivo = pareceCodigo(t);
  if (motivo) return TIPO_DO_CODIGO[motivo] ?? 'xss';
  if (RE_NOSQL.test(t)) return 'nosql';
  return null;
}

/** Anda pelo corpo JSON (até 4 níveis / 300 nós) juntando os achados. */
function olharCorpo(corpo, achados, chave = '', nivel = 0, orcamento = { n: 300 }) {
  if (nivel > 4 || orcamento.n-- <= 0) return;
  if (typeof corpo === 'string') {
    const tipo = tipoDoTexto(corpo);
    if (tipo) achados.push({ tipo, valor: `${chave ? chave + '=' : ''}${corpo}` });
  } else if (typeof corpo === 'number') {
    if (Number.isFinite(corpo) && (corpo >= 1e16 || (Number.isInteger(corpo) && corpo > MAX_ID && RE_CHAVE_ID.test(chave)))) achados.push({ tipo: 'numero', valor: `${chave}=${corpo}` });
  } else if (Array.isArray(corpo)) {
    corpo.forEach((v, i) => olharCorpo(v, achados, chave || String(i), nivel + 1, orcamento));
  } else if (corpo && typeof corpo === 'object') {
    for (const k of Object.keys(corpo)) {
      if (RE_PROTO.test(k)) achados.push({ tipo: 'proto', valor: k });
      if (RE_CHAVE_SECRETA.test(k)) continue;
      olharCorpo(corpo[k], achados, k, nivel + 1, orcamento);
    }
  }
}

/**
 * Olha o pedido ANTES da rota rodar: rota, query e corpo. Devolve os achados [{ tipo, valor }] (vazio = nada).
 * Puro (sem rede/banco) — é o que o scripts/test-gracinha.js confere.
 */
export function inspecionarPedido({ method = 'GET', url = '/', body = null } = {}) {
  const achados = [];
  const [caminhoCru, queryCru = ''] = String(url).split('?');
  const caminho = decodificar(caminhoCru);
  for (const seg of caminho.split('/').filter(Boolean)) {
    if (numeroGigante(seg)) achados.push({ tipo: 'numero', valor: seg });
    const tipo = tipoDoTexto(seg);
    if (tipo) achados.push({ tipo, valor: seg });
  }
  if (queryCru) {
    for (const [k, v] of new URLSearchParams(queryCru)) {
      if (numeroGigante(v)) achados.push({ tipo: 'numero', valor: `${k}=${v}` });
      const tipo = tipoDoTexto(v) ?? tipoDoTexto(k);
      if (tipo) achados.push({ tipo, valor: `${k}=${v}` });
    }
  }
  if (body && typeof body === 'object' && method !== 'GET' && !RE_CORPO_PROPRIO.test(caminho)) olharCorpo(body, achados);
  return achados;
}

/**
 * Olha o pedido DEPOIS da resposta: o que só o status diz (endereço inexistente, chave de admin, painel sem ser
 * admin, rajada no login) e o que a rota marcou em `res.locals.gracinha` (token forjado, lib/auth.js).
 * `contadores` = os do IP (404 e login), já incrementados por quem chama.
 */
export function inspecionarResposta({ method = 'GET', path = '/', status = 200, user = null, marcado = null, n404 = 0, nLogin = 0 } = {}) {
  const achados = [];
  if (status === 404 && (RE_DESCOBERTA.test(path) || n404 >= LIMITE_404)) achados.push({ tipo: 'rota', valor: path });
  if (status === 403 && path.startsWith('/api/admin/')) achados.push({ tipo: 'admin', valor: path });
  if (status === 403 && path.startsWith('/api/painel') && user && !user.isAdmin) achados.push({ tipo: 'painel', valor: path });
  if (status === 401 && method === 'POST' && path === '/api/auth/login' && nLogin >= LIMITE_LOGIN) achados.push({ tipo: 'login', valor: `${nLogin} senhas erradas em 10 min` });
  if (marcado?.tipo) achados.push(marcado);
  return achados;
}

/** O veredito do aviso: o que a API respondeu diz se a gracinha passou. */
export function resultado(status, tipos) {
  if (status >= 500) return { k: 'quebrou', txt: `💥 QUEBROU A API (HTTP ${status}) — precisa corrigir` };
  if (status >= 400) return { k: 'barrada', txt: `🛡️ BARRADA (HTTP ${status})` };
  if (tipos.length && tipos.every((t) => t === 'sql' || t === 'nosql')) return { k: 'semEfeito', txt: `✅ SEM EFEITO (HTTP ${status}): as consultas são parametrizadas — virou texto comum, nada executou` };
  return { k: 'passou', txt: `⚠️ PASSOU (HTTP ${status}) — conferir` };
}

// ─── Contadores e avisos por IP (memória; 1 instância PM2) ─────────────────────────────────────────────────
const contadores = new Map(); // ip -> { since, n404, nLogin }
const abertas = new Map(); // ip -> { since, n, tipos: Map, res: {…}, passaram: [], nicks: Set, timer }

function contar(ip, campo, now) {
  let c = contadores.get(ip);
  if (!c || now - c.since > JANELA_MS) { c = { since: now, n404: 0, nLogin: 0 }; contadores.set(ip, c); }
  c[campo] += 1;
  if (contadores.size > 5000) for (const [k, v] of contadores) if (now - v.since > JANELA_MS) contadores.delete(k);
  return c[campo];
}

const geoTexto = (g) => (g ? [[g.city, g.country].filter(Boolean).join(', '), g.proxy || g.hosting ? 'VPN/datacenter' : g.mobile ? 'celular' : null].filter(Boolean).join(' · ') : 'sem geolocalização');

/** Quem é o IP: geolocalização, aparelho e as contas vistas nele (o painel tem o mesmo cruzamento). */
async function identidade(ip, req) {
  const partes = [];
  try { partes.push(geoTexto(await geoForIp(ip))); } catch { /* sem geo */ }
  try { partes.push(deviceOf(req).label); } catch { /* sem aparelho */ }
  let contas = [];
  try {
    contas = await prisma.user.findMany({ where: { deletedAt: null, OR: [{ lastIp: ip }, { createdIp: ip }] }, orderBy: { lastSeenAt: 'desc' }, take: 6, select: { nick: true, bannedUntil: true, isBot: true } });
  } catch { /* banco fora: fica sem */ }
  return { quem: partes.join(' · '), contas: contas.filter((u) => !u.isBot).map((u) => `${u.nick}${u.bannedUntil && u.bannedUntil.getTime() > Date.now() ? ' (suspensa)' : ''}`) };
}

async function avisoImediato(ip, req, tipos, r, exemplo, nick) {
  const { quem, contas } = await identidade(ip, req);
  const outras = contas.filter((c) => c.split(' ')[0] !== nick);
  const linhas = [
    `🕵️ Gracinha — <b>${tg.esc(tipos.map((t) => TIPOS[t]).join(' + '))}</b>: ${r.txt}`,
    `<code>${tg.esc(exemplo)}</code>`,
    `Quem: IP <code>${tg.esc(ip)}</code>${quem ? ` · ${tg.esc(quem)}` : ''}`,
    nick ? `Conta: <b>${tg.esc(nick)}</b>${outras.length ? ` · outras neste IP: ${tg.esc(outras.join(', '))}` : ''}` : contas.length ? `Sem login · contas deste IP: ${tg.esc(contas.join(', '))}` : 'Sem login · nenhuma conta conhecida neste IP',
    `<i>As próximas deste IP juntam num resumo em ${Math.round(JANELA_MS / 60_000)} min.</i>`,
  ];
  tg.warn(linhas.join('\n'));
}

function resumo(ip) {
  const g = abertas.get(ip);
  abertas.delete(ip);
  if (!g || g.n <= 1) return; // só a primeira: já foi avisada na hora
  const tipos = [...g.tipos.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${TIPOS[t]} ${n}`).join(' · ');
  const nicks = [...g.nicks];
  const linhas = [
    `🕵️ Resumo de ${Math.round(JANELA_MS / 60_000)} min — IP <code>${tg.esc(ip)}</code>${nicks.length ? ` (${tg.esc(nicks.join(', '))})` : ''}: <b>${g.n} gracinhas</b> — 🛡️ ${g.res.barrada} barradas · ✅ ${g.res.semEfeito} sem efeito · ⚠️ <b>${g.res.passou} passaram</b> · 💥 ${g.res.quebrou} quebraram`,
    `Tipos: ${tg.esc(tipos)}`,
  ];
  if (g.passaram.length) linhas.push(`Passaram/quebraram (conferir): ${g.passaram.map((p) => `<code>${tg.esc(p)}</code>`).join(' · ')}`);
  tg.warn(linhas.join('\n'));
}

/** Registra uma gracinha do IP: a primeira avisa na hora; as outras entram no resumo da janela. */
function registrar(ip, req, res, achados, now = Date.now()) {
  const tipos = [...new Set(achados.map((a) => a.tipo))];
  const r = resultado(res.statusCode, tipos);
  const caminho = String(req.originalUrl || req.url || '/').split('?')[0];
  const valor = achados.find((a) => a.valor)?.valor;
  const exemplo = `${req.method} ${decodificar(caminho)}${valor && !decodificar(caminho).includes(String(valor)) ? ` · ${String(valor).slice(0, 160)}` : ''}`;
  const nick = req.user?.nick ?? res.locals?.jwtNick ?? null;
  let g = abertas.get(ip);
  const primeira = !g;
  if (!g) {
    g = { since: now, n: 0, tipos: new Map(), res: { barrada: 0, semEfeito: 0, passou: 0, quebrou: 0 }, passaram: [], nicks: new Set(), timer: null };
    g.timer = setTimeout(() => resumo(ip), JANELA_MS);
    g.timer.unref?.();
    abertas.set(ip, g);
    if (abertas.size > 2000) { const [k, v] = abertas.entries().next().value; clearTimeout(v.timer); resumo(k); }
  }
  g.n += 1;
  for (const t of tipos) g.tipos.set(t, (g.tipos.get(t) ?? 0) + 1);
  g.res[r.k] += 1;
  if ((r.k === 'passou' || r.k === 'quebrou') && g.passaram.length < 8) g.passaram.push(`${exemplo.slice(0, 90)} (HTTP ${res.statusCode})`);
  if (nick) g.nicks.add(nick);
  console.warn(`[gracinha] ${ip}${nick ? ` (${nick})` : ''} ${tipos.join('+')} ${r.k} HTTP ${res.statusCode}: ${exemplo.slice(0, 200)}`);
  if (primeira) avisoImediato(ip, req, tipos, r, exemplo, nick).catch((e) => console.warn('[gracinha] aviso:', e.message));
}

/** Middleware (index.js): inspeciona o pedido agora e a resposta no `finish`. Nunca lança, nunca segura o pedido. */
export function gracinha(req, res, next) {
  let antes = [];
  try { antes = inspecionarPedido({ method: req.method, url: req.originalUrl || req.url, body: req.body }); } catch { /* nunca atrapalha o pedido */ }
  res.on('finish', () => {
    try {
      const now = Date.now();
      const ip = clientIp(req);
      const path = String(req.originalUrl || req.url || '/').split('?')[0];
      const status = res.statusCode;
      const n404 = status === 404 && path.startsWith('/api/') && !path.startsWith('/api/uploads/') ? contar(ip, 'n404', now) : 0; // foto apagada não é varredura
      const nLogin = status === 401 && req.method === 'POST' && path === '/api/auth/login' ? contar(ip, 'nLogin', now) : 0;
      const depois = inspecionarResposta({ method: req.method, path, status, user: req.user ?? null, marcado: res.locals?.gracinha ?? null, n404, nLogin });
      const achados = [...antes, ...depois];
      if (achados.length) registrar(ip, req, res, achados, now);
    } catch (e) { console.warn('[gracinha]', e.message); }
  });
  next();
}

/** Para os testes: zera janelas e contadores. */
export function _zerar() { for (const g of abertas.values()) clearTimeout(g.timer); abertas.clear(); contadores.clear(); }
