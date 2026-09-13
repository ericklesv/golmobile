# ROADMAP — BRGOL

Marcar `[x]` ao concluir. Ordem = prioridade. Referência de regras: `BRGOL_ORIGINAL.md`.

## Próximos passos (atualizado 13/09/2026 — fazer nesta ordem)
Feitos hoje: header (foto · nick/xp · nível → /perfil), foto de perfil (PNG/JPG/WEBP/GIF ≤ 5 MB),
aba **Loja**, moeda VIP no header, texto pessoal no perfil público, lista de jogadores ativos
(24 h) clicável, rolagem por arraste no PC, roleta calibrada, setas de chute no pênalti/falta.
1. [x] **Loja de verdade** (13/09/2026): Energia do chute nv 1–5 (28 h), Boost Auto (−60 s, 28 h),
   Caneleira (última linha da trilha; R$ 80 mil ou 1 VIP), Chuteiras Couro/Bronze/Prata/Ouro/Diamante
   (+2 % a +10 %, 30 dias, só uma equipada), troca de nick e cor do nick (nível 8+). Catálogo em
   `api/src/lib/items.js`, tabelas `UserItem`/`ShopLog`, `cooldownFor`/chances/trilha leem os itens
   ativos. `GET/POST /api/shop/*`. Falta: mercado de chuteiras entre jogadores (depois).
2. **VIP pago** (pacotes de dias via AbacatePay Pix, mesmo fluxo do Managol) e **auto-chute
   offline para VIP** (scheduler marca o gol a cada 5 min mesmo sem app aberto).
3. **Uniformes reais nas cenas 3D** (pack Soccer Players Uniforms) — pipeline em `tools/3d/README.md`.
4. [x] **Recuperação de senha por e-mail** (13/09/2026): `POST /api/auth/forgot|reset`, telas
   `/esqueci-senha` e `/redefinir-senha`. **Pendente na VPS:** preencher `SMTP_*`, `MAIL_FROM` e
   `PUBLIC_WEB_URL` no `api/.env` (Brevo) — sem isso o link só aparece no log do PM2.
5. [x] **Captcha nos chutes manuais** (13/09/2026): conta numérica a cada 10 chutes manuais
   (`GET /api/play/captcha`, `captchaRequired` no `/api/me`). Falta: regras/proibições na tela
   de regras (proxy, flood, auto-penalty, 1 login por IP fixo).
6. **Cargos do time** (Presidente/Diretor/Capitão/Auxiliar, só VIP), caixa do time (R$ e VIP),
   **Secar / Seguir ordem** com as regras do concorrente (1 alvo por rodada, mesma divisão, não o
   adversário atual, boosts Gatorade/Energético comprados pelo presidente).
7. **Missões** de rodada/temporada em tiers com resgate manual + ranking.
8. **Desafio 1x1** com aposta (dinheiro/VIP), modo hora atual, ELO.
9. Mensagens privadas, amigos, chat do time; "à frente/atrás" no ranking geral no perfil.
10. Limpeza pré-lançamento: apagar contas de teste `craque_g88qn` / `craque_warvl` e zerar temporada.
Pendências pequenas: cabelo nos jogadores 3D; strip das animações não usadas do `keeper.glb`;
empate por diferença < 5 % nas copas.

## Fase 1 — Núcleo 1:1 em produção (jogagol.com.br)
- [x] API Node/Express/Prisma/Postgres na VPS do Managol (porta 4100, PM2 `brgol-api`)
- [x] Cadastro (nick único, e-mail, senha, sexo, time em A/B/C) e login (JWT)
- [x] 48 clubes em 3 séries; escudos gerados
- [x] Chute direto automático (10 min / VIP 5) — sempre gol, +R$10
- [x] Pênalti 3D (esquerda/meio/direita, goleiro pula, destreza +1%/pt) — +R$20
- [x] Falta 3D (por fora/por cima da barreira de 4) — +R$30, libera no lvl 1
- [x] Trilha (campo vertical, 3 linhas; "ladrões": 1 de 4 na defesa, 1 de 3 no meio, 2 de 3 no ataque → ~17% de gol) — +R$40, libera lvl 3, níveis reduzem o tempo
- [x] Trilha: bola cartoon que percorre o caminho — dribla o escolhido e para à frente da linha, treme no roubo, volta no rebote, entra na rede no gol; rastro pintado pela bola
- [x] Party GoL (roleta, aposta 50 → 150)
- [x] Rebotes por nível (pênalti/falta/trilha)
- [x] Destreza (compra, 0–30) e Nerf (lvl 14+)
- [x] Liga: rodadas de 24h fechando às 19:00, partidas time x time com % de domínio, tabela PG/J/V/E/D/SG, acesso/rebaixamento, campeão/vice, nova temporada
- [x] Rankings: hora, rodada, temporada, geral, pênalti, falta, trilha
- [x] Fechamento de hora (artilheiro) e rodada (prêmios em R$ e VIP) e recordes hora/rodada/temporada
- [x] VIP: recargas pela metade, nome azul, ativar unidades ganhas em prêmio
- [x] Home com placar ao vivo, tops, feed de lances narrados, online
- [x] Perfil (números por modo, loja, texto pessoal), perfil público, página do time, regras/níveis
- [x] PWA instalável (manifest + service worker), layout mobile-first
- [x] Script de deploy na VPS (`brgol-deploy.sh`, manual via SSH — GitHub Actions removido em 13/09)
- [x] Verificação visual em produção (screenshots via Edge headless, 12/09/2026) — todas as telas OK
- [x] Cenas 3D com modelos reais dos packs comprados: estádio st_080 com torcida, trave/rede, bola e jogador (goleiro/barreira) com poses procedurais — `tools/3d/`
- [x] Recuperação de senha por e-mail (13/09/2026; configurar SMTP na VPS)
- [x] Captcha/anti-bot nos chutes manuais (13/09/2026: conta numérica a cada 10 chutes manuais)

## Fase 2 — Comunidade e time (features originais restantes)
- [ ] Cargos do time: Presidente, Diretor, Capitão, Auxiliar (só VIP) e caixa do time em VIPs
- [ ] Ordem de chute / Secar / Seguir ordem
- [ ] Mensagens privadas (400 chars), amigos online, bloquear, mensagem em massa
- [x] Chat: salas Geral e Torcida do time, nível/VIP/escudo em cada mensagem, mensagens coloridas a partir do nível 8, botão flutuante com contador (13/09/2026)
- [ ] Movimentações (troca de time com regras), Divisão de Jogadores
- [ ] Copa do Brasil (mata-mata), Copa BRGOL (inscrição paga), Estaduais, Amistosos
- [ ] Títulos/histórico de temporadas com página própria; Bola Prateada/Dourada
- [ ] Avatar de corpo inteiro com uniforme do time (o pack Soccer Players Uniforms tem 430 uniformes/1650 skins texturizados), foto de perfil
- [ ] Uniformes reais nas cenas 3D (goleiro/barreira com camisa do adversário) e cabelo
- [ ] Som de alerta (lvl 2) — mensagens coloridas (lvl 8) já estão no chat

## Fase 3 — Novidades (inspiradas no revival brgol.online)
- [x] Minigames diários (1x por dia, vira à meia-noite): **Termo do dia** — palavra de futebol, 6 tentativas; acertar = 1 gol pro time + pontos de nível (+30 na 1ª … +5 na 6ª); faixa roxa na Home enquanto disponível (12/09/2026)
- [x] **Quiz do dia** (vira ao meio-dia): 5 perguntas de futebol, 4 alternativas, 20 s cada; +6 de nível por acerto e 3 acertos = 1 gol; a Home mostra só uma faixa (o minigame que vence primeiro) (13/09/2026)
- [x] **Hub de minigames**: slider horizontal na Home, cada card com o nível que libera, PRONTO/CONTINUAR/JOGADO/EM BREVE (13/09/2026)
- [x] **Memória dos Escudos** (nível 2, vira à meia-noite): 16 cartas/8 pares sorteados por jogador; até 14 jogadas = 1 gol; nível +30 (≤8), +25 (≤10), +20 (≤12), +15 (≤14), +10 (≤18), +5 (13/09/2026)
- [x] **De que time é?** (nível 4, vira à meia-noite): 10 rodadas alternando "pista → 4 escudos" e "escudo → 4 pistas do mesmo tipo" (estádio, cidade, fundação, cores+estado, apelido, mascote, ídolo, clássico — só fatos certos; sem série, que muda com o acesso); distratores parecidos (mesmas cores/estado/cidade), nunca um time para quem a pista também vale; 7 s por pista, −0,5 s a cada acerto seguido (mín. 5 s), relógio no servidor; tipo da pista só depois de responder; +3 de nível por acerto (até +30), 8 acertos = 1 gol; banco em `api/src/lib/qualtime/bank.js` (13/09/2026; refeito no mesmo dia porque estava fácil demais)
- [x] Regra: todo minigame vencido = 1 gol + bônus; Party GoL dá o gol na 1ª vitória do dia; slider ordenado por disponibilidade (13/09/2026)
- [x] **Alvo no Gol** (nível 6, vira à meia-noite): batalha naval no gol — grade 6x4 com goleiro (3), 2 zagueiros (2) e 3 cones (1) escondidos por jogador/dia (`api/src/lib/alvo.js`); 12 chutes (eram 14, dono achou fácil); +2 de nível por casa, 8 casas = 1 gol, derrubar tudo = gol +30. Substituiu a versão "10 alvos de 1,5 s", que estava fácil demais (13/09/2026)
- [x] **Estatísticas** (nível 3, vira às 13h): "quem tem mais?" entre dois jogadores do Brasileirão 2024 (dados reais da API-Football, com fotos) + 22 duelos escritos pelo dono; sequência até errar; uma partida por dia: +3 por acerto (até +30) e 5 seguidos = gol (13/09/2026)
- [ ] **Baú diário / Giro Premiado** (nível 9): dinheiro ou dias de VIP
- [ ] **Embaixadinhas** (nível 12): ritmo, não deixar a bola cair
- [ ] **Disputa de pênaltis 1x1** (nível 15): 5 pênaltis contra outro craque (assíncrono)
- [~] **Cabeção** (head soccer 1x1 AO VIVO, nível 0) — **ESCONDIDO no hub (`soon: true`) em 13/09/2026, fica "para depois"; a rota `/cabecao` continua funcionando para testes.** Personagens: pack **Kenney Toon Characters (CC0)** já está em `web/public/cabecao/kenney/` (cabeças, corpo, braço, pernas em HD, 4 humanos + robô + zumbi) para trocar os bonecos vetoriais — falta ligar no `cabecaoDraw.ts`. Estado: fila + partida por WebSocket (`/api/ws/cabecao`), física no servidor a 30 Hz (`api/src/realtime/`), pareamento só entre times e IPs diferentes, 60 s + gol de ouro, vencedor = 1 gol (máx. 3/dia, nunca 2x o mesmo adversário no dia, W.O. < 20 s não vale). Falta: bloco WebSocket no nginx (`deploy/nginx-brgol.conf`), teste com 2 jogadores reais, bonecos melhores (13/09/2026)
  - **Arte de estudo (NÃO lançar com ela):** a arena (céu, arquibancada, torcida, gramado, gols, bola) é do pack de estudo extraído do Head Ball 2 (Masomo) — fica **fora do git**, em `/var/www/brgol/uploads/cabecao/` na VPS, servida em `/api/uploads/cabecao/`. O repo do GitHub é PÚBLICO: nunca commitar esses arquivos. Antes de qualquer lançamento, trocar por arte própria/licenciada (os bonecos já são nossos, em vetor: `web/src/lib/cabecaoDraw.ts`).
- [ ] Domínio jogagol.com.br no ar (nginx + certbot + redirects) — feito 13/09/2026; sugestão: renomear o repo do GitHub para `jogagol`
- [ ] Bola de Ouro da temporada (fórmula do dossiê) + Top Chutadores
- [ ] Hora Premiada, Giro Premiado diário, Ranking de Fama
- [ ] Desafios X1 e Torneio X1
- [x] Loja de itens com validade (13/09/2026: Energia, Boost Auto, Caneleira, Chuteiras, nick/cor) — faltam Espionagem da Trilha, Impulso, Potência
- [ ] VIP pago (AbacatePay Pix, igual ao Managol) e doação de VIP entre jogadores
- [ ] Notificações push ("seu chute recarregou", "seu time está perdendo")
- [ ] Apps nas lojas (Capacitor) — depois do PWA estável

## Dívidas / ideias
- [ ] Estatísticas: trocar para o Brasileirão 2025 quando o plano grátis da API-Football liberar a temporada (ou assinando 1 mês); faltam ~20 jogadores por time que ficaram na 4ª página da API; mais duelos do dono em `api/src/lib/stats/curated.js` (hoje 22)
- [ ] **Quiz: o banco (172 perguntas) cobre 34 dias, até 16/10/2026** — depois as perguntas se repetem; acrescentar em `api/src/lib/quiz/q-*.js` e no fim de `ORDER`
- [ ] **Termo: a lista de respostas acaba no dia #114 (03/01/2027)** — acrescentar palavras no fim de `api/src/lib/termo/answers.js` antes disso (depois o calendário dá a volta)
- [ ] Socket.IO para placar/feed em tempo real (hoje polling 15 s)
- [ ] Painel admin web (hoje só endpoints com `x-admin-key`)
- [ ] Apagar `legacy-expo/` quando o novo estiver validado
