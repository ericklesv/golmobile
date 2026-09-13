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
  - `spin` — curvatura do rastro (desvio lateral médio em relação à reta início→fim;
    desenhar um "C" dá efeito para a esquerda, um "Ɔ" para a direita).
- Réplica visual: a bola voa com Magnus simplificado — aceleração lateral ∝ `spin`,
  gravidade fixa — a MESMA fórmula do servidor, para o replay bater com o resultado.

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
- Slider: entrada em `MINIGAMES` (rules.js) — liberação sugerida nível 7 (entre Alvo 6 e
  Baú 9); reset às **18h** (próxima hora livre — regra "cada minigame numa hora própria").

### Fases de implementação
1. Protótipo do gesto + voo com curva numa rota `/debug-faltapro` (só visual).
2. Servidor: cenários do dia + simulação + validação (serviço `faltapro.js`).
3. Telas (Layout, slider, overlay de recompensa) + migração do enum.
4. Polimento: som, câmera acompanhando a bola, rede reagindo, replays.

## Frangalho (transposto do Managol — MECÂNICA A CONFIRMAR)

**Atenção:** não existe "Frangalho" em nenhum repo do Managol (procurei em
`Managol/src`, `managol-frontend`, `managol-backend`, `managol-discord-bot` e
`Managol2.0` — nada). Antes de implementar, o Guilherme precisa descrever a mecânica
original. Proposta adaptada ao JogaGol enquanto isso (tema "frango"):

- **Você é o goleiro** (o inverso do pênalti): câmera atrás do gol, chutes vêm em
  sequência; uma dica visual rápida (olhar do batedor/posição do corpo) sugere o canto.
- Toque/arraste para o canto = mergulho (os clipes de salto em arco do `keeper.tsx`
  servem direto, com a câmera invertida).
- Cada defesa soma; levar um **frango** (bola fraca no meio que você não segurou)
  encerra na hora. Dificuldade sobe: chutes mais rápidos, fintas.
- 1 partida/dia; N defesas seguidas = **1 gol** + pontos de nível por defesa.
- Reaproveita: cena do pênalti, clipes do goleiro, Trionda, kit do adversário no batedor.
