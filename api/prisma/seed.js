// Seed idempotente: cria/atualiza os 48 times. Rodar após `prisma migrate deploy`.
import { PrismaClient } from '@prisma/client';
import { TEAMS } from '../src/data/teams.js';

const prisma = new PrismaClient();

for (const t of TEAMS) {
  await prisma.team.upsert({
    where: { slug: t.slug },
    create: { slug: t.slug, name: t.name, abbr: t.abbr, state: t.state, colorPrimary: t.c1, colorSecondary: t.c2, stadium: t.stadium, serie: t.serie },
    // não sobrescreve a série (muda com acesso/rebaixamento)
    update: { name: t.name, abbr: t.abbr, state: t.state, colorPrimary: t.c1, colorSecondary: t.c2, stadium: t.stadium },
  });
}
console.log(`Seed: ${TEAMS.length} times ok.`);
await prisma.$disconnect();
