/**
 * Demonstração jogável da tela de entrada — o FutPrego que dá para jogar SEM CONTA (27/09/2026).
 *
 * Por que existe: em 26/09 o Google Ads trouxe 11 pessoas ao site; 5 abriram a tela de cadastro e NENHUMA enviou o
 * formulário, enquanto a base geral converte 70% de quem abre o cadastro. Quem vem de anúncio chega frio e não
 * entrega e-mail e senha antes de ver se o jogo presta — então agora ela joga primeiro. O dono pediu o FutPrego
 * "com um mapa mais aberto e que o usuário consiga até fazer gol de primeira se acertar bem", contra um bot ruim.
 *
 * **É o FutPrego de verdade**: a mesma `lib/futprego.js` do X1, com a MESMA física determinística — a regra da casa
 * vale aqui (a lógica roda na API, a tela só anima os quadros que o servidor manda).
 *
 * O que ela NÃO faz: não tem login, não toca no banco, não conta gol para ninguém, não dá dinheiro nem ponto de
 * nível e não entra em ranking. O gol daqui não existe para o jogo — é uma amostra, e a tela diz isso.
 *
 * As partidas ficam em memória (1 instância PM2, como o captcha e o resto): reiniciou, a tela pede outra. Cada uma
 * vale 3 minutos, renovados a cada peteleco.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { makeBoard, simulateFlick } from '../lib/futprego.js';

const router = Router();

const TTL_MS = 3 * 60_000;
const MAX_LANCES = 5000;

function limpaVencidos() {
  const agora = Date.now();
  for (const [k, v] of partidas) if (v.expiresAt <= agora) partidas.delete(k);
}

// a página inicial é pública e vira alvo de robô: 40 chamadas/min por IP dão de sobra para jogar
router.use(rateLimit({
  windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate-limit', message: 'Muitos chutes seguidos. Aguarde um pouco.' },
}));

// ─────────────────────────────── FutPrego da tela de entrada ───────────────────────────────
/**
 * Tábua ABERTA, só da demonstração (dono, 27/09/2026: "um mapa mais aberto e que o usuário consiga até fazer gol de
 * primeira se acertar bem"). NÃO entra em `LAYOUTS` do futprego.js: aquilo alimenta o sorteio das partidas de
 * verdade do X1, e mexer lá mudaria o jogo de todo mundo.
 *
 * `shape` conta o y a partir do PRÓPRIO gol; `makeBoard` espelha para o outro lado. São **5 pregos por time** em vez
 * dos 11–13 das tábuas de verdade, **nenhum na frente da boca** e o central deslocado para o lado (x=118) — é o que
 * abre o corredor do meio. Conferido por `scripts/demo-tabua-balance.js`.
 */
const TABUA_ABERTA = [[118, 190], [96, 86], [204, 86], [46, 160], [254, 160]];
const board = makeBoard(TABUA_ABERTA, 'aberta', 'Aberta');
const CENTRO = { x: board.W / 2, y: board.H / 2 };
const partidas = new Map(); // id -> { ball, golsBot, gks, expiresAt }

/**
 * GOLEIROS (pedido do dono, 27/09/2026: "precisa do goleiro no futprego"). Cada gol tem uma peça redonda na boca
 * que a bola bate como se fosse um prego (`opts.extra` em lib/futprego.js) e que MUDA DE LUGAR a cada peteleco —
 * é o que dá a sensação de adversário defendendo. Ele cobre parte da boca, nunca ela inteira: sobra passagem dos
 * dois lados, senão o gol de primeira que o dono pediu deixaria de existir.
 */
const GK = { r: 9, recuo: 17, margem: 11 };
const gkX = () => {
  const [a, b] = board.goalX;
  const min = a + GK.r + GK.margem, max = b - GK.r - GK.margem;
  return Math.round(min + Math.random() * (max - min));
};
const novosGoleiros = () => ({
  top: { x: gkX(), y: GK.recuo, r: GK.r },              // defende o gol de cima (o que o jogador ataca)
  bottom: { x: gkX(), y: board.H - GK.recuo, r: GK.r }, // defende o gol de baixo (o que o bot ataca)
});
const comoExtra = (gks) => [gks.top, gks.bottom];

/**
 * O bot: ruim de propósito (pedido do dono), mas **joga de verdade** — o erro de ±35° da primeira versão fazia ele
 * marcar GOL CONTRA, o que parecia bobo. Agora erra ±18° e a direção é forçada para baixo (o gol que ele ataca),
 * então a bola nunca sai rumo ao próprio gol. A força continua curta: ele quase sempre para no meio do caminho.
 */
function peteleccoDoBot(ball, gks) {
  const alvo = { x: board.W / 2, y: board.H + 10 };
  const base = Math.atan2(alvo.y - ball.y, alvo.x - ball.x);
  const ang = base + (Math.random() * 2 - 1) * 0.31; // ±18°
  let dx = Math.cos(ang), dy = Math.sin(ang);
  if (dy <= 0.12) dy = 0.12 + Math.random() * 0.2; // nunca chuta para o próprio gol
  const power = 0.42 + Math.random() * 0.4;
  return simulateFlick(ball, dx, dy, power, board, { extra: comoExtra(gks) });
}

router.get('/futprego', (_req, res) => {
  limpaVencidos();
  if (partidas.size >= MAX_LANCES) return res.status(503).json({ error: 'ocupado', message: 'Tente de novo em instantes.' });
  const id = randomBytes(12).toString('hex');
  const gks = novosGoleiros();
  partidas.set(id, { ball: { ...CENTRO }, golsBot: 0, gks, expiresAt: Date.now() + TTL_MS });
  res.json({ id, board, ball: CENTRO, golsBot: 0, keepers: gks });
});

router.post('/futprego', (req, res) => {
  const { id, dx, dy, power } = req.body ?? {};
  const p = typeof id === 'string' ? partidas.get(id) : null;
  if (!p || p.expiresAt <= Date.now()) return res.status(400).json({ error: 'stale', message: 'Essa partida expirou.' });
  p.expiresAt = Date.now() + TTL_MS;

  // o peteleco do jogador: ele ataca o gol de CIMA (lado 0), e pode ser gol de primeira
  const gksMeu = p.gks;
  const meu = simulateFlick(p.ball, Number(dx) || 0, Number(dy) || -1, Number(power) || 0, board, { extra: comoExtra(gksMeu) });
  p.ball = meu.goal ? { ...CENTRO } : meu.end;
  if (meu.goal === 'top') {
    partidas.delete(id); // fez o gol: a demonstração acabou, o resto é o convite
    return res.json({ meu: { frames: meu.frames, goal: 'top' }, bot: null, golsBot: p.golsBot, keepersMeu: gksMeu, keepersBot: null, keepers: gksMeu, fim: 'gol' });
  }
  if (meu.goal === 'bottom') p.golsBot++; // gol contra do jogador conta para o bot

  const gksBot = novosGoleiros(); // entre os dois petelecos os goleiros se mexem
  const bot = peteleccoDoBot(p.ball, gksBot);
  p.ball = bot.goal ? { ...CENTRO } : bot.end;
  if (bot.goal === 'bottom') p.golsBot++;
  // gol contra do BOT é gol do jogador: com a mira nova quase não acontece, mas se acontecer vale
  const meuPeloBot = bot.goal === 'top';
  if (meuPeloBot) partidas.delete(id);
  else p.gks = novosGoleiros();
  res.json({
    meu: { frames: meu.frames, goal: meu.goal },
    bot: { frames: bot.frames, goal: bot.goal },
    golsBot: p.golsBot, keepersMeu: gksMeu, keepersBot: gksBot, keepers: p.gks ?? gksBot,
    fim: meuPeloBot ? 'gol' : null,
  });
});

export default router;