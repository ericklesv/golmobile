// Gera web/public/sitemap.xml (auditoria de SEO, 25/09/2026): as páginas públicas + uma página por time
// (/time/<slug>, screens/PublicTeams.tsx). Os times vêm de api/src/data/teams.js — time novo = rodar de novo:
//   node web/scripts/gerar-sitemap.mjs        (da raiz do repositório)
// Fora do sitemap de propósito: /entrar, /cadastro e /bem-vindo (a /bem-vindo aponta o Google para "/").
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, '../../api/src/data/teams.js')).href);
const teams = mod.default ?? mod.TEAMS ?? Object.values(mod).find(Array.isArray);
const hoje = new Date().toISOString().slice(0, 10);
const BASE = 'https://jogagol.com.br';

const pages = [
  ['/', 'daily', '1.0'],
  ['/brgol', 'monthly', '0.9'],
  ['/times', 'weekly', '0.8'],
  ...teams.map((t) => [`/time/${t.slug}`, 'daily', '0.6']),
  ['/privacidade', 'yearly', '0.2'],
  ['/termos', 'yearly', '0.2'],
  ['/excluir-conta', 'yearly', '0.1'],
];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([p, f, pr]) => `  <url><loc>${BASE}${p}</loc><lastmod>${hoje}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(here, '../public/sitemap.xml'), xml);
console.log(`sitemap.xml: ${pages.length} endereços (${teams.length} times)`);
