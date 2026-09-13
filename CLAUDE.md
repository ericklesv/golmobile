# BRGOL (nome temporário: Gol Mobile) — CLAUDE.md

## O que é
Port 1:1 do **BRGOL** (jogo de navegador brasileiro de 2008–2013, falido) para os tempos
modernos: mobile-first, PWA, "cara de jogo". Você escolhe um clube, faz gols (chute direto
automático, pênalti, falta, trilha), cada gol soma no placar do time na rodada de 24h, e
disputa a artilharia da hora/rodada/temporada. Todas as regras originais estão em
**`docs/BRGOL_ORIGINAL.md`** (fonte da verdade — consultar antes de mudar qualquer número).
Roadmap em `docs/ROADMAP.md`.

Produção: **https://brgol.managol.com.br** (VPS do Managol; subdomínio já apontado).
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

## Endpoints
`POST /api/auth/register|login` · `GET /api/me` · `POST /api/me/heartbeat|buy-dexterity|activate-vip|change-team|nerf/:nick` · `PUT /api/me/bio`
`POST /api/play/auto|penalty{direction}|foul{direction}|trail{index}|party`
`GET /api/meta|home?team=|rankings/:scope|league|league/rounds/:n|league/titles|teams|teams/:slug|players/:nick|players/search?q=|feed`
`POST /api/admin/advance-round|close-hour|vip|money|ban` (header `x-admin-key`)
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

## Para o colaborador (ericklesv) e sua IA
- Tudo que o jogo **já usa** está no git: sprites do kit em `web/public/ui/`, escudos em
  `web/public/escudos/`, modelos 3D em `web/public/3d/`. Para **peças novas** do pack Layer Lab
  (menu novo, popup, ícone), a biblioteca completa fica em `assets/layerlab/` (no repo se ele for
  privado; senão distribuída por fora e gitignored) — receita de recorte 9-slice e tabela de
  fatias em `docs/SPRITES_LAYERLAB.md`. Packs 3D da Unity ficam só na máquina do Guilherme;
  `tools/3d/README.md` gera os `.glb` que entram no repo.
- **Não usamos GitHub Actions** (removido em 13/09/2026). Deploy é sempre manual, pela VPS:
  `ssh -i <chave> root@187.127.17.121 'bash /usr/local/bin/brgol-deploy.sh'` — depois conferir
  `https://brgol.managol.com.br/api/health`. Push no git **não** publica nada sozinho.
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
- Antes de mexer em produção/servidor: mostrar o comando e pedir autorização.
- Ao concluir itens, atualizar `docs/ROADMAP.md` e este arquivo.
