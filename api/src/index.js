/**
 * BRGOL — API de jogo
 * Toda a lógica (sorteios, recargas, rankings, liga) roda aqui. Cliente só anima.
 */
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
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
import { ensureSeason } from './services/league.js';
import { startScheduler } from './services/scheduler.js';
import { attachCabecao, cabecaoStatus } from './realtime/cabecao.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true }));
app.use(express.json({ limit: '64kb' }));
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
app.get('/api/cabecao/status', (_req, res) => res.json(cabecaoStatus())); // fila do Cabeção (WebSocket em /api/ws/cabecao)
app.use('/api', game);

app.use((_req, res) => res.status(404).json({ error: 'not-found', message: 'Rota não encontrada.' }));

ensureSeason()
  .then(() => {
    startScheduler();
    const server = http.createServer(app);
    attachCabecao(server);
    server.listen(config.port, () => console.log(`brgol-api na porta ${config.port}`));
  })
  .catch((e) => {
    console.error('Falha ao iniciar a temporada:', e);
    process.exit(1);
  });
