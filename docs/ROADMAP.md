# ROADMAP — BRGOL

Marcar `[x]` ao concluir. Ordem = prioridade. Referência de regras: `BRGOL_ORIGINAL.md`.

## Fase 1 — Núcleo 1:1 em produção (brgol.managol.com.br)
- [x] API Node/Express/Prisma/Postgres na VPS do Managol (porta 4100, PM2 `brgol-api`)
- [x] Cadastro (nick único, e-mail, senha, sexo, time em A/B/C) e login (JWT)
- [x] 48 clubes em 3 séries; escudos gerados
- [x] Chute direto automático (10 min / VIP 5) — sempre gol, +R$10
- [x] Pênalti 3D (esquerda/meio/direita, goleiro pula, destreza +1%/pt) — +R$20
- [x] Falta 3D (por fora/por cima da barreira de 4) — +R$30, libera no lvl 1
- [x] Trilha (campo vertical, 3 linhas, um "ladrão" por linha) — +R$40, libera lvl 3, níveis reduzem o tempo
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
- [x] Deploy automático (GitHub Actions → VPS)
- [x] Verificação visual em produção (screenshots via Edge headless, 12/09/2026) — todas as telas OK
- [ ] Ajustes finos de animação 3D (câmera do pênalti mais alta/afastada, torcida menos "confete")
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
- [ ] Avatar de corpo inteiro com uniforme do time (chibi), foto de perfil
- [ ] Som de alerta (lvl 2) e mensagens coloridas (lvl 8)

## Fase 3 — Novidades (inspiradas no revival brgol.online)
- [ ] Bola de Ouro da temporada (fórmula do dossiê) + Top Chutadores
- [ ] Hora Premiada, Giro Premiado diário, Ranking de Fama
- [ ] Desafios X1 e Torneio X1
- [ ] Loja de itens temporários (Espionagem da Trilha, Impulso, Potência, Boost)
- [ ] VIP pago (AbacatePay Pix, igual ao Managol) e doação de VIP entre jogadores
- [ ] Notificações push ("seu chute recarregou", "seu time está perdendo")
- [ ] Apps nas lojas (Capacitor) — depois do PWA estável

## Dívidas / ideias
- [ ] Socket.IO para placar/feed em tempo real (hoje polling 15 s)
- [ ] Painel admin web (hoje só endpoints com `x-admin-key`)
- [ ] Apagar `legacy-expo/` quando o novo estiver validado
