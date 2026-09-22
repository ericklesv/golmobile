import { PrismaClient } from '@prisma/client';
import { tg } from './lib/telegram.js';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

/**
 * A conexão com o Postgres caiu no meio de uma consulta: P1017 "Server has closed the connection", 57P01
 * "terminating connection due to administrator command", P1001 "Can't reach database server". Acontece quando o
 * Postgres reinicia — em 22/09/2026 às 03:23 foi o unattended-upgrades (atualização de segurança do Ubuntu)
 * trocando a libxml2 e o needrestart reiniciando o postgresql@17-main (2 s fora). O Prisma reconecta sozinho na
 * consulta seguinte; quem pegou o erro (scheduler, bots, rota) avisa com `avisarDbDropped` em vez do 🔴 genérico.
 */
export function dbDropped(e) {
  if (['P1001', 'P1002', 'P1008', 'P1017'].includes(e?.code)) return true;
  return /Server has closed the connection|terminating connection due to administrator command|57P01|Can't reach database server|ECONNREFUSED|ECONNRESET|Connection terminated/i.test(String(e?.message || e));
}

/** Um aviso só a cada 10 min, venha de onde vier (bots, scheduler, rota). */
export function avisarDbDropped(onde, e) {
  console.warn(`[banco] conexão caiu no meio de ${onde}: ${String(e?.message || e).trim().split(/\r?\n/).pop()}`);
  tg.warn(`🗄️ Postgres reiniciou no meio de <b>${tg.esc(onde)}</b> — a API reconectou sozinha na consulta seguinte, ninguém precisa fazer nada. Costuma ser a atualização automática do sistema (entre 3h e 4h); fora desse horário, olhar <code>journalctl -u postgresql@17-main</code>.`, { key: 'db-dropped', every: 10 * 60_000 });
}
