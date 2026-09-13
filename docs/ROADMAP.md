# ROADMAP — BRGOL

Marcar `[x]` ao concluir. Ordem = prioridade. Referência de regras: `BRGOL_ORIGINAL.md`.

## Próximos passos (atualizado 13/09/2026 — fazer nesta ordem)
Feitos hoje: header (foto · nick/xp · nível → /perfil), foto de perfil (PNG/JPG/WEBP/GIF ≤ 5 MB),
aba **Loja**, moeda VIP no header, texto pessoal no perfil público, lista de jogadores ativos
(24 h) clicável, rolagem por arraste no PC, roleta calibrada, setas de chute no pênalti/falta.
1. **Loja de verdade** (itens listados em "Em breve" na tela `/loja`, regras em
   `CONCORRENTE_BRGOL_ONLINE.md`): Energia do chute nv 1–5 (28 h), Boost Auto (−60 s, 28 h),
   Caneleira (última linha da trilha), Chuteiras por nível **sem nome de jogador** (+2 % a +10 %,
   30 dias), troca de nome/cor do nick. Servidor: tabela `Item`/`UserItem` com validade;
   `cooldownFor`/chances passam a considerar itens ativos.
2. **VIP pago** (pacotes de dias via AbacatePay Pix, mesmo fluxo do Managol) e **auto-chute
   offline para VIP** (scheduler marca o gol a cada 5 min mesmo sem app aberto).
3. **Uniformes reais nas cenas 3D** (pack Soccer Players Uniforms) — pipeline em `tools/3d/README.md`.
4. **Recuperação de senha por e-mail** (SMTP Brevo; envs SMTP_* na VPS).
5. **Captcha/anti-bot nos chutes manuais** + regras/proibições na tela de regras (proxy, flood,
   auto-penalty, 1 login por IP fixo).
6. **Cargos do time** (Presidente/Diretor/Capitão/Auxiliar, só VIP), caixa do time (R$ e VIP),
   **Secar / Seguir ordem** com as regras do concorrente (1 alvo por rodada, mesma divisão, não o
   adversário atual, boosts Gatorade/Energético comprados pelo presidente).
7. **Missões** de rodada/temporada em tiers com resgate manual + ranking.
8. **Desafio 1x1** com aposta (dinheiro/VIP), modo hora atual, ELO.
9. Mensagens privadas, amigos, chat do time; "à frente/atrás" no ranking geral no perfil.
10. Limpeza pré-lançamento: apagar contas de teste `craque_g88qn` / `craque_warvl` e zerar temporada.
Pendências pequenas: cabelo nos jogadores 3D; strip das animações não usadas do `keeper.glb`;
empate por diferença < 5 % nas copas.

## Fase 1 — Núcleo 1:1 em produção (brgol.managol.com.br)
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
- [ ] Recuperação de senha por e-mail (SMTP Brevo do Managol)
- [ ] Captcha/anti-bot nos chutes manuais (o original tinha; hoje só rate-limit + heartbeat)

## Fase 2 — Comunidade e time (features originais restantes)
- [ ] Cargos do time: Presidente, Diretor, Capitão, Auxiliar (só VIP) e caixa do time em VIPs
- [ ] Ordem de chute / Secar / Seguir ordem
- [ ] Mensagens privadas (400 chars), amigos online, bloquear, mensagem em massa
- [ ] Chat do time
- [ ] Movimentações (troca de time com regras), Divisão de Jogadores
- [ ] Copa do Brasil (mata-mata), Copa BRGOL (inscrição paga), Estaduais, Amistosos
- [ ] Títulos/histórico de temporadas com página própria; Bola Prateada/Dourada
- [ ] Avatar de corpo inteiro com uniforme do time (o pack Soccer Players Uniforms tem 430 uniformes/1650 skins texturizados), foto de perfil
- [ ] Uniformes reais nas cenas 3D (goleiro/barreira com camisa do adversário) e cabelo
- [ ] Som de alerta (lvl 2) e mensagens coloridas (lvl 8)

## Fase 3 — Novidades (inspiradas no revival brgol.online)
- [x] Minigames diários (1x por dia, vira à meia-noite): **Termo do dia** — palavra de futebol, 6 tentativas; acertar = 1 gol pro time + pontos de nível (+30 na 1ª … +5 na 6ª); faixa roxa na Home enquanto disponível (12/09/2026)
- [x] **Quiz do dia** (vira ao meio-dia): 5 perguntas de futebol, 4 alternativas, 20 s cada; +6 de nível por acerto e 3 acertos = 1 gol; a Home mostra só uma faixa (o minigame que vence primeiro) (13/09/2026)
- [ ] Próximos minigames diários (a estrutura `DailyGame` já aceita — ver CLAUDE.md)
- [ ] Bola de Ouro da temporada (fórmula do dossiê) + Top Chutadores
- [ ] Hora Premiada, Giro Premiado diário, Ranking de Fama
- [ ] Desafios X1 e Torneio X1
- [ ] Loja de itens temporários (Espionagem da Trilha, Impulso, Potência, Boost)
- [ ] VIP pago (AbacatePay Pix, igual ao Managol) e doação de VIP entre jogadores
- [ ] Notificações push ("seu chute recarregou", "seu time está perdendo")
- [ ] Apps nas lojas (Capacitor) — depois do PWA estável

## Dívidas / ideias
- [ ] **Quiz: o banco (172 perguntas) cobre 34 dias, até 16/10/2026** — depois as perguntas se repetem; acrescentar em `api/src/lib/quiz/q-*.js` e no fim de `ORDER`
- [ ] **Termo: a lista de respostas acaba no dia #114 (03/01/2027)** — acrescentar palavras no fim de `api/src/lib/termo/answers.js` antes disso (depois o calendário dá a volta)
- [ ] Socket.IO para placar/feed em tempo real (hoje polling 15 s)
- [ ] Painel admin web (hoje só endpoints com `x-admin-key`)
- [ ] Apagar `legacy-expo/` quando o novo estiver validado
