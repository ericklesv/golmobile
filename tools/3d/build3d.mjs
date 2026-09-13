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

// ── goleiro + animações ────────────────────────────────────────────────────
{
  const gk = await rd('gk_mesh');
  const root = gk.getRoot();
  const nodeByName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const anims = [
    ['anim_goalkeeper_idle_normal', 'idle'],
    ['anim_goalkeeper_diving_save', 'dive'],
    ['anim_gkjump', 'jump'],
    ['anim_gkmiss', 'miss'],
    ['anim_gk_ballsave_low', 'save_low'],
  ];
  for (const [file, name] of anims) {
    const src = await rd(file);
    const srcAnim = src.getRoot().listAnimations()[0];
    const anim = gk.createAnimation(name);
    let kept = 0, dropped = 0;
    for (const ch of srcAnim.listChannels()) {
      const tgt = nodeByName.get(ch.getTargetNode()?.getName());
      if (!tgt) { dropped++; continue; }
      // só rotações (mantém o comprimento dos ossos da malha); translação apenas no quadril
      if (ch.getTargetPath() === 'translation' && tgt.getName() !== 'Hips') { dropped++; continue; }
      if (ch.getTargetPath() === 'scale') { dropped++; continue; }
      const s = ch.getSampler();
      const input = s.getInput(), output = s.getOutput();
      const inAcc = gk.createAccessor().setType(input.getType()).setArray(input.getArray().slice());
      const outAcc = gk.createAccessor().setType(output.getType()).setArray(output.getArray().slice());
      const sampler = gk.createAnimationSampler().setInput(inAcc).setOutput(outAcc).setInterpolation(s.getInterpolation());
      const channel = gk.createAnimationChannel().setTargetNode(tgt).setTargetPath(ch.getTargetPath()).setSampler(sampler);
      anim.addSampler(sampler).addChannel(channel);
      kept++;
    }
    console.log(`  ${name}: ${kept} canais (${dropped} descartados)`);
  }
  // material único: cor definida em runtime (uniforme do goleiro)
  for (const m of root.listMaterials()) m.setName('kit').setBaseColorFactor([0.9, 0.9, 0.9, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
  await gk.transform(unpartition(), dedup(), prune(), resample(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  await io.write(`${OUT}/keeper.glb`, gk);
  console.log('keeper.glb ok');
}
