# ROADMAP — BRGOL

Marcar `[x]` ao concluir. Ordem = prioridade. Referência de regras: `BRGOL_ORIGINAL.md`.

## Tutorial de boas-vindas (18/09/2026) — no GitHub, aguardando publicação
Conta nova não recebe pop-up nenhum: só a janela de boas-vindas, que explica que o jogador faz gols para o time
vencer as rodadas e oferece 1 VIP para fazer três etapas — pênalti, Termo e X1. O passo só anda quando o servidor
confere no banco que ele fez a coisa. No X1, se ninguém aceitar o desafio em 20 s, um dos bots do Guilherme aceita
e joga valendo tudo (decisão do dono; só no tutorial). `services/tutorial.js`, migração 0043,
`components/Tutorial.tsx`, `scripts/test-tutorial.js`.

## Publicado em 18/09/2026 14:41 (Brasília) — commit 249740e
Backup antes: `/var/backups/brgol/antes-goleada-2026-09-18.dump` (produção estava em 0eb1892, de 17/09 21:29).
Subiu: **minigame Goleada** (nível 3, 22h — porte do Mini Cup do Google, cena 3D do pênalti, puxão de dedo),
o goleiro dele calibrado em meio-termo depois de dois pedidos do dono, o **goleiro que levanta depois do
mergulho e cai para o lado certo** (o mesmo descuido estava na Falta PRO, que já estava no ar), a **bola de
prata/ouro virando UMA batida que vale 2 ou 3 gols** (antes eram 2/3 batidas na mesma recarga), o contador do
chat que não conta mais a própria mensagem e o aviso de desafio do X1 que desceu para perto das abas.

## Feito em 15/09/2026 (madrugada) — resumo em `docs/MUDANCAS-2026-09-15.md`
Ranking X1 (3·1·−2, sequência, prêmios por rodada/temporada, medalhas caveira no perfil), sair da partida =
derrota, uniforme do time escolhido pelo presidente (Camisas + X1 + 3D), Santa Cruz tricolor, caixa de mensagens
(avisos automáticos, admin, ícones/links/@nick), pacotes de VIP com saldo + compensação dos 7 compradores, Loja
"Saco de dinheiro" (1 VIP = R$ 50 mil), roleta 500/1.500 com 5 giros (VIP 10), R$ 500 por vitória nos minigames,
convite paga aos dois lados, painel de admin (X1, Multiconta com mapa, VIP/saldo, mensagens, avisos), SEO/preview
do link, PWA com banner "Atualizar", cadastro sem o falso "rápido demais". Pendências no fim daquele arquivo.
**Tarde de 15/09:** **Provocar** no X1 — caretas e frases prontas durante a partida, estilo Clash Royale (4 caras
para todos; o resto e as frases só VIP; silenciar; ritmo de 2 s). Ver `CLAUDE.md` → X1 → Provocar.
**Deploy sem partida travada**: o `brgol-deploy.sh` trava a busca do X1, espera as partidas acabarem e cancela o que
sobrar com a aposta devolvida e o motivo na tela (`CLAUDE.md` → X1 → Trava de atualização; `scripts/test-deploy-x1.js`).

## Feito em 18/09/2026 — bots "quase reais" para os times da Série A sem ninguém
Contas que o servidor joga sozinho (`api/src/services/bots.js`; lista `api/src/data/bots.js`; números `BOTS` em
`rules.js`): persona (casual/regular/assíduo, janelas do dia, quais chutes usa), plano diário sorteado (sessões,
folga), chutes pelos MESMOS serviços do jogador com atraso humano, Presença resgatada, ponto de nível gasto na
habilidade; nunca chat/minigame/X1; fora da premiação e do relatório diário; selo "Bot" só no painel de admin.
`node scripts/bots.js listar|criar|status|persona` (o `criar` só depois de o dono validar os nicks). Teste:
`scripts/test-bots.js`. Ver `CLAUDE.md` → "Bots quase reais".

## Próximos passos (atualizado 14/09/2026 — fazer nesta ordem)
0. [~] **Google Play** (14/09/2026, decisões do dono; guia completo em **`docs/PLAY_STORE.md`**):
   app = TWA com Bubblewrap; Play Billing dentro do app + PIX só no site (modelo Pokémon GO); conta
   pessoal ⇒ teste fechado 12 testadores/14 dias. **Feito 14/09:** `/privacidade`, `/termos`,
   `/excluir-conta` (`Legal.tsx`), exclusão de conta no Perfil (`DELETE /api/account`, anonimiza),
   denunciar/bloquear no chat e no perfil (`/api/account/*`, tabelas `UserBlock`/`Report`, migração
   0023), aba **Denúncias** no painel de admin, ícone maskable, app esconde o PIX quando é TWA
   (`lib/twa.ts`), ícone e gráfico de destaque em `assets/play-store/`. **Falta:** criar
   `contato@jogagol.com.br`; deploy; `assetlinks.json` (precisa do SHA-256 do console); Bubblewrap;
   formulários do console; screenshots; teste fechado; depois **Play Billing** (passo 8 do guia).
Feitos hoje: header (foto · nick/xp · nível → /perfil), foto de perfil (PNG/JPG/WEBP/GIF ≤ 5 MB),
aba **Loja**, moeda VIP no header, texto pessoal no perfil público, lista de jogadores ativos
(24 h) clicável, rolagem por arraste no PC, roleta calibrada, setas de chute no pênalti/falta,
**menções @nick no chat** (autocomplete ao digitar @, link com avatar; mensagens antigas também
viram link) e **goleiro com salto em arco de verdade** (clipes com keyframes em `keeper.tsx`:
agacha → voo parabólico → extensão → queda; `/debug3d?pose=dive&at=0.4` congela o clipe).
1. [x] **Loja de verdade** (13/09/2026): Energia do chute nv 1–5 (28 h), Boost Auto (−60 s, 28 h),
   Caneleira (última linha da trilha; R$ 80 mil ou 1 VIP), Chuteiras Couro/Bronze/Prata/Ouro/Diamante
   (+2 % a +10 %, 30 dias, só uma equipada), troca de nick e cor do nick (nível 8+). Catálogo em
   `api/src/lib/items.js`, tabelas `UserItem`/`ShopLog`, `cooldownFor`/chances/trilha leem os itens
   ativos. `GET/POST /api/shop/*`. Falta: mercado de chuteiras entre jogadores (depois).
2. [~] **VIP pago** (13/09/2026, código pronto e testado com a Efí simulada): pacotes de dias de VIP
   por **PIX na Efí** (tela `/vip`, botão VIP do topo e atalho na Loja), dias guardados no banco de
   VIPs e ativados quando o jogador quiser, e **auto-chute offline para VIP** (pronto, mas DESLIGADO por
   decisão do dono — `VIP_OFFLINE_AUTO`). Preços aprovados pelo dono e Efí ligada na VPS (13/09/2026;
   conta da plataforma Rifa Express + chave só do JogaGol). **Falta:** um PIX real de teste. Depois: cartão.
3. **Uniformes reais nas cenas 3D** (pack Soccer Players Uniforms) — pipeline em `tools/3d/README.md`.
4. [x] **Recuperação de senha por e-mail** (13/09/2026): `POST /api/auth/forgot|reset`, telas
   `/esqueci-senha` e `/redefinir-senha`. **Pendente na VPS:** preencher `SMTP_*`, `MAIL_FROM` e
   `PUBLIC_WEB_URL` no `api/.env` (Brevo) — sem isso o link só aparece no log do PM2.
5. [x] **Captcha nos chutes manuais** (13/09/2026): conta numérica a cada 10 chutes manuais
   (`GET /api/play/captcha`, `captchaRequired` no `/api/me`). Falta: regras/proibições na tela
   de regras (proxy, flood, auto-penalty, 1 login por IP fixo).
5b. [x] **Painel de admin** (13/09/2026): `/admin` (só ericklesv e MVGIC, `User.isAdmin` na
   migração 0015) — lista/busca de jogadores, edição de perfil (nick/e-mail/bio/dinheiro/VIP/
   destreza/time/cor), gols de verdade e exp, ban/desban, IP + geolocalização (ip-api.com com
   cache 24 h; `User.lastIp` no cadastro/login/heartbeat) e log de auditoria (`AdminAction`).
   API em `/api/painel/*` (`routes/adminPanel.js`, middleware `requireAdmin`).
6. [~] **Cargos do time**: FEITO 13/09/2026 — Presidente (time vago → VIP que marcou pelo time assume) +
   até 2 Diretores, **contratações** (proposta em VIP; contrato de 1 dia por VIP; movimentações na página do
   time) e **doação de VIP entre colegas de time**. Falta: Capitão/Auxiliar (com a ordem de chute), caixa do time (R$ e VIP),
   **Secar / Seguir ordem** com as regras do concorrente (1 alvo por rodada, mesma divisão, não o
   adversário atual, boosts Gatorade/Energético comprados pelo presidente).
6e. [x] **Página da partida** (14/09/2026): /partida/:id com placar, tempo que falta, artilheiros, gráfico hora a hora,
   gols por tipo, comparação dos times, confrontos e últimos gols (placares da Home, Liga e Time levam até ela).
6d. [x] **Convites** (14/09/2026): link de afiliado no Perfil; quem convidou ganha VIP nos marcos de gols do
   convidado (25→1000; 16 VIP por amigo); trava de mesma internet. Depois: % dos VIPs comprados pelo convidado?
6c. [x] **Distintivos e TOP 10** (13/09/2026): P/D ao lado do nome, ícone do top 3 de agora (hora/rodada/
   temporada; ouro/prata/bronze) nos rankings, chat e perfil, e o quadro TOP 10 do perfil (vezes em 1º/2º/3º/top 10).
6b. [x] **Presença da Semana** (login diário, 13/09/2026): 7 dias, todo dia dá XP (490/semana, dobro para VIP),
   7º dia dá VIP que ativa na hora (2 VIP da 2ª semana seguida); pulou um dia, volta ao dia 1. Depois: "Passe da
   Temporada" (30 dias da liga) com trilha grátis + trilha VIP vendida por PIX.
7. **Missões** de rodada/temporada em tiers com resgate manual + ranking.
8. **Desafio 1x1** com aposta (dinheiro/VIP), modo hora atual, ELO.
9. Mensagens privadas, amigos, chat do time; "à frente/atrás" no ranking geral no perfil.
10. Limpeza pré-lançamento: apagar contas de teste `craque_g88qn` / `craque_warvl` e zerar temporada.
Pendências pequenas: cabelo nos jogadores 3D; empate por diferença < 5 % nas copas.
Minigames novos (13/09, design em **`docs/FALTA_PRO.md`**): **Falta PRO** FEITO (nível 8,
vira às 19h; arrasto + curva, Trionda, servidor valida; rota de conferência `/debug-faltapro`)
e **Frangaço** FEITO (porte 1:1 do Managol: cliente Unity em `/tv/?mode=penalty` + API compat
`/api/frangaco/*`; nível 10, vira às 20h) — ver a lista de minigames abaixo.
**Modo teste do MVGIC ACABOU (14/09/2026):** ele agora é jogador normal — recargas normais e 1
partida por dia nos minigames (`COOLDOWN_FREE_NICKS`/`isFreeTester` e os middlewares de
`routes/daily.js`/`routes/frangacoTv.js` foram removidos). A EXP dada pelo painel (12 × 100 = 1200
de `levelBonus`) foi estornada no banco para o nível dele voltar a ser o "de verdade". Para repetir
minigame em teste, só `MINIGAMES_LIVRES=1` no PC.
Feito 13/09: goleiro e barreira com **uniforme de verdade** (textura composta em runtime:
`kit-mask.png` + `kit-ao.png` + cores em `keeper.tsx` — pele, chuteira, luva do goleiro);
`keeper.glb` reconstruído com UVs e sem as animações não usadas (84 KB).

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
- [~] Cargos do time: Presidente e Diretores + contratações e doação de VIP no time (13/09/2026); faltam Capitão, Auxiliar e caixa do time em VIPs
- [ ] Ordem de chute / Secar / Seguir ordem
- [ ] Mensagens privadas (400 chars), amigos online, bloquear, mensagem em massa
- [x] Chat: salas Geral e Torcida do time, nível/VIP/escudo em cada mensagem, mensagens coloridas a partir do nível 8, botão flutuante com contador (13/09/2026)
- [ ] Movimentações (troca de time com regras), Divisão de Jogadores
- [ ] Copa do Brasil (mata-mata), Copa BRGOL (inscrição paga), Estaduais, Amistosos
- [ ] Títulos/histórico de temporadas com página própria; Bola Prateada/Dourada
- [ ] Avatar de corpo inteiro com uniforme do time (o pack Soccer Players Uniforms tem 430 uniformes/1650 skins texturizados), foto de perfil
- [x] Uniformes reais nas cenas 3D (13/09/2026: textura composta em runtime com cores de kit
  livres — goleiro amarelo com luvas, barreira vermelha; falta usar as cores do time
  adversário de verdade e cabelo)
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
- [x] **Camisas** (nível 5, vira às 16h): maior ou menor com 4 camisas de 1 a 11 nas cores do time; 4 certas = 1 gol e segue valendo até errar (vários gols no dia, exceção do dono); +3 de nível por acerto (até +30) (13/09/2026)
- [x] **Hat Trick** (nível 7, vira às 18h): chute de longe com mira de estilingue, batida na bola (lado = curva, embaixo = sobe), vento e goleiro; 3 vidas, cada gol vale gol do time, 3 gols = hat trick (13/09/2026)
- [x] **Falta PRO** (nível 8, vira às 19h): cobrança de falta 3D estilo Free Kick Classic — arrasta a bola (direção/força; a bola SEGUE o arco do gesto — curva é a arma principal, corrigido 14/09), barreira 3–5 (às vezes pula), goleiro e alvos bônus no ângulo; física em `api/src/lib/faltapro.js` (calibrada em `api/scripts/faltapro-balance.js`: bom ~36%); 5 cobranças, 3+ gols = exatamente 1 gol, +4 de nível por conversão (até +20), alvo = +R$ 50 (13/09/2026)
- [x] **Goleada** (nível 3, vira às 22h): porte do "Mini Cup" do Google — você é o batedor e o goleiro anda de trave a trave o tempo todo. Puxão de dedo como na Falta PRO (direção, força pela velocidade do gesto, efeito pelo arco) na MESMA cena 3D do pênalti (estádio, goleiro de uniforme do adversário, Trionda). Aperta pelo RELÓGIO, não pelos gols: no 1º segundo o goleiro fecha ~24% do gol e aos 100 s, 78% (dois ajustes do dono em 18/09: "muito rápido no nível inicial" → "lento demais" → meio-termo). A cada 3 gols seguidos sai 1 gol do time, até 3 no dia (o alvo era 10 seguidos; o dono achou difícil demais em 18/09 e escolheu o teto); cada gol do time traz R$ 1.400 e cada gol da série dá 3 de nível (até 30); recorde em `User.goleadaBest`. **Nome de tela: PenalCup** (id interno segue GOLEADA). Calibragem em `api/scripts/goleada-balance.js` (18/09/2026)
- [x] **Frangaço** (nível 10, vira às 20h; **porte 1:1 do Managol via Unity WebGL**, 13/09/2026): o jogo é o cliente `ManagolTV` em `/tv/?mode=penalty`; a API do JogaGol fala o contrato dele em `/api/frangaco/*` (`state|run|incoming|kick{xAnunciado,xReal}|save{ms,x,y}` — `routes/frangacoTv.js`). Torneio INTEIRO numa sessão: 5 fases contra clubes da mesma série, duelo de 5 cobranças alternadas com finta (sem finta o goleiro quase sempre pega), morte súbita; janela de defesa 900→660 ms validada no relógio do servidor; 1 torneio por dia (`DailyGame`); só o CAMPEÃO pontua = 1 gol (kind FRANGACO) + R$ 500 + 20 de nível; ranking de títulos por temporada. A tela `/frangaco` virou wrapper (iframe + token por postMessage). **Pendente: hospedar o build do ManagolTV em `/tv/` na VPS (nginx)**
- [x] **Horário de virada por minigame** (um por jogo, para sempre ter algum renovando): Termo 0h, Quiz 12h, Estatísticas 13h, Memória 14h, De que time é? 15h, Camisas 16h, Alvo no Gol 17h; jogo novo pega a próxima hora livre (13/09/2026)
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
- [~] VIP pago (PIX Efí — código pronto 13/09/2026, falta ligar as credenciais); doação de VIP só entre colegas de time (feita 13/09/2026)
- [ ] Notificações push ("seu chute recarregou", "seu time está perdendo")
- [ ] Apps nas lojas (Capacitor) — depois do PWA estável

## Dívidas / ideias
- [ ] Estatísticas: trocar para o Brasileirão 2025 quando o plano grátis da API-Football liberar a temporada (ou assinando 1 mês); faltam ~20 jogadores por time que ficaram na 4ª página da API; mais duelos do dono em `api/src/lib/stats/curated.js` (hoje 22)
- [ ] **Quiz: o banco (172 perguntas) cobre 34 dias, até 16/10/2026** — depois as perguntas se repetem; acrescentar em `api/src/lib/quiz/q-*.js` e no fim de `ORDER`
- [ ] **Termo: a lista de respostas acaba no dia #114 (03/01/2027)** — acrescentar palavras no fim de `api/src/lib/termo/answers.js` antes disso (depois o calendário dá a volta)
- [ ] Socket.IO para placar/feed em tempo real (hoje polling 15 s)
- [ ] Painel admin web (hoje só endpoints com `x-admin-key`)
- [ ] Apagar `legacy-expo/` quando o novo estiver validado
