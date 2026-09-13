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
  O front lê tudo via `GET /api/meta` — **não duplicar constantes no `web/`**.
- Liga: `api/src/services/league.js` — temporada, rodadas de 24h que fecham às **19:00
  (America/Sao_Paulo)**, round-robin determinístico por série, fechamento de hora/rodada
  com prêmios e recordes, acesso/rebaixamento (2 sobem/2 caem), nova temporada automática.
  Agendador: `scheduler.js` (tick a cada 30 s; 1 instância PM2 só).
- Auto-chute: o cliente dispara `POST /api/play/auto` quando o timer zera com a aba aberta
  (igual ao original, que exigia estar logado). Heartbeat `POST /api/me/heartbeat` a cada 60 s.
- Tempo: contadores do front usam `serverTime` (offset em `useAuth.now()`); não confiar no
  relógio do celular.
- **Nível = pontos de nível = `goalsTotal + levelBonus`** (o bônus vem dos minigames diários).
  No servidor, use sempre `levelOf(user)` (`rules.js`) — nunca `levelFor(user.goalsTotal)`,
  senão o bônus some (desbloqueios, rebote, nerf, recarga da trilha). O front mostra
  `me.levelPoints` na barra de nível.
- **Minigames diários** (`services/daily.js`, tabela `DailyGame`): 1 partida por jogador,
  por jogo, por dia. Cada um vira num horário: **Termo à meia-noite**, **Quiz ao meio-dia**
  (Brasília; `dayNumber`/`nextMidnight` e `quizDayNumber`/`nextNoon` em `time.js`), a
  **Memória dos Escudos à meia-noite**. A Home mostra o **slider horizontal de minigames**
  (`MinigameSlider.tsx`, dados de `GET /api/daily/hub`): catálogo em `MINIGAMES` (`rules.js`)
  com o **nível que libera cada um** (Termo 0, Quiz 0, Party 1, Memória 2, De que time é? 4,
  Alvo no Gol 6, Baú 9, Embaixadinhas 12, Disputa 1x1 15); `soon: true` = card "EM BREVE".
  Minigame novo: entrada em `MINIGAMES` (tirar o `soon`) + `DAILY_GAMES` + `calendar()` +
  serviço + tela; o gol dele pede um valor novo no enum `KickKind` (migração). **Regras do
  dono (13/09/2026): um minigame por vez, perfeito e funcional antes do próximo; TODO
  minigame vencido dá exatamente 1 gol + outro bônus (nível, dinheiro…), nunca mais de 1 gol;**
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
- **Senha** (`routes/password.js`): `forgot` sempre 200; token SHA-256 de uso único (1 h) em
  `PasswordReset`; e-mail via Nodemailer (`SMTP_*`, `MAIL_FROM`, `PUBLIC_WEB_URL`); sem SMTP, loga o link.
- **Termo do dia** (`lib/termo/`): 5 letras, 6 tentativas; a palavra **nunca** vai para o
  cliente antes do fim (nem no JSON). Acertar = 1 gol normal (`applyResult` com kind `TERMO`:
  placar, artilharia, lances) + pontos de nível pela tentativa (`TERMO.levelPoints`, 30→5);
  não dá dinheiro. Respostas em `answers.js` (a lista do Termo do Corujão, 46 dias à frente,
  + 21 palavras do dono intercaladas): **palavra nova entra no fim**, antes do dia #114
  (03/01/2027). Dicionário em `palavras.txt` (resposta fora do léxico entra lá, à mão).

## Endpoints
`POST /api/auth/register|login|forgot{email}|reset{token,password}` · `GET /api/me` (inclui `items`, `nickColor`, `captchaRequired`) · `POST /api/me/heartbeat|buy-dexterity|activate-vip|change-team|nerf/:nick` · `PUT /api/me/bio`
`POST /api/play/auto|penalty{direction}|foul{direction}|trail{index}|party` (+`captchaId`,`answer` quando `captchaRequired`) · `GET /api/play/captcha`
`GET /api/shop` · `POST /api/shop/buy{key,currency}|equip{key}|nick{nick}|nick-color{color}` (loja; catálogo também em `/api/meta.items`)
`POST /api/uploads/avatar` (multipart `avatar`, ≤5 MB, PNG/JPG/WEBP/GIF) · `DELETE /api/uploads/avatar` · arquivos em `/api/uploads/avatars/*`
`GET /api/players/active` (24 h)
`GET /api/daily|daily/hub|daily/termo|daily/quiz|daily/memoria|daily/qualtime|daily/alvo` · `POST /api/daily/termo/guess{word,day}|daily/quiz/next{day}|daily/quiz/answer{index,choice,day}|daily/memoria/flip{index,day}|daily/qualtime/next{day}|daily/qualtime/answer{index,choice,day}|daily/alvo/next{day}|daily/alvo/hit{index,day}` (minigames)
`GET /api/chat/:room?after=` · `POST /api/chat/:room{text,color?}` (salas `geral` e `time`; cor só do nível 8; 3 s entre mensagens; sem links)
`GET /api/meta|home?team=|rankings/:scope|league|league/rounds/:n|league/titles|teams|teams/:slug|players/:nick|players/search?q=|feed`
`POST /api/admin/advance-round|close-hour|vip|money|level|ban` (header `x-admin-key`)
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
  `scenes/models.tsx` (estádio, trave, bola) e `scenes/keeper.tsx` (jogador com poses
  procedurais). Rota oculta `/debug3d?view=&pose=` para conferir por screenshot.
- Trilha: a bola é `components/TrailBall.tsx` (arte SVG cartoon no traço do kit + animação por
  requestAnimationFrame; o rastro é pintado por ela). Não usar `motion.g animate={{ x, y }}`
  dentro do `<svg>` da Trilha: a bola antiga, feita assim, nunca se moveu (ficava presa no
  canto 0,0 do campo).
- Termo: casas `.tile tile-{slot,now,typed,correct,present,absent}` (Label_Round01_White e
  item-*) e teclas `.key key-{correct,present,absent,kick}` (Button01_195) em `index.css`.
  Cores: verde = letra no lugar, laranja = em outro lugar, cinza = não tem.
- Antes de mexer em produção/servidor: mostrar o comando e pedir autorização.
- Ao concluir itens, atualizar `docs/ROADMAP.md` e este arquivo.
