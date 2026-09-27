/**
 * Demonstração jogável da tela de entrada — o chute de longe que dá para dar SEM CONTA (27/09/2026).
 *
 * Por que existe: em 26/09 o Google Ads trouxe 11 pessoas ao site; 5 abriram a tela de cadastro e NENHUMA enviou o
 * formulário, enquanto a base geral converte 70% de quem abre o cadastro. Quem vem de anúncio chega frio e não
 * entrega e-mail e senha antes de ver se o jogo presta — então agora ela joga primeiro. O dono pediu que fosse
 * "algo mais interativo como o Hat Trick", com UM gol só: feito o gol, a tela convida a criar a conta.
 *
 * **É o Hat Trick de verdade**: a mesma `lib/hattrick.js` da partida diária, com o MESMO sorteio de lance e a MESMA
 * simulação — a regra da casa vale aqui também (a lógica de jogo roda na API, o cliente só anima o resultado, e o
 * goleiro daquele chute nunca vai para a tela).
 *
 * O que ela NÃO faz: não tem login, não toca no banco, não gasta vida, não conta gol para ninguém e não dá dinheiro
 * nem ponto de nível. O gol daqui não existe para o jogo — é uma amostra, e a tela diz isso ao jogador.
 *
 * Os lances ficam em memória (1 instância PM2, como o captcha e o resto): reiniciou, o cliente pede outro. Cada
 * lance vale por 3 minutos e por UM chute só — sem isso, dava para pedir um lance e simular mil chutes em cima
 * dele até achar a mira que faz gol.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { newShot, simulate } from '../lib/hattrick.js';

const router = Router();

const TTL_MS = 3 * 60_000;
const MAX_LANCES = 5000;
const lances = new Map(); // id -> { shot, expiresAt }

function limpaVencidos() {
  const agora = Date.now();
  for (const [k, v] of lances) if (v.expiresAt <= agora) lances.delete(k);
}

// a página inicial é pública e vira alvo de robô: 40 chamadas/min por IP dão de sobra para jogar
router.use(rateLimit({
  windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate-limit', message: 'Muitos chutes seguidos. Aguarde um pouco.' },
}));

/** Sorteia um lance e guarda o goleiro no servidor. A tela recebe só onde a bola está e o vento. */
router.get('/hattrick', (_req, res) => {
  limpaVencidos();
  if (lances.size >= MAX_LANCES) return res.status(503).json({ error: 'ocupado', message: 'Tente de novo em instantes.' });
  const shot = newShot(Math.random);
  const id = randomBytes(12).toString('hex');
  lances.set(id, { shot, expiresAt: Date.now() + TTL_MS });
  res.json({ id, ball: shot.ball, wind: shot.wind });
});

/** Resolve o chute com a física do jogo e devolve o voo para a tela animar. O lance morre aqui. */
router.post('/hattrick', (req, res) => {
  const { id, dirX, dirY, power, strike } = req.body ?? {};
  const lance = typeof id === 'string' ? lances.get(id) : null;
  if (!lance || lance.expiresAt <= Date.now()) {
    return res.status(400).json({ error: 'stale', message: 'Esse chute expirou. Mire de novo.' });
  }
  lances.delete(id); // um chute por lance
  const ok = strike && typeof strike === 'object' && Number.isFinite(Number(strike.sx)) && Number.isFinite(Number(strike.sy));
  const r = simulate(lance.shot, {
    dirX: Number(dirX) || 0,
    dirY: Number(dirY) || 0,
    power: Number(power) || 0,
    strike: ok ? { sx: Number(strike.sx), sy: Number(strike.sy) } : null,
  });
  res.json({ result: r.result, flight: { T: r.T, samples: r.samples, cross: r.cross, keeper: r.keeper } });
});

export default router;
