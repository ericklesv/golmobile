/**
 * Extrai um .unitypackage (tar.gz: <guid>/pathname + <guid>/asset) para uma
 * pasta, reconstruindo os caminhos originais. Filtra por extensão.
 *
 *   node tools/extrair-unitypackage.mjs "<pacote.unitypackage>" <saida> [png,jpg,...]
 */
import { execSync } from 'child_process';
import { mkdirSync, readdirSync, readFileSync, copyFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

const [,, pacote, saida, exts = 'png'] = process.argv;
if (!pacote || !saida) { console.error('uso: node extrair-unitypackage.mjs <pacote> <saida> [exts]'); process.exit(1); }
const filtro = new Set(exts.toLowerCase().split(','));

const tmp = join(tmpdir(), 'up-' + Date.now());
mkdirSync(tmp, { recursive: true });
console.log('extraindo tar →', tmp);
// --force-local: o tar do Git Bash interpreta "C:" como host remoto sem isso
execSync(`tar --force-local -xzf "${pacote}" -C "${tmp}"`, { stdio: 'inherit' });

let n = 0;
for (const guid of readdirSync(tmp)) {
  const pDir = join(tmp, guid);
  const pPath = join(pDir, 'pathname');
  const pAsset = join(pDir, 'asset');
  if (!existsSync(pPath) || !existsSync(pAsset)) continue;
  const caminho = readFileSync(pPath, 'utf8').split('\n')[0].trim();
  const ext = caminho.split('.').pop()?.toLowerCase() || '';
  if (!filtro.has(ext)) continue;
  const destino = join(saida, caminho.replace(/^Assets\//, ''));
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(pAsset, destino);
  n++;
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${n} arquivos extraídos para ${saida}`);
