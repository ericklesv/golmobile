# GolMobile — CLAUDE.md

Jogo de futebol estilo **BRGol** (clicker de gols com cooldown): o jogador escolhe um
time, chuta em intervalos e acumula gols em rankings. Alvo: **mobile (Expo) + navegador
(react-native-web)**. Roteiro completo em `BACKLOG.txt` (seguir a ordem das fases e
marcar itens feitos).

## Stack
- Expo 54 / React Native 0.81 / React 19 / TypeScript
- Firebase (plano GRATUITO/Spark): Auth (email/senha) + Firestore (projeto `futgol-acc08`)
- **Backend de jogo: Node/Express no Railway** (`server/`) com firebase-admin
  (decisão: sem Cloud Functions para não exigir plano Blaze)
- Navegação: react-navigation (stack + bottom tabs)

## Comandos
```
npm start            # Metro / Expo Go
npm run web          # versão navegador
cd server && npm start               # API local (precisa FIREBASE_SERVICE_ACCOUNT)
npx firebase-tools deploy --only firestore   # deploy rules+índices (gratuito, precisa login)

# publicar a versão WEB (grátis, Firebase Hosting → https://futgol-acc08.web.app):
npx expo export --platform web       # gera dist/ (gitignored)
npx firebase-tools deploy --only hosting
```
Dev apontando para API local: `EXPO_PUBLIC_API_URL=http://<ip-local>:3000 npx expo start`

## Arquitetura do jogo (IMPORTANTE)
**Toda a lógica de jogo roda no servidor** (`server/index.js`, hospedado no Railway):
sorteio de gol, validação de cooldown, incremento de rankings, feed de atividades.
O cliente **nunca** escreve resultado de jogo no Firestore — só chama a API via
`src/services/game.ts` (com o ID token do Firebase Auth no header) e anima o
resultado. As `firestore.rules` bloqueiam escrita direta em `users` (após criação),
`rankings` e `activities`. Não reintroduzir `Math.random()`/`updateDoc` de gols no cliente.

- `POST /kick { type: 'auto'|'falta'|'penalti', direction? }` → `{ goal, keeperDir, cooldownMs, kickedAt }`
- `POST /trail-pick { pickIndex }` → `{ mine, goal, finished, phase, lineMines, ... }`
  (layout de minas fica em `users/{uid}/private/trail`, ilegível pelo cliente)
- Erro de recarga: HTTP 429 `{ error: 'cooldown' }` (ver `isCooldownError`)
- `POST /admin/advance` (header `x-admin-key: ADMIN_KEY`): força encerrar a rodada
  atual — só para testes.

### Liga (Fase 1 — server/league.js)
Brasileirão do jogo. Cada gol de torcedor soma no placar do time na partida da
rodada (`incrementTeamMatch` roteia via ponteiro `teamMatch/{teamId}`).
- Coleções (todas só-leitura p/ cliente): `config/season` (temporada+rodada+
  `schedule` como MAPA `{ "1": [{home,away}...] }` — Firestore não aceita array
  aninhado), `matches/{s#r#m#}`, `standings/{seasonId}_{teamId}`, `teamMatch/{teamId}`,
  `seasonHistory/{seasonId}`.
- Rodada de 24h (`ROUND_DURATION_MS`, env p/ encurtar em teste); agendador
  `setInterval` encerra a rodada (empate se dif < 5% do líder; vitória 3 pts) e
  cria a próxima; ao fim das 15 rodadas coroa campeão e abre nova temporada.
- Cliente: `src/services/league.ts` (subscribeTeamMatch/Standings, fetchRoundMatches),
  placar ao vivo na Home, aba **Liga** (`LeagueScreen`).
- Railway: env var `FIREBASE_SERVICE_ACCOUNT` = JSON da service account
  (Firebase Console → Configurações → Contas de serviço → Gerar nova chave privada);
  Root Directory do serviço = `server`. URL do serviço fica em `API_URL` no
  `src/services/game.ts` (sobrescreve com `EXPO_PUBLIC_API_URL`).

### Regras do jogo
- Cooldowns: AUTO 1 min · Falta 5 min · Pênalti 10 min · Trilha 3 min
- Chance de gol: auto/falta 65%; pênalti = goleiro sorteia 1 de 3 cantos (66%);
  trilha = minado 3 linhas (defesa 4/1 mina, meio 3/1, ataque 3/2)
- Rankings: `rankings/{hour|round|season}/entries` com chaves `hourKey`/`roundKey`
  no fuso **America/Sao_Paulo** (`getCurrentHourKey/RoundKey` em `src/utils/gameLogic.ts`
  espelham `server/index.js` — manter os dois em sincronia!)
- Perfil (`users/{uid}`): `totalGoals`, `totalKicks`, `hourGoals`+`hourKey`,
  `roundGoals`+`roundKey`, `last*Time` por modo, `trailPosition`
- Presença online: heartbeat em `presence/{uid}.lastSeen` (60s), contagem via
  `getCountFromServer` (janela de 2 min)

## Estrutura
```
src/config/firebase.ts    # app, auth (persistência AsyncStorage no nativo), db
src/services/game.ts      # cliente da API de jogo — ÚNICO caminho para jogar
src/constants/teams.ts    # times, cooldowns (só para UI de countdown)
src/context/AuthContext.tsx
src/screens/              # Home (hub), Penalty, Trail (modais), Ranking, Profile, Login, Register
server/index.js           # API de jogo (Express + firebase-admin, Railway)
firestore.rules / firestore.indexes.json
```

## Design (Fase 2 — tema "Estádio à noite")
- Tokens em `src/theme/index.ts` (`colors`, `spacing`, `radius`, `font`, `glow`):
  noite azul + gramado #22E58A + cal #EDF4F3 + âmbar #FFC24B. **Nada de hex solto
  em tela nova — importar do theme.**
- Fontes (`App.tsx`): `font.poster` Anton, `font.score`/`scoreMed` Saira Condensed
  (numerais de placar), `font.body`/`bodyMed`/`bodyBold` Inter.
- Componentes reutilizáveis em `src/components/`: `NightBackground` (fundo padrão
  das telas), `TeamBadge` (escudo genérico — usar no lugar de `team.shield` emoji),
  `KickTarget` (alvo com anel SVG de cooldown), `Scoreboard` (placar ao vivo).
- Ícones: `@expo/vector-icons` (MaterialCommunityIcons). Migradas para o theme:
  Home, tab bar, Login, Registro, Rankings, Perfil, Liga, splash.
  **Pendente:** Pênalti e Trilha (telas de minigame com muita animação — pedem
  verificação visual rodando antes de redesenhar). Arte de ícone/splash (PNGs).
- Input temático reutilizável: `src/components/Field.tsx`.
- **Web:** `Alert.alert` NÃO renderiza no navegador — usar `useToast()` de
  `src/components/Toast.tsx` (`.toast(msg, type)` e `.confirm({...})`). Layout web
  é centralizado em `maxWidth: 480` (App.tsx, só `Platform.OS === 'web'`).
  Versão web publicada em https://futgol-acc08.web.app.

## Convenções e avisos
- Sempre atualizar este arquivo e o `BACKLOG.txt` ao concluir itens.
- Manter as regras de jogo de `server/index.js` em sincronia com
  `src/constants/teams.ts` (cooldowns) e `src/utils/gameLogic.ts` (chaves de janela).
- Índices compostos necessários (hourKey+goals, roundKey+goals) estão em
  `firestore.indexes.json` — deploy junto com as rules.
- `Alert.alert` não funciona no web (item 3.1 do backlog) — evitar em código novo.
- Web: sombras `shadow*` têm suporte parcial; testar glow no navegador.
