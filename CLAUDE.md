# BRGOL (nome temporário: Gol Mobile) — CLAUDE.md

## O que é
Port 1:1 do **BRGOL** (jogo de navegador brasileiro de 2008–2013, falido) para os tempos
modernos: mobile-first, PWA, "cara de jogo". Você escolhe um clube, faz gols (chute direto
automático, pênalti, falta, trilha), cada gol soma no placar do time na rodada de 24h, e
disputa a artilharia da hora/rodada/temporada. Todas as regras originais estão em
**`docs/BRGOL_ORIGINAL.md`** (fonte da verdade — consultar antes de mudar qualquer número).
Roadmap em `docs/ROADMAP.md`.

Produção: **https://brgol.managol.com.br** (VPS do Managol; subdomínio já apontado).
Repo: https://github.com/ericklesv/golmobile (branch `main` = prod, deploy automático).

## Stack
| Camada | Tecnologia |
|---|---|
| `api/` | Node 20 ESM · Express 5 · Prisma 6 · PostgreSQL (banco `brgol`, mesmo servidor PG do Managol) |
| `web/` | Vite 5 · React 18 · TypeScript · Tailwind 3 · framer-motion · react-three-fiber/three (cenas 3D do pênalti e da falta) · zustand · vite-plugin-pwa |
| Infra | Nginx (site `brgol`) · PM2 (`brgol-api`, porta 4100, usuário `brgol`) · Certbot · GitHub Actions → `/usr/local/bin/brgol-deploy.sh` |

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

## Convenções
- PT-BR em UI, commits (`tipo(escopo): descrição`), logs e mensagens de erro.
- Design system: tokens do Tailwind (`web/tailwind.config.js`) — tema "Estádio à noite":
  night/turf/chalk/flood/card. Fontes: Anton (pôster), Saira Condensed (placar), Inter.
  Nada de hex solto em tela nova. Layout mobile (max-width 480 centralizado no desktop).
- Escudos são gerados (`Shield.tsx`, sigla + cores) — sem marcas registradas.
- Antes de mexer em produção/servidor: mostrar o comando e pedir autorização.
- Ao concluir itens, atualizar `docs/ROADMAP.md` e este arquivo.
