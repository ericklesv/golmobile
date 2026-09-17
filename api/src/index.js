/**
 * BRGOL — API de jogo
 * Toda a lógica (sorteios, recargas, rankings, liga) roda aqui. Cliente só anima.
 */
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { tg } from './lib/telegram.js';
import { prisma } from './prisma.js';
import { auth } from './routes/auth.js';
import { me } from './routes/me.js';
import { play } from './routes/play.js';
import { game } from './routes/game.js';
import { admin } from './routes/admin.js';
import { adminPanel } from './routes/adminPanel.js';
import { daily } from './routes/daily.js';
import { shop } from './routes/shop.js';
import { password } from './routes/password.js';
import { uploads } from './routes/uploads.js';
import { chat } from './routes/chat.js';
import { frangacoTv } from './routes/frangacoTv.js';
import { vip, pay } from './routes/vip.js';
import { club } from './routes/club.js';
import { pass } from './routes/pass.js';
import { referral } from './routes/referral.js';
import { inbox } from './routes/inbox.js';
import { account } from './routes/account.js';
import { ensureSeason } from './services/league.js';
import { startScheduler } from './services/scheduler.js';
import { attachCabecao, cabecaoStatus } from './realtime/cabecao.js';
import { attachX1, x1Status } from './realtime/x1.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } })); // cabeçalhos de segurança da API (fotos em /api/uploads são lidas pelo site)
app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true }));
app.use(express.json({ limit: '64kb' }));
/**
 * Corpo que não é JSON (17/09/2026): um jogador mandou multipart numa rota JSON e o body-parser derrubou o
 * pedido com um erro feio no log — e um aviso de erro no Telegram. Agora vira um 400 educado, sem barulho.
 */
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ error: 'bad-json', message: 'O pedido não está no formato esperado.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'too-large', message: 'Pedido grande demais.' });
  }
  return next(err);
});
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate-limit', message: 'Calma, craque! Muitas requisições.' } }));

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'brgol-api', database: true, time: Date.now() });
  } catch {
    res.status(500).json({ ok: false, database: false });
  }
});

app.use('/api/auth', auth);
app.use('/api/me', me);
app.use('/api/play', play);
app.use('/api/admin', admin);
app.use('/api/painel', adminPanel); // painel de admin (JWT + isAdmin)
app.use('/api/daily', daily);
app.use('/api/shop', shop);
app.use('/api/auth', password); // forgot / reset (recuperação de senha por e-mail)
app.use('/api/uploads', uploads);
app.use('/api/chat', chat);
app.use('/api/frangaco', frangacoTv); // contrato do cliente Unity do Frangaço (/tv/?mode=penalty)
app.use('/api/vip', vip);
app.use('/api/club', club);
app.use('/api/pass', pass);
app.use('/api/ref', referral);
app.use('/api/inbox', inbox); // caixa de mensagens do jogador
app.use('/api/pay', pay); // aviso de PIX da Efí (sem login)
app.use('/api/account', account); // exclusão de conta, bloqueios e denúncias (Play Store)
app.get('/api/cabecao/status', (_req, res) => res.json(cabecaoStatus())); // fila do Cabeção (WebSocket em /api/ws/cabecao)
app.get('/api/x1/status', (_req, res) => res.json(x1Status())); // X1: jogo do dia, desafios e partidas (WebSocket em /api/ws/x1)
app.get('/api/futprego/status', (_req, res) => res.json(x1Status())); // endereço antigo (FutPrego virou o X1)
app.use('/api', game);

app.use((_req, res) => res.status(404).json({ error: 'not-found', message: 'Rota não encontrada.' }));

ensureSeason()
  .then(() => {
    startScheduler();
    const server = http.createServer(app);
    attachCabecao(server);
    attachX1(server);
    server.listen(config.port, () => { console.log(`brgol-api na porta ${config.port}`); if (process.env.NODE_ENV === 'production') tg.info(`🚀 API subiu (pid ${process.pid}${process.env.GIT_COMMIT ? `, ${process.env.GIT_COMMIT.slice(0, 7)}` : ''})`); });
  })
  .catch((e) => {
    console.error('Falha ao iniciar a temporada:', e);
    tg.error(`API NÃO subiu: ${tg.esc(String(e?.message || e).slice(0, 300))}`);
    setTimeout(() => process.exit(1), 1500);
  });

// exceção fora das rotas: avisa e deixa o PM2 reiniciar
process.on('unhandledRejection', (e) => { console.error('[unhandledRejection]', e); tg.error(`unhandledRejection: ${tg.esc(String(e?.message || e).slice(0, 300))}`, { key: 'unhandled', every: 5 * 60_000 }); });
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e); tg.error(`uncaughtException (API vai reiniciar): ${tg.esc(String(e?.message || e).slice(0, 300))}`); setTimeout(() => process.exit(1), 1500); });
