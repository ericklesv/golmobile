/**
 * Teste do detector de gracinhas (lib/gracinha.js) — sem banco, sem API no ar: só as funções puras.
 *   node scripts/test-gracinha.js
 * 1) Os pedidos REAIS da varredura de 17/09/2026 (IP 107.150.41.226) têm de ser reconhecidos, com o tipo certo.
 * 2) O tráfego normal do jogo (heartbeat, busca com aspas, senha com SQL, relógio do cadastro, foto apagada…)
 *    NÃO pode virar aviso — alarme falso no Telegram é pior que nenhum.
 * 3) O veredito (barrada / sem efeito / passou / quebrou) segue o status.
 * 4) Só vai para o grupo o IP que tem conta no jogo (dono, 22/09/2026).
 */
import { inspecionarPedido, inspecionarResposta, resultado, vaiParaOGrupo, LIMITE_404, LIMITE_LOGIN, TIPOS } from '../src/lib/gracinha.js';

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const tipos = (a) => [...new Set(a.map((x) => x.tipo))].sort().join('+');

console.log('— 1) a varredura de 17/09 é reconhecida');
const varredura = [
  ["GET /api/players/search?q=%27%20UNION%20SELECT%20version%28%29--", 'sql'],
  ["GET /api/players/search?q=%27%20OR%20%271%27%3D%271", 'sql'],
  ["GET /api/players/search?q=%27%3B%20SELECT%20pg_sleep%285%29--", 'sql'],
  ["GET /api/players/search?q=%27%20UNION%20SELECT%20pg_read_file%28%27/etc/passwd%27%29--", 'caminho'], // /etc/passwd pesa mais
  ["GET /api/players/search?q=%27%20UNION%20SELECT%20%40%40version--", 'sql'],
  ["GET /api/players/search?q=%7B%22id%22%3A%7B%22%24gt%22%3A0%7D%7D", 'nosql'],
  ["GET /api/players/search?q=%7B%22where%22%3A%7B%22OR%22%3A%5B%7B%22id%22%3A%7B%22gt%22%3A0%7D%7D%5D%7D%7D", 'nosql'],
  ["GET /api/players/%27%20UNION%20SELECT%20NULL%2CNULL%2CNULL--", 'sql'],
  ["GET /api/teams/%27%20UNION%20SELECT%20sql%20FROM%20sqlite_master--", 'sql'],
  ['GET /api/matches/10000000000000000', 'numero'],
  ['GET /api/league/rounds/9999999999999999', 'numero'],
  ['GET /api/inbox?page=9999999999999999', 'numero'],
  ['GET /api/players/search?q=..%2F..%2F..%2Fetc%2Fpasswd', 'caminho'],
];
for (const [linha, esperado] of varredura) {
  const [method, url] = linha.split(' ');
  const a = inspecionarPedido({ method, url });
  check(tipos(a) === esperado, `${decodeURIComponent(url).slice(0, 70)} → ${tipos(a) || '(nada)'}`);
}
// corpo com XSS/SQL/protótipo/número gigante numa rota comum
check(tipos(inspecionarPedido({ method: 'POST', url: '/api/shop/nick', body: { nick: '<script>alert(1)</script>' } })) === 'xss', 'corpo: <script> no nick → xss');
check(tipos(inspecionarPedido({ method: 'POST', url: '/api/auth/login', body: { email: "' OR '1'='1", password: 'x' } })) === 'sql', "corpo: e-mail ' OR '1'='1 → sql");
check(tipos(inspecionarPedido({ method: 'POST', url: '/api/me/vip-to-money', body: { qtd: 10000000000000000 } })) === 'numero', 'corpo: qtd = 1e16 → numero');
check(tipos(inspecionarPedido({ method: 'POST', url: '/api/shop/buy', body: { key: 'boost', __proto__: { isAdmin: true }, constructor: { prototype: {} } } })) === 'proto', 'corpo: __proto__/constructor → proto');
check(tipos(inspecionarPedido({ method: 'POST', url: '/api/club/offers', body: { nick: 'x', vip: 1, message: '{{constructor.constructor("return this")()}}' } })) === 'template', 'corpo: molde de template → template');
check(tipos(inspecionarPedido({ method: 'POST', url: '/api/play/trail', body: { index: 4294967296 } })) === 'numero', 'corpo: index acima do INT4 → numero');

console.log('— 2) tráfego normal do jogo não vira aviso');
const normais = [
  ['GET', '/api/me'], ['POST', '/api/me/heartbeat'], ['GET', '/api/chat/geral?after=526'], ['GET', '/api/home?team=sport'],
  ['GET', '/api/rankings/x1-rodada?limit=50'], ['GET', '/api/players/search?q=ma%27'], ['GET', "/api/players/search?q=d'or"],
  ['GET', '/api/players/search?q=union'], ['GET', '/api/players/search?q=select'], ['GET', '/api/players/Jo%C3%A3o_10'],
  ['GET', '/api/teams/santa-cruz'], ['GET', '/api/league/rounds/12'], ['GET', '/api/matches/1234'], ['GET', '/api/daily/termo?day=42'],
  ['GET', '/api/uploads/avatars/169-1758120000000.webp'], ['GET', '/api/ref/ABCDEF'], ['GET', '/api/vip/purchases/JG0123456789abcdef0123456789abcdef'],
];
for (const [method, url] of normais) check(inspecionarPedido({ method, url }).length === 0, `${method} ${decodeURIComponent(url)}`);
const corposNormais = [
  ['POST', '/api/auth/register', { nick: 'Zé_10', email: 'ze@gmail.com', password: "' OR '1'='1 -- minha senha", teamSlug: 'flamengo', elapsedMs: 8123, startedAt: 1790059825710 }],
  ['POST', '/api/auth/login', { email: 'ze@gmail.com', password: '<script>alert(1)</script>' }],
  ['POST', '/api/chat/geral', { text: "' UNION SELECT NULL--" }], // o chat tem o próprio filtro (aviso 🧪)
  ['PUT', '/api/me/bio', { bio: '<img src=x onerror=alert(1)>' }], // idem, texto pessoal
  ['POST', '/api/events', { events: [{ name: 'erro.tela', data: { msg: 'Objects are not valid as a React child (found: object with keys {a, b}) <div>' }, at: 1790059825710 }], device: 'abc' }],
  ['POST', '/api/play/captcha', { captchaId: 'c1', answer: 7 }],
  ['POST', '/api/daily/quiz/answer', { index: 3, choice: 1, day: 34 }],
  ['POST', '/api/play/party', {}],
  ['POST', '/api/daily/faltapro/kick', { i: 2, dirX: 0.31, dirY: 0.2, power: 0.88, spin: -0.4 }],
  ['POST', '/api/daily/goleada/end', { taps: [{ t: 1790059825710, x: 0.2, y: 0.4 }, { t: 1790059826910, x: -0.3, y: 0.1 }] }],
  ['POST', '/api/x1/whatever', { text: 'Freguês! 5 x 0, vai chorar? 5 > 3 e "a" = "a"; união é força' }],
];
for (const [method, url, body] of corposNormais) check(inspecionarPedido({ method, url, body }).length === 0, `${method} ${url} ${JSON.stringify(body).slice(0, 60)}`);
// a senha nunca aparece no aviso, mesmo quando outro campo é gracinha
const comSenha = inspecionarPedido({ method: 'POST', url: '/api/auth/login', body: { email: "' OR 1=1", password: 'SEGREDO123' } });
check(comSenha.length === 1 && !JSON.stringify(comSenha).includes('SEGREDO123'), 'a senha não vai para o aviso');

console.log('— 3) o que só a resposta diz');
check(tipos(inspecionarResposta({ path: '/api/swagger.json', status: 404 })) === 'rota', '404 em /api/swagger.json → varredura');
check(tipos(inspecionarResposta({ path: '/api/.env', status: 404 })) === 'rota', '404 em /api/.env → varredura');
check(tipos(inspecionarResposta({ path: '/api/graphql', status: 404 })) === 'rota', '404 em /api/graphql → varredura');
check(inspecionarResposta({ path: '/api/players/fulano', status: 404, n404: 1 }).length === 0, '404 de um perfil que não existe (1ª vez) → nada');
check(tipos(inspecionarResposta({ path: '/api/players/fulano', status: 404, n404: LIMITE_404 })) === 'rota', `${LIMITE_404} 404s em 10 min → varredura`);
check(inspecionarResposta({ path: '/api/players/fulano', status: 200 }).length === 0, '200 num perfil → nada');
check(tipos(inspecionarResposta({ path: '/api/admin/x1/status', status: 403 })) === 'admin', '403 em /api/admin → chave errada');
check(inspecionarResposta({ path: '/api/admin/x1/status', status: 200 }).length === 0, '200 em /api/admin (chave certa, deploy) → nada');
check(tipos(inspecionarResposta({ path: '/api/painel/users', status: 403, user: { nick: 'x', isAdmin: false } })) === 'painel', 'jogador comum no painel → painel');
check(inspecionarResposta({ path: '/api/painel/users', status: 403, user: null }).length === 0, 'conta suspensa (403 antes do user) no painel → nada');
check(inspecionarResposta({ method: 'POST', path: '/api/auth/login', status: 401, nLogin: 3 }).length === 0, '3 senhas erradas → nada (a trava por conta cuida)');
check(tipos(inspecionarResposta({ method: 'POST', path: '/api/auth/login', status: 401, nLogin: LIMITE_LOGIN })) === 'login', `${LIMITE_LOGIN} senhas erradas do IP → rajada`);
check(tipos(inspecionarResposta({ path: '/api/me', status: 401, marcado: { tipo: 'token', valor: 'invalid signature' } })) === 'token', 'token forjado (marcado por lib/auth.js) → token');

console.log('— 4) o veredito');
check(resultado(404, ['sql']).k === 'barrada' && resultado(403, ['admin']).k === 'barrada' && resultado(429, ['sql']).k === 'barrada', '4xx → barrada');
check(resultado(500, ['numero']).k === 'quebrou', '500 → quebrou');
check(resultado(200, ['sql']).k === 'semEfeito' && resultado(200, ['nosql']).k === 'semEfeito', '200 numa injeção de SQL/NoSQL → sem efeito (parametrizada)');
check(resultado(200, ['xss']).k === 'passou' && resultado(200, ['numero']).k === 'passou' && resultado(200, ['sql', 'xss']).k === 'passou', '200 no resto → PASSOU (conferir)');
check(Object.keys(TIPOS).length === 12, 'os 12 tipos têm texto');

console.log('— 5) só IP com conta vai para o grupo');
check(vaiParaOGrupo({ contas: [], nick: 'Fulano' }) === true, 'pedido com login (nick) → avisa');
check(vaiParaOGrupo({ contas: ['gol36930', 'jogador22276'], nick: null }) === true, 'sem login, mas o IP tem contas → avisa');
check(vaiParaOGrupo({ contas: ['dino (suspensa)'], nick: null }) === true, 'conta suspensa também conta');
check(vaiParaOGrupo({ contas: [], nick: null }) === false, 'robô da internet sem conta no IP → só log, nada no grupo');
check(vaiParaOGrupo({}) === false && vaiParaOGrupo() === false, 'sem dados → não avisa');

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
