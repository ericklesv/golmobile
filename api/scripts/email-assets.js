/**
 * Gera as imagens dos e-mails em web/public/email/ (servidas em https://jogagol.com.br/email/…).
 * E-mail não mostra SVG nem WebP (Gmail, Outlook): logo, ícones do kit e escudos viram PNG aqui.
 * Rodar de novo quando entrar time novo ou mudar o logo: `node scripts/email-assets.js` (pasta api/).
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const PUB = new URL('../../web/public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(PUB, 'email');
mkdirSync(join(OUT, 'escudos'), { recursive: true });

// tamanho 2x do que o e-mail desenha (telas de alta densidade)
const square = (src, px) => sharp(src, { density: 300 })
  .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9, palette: true });

await sharp(join(PUB, 'brand/logo-h.webp')).resize(480).png({ compressionLevel: 9 }).toFile(join(OUT, 'logo.png'));

const ICONS = {
  'vip.png': 'ui/ico-crown_silver.png',
  'check.png': 'ui/check-green.png',
  'recarga.png': 'ui/ico-energy.png',
  'x1.png': 'ui/ico-x1.svg',
  'drible.png': 'ui/ico-badge.png',
  'trofeu.png': 'ui/ico-trophy_m.png',
};
for (const [out, src] of Object.entries(ICONS)) await square(join(PUB, src), 112).toFile(join(OUT, out));

let n = 0;
for (const f of readdirSync(join(PUB, 'escudos'))) {
  const m = f.match(/^(.+)\.(svg|png)$/);
  if (!m) continue;
  await square(join(PUB, 'escudos', f), 128).toFile(join(OUT, 'escudos', `${m[1]}.png`));
  n++;
}
console.log(`ok: logo, ${Object.keys(ICONS).length} ícones e ${n} escudos em ${OUT}`);
