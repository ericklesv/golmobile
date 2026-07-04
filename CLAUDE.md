# GolMobile — CLAUDE.md

Jogo de futebol estilo **BRGol** (clicker de gols com cooldown): o jogador escolhe um
time, chuta em intervalos e acumula gols em rankings. Alvo: **mobile (Expo) + navegador
(react-native-web)**. Roteiro completo em `BACKLOG.txt` (seguir a ordem das fases e
marcar itens feitos).

## Stack
- Expo 54 / React Native 0.81 / React 19 / TypeScript
- Firebase: Auth (email/senha), Firestore, **Cloud Functions** (projeto `futgol-acc08`)
- Navegação: react-navigation (stack + bottom tabs)

## Comandos
```
npm start            # Metro / Expo Go
npm run web          # versão navegador
cd functions && npm install          # 1ª vez
npx firebase-tools deploy --only functions,firestore   # deploy backend (precisa login + plano Blaze)
```

## Arquitetura do jogo (IMPORTANTE)
**Toda a lógica de jogo roda nas Cloud Functions** (`functions/index.js`):
sorteio de gol, validação de cooldown, incremento de rankings, feed de atividades.
O cliente **nunca** escreve resultado de jogo no Firestore — só chama as callables via
`src/services/game.ts` e anima o resultado. As `firestore.rules` bloqueiam escrita
direta em `users` (após criação), `rankings` e `activities`. Não reintroduzir
`Math.random()`/`updateDoc` de gols no cliente.

- `kick({ type: 'auto'|'falta'|'penalti', direction? })` → `{ goal, keeperDir, cooldownMs, kickedAt }`
- `trailPick({ pickIndex })` → `{ mine, goal, finished, phase, lineMines, ... }`
  (layout de minas fica em `users/{uid}/private/trail`, ilegível pelo cliente)

### Regras do jogo
- Cooldowns: AUTO 1 min · Falta 5 min · Pênalti 10 min · Trilha 3 min
- Chance de gol: auto/falta 65%; pênalti = goleiro sorteia 1 de 3 cantos (66%);
  trilha = minado 3 linhas (defesa 4/1 mina, meio 3/1, ataque 3/2)
- Rankings: `rankings/{hour|round|season}/entries` com chaves `hourKey`/`roundKey`
  no fuso **America/Sao_Paulo** (`getCurrentHourKey/RoundKey` em `src/utils/gameLogic.ts`
  espelham `functions/index.js` — manter os dois em sincronia!)
- Perfil (`users/{uid}`): `totalGoals`, `totalKicks`, `hourGoals`+`hourKey`,
  `roundGoals`+`roundKey`, `last*Time` por modo, `trailPosition`
- Presença online: heartbeat em `presence/{uid}.lastSeen` (60s), contagem via
  `getCountFromServer` (janela de 2 min)

## Estrutura
```
src/config/firebase.ts    # app, auth (persistência AsyncStorage no nativo), db, functions
src/services/game.ts      # wrappers das callables — ÚNICO caminho para jogar
src/constants/teams.ts    # times, cooldowns (só para UI de countdown)
src/context/AuthContext.tsx
src/screens/              # Home (hub), Penalty, Trail (modais), Ranking, Profile, Login, Register
functions/index.js        # lógica de jogo server-side
firestore.rules / firestore.indexes.json
```

## Convenções e avisos
- Sempre atualizar este arquivo e o `BACKLOG.txt` ao concluir itens.
- Índices compostos necessários (hourKey+goals, roundKey+goals) estão em
  `firestore.indexes.json` — deploy junto com as rules.
- Cloud Functions exigem plano **Blaze** no projeto Firebase.
- `Alert.alert` não funciona no web (item 3.1 do backlog) — evitar em código novo.
- Web: sombras `shadow*` têm suporte parcial; testar glow no navegador.
