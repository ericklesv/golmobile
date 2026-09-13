import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/core'; const bounds = getBounds;
const io = new NodeIO();
const OUT = process.argv[2];
async function load(n) { return io.read(`${OUT}/${n}.glb`); }
function bb(node){ const b=bounds(node); return b.min.map(v=>+v.toFixed(3)).join(',')+' → '+b.max.map(v=>+v.toFixed(3)).join(','); }
for (const n of ['gk_mesh','ball','goal','st080_stadium','st080_people','st080_line']) {
  const d = await load(n); const r = d.getRoot();
  console.log(`\n### ${n}: nodes=${r.listNodes().length} skins=${r.listSkins().length} anims=${r.listAnimations().length}`);
  console.log('scene bbox', bb(r.listScenes()[0]));
  if (n==='gk_mesh') { console.log('joints:', r.listSkins()[0]?.listJoints().map(j=>j.getName()).join(' ')); }
  if (n.startsWith('st080') || n==='goal') for (const node of r.listNodes()) { const m=node.getMesh(); if(!m) continue; console.log(' node', node.getName(), 'T', node.getTranslation().map(v=>+v.toFixed(3)), 'S', node.getScale().map(v=>+v.toFixed(3)), 'R', node.getRotation().map(v=>+v.toFixed(3))); for (const p of m.listPrimitives()) { const pos=p.getAttribute('POSITION'); const mn=pos.getMin([]),mx=pos.getMax([]); console.log('   prim mat=', p.getMaterial()?.getName(), 'bbox', mn.map(v=>+v.toFixed(3)).join(','), '→', mx.map(v=>+v.toFixed(3)).join(',')); } }
}
for (const n of ['anim_goalkeeper_diving_save','anim_goalkeeper_idle_normal','anim_gkjump','anim_gkmiss','anim_gk_ballsave_low']) {
  const d = await load(n); const r=d.getRoot(); const a=r.listAnimations()[0];
  const targets=[...new Set(a.listChannels().map(c=>c.getTargetNode()?.getName()))];
  const dur=Math.max(...a.listSamplers().map(s=>s.getInput().getMax([])[0]));
  console.log(`\n### ${n}: dur=${dur.toFixed(2)}s targets(${targets.length}):`, targets.slice(0,12).join(' '), '...', 'nodes in file:', r.listNodes().length);
}
