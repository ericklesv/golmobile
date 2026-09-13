# Pipeline 3D (packs da Unity Asset Store → glTF para o BRGOL)

Fontes (comprados/licenciados, cache em `%APPDATA%\Unity\Asset Store-5.x`):
- **Soccer Stadiums Extension Pack** (Game Asset Studio) → `stadium.glb` (st_080: estádio + torcida + linhas + seguranças)
- **Football Soccer Simulator** (EsnetSoftware) → `goal.glb` (Goalnet3 + goalNet2.png) e `keeper.glb` (Player_Mobile_Mesh)
- **Soccer Players Uniforms Extension Pack** (Game Asset Studio) → `ball.glb` (st_ball_000)

Passos (Windows, Git Bash):
```
npm i fbx2gltf@0.9.7-p1 @gltf-transform/{core,extensions,functions,cli}@4.5.0 sharp   # numa pasta de trabalho
node extrair-unitypackage.mjs "<pacote>.unitypackage" <saida> fbx,png,jpg,tga,mat,prefab
# copiar as texturas para a pasta do .fbx e converter:
FBX2glTF.exe -i modelo.fbx -o out/modelo.glb -b
node build3d.mjs <out> <pasta st_080 com pngs> <goalNet2.png> ../../web/public/3d
```
Notas:
- FBX2glTF descarta texturas no slot *TransparentColor* e exporta `baseColorFactor` preto
  em materiais só-textura — o `build3d.mjs` religa as texturas pelo nome do material e força branco.
- As animações do Football Simulator não batem com o rig da malha (ficam deformadas);
  o goleiro é animado por poses procedurais em `web/src/scenes/keeper.tsx`.
- Sistema de coordenadas no jogo: linha do gol em z=0, campo cresce em +z, metros.
  Estádio: escala 100, posição z=55. Trave: rotação Y 90°, z=-1. Bola: raio 0,21 (2x real).
