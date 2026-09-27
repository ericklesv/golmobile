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
 * abre o corredor do meio. Medido com `scripts/demo-tabua-balance.js`: **o tiro reto no gol ENTRA**, 10,6% das
 * combinações de mira e força dão gol de primeira e há uma faixa contígua de 15° que funciona. As tábuas com prego
 * na boca ou no meio ficavam em 2,4% e o tiro reto batia num prego — a pessoa mirava no gol e não entendia por quê.
 */
const TABUA_ABERTA = [[118, 190], [96, 86], [204, 86], [46, 160], [254, 160]];
const board = makeBoard(TABUA_ABERTA, 'aberta', 'Aberta');
const CENTRO = { x: board.W / 2, y: board.H / 2 };
const partidas = new Map(); // id -> { ball, golsBot, expiresAt }

/** O bot RUIM (pedido do dono): mira no gol do jogador, mas erra muito o ângulo e a força. */
function peteleccoDoBot(ball) {
  const alvo = { x: board.W / 2, y: board.H + 10 }; // o gol que o bot ataca é o de baixo
  const ang = Math.atan2(alvo.y - ball.y, alvo.x - ball.x) + (Math.random() * 2 - 1) * 0.62; // ±35°
  const power = 0.3 + Math.random() * 0.45; // nunca a força cheia: a bola morre no meio do caminho
  return simulateFlick(ball, Math.cos(ang), Math.sin(ang), power, board);
}

router.get('/futprego', (_req, res) => {
  limpaVencidos();
  if (partidas.size >= MAX_LANCES) return res.status(503).json({ error: 'ocupado', message: 'Tente de novo em instantes.' });
  const id = randomBytes(12).toString('hex');
  partidas.set(id, { ball: { ...CENTRO }, golsBot: 0, expiresAt: Date.now() + TTL_MS });
  res.json({ id, board, ball: CENTRO, golsBot: 0 });
});

router.post('/futprego', (req, res) => {
  const { id, dx, dy, power } = req.body ?? {};
  const p = typeof id === 'string' ? partidas.get(id) : null;
  if (!p || p.expiresAt <= Date.now()) return res.status(400).json({ error: 'stale', message: 'Essa partida expirou.' });
  p.expiresAt = Date.now() + TTL_MS;

  // o peteleco do jogador: ele ataca o gol de CIMA (lado 0), e pode ser gol de primeira
  const meu = simulateFlick(p.ball, Number(dx) || 0, Number(dy) || -1, Number(power) || 0, board);
  p.ball = meu.goal ? { ...CENTRO } : meu.end;
  if (meu.goal === 'top') {
    partidas.delete(id); // fez o gol: a demonstração acabou, o resto é o convite
    return res.json({ meu: { frames: meu.frames, goal: 'top' }, bot: null, golsBot: p.golsBot, fim: 'gol' });
  }
  // gol contra conta para o bot, e a bola volta ao meio
  if (meu.goal === 'bottom') p.golsBot++;

  const bot = peteleccoDoBot(p.ball);
  p.ball = bot.goal ? { ...CENTRO } : bot.end;
  if (bot.goal === 'bottom') p.golsBot++;
  res.json({
    meu: { frames: meu.frames, goal: meu.goal },
    bot: { frames: bot.frames, goal: bot.goal },
    golsBot: p.golsBot, fim: null,
  });
});

export default router;
