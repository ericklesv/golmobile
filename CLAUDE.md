# JogaGol (antigo BRGOL) — CLAUDE.md

## O que é
**Nome do jogo: JogaGol** (logo em `web/public/brand/logo-{v,h}.webp`; domínio **jogagol.com.br**).
Port 1:1 do **BRGOL** (jogo de navegador brasileiro de 2008–2013, falido) para os tempos
modernos: mobile-first, PWA, "cara de jogo". Você escolhe um clube, faz gols (chute direto
automático, pênalti, falta, trilha), cada gol soma no placar do time na rodada de 24h, e
disputa a artilharia da hora/rodada/temporada. Todas as regras originais estão em
**`docs/BRGOL_ORIGINAL.md`** (fonte da verdade — consultar antes de mudar qualquer número).
Roadmap em `docs/ROADMAP.md`.

Produção: **https://jogagol.com.br** (VPS do Managol; `www.` e `brgol.managol.com.br` redirecionam 301 para lá).
Repo: https://github.com/ericklesv/golmobile (branch `main` = prod; deploy manual via SSH, **sem GitHub Actions**).

## Stack
| Camada | Tecnologia |
|---|---|
| `api/` | Node 20 ESM · Express 5 · Prisma 6 · PostgreSQL (banco `brgol`, mesmo servidor PG do Managol) |
| `web/` | Vite 5 · React 18 · TypeScript · Tailwind 3 · framer-motion · react-three-fiber/three (cenas 3D do pênalti e da falta) · zustand · vite-plugin-pwa |
| Infra | Nginx (site `brgol`) · PM2 (`brgol-api`, porta 4310, usuário `brgol`) · Certbot · deploy = `ssh root@VPS 'bash /usr/local/bin/brgol-deploy.sh'` |

`legacy-expo/` = esqueleto antigo (Expo + Firebase + Railway). Não é usado; será apagado
depois que o novo estiver estável. Não instalar nada dele.

## Arquitetura (IMPORTANTE)
- **Toda lógica de jogo roda na API** (`api/src/services/play.js`): sorteio, recargas
  (reserva atômica via `updateMany` — sem corrida), dinheiro, rankings, placar da partida.
  O cliente só anima o resultado. Nunca reintroduzir `Math.random()` de gol no front.
- Regras/números: `api/src/lib/rules.js` (recargas, dinheiro, chances, níveis, prêmios).
  **Chutes (direto, pênalti, falta, trilha) liberados para todos desde o nível 0** (decisão do
  dono, 13/09/2026: travar desanimava); **só os minigames travam por nível** (`MINIGAMES.unlock`).
  O front lê tudo via `GET /api/meta` — **não duplicar constantes no `web/`**.
- Liga: `api/src/services/league.js` — temporada, rodadas de 24h que fecham às **19:00
  (America/Sao_Paulo)**, round-robin determinístico por série, fechamento de hora/rodada
  com prêmios e recordes, acesso/rebaixamento (2 sobem/2 caem), nova temporada automática.
  Agendador: `scheduler.js` (tick a cada 30 s + disparo extra no segundo exato do fechamento;
  1 instância PM2 só). **Fechamento sem corrida:** `settleRound` encerra as partidas e lê o
  placar final num único `UPDATE … RETURNING`; `applyResult` só soma gol em partida `LIVE`
  (se fechou no meio do chute, o gol vai para a rodada nova) — não voltar a ler e encerrar
  em passos separados (o gol do instante do fechamento ficava no placar e fora da tabela).
  **Ordem da tabela = `standingOrder`** (pontos, saldo, gols pró, nome), a MESMA na tela, na
  página do time e no título/acesso/rebaixamento. **Prêmio de time** (campeão/vice, VIP de
  `PRIZES.team`): vai para quem marcou pelo menos 1 gol pelo time na temporada (decisão do
  dono; só estar no time não conta — trocar de time é livre). Gols da hora/rodada/temporada do jogador
  ficam gravados até o próximo gol dele: na tela, sempre via `periodGoals` (`view.js`).
  **Mexeu na liga? Rode `node scripts/sim-liga.js`** (pasta api/, só banco LOCAL, schema
  `liga_sim` criado e apagado por ele): temporada inteira de 30 rodadas + virada, com gols no
  instante do fechamento; ~7 mil conferências, tem de dar 0 falha.
- Auto-chute: o cliente dispara `POST /api/play/auto` quando o timer zera com a aba aberta
  (igual ao original, que exigia estar logado). Heartbeat `POST /api/me/heartbeat` a cada 60 s.
- Tempo: contadores do front usam `serverTime` (offset em `useAuth.now()`); não confiar no
  relógio do celular.
- **Janela de "subiu de nível"** (`components/LevelUp.tsx`, montada no App para quem está logado; pedido do
  dono, 13/09/2026): vigia `me.level.lvl`; o último nível visto fica no aparelho (`localStorage`
  `brgol.nivelVisto.<id>`, gravado só quando a janela aparece). Mostra o nível novo, "LIBERADO X! JOGAR
  AGORA" para cada minigame do catálogo (`meta.minigames`, sem os "em breve") e "Nova habilidade" (skills
  de `LEVELS` que não começam com "Libera"). 1ª vez no aparelho só anota (sem janela de níveis antigos).
- **Nível = pontos de nível = `goalsTotal + levelBonus`** (o bônus vem dos minigames diários).
  No servidor, use sempre `levelOf(user)` (`rules.js`) — nunca `levelFor(user.goalsTotal)`,
  senão o bônus some (desbloqueios, rebote, nerf, recarga da trilha). O front mostra
  `me.levelPoints` na barra de nível.
- **Minigames diários** (`services/daily.js`, tabela `DailyGame`): 1 partida por jogador,
  por jogo, por dia. **Cada minigame vira numa hora própria** (decisão do dono, 13/09/2026: sempre
  ter algum renovando) — `RESET_HOUR` em `rules.js`: **Termo 0h, Quiz 12h, Estatísticas 13h,
  Memória 14h, De que time é? 15h, Camisas 16h, Alvo no Gol 17h, Hat Trick 18h**; jogo novo pega a
  próxima hora livre (19h…), nunca repetir hora. Termo/Quiz/Estatísticas usam `dayNumber`/`quizDayNumber`/
  `statsDayNumber`; os outros, `dayNumberAt(hora)`/`nextResetAt(hora)` (`time.js`: o nº do dia é
  a data em que a janela TERMINA — por isso a troca da meia-noite para a hora nova não tirou nem
  deu partida a ninguém). Textos de "já jogou" usam `resetLabel(jogo)` ("renova às 14h"). A Home mostra o **slider horizontal de minigames**
  (`MinigameSlider.tsx`, dados de `GET /api/daily/hub`): catálogo em `MINIGAMES` (`rules.js`)
  com o **nível que libera cada um** (Termo 0, Quiz 0, Party 1, Memória 2, Estatísticas 3,
  De que time é? 4, Camisas 5, Alvo no Gol 6, Hat Trick 7, Baú 9, Embaixadinhas 12, Disputa 1x1 15); `soon: true` =
  card "EM BREVE". O nível também é conferido no servidor ao começar (403 `locked`).
  Minigame novo: entrada em `MINIGAMES` (tirar o `soon`) + `DAILY_GAMES` + `calendar()` +
  serviço + tela; o gol dele pede um valor novo no enum `KickKind` (migração). **Regras do
  dono (13/09/2026): um minigame por vez, perfeito e funcional antes do próximo; TODO
  minigame vencido dá exatamente 1 gol + outro bônus (nível, dinheiro…), nunca mais de 1 gol;**
  **EXCEÇÕES de propósito: o Camisas e o Hat Trick** (decisões do dono, 13/09/2026): o Camisas dá
  1 gol a cada 4 camisas certas e segue até errar; no Hat Trick cada gol é gol do time até perder as
  3 vidas — vários gols no dia; não "corrigir" para 1 gol.
  o slider vem ordenado do servidor: disponíveis primeiro (começado na frente), depois os já
  jogados pelo que volta antes, depois bloqueados por nível, por fim "em breve". Party GoL:
  R$ 150 por vitória e o gol só na primeira vitória do dia (senão dinheiro compraria gols). Fora de produção,
  `TERMO_DAY=<n>` / `QUIZ_DAY=<n>` forçam o dia (teste da virada).
- **Quiz do dia** (`lib/quiz/`): 5 perguntas de 4 alternativas, 20 s cada. O relógio é do
  servidor (começa no `POST next`; estourou + 2,5 s de tolerância = erro); alternativas
  embaralhadas por jogador; a certa só vai ao cliente depois da resposta. Cada acerto +6 de
  nível; 3+ acertos = 1 gol normal (kind `QUIZ`); não dá dinheiro. Perguntas em `q-*.js`
  (`a[0]` é a correta — só fatos certos e estáveis); o calendário é `ORDER` em
  `questions.js`: **pergunta nova entra no fim de `ORDER`**. 172 perguntas = 34 dias.
- **Loja** (`lib/items.js` = catálogo estático + efeitos; `services/shop.js`; tabelas `UserItem`
  com validade/nível/equipada/consumida e `ShopLog`): Energia do chute nv 1–5 (−10 %/nível na
  recarga de pênalti/falta/trilha, 28 h), Boost Auto (−60 s no chute direto, 28 h), Caneleira
  (última linha da trilha; gasta quando a trilha termina na última linha), Chuteiras (+2 % a +10 %
  em pênalti/falta, 30 dias, só uma equipada), troca de nick, cor do nick (`User.nickColor`, nível 8+).
  Os efeitos entram por `cooldownFor` (rules.js → `applyItemCooldown`), `bootBonus` nas chances e
  `shinGuard` no layout da trilha — **o usuário precisa vir com `items`**: carregue com
  `meInclude()` (items.js) em tudo que vira `meView`. Preços/regras: só em `items.js`.
- **Captcha** (`lib/captcha.js`): a cada 10 chutes manuais o `/api/me` manda `captchaRequired`;
  o chute seguinte (pênalti/falta/início de trilha) precisa de `{captchaId, answer}` de
  `GET /api/play/captcha` (senão HTTP 428 `{error:'captcha'}`). Desafios em memória (1 instância).
  Só contas fáceis de somar/subtrair (números até 10, decisão do dono). **Uma conta aberta por
  jogador** (pedir de novo devolve a mesma; `?nova=1` troca), vale **30 min** (a recarga é 10) e,
  acertou, o chute pendente fica liberado mesmo se for recusado (recarga) — não voltar a
  "gastar" a conta antes do chute sair (era o bug de a conta se repetir mesmo acertando).
  Tela: o jogador responde e toca em **ENVIAR** (`POST /api/play/captcha {captchaId, answer}` →
  `{ok}` ou `{ok:false, message, captcha: próxima}`); acertou, a caixa some; errou, vem outra conta.
  Não voltar a ter botão "Outra" (jogador achava que era confirmar e ficava trocando de conta).
- **Senha** (`routes/password.js`): `forgot` sempre 200; token SHA-256 de uso único (1 h) em
  `PasswordReset`; e-mail via Nodemailer (`SMTP_*`, `MAIL_FROM`, `PUBLIC_WEB_URL`); sem SMTP, loga o link.
- **Termo do dia** (`lib/termo/`): 5 letras, 6 tentativas; a palavra **nunca** vai para o
  cliente antes do fim (nem no JSON). Acertar = 1 gol normal (`applyResult` com kind `TERMO`:
  placar, artilharia, lances) + pontos de nível pela tentativa (`TERMO.levelPoints`, 30→5);
  não dá dinheiro. Respostas em `answers.js` (a lista do Termo do Corujão, 46 dias à frente,
  + 21 palavras do dono intercaladas): **palavra nova entra no fim**, antes do dia #114
  (03/01/2027). Dicionário em `palavras.txt` (resposta fora do léxico entra lá, à mão).
- **Estatísticas** (`services/stats.js`, `lib/stats/`; nível 3): "quem tem mais X?" entre dois
  jogadores do **Brasileirão 2024** (dados reais da API-Football em
  `lib/stats/brasileirao-2024.json`; o jogo NÃO chama a API) + **duelos do dono**
  (`lib/stats/curated.js`: história do Brasileirão, torcidas etc., ~30% dos pares; `better:
  'low'` quando o menor vence; `note` = linha de fonte/temporada). Acertou, segue; errou,
  acaba. **Uma partida por dia**, sem jogar pelo recorde (decisão do dono): +3 de nível por
  acerto (até +30) e 5 seguidos = 1 gol (kind `STATS`); a maior sequência fica em
  `User.statsBest`. Par e números ficam no servidor; a tela só recebe os números depois de
  escolher. Filtro de confiança em `data.js` (8+ jogos, 180+ min, sem dado zerado; fora quem
  aparece em 2 times). Atualizar dados: `node scripts/import-stats.js <temporada>` na pasta
  api/ com `API_FOOTBALL_KEY` no `api/.env` **local** (nunca no git/VPS). Plano grátis: 100
  req/dia, só 2022–2024 e 3 páginas por consulta (por isso vai time por time, ~65 req).
- **Camisas** (`services/camisas.js`, tela `Camisas.tsx`, camisa desenhada em `Jersey.tsx` nas
  cores do time; nível 5, vira às 16h): maior ou menor. Sequência de 4 camisas de 1 a 11
  sem repetir (sorteio `crypto.randomInt`); a 1ª aparece, o jogador diz se a próxima é maior
  ou menor. Acertou as 4 = 1 gol (kind `CAMISAS`) e começa outra sequência; errou, acaba o
  dia. **Vários gols no dia** (exceção do dono à regra de 1 gol). +3 de nível por acerto (até
  +30). Gol e nível entram na hora; as camisas escondidas ficam só no servidor; abrir a tela
  (GET) não cria o registro do dia (o hub só mostra CONTINUAR depois de começar).

- **Hat Trick** (`lib/hattrick.js` = física pura; `services/hattrick.js`; tela `Hattrick.tsx`; nível 7,
  vira às 18h): chute de longe visto de cima (metros; gol em y = 0). A bola aparece fora da área
  (20–34 m), com vento de 0–5 m/s. Mira = estilingue (toca na bola e puxa pra trás); a **força só muda a
  velocidade** (bola lenta sofre mais vento e dá tempo pro goleiro). Batida = tela de lado com a bola
  grande quicando: toque NA bola — lado esquerdo vai pra direita e vice-versa (desvio + curva), embaixo
  sobe (muito embaixo = por cima; mais longe sobe mais), fora da bola = furou. Goleiro (reação,
  velocidade, leitura e "frango" sorteados no servidor por lance, nunca vão à tela) pula; no ângulo o
  alcance é menor. 3 vidas; gol = 1 gol do time (kind `HATTRICK`) + 5 de nível (até 30); o 3º gol é o
  hat trick. O servidor decide e devolve o voo (amostras [x, y, z] a 30/s) para a tela animar.
  Calibrar: `node scripts/hattrick-balance.js` (bom ~34% de gol, médio ~15%, iniciante ~7%).
  Teste local sem limite: `MINIGAMES_LIVRES=1` no `api/.env` do PC (ignorado com NODE_ENV=production) —
  acabou, aparece "Jogar de novo". Nunca pôr no .env da VPS.

## Endpoints
`POST /api/auth/register|login|forgot{email}|reset{token,password}` · `GET /api/me` (inclui `items`, `nickColor`, `captchaRequired`) · `GET /api/me/opponent` (adversário da rodada — cores/escudo para o kit 3D) · `POST /api/me/heartbeat|buy-dexterity|activate-vip|change-team|nerf/:nick` · `PUT /api/me/bio`
`POST /api/play/auto|penalty{direction}|foul{direction}|trail{index}|party` (+`captchaId`,`answer` quando `captchaRequired`) · `GET /api/play/captcha` · `POST /api/play/captcha{captchaId,answer}`
`GET /api/shop` · `POST /api/shop/buy{key,currency}|equip{key}|nick{nick}|nick-color{color}` (loja; catálogo também em `/api/meta.items`)
`POST /api/uploads/avatar` (multipart `avatar`, ≤5 MB, PNG/JPG/WEBP/GIF) · `DELETE /api/uploads/avatar` · arquivos em `/api/uploads/avatars/*`
`GET /api/players/active` (24 h)
`GET /api/daily|daily/hub|daily/termo|daily/quiz|daily/memoria|daily/qualtime|daily/alvo|daily/stats|daily/camisas|daily/hattrick` · `POST /api/daily/termo/guess{word,day}|daily/quiz/next{day}|daily/quiz/answer{index,choice,day}|daily/memoria/flip{index,day}|daily/qualtime/next{day}|daily/qualtime/answer{index,choice,day}|daily/alvo/shot{index,day}|daily/stats/start|daily/stats/pick{side}|daily/camisas/start|daily/camisas/guess{guess:maior|menor}|daily/hattrick/start|daily/hattrick/shoot{i,dirX,dirY,power,strike:{sx,sy}|null}` (minigames)
`GET /api/chat/:room?after=` · `POST /api/chat/:room{text,color?}` (salas `geral` e `time`; cor só do nível 8; 3 s entre mensagens; sem links)
`GET /api/meta|home?team=|rankings/:scope|league|league/rounds/:n|league/titles|teams|teams/:slug|players/:nick|players/search?q=|feed`
`POST /api/admin/advance-round|close-hour|vip|money|level|reset-daily{nick}|ban` (header `x-admin-key`)
Erros: JSON `{error, message}`; recarga = HTTP 429 `{error:'cooldown', remainingMs}`.

## Comandos
```
# api
cd api && npm install && npx prisma migrate deploy && npm run seed && npm start
# web (build de verificação — não rodamos servidor local por padrão)
cd web && npm install && npm run build      # tsc --noEmit + vite build
# VPS
sudo -u brgol pm2 logs brgol-api --lines 100
bash /usr/local/bin/brgol-deploy.sh          # forçar deploy manual
```
Env da API em `/var/www/brgol/app/api/.env` (ver `api/.env.example`). Segredos nunca no repo.
Uploads (fotos de perfil) ficam em `UPLOADS_DIR=/var/www/brgol/uploads` (fora do repo, dono `brgol`),
servidos pelo próprio Express em `/api/uploads/`.

## Regras de trabalho (valem para todo mundo e toda IA no projeto)
- **Commit + push em `main` a cada alteração concluída** (não acumular trabalho local): o
  outro colaborador precisa sempre ter a versão atual pelo git. Commits em PT-BR.
- **O jogo roda SOMENTE na VPS do Managol** (`root@187.127.17.121`, projeto em
  `/var/www/brgol/app`). Não existe ambiente local nem outra hospedagem. Todo deploy é
  `bash /usr/local/bin/brgol-deploy.sh` na VPS, rodado manualmente via SSH (faz `git reset --hard
  origin/main`, `npm ci`, `prisma migrate deploy`, build do web e `pm2 restart brgol-api`).
  Não há CI: push no GitHub não dispara nada.
- Antes de qualquer comando na VPS: mostrar o comando e pedir autorização.
- Verificação visual = build (`cd web && npm run build`) + screenshot de produção com Edge
  headless/puppeteer-core (ver `tools/`); se não der para ver, dizer que não viu.
- Próximos passos combinados estão em **`docs/ROADMAP.md` → "Próximos passos"**. Seguir a ordem.
- Referência do concorrente (o que copiar/adaptar/descartar): `docs/CONCORRENTE_BRGOL_ONLINE.md`.
- UI: telas dentro do `Layout` (header + 6 abas: Jogar, Liga, Rankings, Loja, Time, Perfil);
  o header leva ao perfil e mostra dinheiro e VIP. Rolagem por arraste no PC é global
  (`web/src/lib/dragScroll.ts`) — botões que não podem iniciar arraste usam a classe `no-drag`.

## Para o colaborador (ericklesv) e sua IA
- Tudo que o jogo **já usa** está no git: sprites do kit em `web/public/ui/`, escudos em
  `web/public/escudos/`, modelos 3D em `web/public/3d/`. Para **peças novas** do pack Layer Lab
  (menu novo, popup, ícone), a biblioteca completa fica em `assets/layerlab/` (no repo se ele for
  privado; senão distribuída por fora e gitignored) — receita de recorte 9-slice e tabela de
  fatias em `docs/SPRITES_LAYERLAB.md`. Packs 3D da Unity ficam só na máquina do Guilherme;
  `tools/3d/README.md` gera os `.glb` que entram no repo.
- **Não usamos GitHub Actions** (removido em 13/09/2026). Deploy é sempre manual, pela VPS:
  `ssh -i <chave> root@187.127.17.121 'bash /usr/local/bin/brgol-deploy.sh'` — depois conferir
  `https://jogagol.com.br/api/health`. Push no git **não** publica nada sozinho.
- **Acesso à VPS (necessário para deployar; precisa da intervenção do Guilherme):**
  1. Gerar uma chave: `ssh-keygen -t ed25519 -C "erick-brgol" -f ~/.ssh/id_ed25519_brgol`
  2. Enviar para o Guilherme SOMENTE o conteúdo de `~/.ssh/id_ed25519_brgol.pub`
     (nunca a chave privada).
  3. O Guilherme adiciona a chave em `/root/.ssh/authorized_keys` na VPS.
  4. Testar: `ssh -i ~/.ssh/id_ed25519_brgol root@187.127.17.121 'bash /usr/local/bin/brgol-deploy.sh'`
  A VPS é compartilhada com o Managol e outros projetos (nginx, PM2, Postgres): mexer só em
  `/var/www/brgol`, `/etc/nginx/sites-available/brgol`, PM2 `brgol-api` e banco `brgol`.
  Enquanto não tiver acesso, faça o push e peça ao Guilherme para rodar o deploy.
- Segredos da API (`api/.env` na VPS) nunca vão para o git; `ADMIN_KEY` está lá para os
  endpoints `/api/admin/*`.

## Convenções
- PT-BR em UI, commits (`tipo(escopo): descrição`), logs e mensagens de erro.
- **Visual = kit "BRGOL Casual"** em `web/src/index.css`: sprites 9-slice do pack Layer Lab
  *GUI Pro – Casual Game* (licenciado; fonte em `IdleFM/client/Assets/Layer Lab`, cópia usada
  em `web/public/ui/`). Classes: `.btn .btn-{orange,green,blue,sky,yellow,red,gray,white}`
  `.btn-{lg,md,sm}`, `.panel`, `.panel-navy`, `.card-*`, `.ribbon ribbon-*`, `.trap trap-*`,
  `.resbar`, `.bar`, `.field`, `.toast`, `.menu-btn`, texto `.t-display .t-out .t-gold .t-green .t-red`.
  Fatias vêm dos `.meta` do Unity (ordem CSS: top right bottom left) — deixar sempre ≥2px de
  miolo (caps que somam a largura toda não renderizam no CSS). Fontes: Lilita One + Nunito.
  Fundo: céu + gramado (`.app-frame` + `.stadium-bg`). **Nada de emoji nem "cara de site/IA"**
  (glassmorphism escuro, gradientes neon): botão é sprite, título é ribbon, ícone é PNG do pack.
- Escudos reais em `web/public/escudos/<slug>.svg|png` (projeto privado para amigos);
  `Shield.tsx` renderiza `<img>` com fallback de sigla.
- 3D: modelos glTF em `web/public/3d/` gerados dos packs comprados via `tools/3d/` (README lá).
  `scenes/models.tsx` (estádio, trave, bola = **Trionda** `trionda.glb`) e `scenes/keeper.tsx`
  (jogador com clipes procedurais de salto em arco + **uniforme composto em runtime**:
  `kit-mask.png` + `kit-ao.png` + cores + escudo no peito). Goleiro e barreira vestem a camisa
  do **adversário da rodada** (`GET /api/me/opponent`; sem partida, kit padrão amarelo/vermelho).
  Rota oculta `/debug3d?view=&pose=&at=&badge=&c1=&c2=` para conferir por screenshot.
  **Temporário:** MVGIC sem recarga de pênalti/falta (`COOLDOWN_FREE_NICKS`, rules.js).
- Trilha: a bola é `components/TrailBall.tsx` (arte SVG cartoon no traço do kit + animação por
  requestAnimationFrame; o rastro é pintado por ela). Não usar `motion.g animate={{ x, y }}`
  dentro do `<svg>` da Trilha: a bola antiga, feita assim, nunca se moveu (ficava presa no
  canto 0,0 do campo).
- Termo: casas `.tile tile-{slot,now,typed,correct,present,absent}` (Label_Round01_White e
  item-*) e teclas `.key key-{correct,present,absent,kick}` (Button01_195) em `index.css`.
  Cores: verde = letra no lugar, laranja = em outro lugar, cinza = não tem.
- Antes de mexer em produção/servidor: mostrar o comando e pedir autorização.
- Ao concluir itens, atualizar `docs/ROADMAP.md` e este arquivo.
