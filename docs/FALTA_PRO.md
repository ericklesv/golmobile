# Falta PRO + Frangalho — design (13/09/2026)

Dois minigames novos pedidos pelo dono. Regras gerais que valem para ambos (CLAUDE.md):
**um minigame por vez, perfeito antes do próximo; minigame vencido dá exatamente 1 gol +
outro bônus; toda a lógica/sorteio no servidor, o cliente só anima.**

## Falta PRO (estilo Free Kick Classic / Free Kick Shooter)

Referência do dono: https://www.crazygames.com/game/free-kick-classic — câmera baixa atrás
da bola, você **arrasta** a bola e ela vai na direção/força do arrasto, com **efeito/curva**
desenhando um arco no gesto (como a curveball do Pokémon GO).

### Visão
- Cena 3D nova (react-three-fiber, assets existentes): câmera ~0,6 m atrás da **Trionda**
  (`/3d/trionda.glb`), gol ao fundo, barreira e goleiro com a **camisa do adversário**
  (kit composto + escudo — já pronto em `keeper.tsx`), aro de setas embaixo da bola
  (sprite do kit Layer Lab, como no print de referência).
- 5 cobranças por partida, 1 partida por dia (tabela `DailyGame`, kind novo `FALTAPRO`).

### Controle (o coração do jogo)
- O jogador arrasta a partir da bola: o rastro do dedo é gravado (lista de pontos + tempo).
- No soltar, o cliente resume o gesto em 3 números:
  - `dir` — ângulo horizontal/vertical do vetor final do arrasto;
  - `power` — velocidade média do gesto (px/ms normalizado pela tela);
  - `spin` — curvatura do rastro (desvio lateral médio em relação à reta início→fim).
    **A bola SEGUE o arco desenhado** (14/09/2026): desenhar um "Ɔ" (barriga pra direita)
    faz a bola sair aberta pra direita e voltar de curva pra mira; o vetor final do
    arrasto MIRA o ponto de chegada (o servidor compensa a deriva do Magnus — `spinComp`).
    Curva de última hora engana o goleiro (ele lê o chute em linha reta a partir da
    barreira) — **a curva é a arma principal**, como no Free Kick Classic.
- Réplica visual: o cliente só reproduz as amostras do voo que o SERVIDOR devolve —
  o arco aparece sozinho no replay (não há física de gol no front).

### Servidor (anti-cheat pela arquitetura)
- `POST /api/daily/faltapro/start`: gera os 5 cenários do dia do jogador (distância/ângulo
  da falta, nº de bonecos na barreira e se pulam, skill/posição do goleiro, alvos bônus
  nos cantos). Guarda em `DailyGame.state`.
- `POST /api/daily/faltapro/kick {dir, power, spin}`: valida limites (power/spin dentro da
  faixa física), roda a simulação determinística no servidor (trajetória + colisão com
  barreira/goleiro/trave/alvo) e responde `{outcome, trajectory}` para o cliente animar.
  O cliente NUNCA decide gol.
- Rate limit natural: 5 chutes por dia; captcha não precisa (já é 1 partida/dia).

### Recompensa (regra do 1 gol)
- 3+ gols nas 5 cobranças = **1 gol** (enum `KickKind` novo `FALTAPRO`) — nunca mais de 1.
- Bônus: +4 pontos de nível por cobrança convertida (máx. +20); acertar alvo bônus = +R$ 50.
- Slider: entrada em `MINIGAMES` (rules.js) — liberação sugerida nível 8 (o 7 ficou com o
  Hat Trick); reset às **19h** (próxima hora livre — o Hat Trick pegou as 18h).

### Fases de implementação
1. Protótipo do gesto + voo com curva numa rota `/debug-faltapro` (só visual).
2. Servidor: cenários do dia + simulação + validação (serviço `faltapro.js`).
3. Telas (Layout, slider, overlay de recompensa) + migração do enum.
4. Polimento: som, câmera acompanhando a bola, rede reagindo, replays.

## Frangaço (transposto do Managol — é "Frangaço", não "Frangalho")

O original vive no Managol Flutter (managol.com.br): lobby em
`Managol2.0/lib/features/minigames/frangaco/`, jogo 3D em **Unity WebGL**
(`ManagolTV`, aberto em `/tv/?mode=penalty`), regras no backend (`/frangaco/*`).
**Os packs 3D são os MESMOS do JogaGol** (FootballSimulator + Soccer Stadiums +
Soccer Players Uniforms) — lá o Unity toca as animações originais dos .fbx
(gkMergulho, gkRasteira, gkCentro, gkFalhou, gkPegou, comemoração + sons do pack).

### Mecânica original (frangaco_models.dart)
- **Duelo de pênaltis alternado**: você BATE e você DEFENDE, contra clubes reais
  sorteados, em **torneio mata-mata** (~4 fases). Só o campeão pontua; ranking por
  títulos; temporada de ~6 meses com prêmio e reset.
- **Cobrança**: mira contínua 0..1 no gol, com **finta** — existe `xAnunciado` e
  `xReal` (você anuncia um canto e pode bater no outro); a precisão do batedor
  espalha a bola (`xBola/yBola`); o goleiro IA pula (`xGk`).
- **Defesa**: um **alvo** aparece numa posição do gol e você tem uma **janela de
  reação em ms** (reflexo do goleiro) para tocar nele; não clicou ou errou = gol.
- Batedor/goleiro têm índices 0..1 (precisão / reflexo).

### Porte 1:1 via Unity (decisão do dono, 13/09/2026)
A primeira transposição (cena three.js própria, duelo espalhado por vários dias)
"ficou bem diferente e sequer funcional" — o dono quer **O JOGO DO MANAGOL**, que é
o cliente **Unity WebGL** pronto (`ManagolTV`, `/tv/?mode=penalty`). O porte então é:
- **O Unity é o jogo**; a API do JogaGol fala O CONTRATO dele em **`/api/frangaco/*`**
  (`api/src/routes/frangacoTv.js` + `services/frangaco.js` + `lib/frangaco.js`):
  `GET state` · `POST run|incoming|kick{xAnunciado,xReal|null}|save{ms,x?,y?}`.
  Contrato lido de `ManagolTV/Assets/Managol/ManagolPenalty.cs` (+`...Telas.cs`) e
  `Managol2.0/.../frangaco_models.dart` — motivos, kit `{shirt,shorts,socks}`
  (TraceKit.From), nomes das fases (`NomesFases`) e shapes de `state`/`run`.
- **Torneio INTEIRO numa sessão** (como o original): 5 fases contra clubes da MESMA
  série (sorteio no servidor, sem repetir), duelo de 5 cobranças alternadas com
  finta (`xAnunciado`/`xReal`; sem finta o goleiro quase sempre pega), morte súbita
  no empate. 1 torneio por dia (`DailyGame`, vira às 20h). Só o CAMPEÃO pontua:
  **1 gol** (kind `FRANGACO`) + R$ 500 + 20 de nível; eliminado = nada.
- No JogaGol não há elenco: o próprio jogador é o batedor E o goleiro
  (`precisao` da destreza, `reflexo` do nível 0,35–0,8); ranking de títulos por
  temporada da liga (agregação das linhas `DailyGame` com `champion`).
- Tela `web/src/screens/Frangaco.tsx` = WRAPPER: header do kit + `<iframe>` de
  `/tv/?mode=penalty&apiBase=<origem>`; o token vai por `postMessage`
  (`managol-frangaco-auth`, a cada 400 ms até `managol-tv-pronto`), nunca na URL.
  **Falta hospedar o build do ManagolTV em `/tv/` na VPS do JogaGol** (nginx).
- Escudos: o Unity só decodifica PNG — clubes com escudo SVG ficam sem escudo no
  jogo (fallback silencioso); lista PNG duplicada de `Shield.tsx` no serviço.
- Nome no JogaGol: **Frangaço** mesmo (marca já conhecida dos jogadores do Managol).

### Bônus descoberto no caminho
As animações originais do pack funcionam no Unity (ManagolTV). Dá para **exportar
os clipes bakeados de lá para glb** (script Editor no projeto ManagolTV) e fazer o
goleiro do JogaGol usar as MESMAS animações do Frangaço 3D — próximo passo natural
se os clipes procedurais atuais não agradarem.
