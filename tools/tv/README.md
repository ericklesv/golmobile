# /tv/ — cliente Unity WebGL do Frangaço (ManagolTV)

O jogo do Frangaço é o build WebGL do projeto Unity `ManagolTV` (mesmos packs 3D do JogaGol),
servido pelo nginx em `https://jogagol.com.br/tv/` a partir de `/var/www/brgol/tv` (fora do
repo e do deploy — 85 MB). Só o `index.html` fica versionado aqui.

Atualizar na VPS (pedir autorização antes, como sempre):
```
# página (leve): só o index.html
scp -i <chave> tools/tv/index.html root@187.127.17.121:/var/www/brgol/tv/index.html
# build novo do Unity (ManagolTV/BuildWebGL/Build/BuildWebGL.*): 4 arquivos, ~80 MB
scp -i <chave> -r <BuildWebGL>/Build root@187.127.17.121:/var/www/brgol/tv/
ssh -i <chave> root@187.127.17.121 "chmod -R a+rX /var/www/brgol/tv"
```
Troque o `?v=` dos 4 arquivos no `index.html` a cada build novo (cache do navegador).

Ponte de sessão: o wrapper `web/src/screens/Frangaco.tsx` manda o JWT por `postMessage`
(`managol-frangaco-auth`) e a página repassa ao Unity (`SendMessage('ManagolPenalty','SetAuth')`),
avisando `managol-tv-pronto` quando boota — contrato idêntico ao do Managol Flutter.
O Unity fala com `/api/frangaco/*` (`api/src/routes/frangacoTv.js`).

Rebuild do Unity (Windows, Unity 2021.3.45f1):
```
"C:\Users\guicp\UnityEditors\2021.3.45f1\Editor\Unity.exe" -batchmode -quit -buildTarget WebGL ^
  -projectPath "C:/Users/guicp/Documents/GitHub/ManagolTV" -executeMethod Managol.ManagolBuilder.BuildWebGL ^
  -logFile "C:/Users/guicp/Documents/GitHub/ManagolTV/build_webgl.log"
```
