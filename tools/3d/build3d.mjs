// Monta os GLBs finais do BRGOL a partir das conversões FBX2glTF:
//   stadium.glb  = st_080 estádio + torcida + linhas + seguranças (texturas religadas)
//   goal.glb     = trave + rede (Football Simulator) com textura da rede
//   ball.glb     = bola (Soccer Players Uniforms)
//   keeper.glb   = malha do jogador + 5 animações de goleiro (retarget por nome de osso)
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, textureCompress, mergeDocuments, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';
import { readFileSync } from 'fs';

const [,, IN, TEX_STAD, TEX_NET, OUT] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const rd = (n) => io.read(`${IN}/${n}.glb`);

function setTexture(doc, matName, pngPath, opts = {}) {
  const mat = doc.getRoot().listMaterials().find((m) => m.getName() === matName);
  if (!mat) { console.warn('material não encontrado:', matName); return; }
  const tex = doc.createTexture(matName).setImage(readFileSync(pngPath)).setMimeType('image/png');
  mat.setBaseColorTexture(tex);
  if (opts.alpha) mat.setAlphaMode(opts.alpha).setAlphaCutoff(0.5);
  if (opts.double) mat.setDoubleSided(true);
  if (opts.unlit !== false) mat.setRoughnessFactor(1).setMetallicFactor(0);
}

async function optimize(doc, maxSize = 1024) {
  await doc.transform(
    unpartition(), dedup(), prune(), resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxSize, maxSize], quality: 82 }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );
}

// ── estádio ────────────────────────────────────────────────────────────────
{
  const st = await rd('st080_stadium');
  setTexture(st, 'st_080_bg_stand', `${TEX_STAD}/st_080_bg_stand.png`);
  for (const m of st.getRoot().listMaterials()) { m.setRoughnessFactor(1).setMetallicFactor(0); if (m.getAlphaMode() === 'BLEND') m.setAlphaMode('MASK').setAlphaCutoff(0.5); }
  // FBX2glTF descarta texturas no slot TransparentColor → religa pelo nome do material
  const people = await rd('st080_people');
  setTexture(people, 'st_080_people_000', `${TEX_STAD}/st_080_people_000.png`, { alpha: 'MASK', double: true });
  const line = await rd('st080_line');
  setTexture(line, 'st_080_bg_line', `${TEX_STAD}/st_080_bg_line.png`, { alpha: 'MASK' });
  const sec = await rd('st080_security');
  setTexture(sec, 'st_080_bg_security', `${TEX_STAD}/st_080_bg_security.png`, { alpha: 'MASK', double: true });
  mergeDocuments(st, people); mergeDocuments(st, line); mergeDocuments(st, sec); const merged = st;
  // FBX2glTF exporta baseColorFactor preto para materiais só-textura → branco
  for (const m of merged.getRoot().listMaterials()) m.setBaseColorFactor([1, 1, 1, 1]);
  // une as cenas numa só
  const scenes = merged.getRoot().listScenes();
  const main = scenes[0];
  for (const s of scenes.slice(1)) { for (const n of s.listChildren()) main.addChild(n); s.dispose(); }
  await optimize(merged, 1024);
  await io.write(`${OUT}/stadium.glb`, merged);
  console.log('stadium.glb ok');
}

// ── trave ──────────────────────────────────────────────────────────────────
{
  const g = await rd('goal');
  setTexture(g, 'Net', TEX_NET, { alpha: 'MASK', double: true });
  for (const m of g.getRoot().listMaterials()) m.setBaseColorFactor([1, 1, 1, 1]);
  for (const m of g.getRoot().listMaterials()) if (m.getName().startsWith('Sticks')) m.setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.5).setMetallicFactor(0.1);
  await optimize(g, 512);
  await io.write(`${OUT}/goal.glb`, g);
  console.log('goal.glb ok');
}

// ── bola ───────────────────────────────────────────────────────────────────
{
  const b = await rd('ball');
  for (const m of b.getRoot().listMaterials()) m.setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6).setMetallicFactor(0);
  await optimize(b, 512);
  await io.write(`${OUT}/ball.glb`, b);
  console.log('ball.glb ok');
}

// ── goleiro ────────────────────────────────────────────────────────────────
// Sem animações do pack: as poses são procedurais (web/src/scenes/keeper.tsx).
// UVs preservados (keepAttributes) para a textura do uniforme composta em runtime.
{
  const gk = await rd('gk_mesh');
  for (const m of gk.getRoot().listMaterials()) m.setName('kit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
  await gk.transform(unpartition(), dedup(), prune({ keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  await io.write(`${OUT}/keeper.glb`, gk);
  console.log('keeper.glb ok (UVs preservados, sem animações)');
}

// ── uniforme (máscara + AO para compor a textura em runtime) ───────────────
// TEX_KIT = pasta PlayerModel/Textures do Football Simulator. Regiões extras
// pintadas na máscara (descobertas pelos pesos dos ossos LeftFoot/RightFoot e
// Left/RightHand): verde = chuteira, magenta = luva. O runtime (keeper.tsx)
// troca azul→cor primária, vermelho→secundária, verde→chuteira, magenta→luva,
// cinza→cabelo, preto→pele, e multiplica pelo AO.
const TEX_KIT = process.argv[6];
if (TEX_KIT) {
  const rect = (x0, y0, x1, y1, color) => ({
    input: { create: { width: x1 - x0, height: y1 - y0, channels: 4, background: color } }, left: x0, top: y0,
  });
  await sharp(`${TEX_KIT}/KitSchemas/KitMask4.png`).resize(512, 512, { kernel: 'nearest' })
    .composite([
      rect(12, 123, 44, 198, '#00ff00'), rect(399, 466, 476, 477, '#00ff00'), // chuteiras
      rect(269, 404, 316, 467, '#ff00ff'), // luvas
    ])
    .png({ palette: true, colors: 16 }).toFile(`${OUT}/kit-mask.png`);
  await sharp(`${TEX_KIT}/PlayerAO.png`).resize(512, 512).grayscale().png({ compressionLevel: 9 }).toFile(`${OUT}/kit-ao.png`);
  console.log('kit-mask.png + kit-ao.png ok');
}
