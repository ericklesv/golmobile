# JogaGol (antigo BRGOL) — CLAUDE.md

## O que é
**Nome do jogo: JogaGol** (logo em `web/public/brand/logo-{v,h}.webp`; domínio **jogagol.com.br**).
Port 1:1 do **BRGOL** (jogo de navegador brasileiro de 2008–2013, falido) para os tempos
modernos: mobile-first, PWA, "cara de jogo". Você escolhe um clube, faz gols (chute direto
automático, pênalti, falta, trilha), cada gol soma no placar do time na rodada de 24h, e
disputa a artilharia da hora/rodada/temporada. Todas as regras originais estão em
**`docs/BRGOL_ORIGINAL.md`** (fonte da verdade — consultar antes de mudar qualquer número).
Roadmap em `docs/ROADMAP.md`. **Resumo das mudanças grandes de 15/09/2026** (Ranking X1 com prêmios e medalhas,
uniforme do presidente, caixa de mensagens, economia, PWA com banner de atualização): `docs/MUDANCAS-2026-09-15.md`.

Produção: **https://jogagol.com.br** (VPS do Managol; `www.` e `brgol.managol.com.br` redirecionam 301 para lá).
Repo: https://github.com/ericklesv/golmobile (branch `main` = prod; deploy manual via SSH, **sem GitHub Actions**).

## Stack
| Camada | Tecnologia |
|---|---|
| `api/` | Node 20 ESM · Express 5 · Prisma 6 · PostgreSQL (banco `brgol`, mesmo servidor PG do Managol) |
| `web/` | Vite 5 · React 18 · TypeScript · Tailwind 3 · framer-motion · react-three-fiber/three (cenas 3D do pênalti e da falta) · zustand · vite-plugin-pwa |
| Android | TWA (Bubblewrap) sobre o site — `docs/PLAY_STORE.md` |
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
- **Habilidades = a evolução do jogador** (`SKILLS`/`SKILL_STEPS` em rules.js, `services/skills.js`, painel
  na Loja; reforma do dono em 17/09/2026, ajustada no mesmo dia). **Quatro habilidades de 18 degraus cada**,
  na ordem de gastar ponto: **Recarga** (−5 s por degrau no chute direto/pênalti/falta; a trilha tem a
  redução dos níveis, não esta), **Pontaria** (+2,5 p.p. no pênalti, até 90%), **Chute** (+2,5 p.p. na falta,
  até 80%) e **Sorte** (+0,39 p.p. na chance de chute especial, de 3% a 10%).
  **Cada degrau custa 1 PONTO DE NÍVEL e nada mais** — dinheiro e VIP saíram ("temos que dar mais valor a
  upada de nível… tira a magia que é passar de nível"); o que foi pago com dinheiro/VIP foi devolvido EM
  DOBRO (`scripts/devolver-habilidades.js`, com trava no AdminAction para não pagar duas vezes).
  A árvore inteira custa **72 pontos = nível 72 = 300 mil pontos de nível**, o "full" do BRGOL — os níveis
  33 a 72 (Lendário 4–10, Ídolo, Mito, Imortal) foram criados para isso, subindo ~4,3% por nível.
  **Por que 18 degraus e não 9:** com 9, o acerto máximo dos dois chutes custava 18 pontos e o dono chegou lá
  em 4 dias ("nível 18 e já tô full praticamente") — os 28 primeiros pontos saem em 2 semanas, e só do 29 em
  diante a curva trava. Com 18, os dois acertos custam 36 pontos. Mexeu nos degraus? **Tem de zerar as
  habilidades e devolver os pontos** (migração 0040 fez isso), senão o degrau antigo vira outra coisa.
  **O piso de 4:30 é do VIP** (dono: "ele só deve chegar nos 4:30 se for vip"): o jogador comum sai de 10:00
  e para em 8:30 com a Recarga cheia; o VIP parte de 5:00 e bate no piso no 6º degrau — a tela avisa quem
  está no piso para não gastar ponto à toa.
- **Chute de prata e de ouro** (`BALL`/`rollBall` em rules.js, `lib/bola.js`, coluna `User.ballNext`,
  `Goal.ball`): 3% dos pênaltis, faltas e trilhas vêm especiais desde o nível 0 (2% prata + 1% ouro), até
  10% com a Sorte — as duas somadas, o ouro sempre metade da prata. **UMA batida que VALE mais** (dono,
  18/09/2026: "ao invés de você chutar 2x 3x, você chuta 1, se acertar conta as 2x ou 3x"): o gol vale
  **2 na prata e 3 no ouro** — placar da partida, artilharia, nível e dinheiro. Errou, acabou. Quem
  multiplica é `applyResult` (`vale`), que grava **uma linha de `Goal` por gol** (artilharia, ranking da
  hora/rodada/temporada e página da partida contam LINHAS) e soma o placar de uma vez só. O chute direto
  fica de fora. A bola da PRÓXIMA recarga é sorteada quando o jogador gasta a atual, por isso o card da
  Home já fica prateado/dourado ("VALE 2x"/"VALE 3x") enquanto o tempo corre.
  *(Até 18/09 a bola dava 2 ou 3 BATIDAS de graça na mesma recarga; a coluna `User.ballLeft` era disso e
  ficou no banco sem uso, para não precisar de migração.)*
  **Mexeu em habilidade, recarga ou bola? Rode `node scripts/test-habilidades.js`** (pasta api/, banco LOCAL).
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
  dono; só estar no time não conta — trocar de time custa R$ 50 mil ou 1 VIP na Loja, e contrato de contratação segura). Gols da hora/rodada/temporada do jogador
  ficam gravados até o próximo gol dele: na tela, sempre via `periodGoals` (`view.js`).
  **Mexeu na liga? Rode `node scripts/sim-liga.js`** (pasta api/, só banco LOCAL, schema
  `liga_sim` criado e apagado por ele): temporada inteira de 30 rodadas + virada, com gols no
  instante do fechamento; ~7 mil conferências, tem de dar 0 falha.
- **Troca de séries de 14/09/2026** (decisão do dono, na rodada 3 da temporada 1; feita SÓ no banco, sem
  código): 5 times da A sem nenhum jogador davam ponto de graça. Subiram para a A os 5 com mais gols na
  temporada fora dela (Náutico, Ceará, Brasiliense, Santa Cruz, XV de Piracicaba); Botafogo, Grêmio,
  Fortaleza, Athletico-PR e Internacional (vazios) foram para a B; Remo e Guarani (vazios, lanterna da B)
  para a C. Todos mantiveram pontos e gols; os 24 jogos da rodada 3 foram refeitos com `roundRobinPairs`
  das séries novas e cada time levou os gols que já tinha nela (`Goal.matchId` repontado). A série mora em
  DOIS lugares — `Team.serie` (sorteio das rodadas) e `Standing.serie` da temporada (tabela, título,
  acesso) —: trocar só um quebra a tabela. O seed não mexe na série. Backup de antes na VPS:
  `/root/brgol-antes-troca-series-2026-09-14.dump`. Aviso para os jogadores: `components/SeriesNotice.tsx`
  (1x por conta, só contas criadas antes da troca, some depois de 22/09; o convite do WhatsApp espera ele).
  **Atenção no fim da temporada:** com a B quase sem jogador, o 2º que sobe pode ser um time vazio
  (desempate por saldo/nome) — o dono ainda não decidiu se muda a regra de acesso.
- **Troca AUTOMÁTICA na Série A** (dono, 15/09/2026: "a ideia é que nenhum jogo da Série A fique sem gols";
  `swapEmptySerieA` em `league.js`, número em `SERIE_A_SWAP` de `rules.js`, via `/api/meta.serieASwap`): no
  fechamento de cada rodada — menos a ÚLTIMA da temporada, que já tem o sobe-e-desce —, DEPOIS da tabela e ANTES
  de sortear a próxima (na mesma transação: a rodada nova já sai com as séries novas), time da A que não marcou
  nenhum gol na rodada troca com quem mais marcou fora da A, **com pelo menos 50 gols na rodada** (empate: o melhor
  da tabela). **Gol de BOT não conta nesta regra** (dono, 21/09/2026; `Goal.roundId` com `user.isBot = false`, dos
  DOIS lados: time da A que só teve gol de bot conta como sem gol e pode cair; time de fora não chega aos 50 com gol
  de bot): os bots foram criados para os times vazios da A não ficarem sem gols, mas, contando aqui, seguravam
  justamente esses times na A para sempre e nenhum time com gente de verdade subia — na rodada 8 da temporada 1,
  Flamengo, Bahia, XV de Piracicaba e Brasiliense fecharam a rodada SÓ com gol de bot, e o Athletico-PR (com jogador
  de verdade) ficou na B. Gol tirado no X1 continua não contando como "sem gol" (conta o que o time MARCOU, não o
  placar). Como o time que cai pode ter gols de bot no placar, a mensagem da caixa só diz "não marcou nenhum gol"
  quando o time zerou de verdade (senão entregaria os bots); o Telegram mostra os dois números e o bot não recebe
  mensagem.
  Vários da A sem gol: o pior da tabela troca primeiro; faltou candidato, o resto fica. O da A cai SEMPRE para a B
  (decisão do dono, como em 14/09); se quem subiu veio da C, desce para a C o time da B com menos gols na rodada
  (empate: o pior da tabela; nunca um que acabou de trocar). Muda `Team.serie` E `Standing.serie`; pontos e gols
  vão junto. Os jogadores dos times que trocaram recebem mensagem na caixa; o dono, no Telegram. A regra aparece
  embaixo da tabela na Liga. **Mexeu? Rode `node scripts/test-troca-serie-a.js`** (pasta api/, só banco LOCAL,
  schema `troca_sim` criado e apagado por ele; tem de dar "TUDO OK") e o `sim-liga.js`.
- Auto-chute: o cliente dispara `POST /api/play/auto` quando o timer zera com a aba aberta
  (igual ao original, que exigia estar logado). Heartbeat `POST /api/me/heartbeat` a cada 60 s.
  O chute do VIP com o app FECHADO está pronto mas **desligado** (`VIP_OFFLINE_AUTO = false`; ver "VIP pago").
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
  Memória 14h, De que time é? 15h, Camisas 16h, Alvo no Gol 17h, Hat Trick 18h, Falta PRO 19h**; jogo novo pega a
  próxima hora livre (20h…), nunca repetir hora. Termo/Quiz/Estatísticas usam `dayNumber`/`quizDayNumber`/
  `statsDayNumber`; os outros, `dayNumberAt(hora)`/`nextResetAt(hora)` (`time.js`: o nº do dia é
  a data em que a janela TERMINA — por isso a troca da meia-noite para a hora nova não tirou nem
  deu partida a ninguém). Textos de "já jogou" usam `resetLabel(jogo)` ("renova às 14h"). A Home mostra o **slider horizontal de minigames**
  (`MinigameSlider.tsx`, dados de `GET /api/daily/hub`): catálogo em `MINIGAMES` (`rules.js`)
  com o **nível que libera cada um** (Termo 0, Quiz 0, Party 1, Memória 2, Estatísticas 3,
  De que time é? 4, Camisas 5, Alvo no Gol 6, Hat Trick 7, Falta PRO 8, Baú 9, Embaixadinhas 12, Disputa 1x1 15); `soon: true` =
  **escondido** (não aparece no slider nem no /api/meta — decisão do dono, 14/09/2026: só o que já está no jogo). O nível também é conferido no servidor ao começar (403 `locked`).
  Minigame novo: entrada em `MINIGAMES` (tirar o `soon`) + `DAILY_GAMES` + `calendar()` +
  serviço + tela; o gol dele pede um valor novo no enum `KickKind` (migração). **Regras do
  dono (13/09/2026): um minigame por vez, perfeito e funcional antes do próximo; TODO
  minigame vencido dá exatamente 1 gol + outro bônus (nível, dinheiro…), nunca mais de 1 gol;**
  **EXCEÇÕES de propósito: o Camisas e o Hat Trick** (decisões do dono, 13/09/2026): o Camisas dá
  1 gol a cada 4 camisas certas e segue até errar; no Hat Trick cada gol é gol do time até perder as
  3 vidas — vários gols no dia; não "corrigir" para 1 gol.
  o slider vem ordenado do servidor: disponíveis primeiro (começado na frente), depois os já
  jogados pelo que volta antes, depois bloqueados por nível, por fim "em breve".
  **Party GoL** (números do dono, 17/09/2026): giro de **R$ 100** e **10 giros por dia para todo mundo**
  (`PARTY_SPINS`; conta as Activity PARTY do dia; `GET /api/play/party` = giros usados/limite). A roda tem 8
  casas e **três pagam, cada uma o seu valor: R$ 300, R$ 800 e R$ 1.500** (`PARTY_PRIZES` em rules.js, na ordem
  das fatias da tela; o `/api/meta` manda `partyPrizes`). O sorteio tira UMA CASA em 8 (nunca decide
  "ganhou/perdeu" antes de escolher a casa, senão os três prêmios deixariam de ser 1/8 cada). Isso dá
  **+R$ 225 por giro em média** — de propósito (dono: "não é ganhou levou 1.500… ele tem chance de estourar.
  Como a economia tá difícil temos que dar chance do jogador fazer dinheiro"): 93% dos dias fecham no lucro,
  0,9% perdem os R$ 1.000. O gol vale só na **primeira vitória do dia** (senão dinheiro compraria gols).
  **Acabaram os giros, o cartão SAI da frente no slider** (`minigamesHub` conta as Activity PARTY — o Party
  GoL não tem linha em `DailyGame` — e devolve `finished` + `nextAt` = meia-noite). Mexeu na roleta?
  **`node scripts/test-party.js`** (pasta api/, só banco LOCAL).
  **Dinheiro dos chutes e dos minigames** (dono, 17/09/2026, depois de medir 3 dias de produção: metade dos
  jogadores com R$ 1.080 no bolso e 89% dos gols vindos dos chutes): chute direto R$ 10, pênalti 40, falta 90,
  trilha 160 (`MONEY`) — quanto mais difícil, mais paga; e cada minigame paga pela dificuldade MEDIDA, em
  `MINIGAME_MONEY` (Alvo 3.000, Estatísticas 2.500 … Termo/Quiz 700, Memória 500). `applyResult` usa essa
  tabela por gol quando o serviço manda `money: 0` e o kind está em `MINIGAME_MONEY_KINDS` (Termo, Quiz, Stats,
  Memória, Qualtime, Camisas, Alvo, Hat Trick, Falta PRO, Ganha ou Perde, Cabeção — fora chutes, PARTY, X1 e
  Frangaço, que têm o próprio valor); quem não está na tabela cai em `MONEY.MINIGAME_WIN`. O card do minigame
  mostra o valor lido da própria tabela (`premio()` em rules.js) — **não escrever o número à mão** no texto.
  Fora de produção, `TERMO_DAY=<n>` / `QUIZ_DAY=<n>` forçam o dia (teste da virada).
- **Quiz do dia** (`lib/quiz/`): 5 perguntas de 4 alternativas, 20 s cada. O relógio é do
  servidor (começa no `POST next`; estourou + 2,5 s de tolerância = erro); alternativas
  embaralhadas por jogador; a certa só vai ao cliente depois da resposta. Cada acerto +6 de
  nível; 3+ acertos = 1 gol normal (kind `QUIZ`); não dá dinheiro. Perguntas em `q-*.js`
  (`a[0]` é a correta — só fatos certos e estáveis); o calendário é `ORDER` em
  `questions.js`: **pergunta nova entra no fim de `ORDER`**. 172 perguntas = 34 dias.
- **Loja** (`lib/items.js` = catálogo estático + efeitos; `services/shop.js`; tabelas `UserItem`
  com validade/nível/equipada/consumida e `ShopLog`): Energia do chute nv 1–5 (−10 %/nível na
  recarga de pênalti/falta/trilha, 28 h, **até o piso de 4:30**), Boost Auto (−30 s no chute direto, 28 h; o
  chute direto nunca fica abaixo de 4 min — dono, 17/09/2026), Caneleira (R$ 10 mil desde 17/09/2026; sorteia
  a última linha da trilha, gasta quando a trilha termina nela), **Atacante extra** (R$ 1.000 por HORA, dono
  17/09/2026 recuperando o buff do BRGOL: a última linha passa a ter 2 casas livres de 3 em vez de 1 — o gol
  na trilha vai de 17 % para 33 % enquanto durar; vale junto com a Caneleira, ficando a linha mais fácil das
  duas), Chuteiras (+2 % a +10 %
  em pênalti/falta, 30 dias, só uma equipada), troca de nick, cor do nick (`User.nickColor`, nível 8+),
  **Troca de time** (dono, 15/09/2026: R$ 50 mil ou 1 VIP do banco; `TEAM_CHANGE` + `changeTeam` em `services/shop.js`,
  `POST /api/shop/team {teamSlug, currency}`; antes era de graça e sem tela — o endereço antigo `/api/me/change-team`
  agora cobra igual, nunca voltar a trocar de graça por ele; o painel de admin continua trocando sem cobrar). Contrato
  de contratação segura (409 sem cobrar); sai da diretoria (propostas abertas voltam); zera o contador da rodada; trava a
  linha do jogador (FOR UPDATE, como o aceite). Tela: linha no painel PERFIL da Loja com o escudo do time escolhido.
  **Mexeu? Rode `node scripts/test-troca-time.js`** (pasta api/, só banco LOCAL; tem de dar "TUDO OK").
  Os efeitos entram por `cooldownFor` (rules.js → `applyItemCooldown`), `bootBonus` nas chances e
  `shinGuard` no layout da trilha — **o usuário precisa vir com `items`**: carregue com
  `meInclude()` (items.js) em tudo que vira `meView`. Preços/regras: só em `items.js`.
- **Nick em degradê** (benefício do VIP; pedido do dono, 15/09/2026, estilo speedrun.com): `User.nickFade`
  = `"azul>roxo"` (chaves de `NICK_FADE_COLORS` em `lib/items.js`, 12 tons médios que leem bem no painel
  branco e no fundo marinho); `POST /api/me/nick-fade {from,to}` (403 sem VIP; `{from:null}` tira).
  `nickFadeOf(user)` (items.js) só devolve as cores `{a,b}` com VIP ativo — vencido, some; renovou, volta.
  Toda view que manda nick (meView/publicView, chat, rankings, liga, partida, ativos, painel) manda
  `nickFade`; na tela, **tudo passa por `lib/nick.ts` → `nickProps(u)`** (fade > cor da loja > azul VIP >
  padrão) — nick novo em tela nova = usar `nickProps`, não montar classe à mão. **O `nickProps` vai num `<span>` SÓ
  com o nick**: o degradê é texto recortado e é herdado — o "P"/"D" do cargo, a linha do X1 ou outro texto dentro
  dele ficam transparentes (bug de 15/09/2026). Seletor no Perfil
  (`components/NickFade.tsx`, paleta vem de `meta.nickFades`); benefício listado na tela do VIP.
- **VIP pago** (decisões do dono, 13/09/2026; `services/vip.js`, `lib/efi.js`, `routes/vip.js`, tela
  `/vip` = `Vip.tsx`, tabela `VipPurchase`, migração 0018): pacotes de **dias de VIP** (`VIP_PACKS` em
  `rules.js`, preços propostos à espera do OK do dono) pagos por **PIX na Efí**. Os dias caem no banco
  de VIPs (`User.vipDays`, 1 VIP = 1 dia) e o jogador ativa quando quiser (`activate-vip`). Regras de
  segurança (lições do Rifa Express): txid gravado ANTES da cobrança; QR pendente do mesmo pacote é
  reaproveitado (nunca regerar por cima); no máximo 3 PIX abertos (30 min cada); só credita quando a
  PRÓPRIA cobrança está `CONCLUIDA` na Efí com valor ≥ o do pacote — nunca por valor/horário;
  `e2eId` único no banco; crédito numa transação que só muda `PENDING → PAID` (credita uma vez).
  O aviso da Efí (`POST /api/pay/efi/<EFI_WEBHOOK_SECRET>/pix`) só dispara a conferência. 3 caminhos
  de confirmação: aviso, a tela perguntando a cada 4 s e `vipReconcile` no scheduler (2 min).
  Credenciais `EFI_*` só no `api/.env` da VPS (ver `.env.example`); aviso registrado com
  `node scripts/efi-webhook.js`. **A chave PIX (`EFI_PIX_KEY`) tem de ser só do JogaGol**: a Efí guarda
  UM aviso por chave, e registrar o nosso numa chave de outro projeto (Rifa Express) derruba o de lá.
  **Ligado em 13/09/2026** com a conta Efí da plataforma Rifa Express (decisão do dono) + chave aleatória
  só do JogaGol; aviso registrado. A Rifa (outro repo, `ericklesv/rifaexpress`) tira da lista de PIX e do
  webhook todo txid "JG"+32 hex (`isJogaGolTxid`) — **não mudar o formato do `newTxid()`** sem mexer lá.
  Sem credenciais, a tela mostra "A compra por PIX abre em breve". **Os pacotes dão saldo junto** (pedido do dono,
  15/09/2026; `VIP_PACKS[].money`, guardado em `VipPurchase.money` na compra — migração 0031 — e creditado na mesma
  transação do VIP): R$ 50 mil · 200 mil · 450 mil · 1 mi · 2,25 mi · 5 mi (~10 % a 20 % do pacote em VIP, na
  escala da Loja onde 1 VIP = R$ 50 mil; aprovado pelo dono em 15/09/2026 — mudar só em `rules.js`). A tela mostra "+ R$ X de saldo" no pacote e no PIX confirmado.
  Teste no PC: `EFI_FAKE=1` (botão "Simular pagamento"; ignorado com NODE_ENV=production) — **nunca na VPS**.
  **Auto-chute com o app fechado para VIP ativo** (`vipOfflineAutoKicks` em `play.js`, a cada volta do
  scheduler): quem tem `vipUntil` no futuro e não está suspenso chuta sozinho quando a recarga do
  chute direto (5 min) acaba — mesma regra do `POST /api/play/auto`. **DESLIGADO por decisão do dono
  (13/09/2026, "por enquanto")**: interruptor `VIP_OFFLINE_AUTO` em `rules.js` (false = o scheduler não
  chuta e a tela do VIP esconde o benefício). Não religar sem o dono pedir.
- **Modo livre — SÓ no PC** (`MODO_LIVRE=1` no ambiente; `freeMode()` em rules.js, ignorado com NODE_ENV=production;
  pedido do dono em 14/09/2026 para gravar vídeo de propaganda): chutes sem recarga (`cooldownFor` = 0), sem captcha e
  minigames sem limite do dia (`routes/daily.js` apaga as partidas terminadas do jogador a cada chamada). Junte com
  `MINIGAMES_LIVRES=1` (Hat Trick/Falta PRO/Frangaço). **NUNCA no .env da VPS.**
- **X1 — jogos 1x1 ao vivo, um por dia** (pedido do dono, 15/09/2026: "cada dia 1 jogo para não ficar enjoativo";
  substituiu o card do FutPrego). `realtime/x1.js` (WebSocket `/api/ws/x1`, e `/api/ws/futprego` como nome antigo;
  `mode=game` na tela `/x1` = `screens/X1.tsx`, `mode=lobby` no convite `components/X1Invite.tsx`). O jogo do dia
  alterna **às 19h de Brasília, junto com o fechamento da rodada** (decisão FINAL do dono em 16/09/2026, depois de
  ir e voltar entre 19h e 20h no dia 15 — não mudar de novo sem ele pedir; `X1.switchHour`, `x1GameOf(dayNumberAt(19))` em `rules.js`/`x1.js`,
  **atenção ao histórico**: o dono pediu 19h em 15/09, o Guilherme reverteu na mesma noite anotando "confirmado
  20h" (commit 02dd9d4) e o dono pediu 19h DE NOVO em 16/09 — se for mudar, combine entre vocês antes;
  `X1.games`): **FutPrego** (futebol de prego, `lib/futprego.js`, 1 peteleco na bola por vez), **Futebol de Botão**
  (`lib/botao.js` = física determinística; `lib/botaoMatch.js` = regras puras; como o SnapFC, sem poderes); o
  **Futgolf**, que **entra no rodízio às 19h de 24/09/2026** (dono: "pode programar o futgolf para as 19h"; ver o item
  dele logo abaixo). **O rodízio muda por data** (`X1.rotations` em rules.js: cada rodízio vale a partir do dia `from` —
  o `dayNumberAt(19)` de lib/time.js — e parte da sua `anchor`, um dia e o jogo daquele dia; `x1RotationOf(dia)`): até o
  dia 13, FutPrego e Botão alternando; do dia 14 (24/09 às 19h) em diante, Futgolf → FutPrego → Botão. Com `dia % n`,
  mudar o número de jogos trocaria o jogo de hoje no meio do dia — **jogo novo = rodízio novo começando num dia FUTURO**.
  A tela recebe `order` (o rodízio de hoje), `nextOrder` (o que vale depois da troca) e `names` no `x1Today` e anda o
  rodízio com `advanceX1Today` (components/X1GameSwitch.tsx) — com a meta carregada antes da troca, ela já entra no
  rodízio novo. Regras de
  dinheiro e travas iguais para todos (`FUTPREGO` em rules.js — o nome ficou): cada um põe R$ 200, quem vence leva
  R$ 400 + 1 gol e o time do outro perde 1 gol na rodada; **só as 10 PRIMEIRAS PARTIDAS válidas de cada jogador em
  cada hora cheia de Brasília mexem no placar** (dono, 15/09/2026; `FUTPREGO.maxGoalsPerHour` — o nome ficou): empate
  gasta uma das 10; revanche repetida (`X1Match.repeated`, migração 0035) e amistoso não; cada um conta as suas —
  vitória dentro das 10 do vencedor dá o gol, derrota dentro das 10 do perdedor tira 1 gol do time dele (mesmo que o
  gol do vencedor não tenha valido); da 11ª em diante, até a hora virar, só dinheiro (`why: 'limite'`/`lossLimit` na
  tela). Antes eram dois contadores separados (10 vitórias com gol e 10 derrotas) e quem jogava muito terminava a
  hora no zero a zero; `test-futprego.js` passo 13 cobre; **quem não é VIP espera 2 min depois de terminar uma partida para DESAFIAR de novo** (aceitar
  pode na hora; dono, 15/09/2026: "como o X1 ficou ilimitado, o vip perdeu valor" — `FUTPREGO.challengeCooldownSec`,
  `challengeCooldownUntil` em x1.js lê a última partida FINISHED no banco; a tela recebe `cooldown`/`over.cooldownUntil`,
  desliga o botão com o relógio e mostra "Vire VIP e jogue o X1 ilimitado!"; item "X1 ilimitado" na tela do VIP);
  mesma dupla com o mesmo vencedor duas vezes **seguidas** = a 2ª não vale gol — seguidas = a partida ANTERIOR do
  vencedor (das que contam; amistoso não quebra) foi contra o mesmo adversário; jogou com outra pessoa no meio, vale
  (bug de 15/09/2026: olhava só o último confronto dos dois, mesmo com dezenas de partidas no meio; o
  `test-futprego.js` passo 12 cobre); **dois do MESMO time podem jogar =
  AMISTOSO** (dono, 15/09/2026: "não vale gol, apenas dinheiro"): o vencedor leva o pote e mais nada — nenhum gol
  ganho ou tirado, fora das travas por hora, da regra da mesma dupla e do Ranking X1/campanha/prêmios/medalhas
  (`X1_SAME_TEAM` = `aTeamId` igual a `bTeamId`, os times gravados na partida; `X1_COUNTED` o exclui, `X1_PLAYED` não —
  o retrospecto conta amistoso). Ao desafiar, um desafio aberto de OUTRO time tem preferência sobre o de um colega;
  convite, lista de desafios, `match` e `over` (`why: 'mesmo-time'`) trazem `sameTeam` e a tela fala "amistoso". A
  **MESMA INTERNET agora JOGA, como TREINO** (dono, 17/09/2026: "libere, às vezes as pessoas só querem se divertir um
  pouco" — antes o desafio simplesmente não aparecia e parecia bug): `treinoPorIp` em realtime/x1.js liga `m.freeplay`
  e aí **ninguém aposta (a partida grava `bet: 0`), ninguém ganha dinheiro, não vale gol e fica fora do Ranking X1**
  (`X1_SAME_IP` = `aIp` igual a `bIp`; `X1_COUNTED` exclui amistoso de time E treino de internet). Convite, lista,
  `match` e `over` (`why: 'mesma-internet'`) trazem `freeplay` e a tela fala "treino". Assim não sobra brecha para
  farmar gol/dinheiro entre duas contas da mesma casa. Teste: `node scripts/test-x1-mesma-internet.js` (API local com
  X1_JOGO=BOTAO e SEM FUTPREGO_MESMO_IP). **Sair da partida = derrota, SEMPRE**
  (bug explorado, dono 15/09/2026: desistir, fechar o app — W.O. após `reconnectSec` — ou perder a vez 3 vezes é
  derrota de quem saiu; o antigo "W.O. cedo" que devolvia a aposta antes de cada um jogar 2 vezes ACABOU, `woMinTurns`
  não existe mais; resultado já decidido fica em `m.pending` até a animação acabar — quem desistir/cair nesse
  meio-tempo leva o gol/o resultado, não a desistência); bot de treino depois de 1 min (não vale nada). Botão (`BOTAO` em rules.js): 7 botões por
  time (goleiro preso na área; os de linha não entram em área), 2 petelecos por vez num botão seu (quem começa dá 1 na
  1ª vez — medido: assim quem começa vence ~45%), 15 s cada; **o 1º gol acaba** (dono: "4 minutos é muito tempo");
  sem gol em 9 vezes (somando os dois) = **DEATH MATCH** (dono, 16/09/2026, no lugar dos pênaltis; `BOTAO.death` em
  rules.js, `startDeathMatch`/`dropPiece` em lib/botaoMatch.js): os botões ficam onde estão, os DOIS GOLEIROS saem na
  hora, 1 peteleco por vez e **sempre na força máxima** (o servidor ignora a força pedida — a tela também manda 1), o
  botão que o jogador usou SAI do campo depois da jogada até sobrar 1x1 (o último nunca sai), perder o tempo custa o
  botão mais longe da bola (senão dava para enrolar), **as ÁREAS ficam liberadas** (sem goleiro, barrar ali matava o
  melhor lance do ataque — relato de jogador em 16/09) e **a bola rola 30% mais** (`BOTAO_PHYS.deathBallFriction`),
  e 5 rodadas de 1x1 sem gol = empate. Eventos novos no WebSocket: `deathStart` (em `bturn`) e `out` (em `snap`). **Mexeu no death match? Rode `node scripts/test-deathmatch.js`** (pasta api/, sem
  banco). Partidas na tabela `FutPregoMatch`
  (modelo Prisma `X1Match`, migração 0028: `game`, `seasonId`, `scoreA/B`). **Perfil**: `x1` em
  `GET /api/players/:nick` (`x1Record` em `services/x1.js`: total com pontos e sequência sem perder, cada jogo e a
  temporada no Ranking X1 com a posição) → `components/X1Record.tsx`. Teste no PC: `X1_JOGO=BOTAO` ou `FUTPREGO`
  força o jogo do dia e `FUTPREGO_MESMO_IP=1` deixa jogar com duas janelas na mesma internet (os dois ignorados com
  NODE_ENV=production) — **NUNCA no .env da VPS**. Mexeu? Rode (pasta api/, só banco LOCAL, API no ar com o
  `X1_JOGO` certo) `node scripts/test-botao.js`, `node scripts/test-futprego.js` (os dois criam os jogadores direto no
  banco, VIP por padrão) e, sem banco, `node scripts/botao-balance.js` (física e equilíbrio do Botão) e
  `node scripts/test-rivalidade.js`.
  **Retrospecto contra o adversário** (pedido do dono, 15/09/2026; `headToHead` em `realtime/x1.js`, os dois jogos
  juntos): ao casar a partida, a mensagem `match` de cada lado traz `h2h` na perspectiva de quem recebe (`{total, wins,
  losses, draws, last: ['V'|'D'|'E' × até 5, a mais recente primeiro], lastAt, streak}`; `null` no treino contra bot).
  Conta só partida de verdade FINISHED entre os dois, sem `wo-cedo`. A tela mostra a faixa `H2HStrip` entre a barra do
  adversário e o campo ("Contra X: 2V · 1E · 0D" + últimas 5; "Primeiro confronto" se nunca jogaram).
  **No fim da partida** (pedido do dono, 15/09/2026): a mensagem `over` traz `h2h` já com a partida que acabou e
  `rivalry {kind, text}` = frase de provocação que faz jus ao confronto (freguês, tabu quebrado, paternidade, virada no
  confronto, clássico…), escolhida em `lib/rivalidade.js` (puro: `h2hOf` = retrospecto na perspectiva de quem lê,
  `rivalryKind` = o momento, na ordem de prioridade, `rivalryLine` = sorteia uma frase do momento; o gênero vira
  freguês/freguesa, o/a, ele/ela). Só quando a partida entrou no retrospecto (W.O. cedo e treino: nada). Tela:
  `components/Rivalry.tsx` dentro do `GoalOverlay` (prop `children`; o resultado novo carimba na frente das últimas 5,
  o número que mudou pula e a frase entra por último; a janela fica 10 s). Frase nova = entra na lista do momento em
  `LINES`.
  **Provocar — caretas e frases prontas durante a partida, estilo Clash Royale** (pedido do dono, 15/09/2026;
  catálogo `PROVOCAR` em `rules.js`, mandado no `hello` do WebSocket como `rules.provocar` — a tela não duplica;
  `onProvocar` em `realtime/x1.js`; ícones em `web/public/ui/emotes/` = pictogramas do pack Layer Lab pintados +
  `frango.svg` desenhado). Botão de balão ao lado de "Desistir" abre a bandeja (`ProvocarTray` em `X1.tsx`): 8 caretas
  (Risada, Choro, Raiva, Espanto, Joinha, Coroa, Dormindo, Frango) e 10 frases (Boa!, Bem jogado!, Anda logo!, Tá
  tremendo?, Freguês!, É só isso?, Nem doeu!, Hoje não!, Cheirinho de gol…, Vai chorar?). **Sem VIP só as 4 caras
  básicas; o resto (caretas extras e TODAS as frases) é do VIP** (decisão do dono, 15/09/2026; item na tela do VIP;
  os trancados aparecem com cadeado e "Vire VIP e libere tudo"). Cliente manda `{t:'provocar', key}`; o servidor
  confere partida ao vivo, chave da lista, VIP (**lendo `vipUntil` do banco** a cada provocação do VIP — ativou ou
  perdeu o VIP com a tela aberta, vale o banco) e ritmo (1 a cada `gapMs` = 2 s, fora do ritmo = ignorada; 5 em 15 s
  = 10 s de castigo, `provocar-wait`) e devolve `{t:'provocar', side, key}` para os DOIS (quem mandou vê o próprio
  balão pela volta do servidor). Nada no banco. Balão ao lado do avatar (`PlayerBar`: o meu sobe, o do adversário
  desce), some em `showMs` (2,8 s); som "pop" ao receber. **Silenciar** (X vermelho no balão do adversário ou na
  bandeja): só na tela de quem silenciou, vale a partida (zera na próxima; `resumed` mantém). No treino, o bot
  responde com uma sorteada. Mexeu? `node scripts/test-botao.js` tem o caso (relay, ritmo, chave inválida, VIP).
  **Janela do jogo do dia** (pedido do dono, 15/09/2026; `components/X1GameSwitch.tsx`, montada no Layout e no
  começo da tela do X1 com `gate={false}`): na troca das 20h com o app aberto ("MUDOU O JOGO DO X1") e, para quem
  abre depois, 1x por dia-de-jogo por conta ("X1 DE HOJE"; `localStorage brgol.x1Jogo.<id>` = o `switchAt` do dia
  mostrado). Mostra a "foto" do jogo (a tábua do FutPrego / o campo do Botão nas cores do time, os mesmos
  componentes do começo do X1), como se joga, o que vale e "os jogos entram em rotação todo dia: às 20h, depois do
  fechamento da rodada, troca para X". `effectiveToday(meta.x1.today, now)` corrige a meta velha (carregada uma vez no
  boot) invertendo hoje/amanhã a cada troca já passada. No Layout espera a Presença e o aviso das séries; o convite
  do WhatsApp espera ela (`x1SwitchSettled`).
  **Raio-X (brincadeira do dono, 15/09/2026; SÓ as contas MVGIC e ericklesv)**: na tela do X1 a tecla **R** liga/
  desliga a trajetória exata da mira (traço branco; dourado + "GOL" quando entra; no Botão também o caminho do botão
  em azul). Enquanto arrasta, a tela manda `{t:'preview', seq, dx, dy, power[, idx]}` (~12/s) e o servidor
  (`onPreview` em `realtime/x1.js`, `XRAY_NICKS` — e `XRAY_NICKS` em `X1.tsx`) simula com a MESMA física do peteleco
  (`simulateFlick`/`simulateSnap` são determinísticos) e devolve
  `{t:'preview', seq, path, piece, goal}`; outra conta é ignorada em silêncio. **Os dois precisam saber quando o
  outro está com o Raio-X ligado** (dono): a tela manda `{t:'xray', on}` ao ligar/desligar (e ao reconectar), o
  adversário — se for uma das duas contas — recebe `xray-opp` (selo vermelho "RAIO-X" na barra dele + toast) e a
  `match` traz `oppXray`. **Não avisa no Telegram** (dono, 19/09/2026: "faça o bot do telegram parar de
  notificar o RAIO X" — virou enxurrada no grupo; quem precisa saber já vê o selo na tela). Contas comuns não
  veem nada. Nada no banco.
  **Cliente automatizado = 1 partida a cada 20 min** (dono, 20/09/2026, depois de flagrar o Xumbera com um programa
  em Node ligado direto no WebSocket da partida — UA "node", sem Origin, sem `device=`; 521 conexões num dia, 40V 9D:
  "bloquear o bot dele e permitir apenas 1 partida a cada 20 min"; `automatedClient` em `realtime/x1.js`,
  `FUTPREGO.autoClientGapMin`): em produção, conexão `mode=game` que não é navegador (UA de programa ou sem
  `Mozilla/`, Origin diferente de `https://jogagol.com.br`, ou sem `device=` — todo navegador manda os três; o log
  do nginx confirmou que só o `node` vinha sem `device=`) ganha `conn.auto`: desafiar E aceitar só passam se a última
  partida terminada da conta tem 20+ min (`auto-cooldown`, com `until`); o navegador da MESMA conta segue normal
  (a regra é do cliente). **Sem aviso no Telegram** (dono, 20/09: "vai virar um spam") — só 1 linha no log do pm2 por
  conta. No PC só o UA "node" marca (os testes usam a
  lib `ws`, sem Origin). **Mexeu? `node scripts/test-x1-cliente-auto.js`** (pasta api/, API local no ar).
  **Trava de atualização — deploy sem partida travada** (pedido do dono, 15/09/2026: o `pm2 restart` derrubava as
  partidas no meio, a tela ficava "travada"): o `brgol-deploy.sh` (cópia em `tools/vps/brgol-deploy.sh`), quando a API
  muda, faz 1) `POST /api/admin/x1/drain {seconds}` (`startX1Drain` em `realtime/x1.js`: ninguém desafia/aceita/
  treina — erro `atualizacao` —, os desafios abertos são cancelados com o motivo, todas as telas recebem
  `{t:'drain', until}` e o Lobby mostra "Atualizando o JogaGol…" com o botão travado; `hello.drain` e
  `GET /api/x1/status.drain` também), 2) instala/migra e **espera `status.matches` chegar a 0** (até `X1_WAIT_SEC`
  = 240 s; Botão ~1 min, FutPrego até ~3 min), 3) `POST /api/admin/x1/cancel` (`cancelX1Matches` → `cancelMatch`:
  linha `CANCELED` motivo `atualizacao` — fora do ranking/retrospecto/lances —, aposta devolvida aos dois, `over`
  com `canceled: true` e o texto "Partida cancelada: o JogaGol está sendo atualizado…"), 4) `pm2 restart`.
  `POST /api/admin/x1/resume` destrava sem reiniciar (deploy abortado). Quem reconecta "dentro" de uma partida ou
  espera que o servidor não tem mais recebe `no-match` no `hello` e a tela volta ao começo com o aviso (antes ficava
  presa em `match`/`waiting`). Mexeu? `node scripts/test-deploy-x1.js` (pasta api/, banco LOCAL, `ADMIN_KEY` no
  .env local).
  **Ranking X1** (aba "Ranking X1" em Rankings com sub-abas Rodada / Temporada / Geral — nome e regras do dono,
  15/09/2026; conta os DOIS jogos do X1; `/rankings?aba=x1` ou `?aba=x1-temporada` abre direto). Tudo em
  **`services/x1.js`**: `GET /api/rankings/x1-rodada|x1-temporada|x1-geral` (`futprego` = alias de geral, `x1` = da
  temporada) → `x1Ranking`: **pontos = 3 por vitória, 1 por empate, −2 por derrota** (`FUTPREGO.points`, pode ficar
  negativo); desempate por vitórias, maior sequência sem perder, menos derrotas. Só partida de verdade FINISHED sem
  `wo-cedo`, sem amistoso do mesmo time e sem treino da mesma internet (`X1_COUNTED` — tem `NOT`: com outro `NOT`
  na consulta, junte por `AND`);
  **a partida conta no período em que TERMINOU** (`finishedAt`; rodada =
  `[round.startsAt, fechamento)`, temporada = `season.startsAt`); conta excluída não aparece. Linha = formato da
  artilharia (`goals` = pontos) + `fp {wins, draws, losses, played, points, streak, best, eligible?, prize?, need?}` —
  `best` = maior sequência sem perder (V/E seguidos, D zera), `streak` = a atual; `TopList` mostra "3V · 1E · 0D · sem
  perder: máx. N (agora M) · prêmio R$ X + Y VIP" ou "faltam N partidas p/ prêmio". **Prêmios** (`FUTPREGO.prizes`):
  rodada 1º R$ 10 mil + 2 VIP · 2º R$ 5 mil + 1 VIP · 3º R$ 2,5 mil; temporada 1º R$ 100 mil + 15 VIP · 2º R$ 50 mil +
  5 VIP · 3º R$ 25 mil; **só entre quem tem `minGames` = 3 partidas no período** (quem tem menos aparece na lista, o
  prêmio pula para o próximo). Pagamento: `settleX1Round`/`settleX1Season`, chamados em `settleDueRounds` DEPOIS da
  transação da liga, em transação própria e idempotente (`SELECT … FOR UPDATE` na rodada/temporada; só paga se
  `Round.x1Json`/`Season.x1Json` for null — migração 0027 — e grava ali o quadro + `paid`); um erro no X1 nunca
  segura o fechamento da rodada. Cada premiado vira lance ao vivo ("X foi o 1º do Ranking X1 da rodada N … e
  ganhou R$ 10.000 + 2 VIP!").
  **Lances ao vivo** (pedido do dono, 15/09/2026): todo resultado que conta entra em `Activity` (kind = o jogo,
  `FUTPREGO` ou `BOTAO`) em `settle()` — vitória com gol (via `applyResult`, + linha do perdedor), vitória sem gol
  (limite de 10 por hora / revanche repetida, com o motivo), empate; `how` acrescenta "por W.O." / "(ele desistiu)" /
  "(gol contra dele)".
  **Uniforme reserva quando os times se confundem** (amistoso: dono, 15/09/2026; todo confronto: pedido do Erickles,
  22/09/2026, depois de um jogador reclamar de Flamengo x Athletico-PR idênticos no Botão): `matchPaints` em
  `lib/paint.ts` decide as cores das peças da partida. `kitClash` compara as duas peças como a tela pinta (miolo ~72 %
  + aro, com o desenho do uniforme; diferença de cor em CIELAB) e diz que se confundem quando o conjunto é parecido
  (vermelho e preto x vermelho e preto…), quando o MIOLO é da mesma cor e só o aro muda (Flamengo x Internacional) ou
  quando as duas são quase todas da mesma cor (Sport, com a faixa preta na diagonal, x São Paulo) — números em
  `KIT_CLASH`. Aí o lado 1 (quem aceitou) veste a reserva — `reservePaint`: time de cor escura → reserva BRANCA com a
  cor do time no detalhe (a 3ª cor sai; só invertendo, o Santa Cruz tricolor ficava parecido demais); time de cor clara
  (Santos, CRB…) → cores invertidas, base na secundária; mesmo desenho. Se a reserva também se confundir, o lado 0 veste
  a dele; senão, o lado 1 vai de 3º uniforme (`THIRD`). Com os 48 times de hoje: **188 dos 1.128 confrontos** trocam e
  **nenhum** continua confuso (nem precisou de lado 0 ou 3º uniforme). Amistoso cai aqui sozinho (peças iguais). O
  rodapé diz quem está de reserva. As "fotos" do X1 (começo da tela e `X1GameSwitch`) usam `previewPaints` (o
  adversário genérico branco troca se confundir com o seu time, ex.: Santos). Só na pintura das peças (Prego e Botão),
  nada no servidor: depende só dos dois times e do lado, então os dois aparelhos pintam igual. Time/cor/desenho novo
  ou mexeu no `KIT_CLASH`? **Conferir por print: rota oculta `/debug-x1-kits?confrontos=1`** (sem login; todos os
  confrontos que se confundem, antes e agora; `&times=a,b,c` = só entre esses, `&todos=1` = também os que não se
  confundem, `&so=prego` = FutPrego). `/debug-x1-kits?times=santa-cruz,flamengo` segue mostrando titular x reserva.
  **3ª cor do time** (`Team.colorTertiary`, migração 0029; `c3` em `data/teams.js`; só Santa Cruz = branco por
  enquanto, pedido da torcida 15/09/2026): no X1 a peça fica listrada na horizontal primária · terciária · secundária
  (prego em `PregoBoard`, botão em `BotaoField` com o aro na 3ª cor) — a 3ª cor no meio separa as outras ("sem o
  preto tocar no vermelho").
- **Futgolf — 3º jogo do X1** (aprovado pelo dono em 23/09/2026 a partir das telas de exemplo; pedidos dele: "campo
  maior", "powerups na pista, como as setinhas de boost, coisas para bater e receber bump como uma mola", "mais shapes e
  nada tão óbvio"). **Em teste de 24/09/2026 até entrar no rodízio, às 19h do mesmo dia** (dono, primeiro: "Libere
  apenas para as contas MVGIC e ericklesv. Os adversários precisam ser bots, aceitando em 5 s… não mostre o aviso, ainda,
  para outros usuários"; depois: "adicione um botão embaixo de 'Desafiar alguém' chamado 'Testar FutGolf', visível apenas
  para os admins… os admins devem voltar a ter o botão de desafiar de antes"). **Jogo em teste** (`X1.test` em rules.js:
  `game`, `botAcceptSec` = 5) = o que não está no rodízio de HOJE (`inTest` em realtime/x1.js): só os **admins**
  (`User.isAdmin`; no PC também `X1_TESTERS=nick1,nick2`) recebem `today.test` na `hello` e veem o botão **"Testar
  FutGolf"** embaixo do "Desafiar alguém" (que para eles é o jogo do dia, como para todo mundo); o botão manda
  `{t:'challenge', game}` e o servidor recusa (`error` `jogo`) quem não é admin ou jogo fora de teste. O desafio de teste só
  aparece (lista, convite) e só pode ser aceito por admins e bots (`canSee`); nenhum admin aceitou em 5 s, um bot livre de
  outro time aceita e joga valendo, sem cota nem sorteio (`botEntraNoDesafio`, o mesmo do tutorial). O perfil só mostra a
  linha do jogo fora do rodízio para quem já jogou. **Entrou no rodízio, o teste acaba sozinho** e o botão some (a tela
  tira o `test` ao virar para o rodízio que já tem o jogo). Jogo novo no futuro: `X1.test.game` = ele e o rodízio novo
  numa data futura. Mexeu no teste? **`node scripts/test-futgolf-teste.js`** (pasta api/, API local com `X1_JOGO=BOTAO`,
  `BOTS_OFF=1` e `BOTS_X1_OFF=1`; cria dois admins; sem jogo em teste, confere só que ninguém recebe o botão e que
  desafiar fora do dia é recusado). Golfe de chute visto de cima, com a bola ROLANDO (física de
  chão, tipo minigolfe). **`lib/futgolf.js`** = física pura e
  determinística + os **8 buracos** (`HOLES`: Tabelinha, Bifurcação, Ilha, Fliperama, Zigue-zague, Slalom, Rotatória,
  Bueiros; cada um sorteado e espelhado ou não = 16 variações): corredor (linha central com larguras, Catmull-Rom,
  pontas arredondadas) fechado por placas + ilhas sólidas, placas soltas, zonas (`agua` = a bola volta de onde saiu e o
  chute conta 1 — NÃO 2: dono, 24/09/2026, "se alguém terminar em 3 e o outro estiver na 2ª, precisa esperar ele dar a
  3ª"; com +2 o outro "chegava a 3" com 2 chutes; `areia` = terrão, segura muito; `mato`; `seco` = terra firme por cima
  da água: ilha e ponte), **molas** (devolvem com força extra), postes (cone, jogador de barreira), **setas** (boost
  enquanto a bola passa), **bueiros** (entra num, sai no outro) e **rampas** (24/09: a bola que sobe rápida e no sentido
  dela DECOLA — no ar passa por cima de lagoa, terrão, mato, cones, molas, setas e bueiros, sente mais o vento e só bate
  nas placas; `FG_PHYS.ramp`; os quadros no ar são `[x, y, altura]` e a tela sobe/aumenta a bola com sombra no chão).
  **VENTO** (dono, 24/09/2026: "fator importante… atuando de fato como vento, só com a bola em curso, jamais parada"):
  sorteado no começo (`windRoll`: direção de 15 em 15°, força 0–5), vira um pouco a cada rodada (`windShift`: até 45° e
  ±1), igual para os dois; empurra só a bola que anda (proporcional à velocidade até `vRef`; no ar, ×1,8). A tela mostra
  a seta + força no canto e a bandeira do buraco aponta para onde ele sopra. **Buraco exigente na força** (dono,
  24/09/2026: "está muito fácil embocar… batendo forte e está embocando… a tacada tem que ser mais certeira em força"):
  só cai quem passa pelo MEIO abaixo de `cupV` = 200 (era 330: caía bola que ainda rolaria ~200; agora ~105), e fora do
  meio menos ainda (`cupV × (1 − (d/raio)²)^¼`); rápida demais passa por cima e, se pegou a borda, **tira tinta**
  (evento `beirada`: perde 15% e desvia); o buraco só puxa bola lenta bem na beirada. A janela de força que emboca caiu
  pela metade (0,44–0,75 → 0,44–0,61 num putt reto). **Cada mapa tem uma ASSINATURA** (ideia do dono, 24/09/2026, "como
  nos mapas do Valorant"): o Bueiros é o do teleporte — o **bueiro 3** (no meio dos cones) tem DUAS saídas sorteadas na
  hora, metade das vezes perto do buraco, metade lá atrás perto da saída (`tuneis[k][5]` = a saída do azar,
  `FG_PHYS.tunnelLuck` = 0,5; o sorteio vem de `s.luck`, sequência só do servidor que anda a cada passagem; o `tunel`
  traz `azar` e a tela avisa "Sorte!"/"Azar!"; o `distanceField` NÃO trata esse bueiro como atalho e o bot pesa as duas
  saídas, arriscando como gente 30% das vezes). A Bifurcação e a Ilha têm rampa. Campo de 400 de largura e 900–1.250 de
  altura (~2 telas): a **câmera segue a bola** e "Ver o campo" mostra tudo. **A câmera escreve o viewBox direto no DOM**
  (`golfPan` desliza até a bola): só mudando o estado, voltar da lagoa não mexia — a bola volta EXATAMENTE para onde
  estava, a câmera "nova" era igual à última que o React desenhou e ele não tocava no viewBox (bug de 24/09/2026). **`lib/futgolfMatch.js`** = regras puras: os dois **chutam AO MESMO TEMPO** (`FUTGOLF.kickSec`
  = 20 s por rodada; a bola do outro é um fantasma na tela), **quem embocar primeiro vence** (os dois na mesma rodada:
  menos chutes; empatou = **desempate**: um chute de cada do ponto `tb`, mais perto do buraco vence; iguais de novo, até
  `FUTGOLF.tiebreaks` = 3 vezes, depois empate com a aposta de volta). **Do 2º desempate em diante, no CAMPO DO
  DESEMPATE** (`TIEBREAK_HOLE`, dono 24/09/2026: "campo diferente, específico para desempates, com menor probabilidade de
  hole-in-one"): buraco dentro de uma coroa de cones aberta só por trás, terrão na frente — o balance confere que quase
  nunca cai de primeira; `s.hole` = o buraco sorteado, `s.course` = onde se joga agora; a `ground` traz `course` quando
  o campo muda. **Desempate decidido na DISTÂNCIA** (ninguém embocou): antes da janela do fim, a tela mostra as duas
  medidas em VERMELHO crescendo do buraco até cada bola, em ordem sorteada, e "MAIS PERTO!" no fim — 6,3 s
  (`components/FutgolfDrama.tsx`; dono: "dramática… totalmente aleatória… não mais que 7 s"; 1 unidade ≈ 1,6 cm); par + `FUTGOLF.overPar` (4) sem embocar = pegou a
  bola; perdeu o tempo = chute que não sai do lugar (3 seguidas = W.O.). Efeito: 3 botões (curva −1/0/+1). Dinheiro,
  gol, travas por hora, Ranking X1, retrospecto, provocar, Raio-X e trava de deploy = os mesmos dos outros jogos (settle;
  o placar gravado em `scoreA/scoreB` são os CHUTES). Gol e lances usam `KickKind` FUTGOLF (migração 0044).
  No servidor (`realtime/x1.js`): `scheduleGolf` abre a rodada **depois** da animação dos chutes da anterior — a mensagem
  `ground` chega ANTES de a rodada abrir (`turnEndsAt − kickSec`), e chute antes disso é ignorado (a tela espera; teste
  que chuta na hora recebe "ignorado" — foi o que quebrou o 1º desempate do test-futgolf.js); `gshot` vai na hora para
  as duas telas (quadros + eventos com o quadro `f`: `mola`, `seta`, `tunel` — a tela NÃO interpola entre a entrada e a
  saída do bueiro —, `rampa`, `pouso`, `agua`, `buraco`, `beirada`, `bate`); `gskip` = tempo esgotado. **Bots** (treino, tutorial e os "quase reais"):
  `futgolfAiKick` procura a jogada simulando com a mesma física, guiado por um **mapa de distância** (`distanceField`:
  Dijkstra que contorna placas/ilhas/água e conhece os bueiros; ATENÇÃO: `Float64Array` — com Float32 o arredondamento
  parava a busca), e erra pela `skill` (~20–40 ms por jogada). Tela: `components/FutgolfCourse.tsx` (placas de
  publicidade no contorno, setas piscando, bueiros com cor e número, bandeira de escanteio no buraco, árvores por
  `scenery`) + o ramo FUTGOLF de `screens/X1.tsx` (câmera no viewBox direto no DOM enquanto a bola anda, duas animações
  ao mesmo tempo, `GolfStrip`, `SpinPicker`); a "foto" do começo e da janela do jogo do dia é um recorte
  (`previewView`) do buraco `meta.x1.futgolf.preview`. **Conferir buracos: rota oculta `/debug-futgolf`** (sem login;
  `?buraco=ilha&espelho=1&camera=1`; `?buraco=desempate&drama=168,318;246,196` mostra as medidas do desempate), que lê
  `GET /api/x1/futgolf/buracos` (os 8 + o campo do desempate). **Mexeu nos buracos ou na física? Rode
  `node scripts/futgolf-balance.js`** (pasta api/, sem banco: chutes para embocar por nível de bot — tem de ficar perto
  do par —, determinismo, nenhuma bola fora do campo, toda saída de bueiro dentro dele, as DUAS rotas da Bifurcação
  equilibradas — dono: "não faz sentido ir pela direita" —, o bueiro 3 do Bueiros e o campo do desempate; foi ele que
  achou a bola escapando pela ponta de baixo e a saída do bueiro da Ilha em cima da placa); **mexeu
  na partida? `node scripts/test-futgolf.js`** (pasta api/, banco LOCAL, API no ar com `X1_JOGO=FUTGOLF`,
  `FUTGOLF_CHUTE_SEG=4` e `BOTS_X1_OFF=1`; `FUTGOLF_CHUTE_SEG` só vale fora de produção). Buraco novo = entrada em
  `HOLES` com `par` que o balance confirme e um `tb` de desempate longe do buraco (perto demais os dois embocam).
- **Bots "quase reais"** (pedido do dono, 18/09/2026: "preencher os times que estão sem ninguém na Série A", com nomes
  reais, gols espalhados pelo dia, "não podem ficar na cara que são bots"; `services/bots.js`, lista em `data/bots.js`
  — **os nicks precisam do OK do dono antes do `criar`** (pedido dele; os 27 primeiros foram validados e criados
  em 18/09/2026, ids 187–213: 20 na Série A, 5 na B, 2 na C) —, números em `BOTS` de `rules.js`, `User.isBot`/`botJson`, migração 0042):
  cada bot tem uma **persona** (casual/regular/assíduo, janelas do dia — madrugada/manhã/almoço/tarde/noite —, chance
  de usar pênalti/falta/trilha, onde gasta ponto de nível, se resgata a Presença) e ganha um **plano por dia** (folga
  em 30/12/5 % dos dias; senão 1–4 sessões de 12–130 min em horários sorteados nas janelas), gravado em `botJson.plan`
  (reiniciar a API NÃO sorteia de novo). Na sessão fica "online" (lastSeenAt anda) e chuta pelos **mesmos serviços do
  jogador** (`autoKick`/`penalty`/`foul`/`trailPick`), esperando 8 s–4 min depois da recarga, trilha linha a linha;
  uma ação por bot por volta de 20 s, disparada com atraso sorteado (nunca todos no mesmo segundo). **Nunca** chat
  nem minigame. Volume: casual ~3–10 gols/dia, regular ~10–25, assíduo ~30–55 (abaixo do top 10 da rodada de
  propósito).
  **Bots no X1** (dono, 20/09/2026, depois de flagrar o Xumbera jogando o X1 com um programa: "vamos colocar nossos
  bots para procurarem e jogarem partidas de verdade no X1", "para quase sempre ter alguém diferente no X1", "mas
  não o tempo todo com o Xumbera, faremos partidas mais espaçadas", "toque de aleatoriedade… no tempo que ele passa
  pra bater na bola, de 3 a 8 segundos… e nem sempre ganhando", "vez ou outra, um pouco mais raro, provocações";
  números em `BOTS.x1` de rules.js; `botsX1Round` em bots.js → `x1BotVisit` em `realtime/x1.js`): a cada volta,
  com vaga (`concurrent` = **2 bots**) e passado o intervalo sorteado (`gapMin` 1–6 min desde a última saída), o
  motor sorteia um bot **disponível** (`x1Available`: em sessão OU, fora dela, numa hora que cabe na JANELA da persona
  e sem ser dia de folga — dono, 20/09 à noite: "nenhum bot rodou X1 ainda… precisamos movimentar o jogo"; às 20h30
  não havia bot em sessão e 111 telas de gente no X1; na visita ele fica "online", `lastSeenAt` a cada 50 s),
  descansado (`restMin` 15–60 min desde a última visita), com a aposta e que "topa" (`x1` na persona, 0 = nunca; sem o
  campo, `appetite` por perfil: 0,5/0,7/0,9) e manda ele ao X1: **aceita um desafio aberto de gente de OUTRO time** (o
  mais antigo), **ou o de OUTRO BOT** — SEMPRE (dono, 23/09/2026, com print de Vilao e Loudete desafiando juntos:
  "quando um bot está desafiando, criar um desafio devia cair contra esse bot e não ficar 2 desafios abertos"; até
  ali era 50 %, `botVsBot`/`avoidAi`, e na outra metade ele abria o dele; bot x bot movimenta placar, lances e
  ranking, o dono topou: "mesmo que fiquem no ranking de X1, não tem problema") — ou **abre o dele** e espera
  `waitMin` (3–8 min). **Nunca ficam dois desafios abertos por causa de bot** (`casaOuAbre` em realtime/x1.js): o
  bot não abre o seu se sobrou alguém esperando que ele não pode enfrentar (pessoa fora da cota, bloqueio) — vai
  embora —, e a pessoa fora da cota que abre o dela com bot esperando faz o bot desistir do dele. Desafiar e
  aceitar passam por uma **fila única** (`naFila`): entre olhar a lista e registrar o desafio há idas ao banco, e dois
  "Desafiar" no mesmo instante abriam dois desafios em vez de se enfrentarem. **Nada dentro da fila pode esperar algo
  que entra nela** (trava tudo) — por isso o `createChallenge(a)` do "b sem dinheiro" em `acceptChallenge` não é
  esperado. **E qualquer bot em
  sessão pode ACEITAR** (dono, 20/09/2026: "os bots ativos no momento com possibilidade de aceitar também os X1,
  principalmente após os primeiros 5 s"): gente de verdade abriu um desafio e ninguém pegou em `acceptDelaySec` (5–30 s
  sorteados) → `botAceita` (x1.js) pede ao motor um bot (`pickX1Accepter` em bots.js, registrado com
  `setX1BotPicker`: disponível (`x1Available`, lido do banco, não da volta), de outro time, com a aposta, que
  topa, fora do X1, sem partida há `acceptRestMin` = 10 min e abaixo de `maxDay`; chance `acceptChance` = 0,8) e ele
  aceita (`x1BotVisit` com `acceptOnly`). A cota da pessoa vale igual (fora dela, ninguém aceita). O tutorial mantém
  o dele (20 s, sempre). (Números de 20/09 à noite: `acceptChance` 0,9, `acceptDelaySec` 5–25, `acceptRestMin` 5;
  candidatos por `x1Available`, não só em sessão.) — as telas com abas
  recebem "Fulano está te desafiando" e a tela do X1 lista o desafio, **sem marca de bot** (`playerView.bot` é só do
  treino). Jogou ou ninguém veio, sai (`afterMatchSec` 6–25 s "lendo o resultado") e descansa; no máximo `maxDay` = 8
  partidas por bot em 24 h. **Vale tudo** (aposta, gol, gol a menos, lances ao vivo, retrospecto, Ranking X1) — só o
  **prêmio** do Ranking X1 pula os bots (`x1Ranking`: `eligible` false e sem `need`, o prêmio vai para o próximo; o
  bot aparece na lista). **Cota por pessoa** (`botQuotaOk` em x1.js, dentro de `compatible`): a MESMA pessoa joga com
  os bots (todos somados, tutorial incluído — conta pelas `X1Match` com `bot:<id>` no IP) no máximo `sameHumanDay` =
  6 vezes em 24 h e com `sameHumanMin` = 30 min entre uma e outra (eram 4 e 45 até a noite de 20/09); fora da cota o desafio do bot **nem aparece** para
  ela (nem o dela para o bot). Na partida o lado `ai` (bot quase real, tutorial incluído) **demora `thinkSec` = 3–8 s**
  para bater (`aiDelayMs`; o bot de TREINO `bot` segue rápido), joga com uma **`skill` sorteada por visita** (0,25–0,55
  = a chance de fazer o gol quando existe um na mesa — `botaoHumanMove` em botaoMatch.js; no FutPrego, olha 8
  jogadas e pega a melhor em 0,35 + skill das vezes, senão a 2ª — com 4 jogadas e a skill crua ele perdeu as 5
  primeiras de produção em 20/09; o do tutorial fica na faixa de baixo) e **provoca de vez em quando, SEM hora
  previsível** (dono, 24/09/2026: "estão muito na cara que são bots pelo uso dos emojis… em momentos mais aleatórios e
  não sempre quando alguém faz gol… frases também, de forma aleatória e meio rara"; `BOTS.x1.provocar`): 0 a 3
  provocações soltas por partida em segundos sorteados (`planAiProvocar`, só contra gente), 30% delas frase; responder
  quem provocou (12%) e reagir a gol (4%) ficaram raros e com alguns segundos de atraso. `vipOnly` false = todo bot usa
  o catálogo inteiro (caretas e frases do VIP) — true volta a limitar os sem VIP às 4 caras básicas. No X1 o bot não chuta (está "na tela da partida"). Enquanto
  está lá, `x1BotsInside()`; `POST /api/admin/x1/bot {nick, waitSec?, skill?}` manda um bot ao X1 AGORA e
  `GET /api/admin/x1/bots` mostra quem está (x-admin-key). Calibração de 20/09 (300 partidas por par, `botaoHumanMove` x
  `botaoBotMove` no lib/botaoMatch.js): skill 0,4 x 0,4 = 50/50 com ~14 petelecos; contra o bot de treino (0,5) o quase
  real de 0,25–0,55 vence 28–40 %. Ajustar `BOTS.x1.skill` pelos resultados de produção (`FutPregoMatch` com
  `bot:` no IP). `BOTS_OFF=1` desliga as voltas (chutes e visitas); `BOTS_X1_OFF=1` desliga tudo do X1, visitas E aceites (testes).
  **Mexeu? Rode `node scripts/test-bots-x1.js`**
  (pasta api/, API local no ar com `X1_JOGO=BOTAO` e `ADMIN_KEY`, banco LOCAL; tem de dar "TUDO OK"), o
  `test-bots.js` (passo 7 = a volta do X1 sem servidor) e o **`test-x1-um-desafio.js`** (API local com
  `BOTS_X1_OFF=1`; bot x bot, dois "Desafiar" juntos e a cota — no código de antes de 23/09 ele dá 4 falhas). **Bots não recebem prêmio**: `topAndPrizes` em league.js tira os bots da lista premiada (artilharia da
  rodada/temporada; quem vem depois sobe de posição) numa consulta só com o quadro — duas consultas embaralhavam os
  empates —; o VIP do time campeão também pula bots. O **recorde** de gols (hora, rodada e temporada) sai da
  mesma lista SEM bots — o da rodada paga 20 VIP e ia para o bot que liderasse (corrigido em 21/09/2026) —, e **gol de
  bot não conta na troca automática da Série A** (ver a regra lá em cima). Fora do relatório diário do Telegram (contas e gols). O painel de
  admin mostra o selo **Bot** (e-mail `<nick>@bots.jogagol.com.br`); `isBot` NUNCA vai para o front público (views
  projetam campos). Operação (pasta api/, na VPS com o .env): `node scripts/bots.js listar|criar|status|persona`
  (`criar` é idempotente e pula nick de jogador de verdade; `persona` regrava o jeito de jogar pela lista).
  `BOTS_OFF=1` desliga o motor (testes). **Mexeu? Rode `node scripts/test-bots.js`** (pasta api/, só banco LOCAL,
  ~1 min; tem de dar "TUDO OK") e o `sim-liga.js`.
- **Grupo do WhatsApp** (pedido do dono, 14/09/2026; link em `COMMUNITY` de `rules.js`, via `/api/meta`; tela
  `components/WhatsInvite.tsx`): janela convidando para o grupo **a cada 100 h** (controle no aparelho, por conta),
  só nas telas com abas (Layout — nunca no meio de chute/minigame) e depois que a Presença da Semana do dia foi
  resolvida (`passSettled`). "Entrar no grupo" = não aparece mais; "Agora não" = 100 h. Botão fixo no Perfil.
- **Vitrine da tela de entrada** (`GET /api/vitrine` em `routes/game.js`, cache de 15 s; `components/MundoVivo.tsx`
  em `screens/Login.tsx`): dono, 19/09/2026 — "alguns usuários abrem o site e dão de cara com o login… isso faz
  eles desanimarem… era ideal mostrar um mundo vivo". Quem ainda não entrou vê, **antes do formulário**, o placar
  da partida mais disputada da rodada (mais gols na soma; empatando, o placar mais apertado) com o relógio até as
  19h, e **abaixo dele** os artilheiros do dia e os reis do X1. É tudo dado de verdade — nada de frase de
  propaganda. Em cima do placar vai o **total de gols da rodada** — a soma dos placares de todas as partidas
  (dono, 19/09/2026: antes era quantos estavam chutando agora).
  A API fora do ar = os blocos somem e a tela de entrada funciona igual.
- **Página da partida** (`/partida/:id`, pedido do dono, 14/09/2026; `services/match.js` → `GET /api/matches/:id`,
  pública; tela `screens/Match.tsx`): placar + domínio, "ao vivo · termina em" (fim da rodada) ou "encerrada · vitória/
  empate", artilheiro da partida, top 5 de cada time, gols hora a hora (gráfico espelhado nas cores dos times), gols por
  tipo (chute direto/pênalti/falta/trilha/minigames), em números (quem marcou, online agora, tabela, artilheiro da
  temporada), confrontos anteriores e últimos gols. Tudo lido de `Goal.matchId` (nada novo gravado). Abre tocando no
  placar da tela inicial, da Liga (jogos da rodada) e da página do time. Ao vivo, a tela atualiza a cada 15 s.
- **Convites — link de afiliado** (decisão do dono, 14/09/2026, a partir da sugestão de um jogador; `services/referral.js`,
  `routes/referral.js` em `/api/ref`, marcos em `REFERRAL` de `rules.js`, `User.refCode/referredById` + tabela
  `ReferralReward`, migração 0022; tela `components/Invite.tsx`: painel CONVIDE AMIGOS no Perfil, rota `/convite/:code`
  e aviso "Convite de fulano" no cadastro). Código fixo de 6 letras (não é o nick — nick muda). Quem cria conta pelo
  link vira convidado (**só no cadastro**; conta criada na MESMA internet de quem convidou não vira convidado). Quem
  convidou ganha VIP **no banco** quando o convidado chega a 25/50/100/200/400/800 gols da carreira (1 VIP cada) e
  1000 (10 VIP) = 16 por amigo — **e o CONVIDADO ganha o mesmo em cada marco** (decisão do dono, 15/09/2026;
  `ReferralReward.side` REFERRER/REFERRED, migração 0032; quem já tinha marco pago só para quem convidou recebe o
  seu na próxima varredura). `referralSweep` no scheduler (2 min) paga; `@@unique([referredId, milestone, side])`
  = cada marco paga uma vez por lado; os dois recebem mensagem na caixa. A tela do convite mostra "Você entrou pelo
  convite de X" (`invitee`). Jogando na mesma internet ou suspenso, o marco **espera**. A sugestão original (% dos VIPs
  comprados pelo convidado) NÃO foi feita. Mexeu? **`node scripts/test-referral.js`** (pasta api/, só banco LOCAL).
- **Uniforme do time — desenho escolhido pelo presidente** (pedido do dono, 15/09/2026): `Team.kitDesign`
  (+ `kitChangedAt`, migração 0030; `KIT_DESIGNS` em `rules.js`, exposto em `meta.kitDesigns`: clássico (faixa no
  peito), liso, listras, faixas, metades, diagonal). **As cores são SEMPRE as do time** (primária, secundária e a 3ª
  se houver) — só o desenho muda. `POST /api/club/kit {design}` (`setKitDesign` em club.js: só presidente, 1 troca a
  cada `CLUB.kitChangeHours` = 24 h, vira lance do time); `clubState.kit {design, canChangeAt}`; tela: linha
  "Uniforme" na DIRETORIA da página do time (todos veem; presidente tem "Mudar" → `KitModal` com as 6 camisas nas
  cores do time). **Um pintor só, `web/src/lib/kit.ts`** (`kitPixel` por pixel, `discBands` para peça redonda),
  usado em: `Jersey.tsx` (Camisas + escolha), `PregoBoard`/`BotaoField` (peças do X1) e `scenes/keeper.tsx`
  (uniforme 3D — pinta as ilhas da camisa da `kit-mask.png` por cima; goleiro e barreira do pênalti, falta e Falta
  PRO vestem o desenho do ADVERSÁRIO via `GET /api/me/opponent`, que já traz `kitDesign`/`colorTertiary`). Desenho
  novo = entrada em `KIT_DESIGNS` + os pintores em `kit.ts`.
- **Caixa de mensagens** (pedido do dono, 15/09/2026; `services/inbox.js`, `routes/inbox.js` em `/api/inbox`,
  tabela `Message` — migração 0032; tela `/mensagens` = `screens/Inbox.tsx`, envelope com selo no topo do Layout,
  `unread` vem no `/api/me` e no heartbeat). Tipos: ADMIN (recado do admin) · AVISO (para todos) · COMPRA · PRESENTE
  · PREMIO. **Avisos automáticos** (`notify.*`, sempre em `catch` — nunca derrubam a ação): PIX aprovado (dias +
  saldo), VIP/saldo dado ou retirado pelo admin, marco de convite (os dois lados), doação de VIP de colega e
  **TODA premiação** (pedido do dono, 15/09/2026): artilharia da rodada/temporada (`leaguePrize`, em `payPrizes`
  da liga), recorde da rodada (`roundRecord`), time campeão/vice (`teamPrize`, para quem marcou pelo time) e
  Ranking X1 (`x1Prize`). Prêmio novo = pagar + `notify.*` na mesma transação. O texto aceita `[texto](/rota)` =
  link de dentro do jogo (react-router) além de `[texto](https://…)`. Admin: `POST /api/painel/mensagens {userId | all, title, text}` — painel "MENSAGEM" no detalhe do
  jogador e aba **Avisos** (uma linha por jogador vivo, em lotes de 500); ações `mensagem`/`aviso` no log. O detalhe
  do jogador mostra a caixa dele (`GET /api/painel/users/:id/mensagens`, últimas 30, lida/não lida).
- **VIP vira saldo** (pedido do dono/erickles, 15/09/2026): Loja → "Saco de dinheiro": `POST /api/me/vip-to-money
  {qtd}` troca VIP guardado por `MONEY.VIP_TO_MONEY` (R$ 50 mil) cada, sem limite (ShopLog `VIP_MONEY`). Por isso o
  bônus de saldo dos pacotes está na mesma escala (R$ 50 mil · 200 mil · 450 mil · 1 mi · 2,25 mi · 5 mi).
- **Distintivos ao lado do nome** (pedido do dono, 13/09/2026; regra refeita em 17/09/2026 com o feedback do jogador
  GD — "achei os ícones legais mas mt poluídos"; `services/badges.js`, `components/Badges.tsx`): **P**
  (Presidente) / **D** (Diretor) do cargo no time e **UM ícone só, do período que JÁ FECHOU** — hora = estrela,
  rodada = medalha, temporada = troféu; 1º ouro, 2º prata, 3º bronze (`/ui/ico-{star,medal,trophy}_{gold,silver,bronze}.png`;
  estrela/troféu prata e bronze feitos a partir do dourado do kit). **Quem está liderando agora não ganha ícone**:
  ganha quem terminou no top 3 quando a hora/rodada/temporada fechou (lê `HourResult/Round/Season.topJson` e
  `x1Json.paid`), e ele ostenta durante o período seguinte. O jogador mostra só o de MAIOR prestígio, na ordem de
  `TOP_SCOPES` (temporada > geral do X1 > temporada do X1 > rodada > rodada do X1 > hora) — antes dava para
  aparecer com 5 ícones no nick. Cache de 60 s (só muda quando algo fecha); cargos 30 s, zerado em toda ação da
  diretoria. Aparecem nos rankings (`withBadges` em /home, /rankings, /teams), no chat
  e no perfil. **Quadro TOP 10 do perfil** (`topHistory`): quantas vezes em 1º/2º/3º e no top 10 das horas, rodadas e
  temporadas fechadas — lê os top 10 congelados em `HourResult/Round/Season.topJson` (Season.topJson gravado no
  `finishSeason` desde a migração 0021; índice GIN em HourResult.topJson para o `@>`).
- **Tutorial de boas-vindas** (dono, 18/09/2026; `services/tutorial.js`, `routes/tutorial.js` em `/api/tutorial`,
  números em `TUTORIAL` de rules.js, colunas `User.tutorialStep/tutorialAt`, migração 0043; tela
  `components/Tutorial.tsx`): na PRIMEIRA vez o jogador **não vê pop-up nenhum** — só a janela de boas-vindas,
  que pergunta se ele quer fazer o tutorial por **1 VIP**, que entra **JÁ ATIVO** (soma em `vipUntil`, como o 7º
  dia da Presença — não vai para o banco `vipDays`, então não dá para doar; dono, 19/09/2026: o novato tem de
  sentir o VIP na recarga seguinte, não descobrir onde ativar). Três etapas: **pênalti** (a principal forma de fazer
  gol), **Termo** (os minigames viram de hora em hora, um por dia, e o nível libera mais) e **X1** (ao vivo,
  ganhou = +1 gol para o time, perdeu = −1). O passo só anda quando o servidor CONFERE no banco que ele fez
  (`penaltyTries`, `DailyGame` do Termo, linha em `X1Match`) — a tela pergunta a cada `/me` novo e anda sozinha.
  **Entrando na etapa 3 o servidor garante a aposta do X1** (`FUTPREGO.bet`) para quem tem menos: conta nova
  começa com R$ 0 e o desafio custa R$ 200 — sem isso o tutorial mandaria fazer o que o jogador não pode pagar.
  `tutorialStep`: 0 = não respondeu · 1..3 = na etapa · 9 = terminou · −1 = recusou; o VIP cai uma vez só
  (`updateMany` exigindo a etapa 3). **Quem segura os pop-ups é `me.tutorial.pending`**: Presença, troca de
  séries, WhatsApp, Instagram e "subiu de nível" saem de cena enquanto isso — pop-up novo tem de respeitar esse
  campo. A migração marcou todo mundo que já jogava como "recusou" (ninguém veterano é interrompido nem ganha o
  VIP). **No X1 do tutorial, um BOT aceita**: ninguém aceitou em `TUTORIAL.botAcceptSec` (20 s) → um dos bots do
  Guilherme entra e joga **valendo tudo** (aposta, gol para quem ganha, gol a menos para quem perde e Ranking
  X1) — decisão do dono ("pra dar a impressão que o jogo tá movimentado"), e **só no tutorial**. Em x1.js,
  `ai` = lado jogado pelo servidor (vale tudo) e `bot` = treino (não vale nada): são coisas diferentes, não
  juntar de novo — e **quem decide a jogada (`botPlay`/`botSnap`) tem de olhar `isAi`, não `bot`**: em
  18/09 o bot do tutorial entrou na partida e PERDEU A VEZ porque a função de jogar só aceitava o de treino.
  **Mexeu no bot do X1? Rode `node scripts/test-tutorial-x1.js`** (pasta api/, com a API local no ar): ele
  espera a jogada do bot chegar — é o teste que teria pego esse erro. **Mexeu nisso? Rode `node scripts/test-tutorial.js`** (pasta api/, só banco LOCAL).
- **Presença da Semana** (login diário; decisões do dono, 13/09/2026 — "tá muito difícil upar"; `services/pass.js`,
  `routes/pass.js` em `/api/pass`, prêmios em `LOGIN_PASS` de `rules.js`, tabela `LoginPass`, migração 0020; tela
  `components/Pass.tsx`: cartela que abre sozinha 1x por dia no aparelho + cartão na Home). Entrar 1x por dia e tocar
  em RESGATAR; o dia vira à meia-noite de Brasília (`calendarDay`, time.js — sem o TERMO_DAY de teste). **Pulou
  um dia, volta ao dia 1** (e as semanas seguidas zeram). **Todo dia dá XP** (`levelBonus`): 30·40·50·60·70·90·150 =
  490/semana — para quem começa do zero, cada dia libera um minigame; **VIP ativo ganha o dobro de XP**. Extras:
  R$ 1.000 · Energia nv 1 (28 h) · R$ 2.000 · Boost Auto (28 h) · +1 destreza (no máximo vira R$ 1.000) · Energia nv 2
  (28 h; Energia nunca rebaixa) · R$ 5.000 + **VIP que ATIVA NA HORA** (soma em `vipUntil`, NÃO vai para o banco
  `vipDays` — não dá para doar nem usar em proposta); da 2ª semana seguida em diante o 7º dia dá 2 VIP. **Gol nunca é
  prêmio** (mexe na liga). Um resgate por dia garantido no banco (`@@unique([userId, day])`; a linha é criada antes
  dos prêmios, na mesma transação). Mexeu nisso? **`node scripts/test-pass.js`** (pasta api/, só banco LOCAL).
- **Diretoria e contratações** (decisões do dono, 13/09/2026, a partir do BRGOL original; `services/club.js`,
  `routes/club.js` em `/api/club`, números em `CLUB` de `rules.js`, tabelas `TeamRole`/`TransferOffer`/`VipGift`
  + `User.contractUntil`, migração 0019; telas: tribuna `BoardPanel` e `MovesPanel` na página do time,
  `/propostas` = `Offers.tsx`, botões no perfil do jogador, janelas em `components/Club.tsx`).
  **Presidente**: time sem presidente → qualquer VIP do time que já marcou gol por ele assume. Nomeia até **2
  Diretores** (VIPs do time). No banco, `@@unique([teamId, slot])` (slot 0 = presidente, 1–2 = diretores)
  garante 1 presidente e 2 diretores no máximo. **Perde o cargo** quem sai do time, fica 3 dias sem VIP, 3 dias
  sem entrar ou é suspenso (`clubSweep`: scheduler a cada 5 min + antes de cada tela/ação).
  **Proposta** (Presidente/Diretor, pelo perfil do jogador de outro time): 1–100 VIP do banco de quem propõe
  — sai na hora e **volta** se for recusada, cancelada, vencer (48 h) ou quem propôs sair da diretoria; toda
  volta passa por `closeOffer` (troca `PENDING` uma vez só). **VIP que chega pela diretoria — contratação ou doação —
  entra JÁ ATIVO** (dono, 15/09/2026: "para o jogador usar no time"; `activateVip` em club.js soma em `vipUntil` a partir
  do que falta, NUNCA no banco `vipDays` — não dá para guardar, trocar por saldo nem repassar; a linha de quem recebe
  fica travada para duas chegadas ao mesmo tempo somarem as duas). **Aceitou**: vai para o time, recebe o VIP ativo e ganha
  **contrato de 1 dia por VIP** (`contractUntil`: não troca de time — `change-team` recusa — nem recebe/aceita
  outra proposta); as outras propostas abertas são canceladas (VIP volta). O aceite trava a linha do jogador
  (`SELECT … FOR UPDATE`): dois "aceitar" ao mesmo tempo fecham um só. **Doação**: VIP guardado para colega do
  mesmo time. **Contas na mesma internet (`lastIp` igual) não negociam nem trocam VIP** (conta falsa juntando
  VIP). O painel de admin passa por cima do contrato ao trocar o time. Selo de propostas na aba Time vem no
  heartbeat (`offers`). **Mexeu nisso? Rode `node scripts/test-club.js`** (pasta api/, só banco LOCAL — o
  script se recusa a rodar fora dele): ~50 conferências, tem de dar "TUDO OK".
- **Google Play / conta do jogador** (decisões do dono, 14/09/2026; guia em **`docs/PLAY_STORE.md`**):
  app Android = **TWA** (Bubblewrap) sobre o site; dentro do app o VIP será pelo **Google Play Billing**,
  no site fica o **PIX** — o app **nunca** cita PIX nem aponta para o site (`web/src/lib/twa.ts`: `?src=twa`
  no startUrl do TWA ou `referrer android-app://` ⇒ `isTwa()`, e `Vip.tsx` esconde os pacotes). Exigências
  já cumpridas: páginas públicas `/privacidade`, `/termos`, `/excluir-conta` (`screens/Legal.tsx`;
  `CONTACT_EMAIL` = contato@jogagol.com.br, `RESPONSIBLE` = Managol Softwares — mudou o tratamento de
  dados? atualizar texto e data); **exclusão de conta** (`routes/account.js` → `DELETE /api/account
  {password}`: ANONIMIZA a linha — nick `excluido-<id>`, e-mail/senha/foto/bio/IP/economia apagados,
  mensagens e bloqueios apagados, lances sem o nick, `deletedAt`; gols ficam nos placares; `requireAuth`,
  login, busca, rankings e perfil público ignoram `deletedAt`); **bloqueio** (`UserBlock`: quem bloqueou não
  recebe as mensagens do bloqueado no `GET /api/chat`) e **denúncia** (`Report`, 20/dia, cópia do texto da
  mensagem; painel de admin aba Denúncias → `GET /api/painel/denuncias`, `POST …/:id/resolver
  {acao: ignorar|apagar|banir, horas}` — fecha as outras abertas da mesma mensagem/pessoa, tudo no
  `AdminAction`). Telas: bandeirinha em cada mensagem do chat e botões Denunciar/Bloquear no perfil
  (`components/Account.tsx`). **Mexeu nisso? Rode `node scripts/test-conta.js`** (pasta api/, só banco
  LOCAL): 35 conferências, tem de dar "TUDO OK". Ícone maskable `icon-512-maskable.png`; artes da loja em
  `assets/play-store/`.
- **Contas AO MESMO TEMPO: 3 por APARELHO e, no PC, 3 por INTERNET** (dono, 15/09/2026: "muitos usuários logando com
  o mesmo IP em várias contas" e depois "vários celulares deve ser permitido, o mesmo PC tem que ser limitado"):
  `takeSlot`/`assertRoom` em `lib/security.js` (`SECURITY.maxOnline` = 3, vaga solta depois de `onlineMs` = 10 min
  sem nenhum pedido com login). Vaga por aparelho = o código que o site grava no navegador (`web/src/lib/device.ts`,
  cabeçalho `X-Device-Id`; nos WebSockets `?device=`), vale para celular e PC; vaga por internet só para o que NÃO é
  celular (User-Agent; app da Play Store manda `X-App: twa`/`?app=twa`) — outro navegador/janela anônima no mesmo PC
  continua na mesma internet. Celulares diferentes na mesma internet (família, CGNAT) jogam à vontade. Chamado no
  `requireAuth` (toda rota com login), no login, no cadastro e nos WebSockets do X1 e do Cabeção; quem já tem a vaga
  continua, a conta a mais recebe 403 `multiconta` e o site troca a tela inteira pelo aviso
  `components/MultiAccount.tsx` (evento `MULTI_EVENT` de `lib/api.ts`). Admin e IP privado (PC) ficam de fora; aviso
  no Telegram (1 a cada 30 min por aparelho/internet). Em memória (1 instância). Código e "é celular" vêm do aparelho
  (falsificável): atrapalha a multiconta comum, não é à prova de tudo.
  **Último aparelho da conta** (`lib/device.js` `deviceOf`/`deviceData`; migração 0034): `User.deviceId` (o código do
  navegador), `User.device` ("Android · Chrome", "Windows · Edge", "App Android") e `User.deviceMobile`, gravados no
  cadastro, no login e no heartbeat (site antigo sem código não apaga o que havia). Painel: o aparelho em cada conta,
  linha "Aparelho" (com um pedaço do código) no detalhe, **"Outras contas neste aparelho"** (`sameDevice`, mesmo
  `deviceId` — quase prova de ser a mesma pessoa) e selo **"mesmo aparelho"** nos grupos da aba Multiconta.
  **O IP agora é o de VERDADE**: `clientIp` (lib/ip.js) lê o **X-Real-IP** que o nginx grava — antes lia o 1º valor do
  X-Forwarded-For, que o jogador falsifica (dava para driblar as travas por IP, a "mesma internet" do convite e da
  diretoria e o pareamento do Cabeção). Sem nginx (PC/testes) cai no X-Forwarded-For. **Mexeu? Rode
  `node scripts/test-contas-por-ip.js`** (pasta api/, banco LOCAL, API no ar; tem de dar "TUDO OK").
- **Segurança** (`lib/security.js`; plano completo, Cloudflare e comandos da VPS em **`docs/SEGURANCA.md`**;
  pedido do dono, 15/09/2026): cadastro com 3 s mínimos no formulário (`elapsedMs`; honeypot REMOVIDO 16/09),
  e-mail descartável barrado (`disposable-email-domains`), **5 cadastros/h por IP** e **3 contas por IP em
  24 h** (`User.createdIp`, migração 0026), **Turnstile** só com `TURNSTILE_SITE_KEY`+`TURNSTILE_SECRET` no
  `.env` (a meta manda `turnstileSiteKey`; `components/Turnstile.tsx`); login com **trava por conta** (10
  erros/15 min → 15 min, mesmo de IPs diferentes); **cache em memória** (`cached(ttl)`) nas rotas públicas
  do `game.js` (rankings/liga/home/teams/ativos/feed 5 s, meta 10 s) — nunca em rota com dado do usuário;
  busca 60/min, foto 10/15 min; `helmet` (sem CSP). Tudo em memória = 1 instância PM2. **Mexeu nisso? Rode
  `node scripts/test-seguranca.js`** (pasta api/, só banco LOCAL): tem de dar "TUDO OK". O DDoS de verdade
  é na borda: Cloudflare + `real_ip` no nginx + ufw só com as faixas dela (docs). **Na VPS (15/09):** nginx com
  `limit_req` (20 r/s na API, 5 r/s em `/api/auth/`, 429), cabeçalhos de segurança, fail2ban (sshd +
  nginx), SSH só por chave, unattended-upgrades. **Backup:** diário na VPS (`/usr/local/bin/brgol-backup.sh`
  = `tools/vps/brgol-backup.sh`, 03:40, `/var/backups/brgol`) + cópia mensal no PC do Guilherme
  (`tools/backup-local.ps1`, tarefa "JogaGol backup mensal"). Restaurar: `docs/SEGURANCA.md` → Backup.
- **Relatório diário no Telegram** (pedido do outro investidor, 16/09/2026; `services/dailyReport.js`): todo dia às
  **08:00 de Brasília** o grupo recebe o gráfico (PNG: 14 dias de contas criadas, gols e jogadores com 20+ gols; barra
  de ontem em laranja, média 7d tracejada) + texto do dia anterior com ▲/▼ % vs dia anterior e vs média 7d, mais
  jogadores que marcaram, PIX pagos (R$) e partidas do X1. SVG → PNG pelo `sharp` (**fonte DejaVu instalada na VPS
  em 16/09** — sem fonte o texto sai vazio); `tg.photo()`; `DailyReport` (migração 0037) = dia já enviado (não repete
  no reinício). Reenviar/testar: `POST /api/admin/relatorio-diario {day?, force?}` (x-admin-key; `?ver=1` só devolve
  o PNG). Métrica nova = `series()` + `text` + painel em `renderDailyChart`.
- **Relatório de retenção** (pedido do dono, 18/09/2026: "quantos ficam no jogo e depois saem e nunca mais voltam";
  `api/scripts/relatorio-retencao.js`, só leitura no banco): funil conta → chutou → 10/30 min no 1º dia → voltou outro
  dia → ativo (48 h), tempo no 1º dia, por dia de cadastro, "quem volta × quem some" (minigame, X1, chat, convite) e
  recomendações; PNG por SVG → sharp (como o diário) + 2 mensagens via `tg.raw()` (HTML sem selo, na hora).
  `--ver <png>` só gera; `--enviar` manda ao grupo. Rodar na VPS (pasta api/, usuário brgol). Contas de varredura
  (IP 177.23.227.136, 0 gol) e bots ficam fora. Primeiro envio em 18/09: 30 % voltam, 45 % somem em < 15 min.
- **Eventos de uso + relatório AO VIVO do admin** (recomendação 8 do relatório de retenção; dono, 18/09/2026: "métricas de
  tudo e em tempo real", num menu flutuante à esquerda "onde hoje é background"). **Eventos**: tabela `Event`
  (migração 0043; `userId` opcional + `deviceId` = liga a landing/cadastro à conta criada depois), `POST /api/events`
  (`routes/events.js`, com ou sem login; token/aparelho também no CORPO porque o `sendBeacon` não manda cabeçalho;
  25 por lote, 40 lotes/min por IP, lote ruim é ignorado em silêncio). O site manda por `web/src/lib/track.ts`:
  `app.abriu`/`app.saiu {tela, seg}`/`app.voltou` (installTracking no App), `tela.<rota>` a cada tela (efeito no App
  com `useLocation`), `cadastro.ok` (store/auth), `recarga.vista` (Home: os 4 chutes em recarga), `slider.visto`
  (MinigameSlider) e `erro.tela` (ErrorBoundary). Evento novo = `track('nome.x', {…})` — nome `[a-z][a-z0-9_.:-]`.
  Apagados com 90+ dias (scheduler, 6 h) e na exclusão da conta. **Relatório**: `GET /api/painel/relatorio?dias=1|7|30`
  (`services/report.js`, cache 10 s): agora (online **com a lista de QUEM está online, sem bots** — `onlineList`, até
  120, o visto há menos tempo primeiro —, gols nesta hora/hoje×ontem, contas, **X1 ao vivo com QUEM está jogando em
  cada partida** — `x1Partidas` via `x1LiveMatches()` em `realtime/x1.js`: nicks, sigla, placar, jogadas, desde
  quando, marca de bot de treino/`ai` —, PIX, chat, bots, gols por hora 24 h), retenção dos últimos 7 dias (`services/retention.js`, o mesmo miolo do script do Telegram), funil dos
  novatos pelos eventos (conta → viu a home → chutou → viu a recarga → viu os minigames → abriu minigame/X1/chat/Loja →
  voltou), "onde somem" (última tela de quem nunca voltou + sessões `app.saiu.seg`) e os últimos 20 eventos. Tela:
  `components/AdminReport.tsx` (miolo) dentro do **`AdminDock.tsx`** — fixo à esquerda, só admin, só em tela ≥ 1240 px
  (montado no App, aparece em TODAS as telas; recolher/abrir fica no aparelho) — e na aba **Relatório** do /admin (celular).
  **Ordem na tela** (dono, 22/09/2026: "precisamos ver essas infos primeiro e não ter que rolar"): card ONLINE com os
  nicks (tocar abre o perfil), card X1 AO VIVO com as partidas, os outros números, **Atividade dos jogadores** (os
  últimos eventos, que ficavam no fim), gols por hora, retenção, funil, onde somem.
  **Mexeu? Rode `node scripts/test-eventos.js`** (pasta api/, API local no ar, banco LOCAL; tem de dar "TUDO OK").
- **Google Ads** (Guilherme, 24/09/2026: 1ª campanha de Pesquisa "JogaGol | Pesquisa | Teste set-26", R$ 180 de 24/09 a
  07/10, conta do Google Ads do Guilherme): tag do Google `AW-17439857189` em **`web/src/lib/ads.ts`** — carregada SÓ no site
  jogagol.com.br e SÓ para quem abre sem login (nunca no app da Play Store/TWA, cuja ficha diz "sem anúncios"; nunca no PC),
  sem remarketing (`allow_ad_personalization_signals: false`). Conversão "Cadastro JogaGol" = `adsSignup()` no cadastro que
  deu certo (`store/auth.ts`; precisa do rótulo em `SIGNUP_LABEL`). A origem do clique (`utm_*`/`gclid` da URL de entrada,
  guardada 30 dias no aparelho) vai no `app.abriu` e no `cadastro.ok` como `origem` (`lib/track.ts`) — é por ela que o banco diz
  quantos do anúncio criaram conta e voltaram; o relatório ao vivo do admin mostra "· anúncio google (brgol)". A campanha usa o
  sufixo `utm_source=google&utm_medium=cpc&utm_campaign=teste-set26&utm_term={keyword}`. A Política de Privacidade
  (`screens/Legal.tsx`) descreve a tag — mudou o que ela faz, mude o texto e a data lá.
- **Gracinhas → Telegram** (pedido do dono, 22/09/2026, depois da varredura de 17/09 do IP 107.150.41.226 — Kansas City,
  VPN/datacenter; contas gol36930 e jogador22276, @pm.me —: 582 pedidos em 8 min: /.env, /.git/config, /dump.sql,
  injeção de SQL na busca, id gigante, 15 senhas, chat/bio com código; "precisamos de aviso no telegram sempre que
  alguém tentar alguma gracinha e explicar no aviso se passou ou conseguiu bloquear"). Duas camadas:
  **API — `lib/gracinha.js`**, middleware de todo pedido (index.js, antes do rate limit): olha rota, query e corpo com
  o filtro do chat (`lib/codigo.js`) + operador NoSQL, número acima do INT4, `__proto__`, `../`; no `finish` olha o
  status: 404 em endereço de descoberta (`/api/swagger.json`, `.env`…) ou 6+ 404s em 10 min = varredura, 403 em
  `/api/admin` = chave errada, 403 no painel com login = jogador no painel, 10+ senhas erradas do IP em 10 min =
  rajada, e `res.locals.gracinha` marcado por `lib/auth.js` = token com assinatura forjada (vencido é normal).
  **Veredito pelo status**: 🛡️ BARRADA (4xx) · ✅ SEM EFEITO (2xx numa injeção de SQL/NoSQL — Prisma parametriza) ·
  ⚠️ PASSOU (2xx no resto — conferir) · 💥 QUEBROU (5xx). A 1ª do IP avisa na hora (IP + cidade/VPN via `geoForIp` +
  aparelho + conta logada/`jwtNick` + outras contas do IP); as seguintes juntam por 10 min num resumo (quantas, por
  resultado, por tipo, as que passaram). **Só vai para o grupo IP que tem CONTA no jogo** (dono, 22/09/2026: "pode
  ficar mandando no grupo apenas os ips que tem conta criada junto") — robô da internet varrendo /wp-admin e /.env
  fica só no log do pm2, com o fail2ban bloqueando; "tem conta" = pedido com login OU o IP em `User.lastIp`/
  `createdIp` (`temContas`, cache 5 min com conta e 1 min sem, e o resumo RELÊ sem cache porque o scanner costuma
  criar a conta no meio da varredura — foi o que o 107.150.41.226 fez em 17/09; nesse caso o resumo avisa e diz por
  que veio atrasado). Senha/token nunca vão no aviso; chat, bio e `/api/events` têm filtro próprio
  (🧪) e o corpo deles não é olhado aqui. **Mexeu? `node scripts/test-gracinha.js`** (pasta api/, sem banco; tem de
  dar "TUDO OK" — inclui os pedidos reais da varredura e o tráfego normal, que NÃO pode virar aviso).
  **Borda — nginx + fail2ban** (`tools/vps/nginx-varredura.conf`, `tools/vps/fail2ban/`): `/.env`, `/.git/*`, `*.sql`,
  `*.zip`, `*.key`, `package.json`… na raiz respondem **404 seco** (antes o SPA devolvia o index.html com 200 e o robô
  achava que tinha encontrado); a jaula **`brgol-probes`** (4 em 5 min = 1 h fora) conta isso e os `/api/swagger|
  graphql|.env`. **Achados de 22/09 nas jaulas de 15/09:** o `action.d/brgol-telegram.conf` estava com token/chat
  VAZIOS (nunca avisou) — agora chama `/usr/local/bin/brgol-f2b-aviso.sh`, que explica a jaula em português
  ("🚫 BLOQUEADO o IP X por 60 min: procurou 4 arquivos sensíveis… Nada passou"); e as jaulas do nginx liam o
  JOURNAL (`backend = systemd`, padrão do Ubuntu) em vez dos arquivos — `backend = auto` nas três. Conferir filtro:
  `fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/brgol-probes.conf` (0 no tráfego normal).
  **ADMIN NUNCA é bloqueado** (dono, 22/09/2026: "vai banir o admin? espero que não"): `ignorecommand` =
  `tools/vps/fail2ban/brgol-admin-ip.sh`, que pergunta ao BANCO se o IP é de conta com `isAdmin` (`lastIp`/
  `createdIp` — acompanha o IP de casa mudando; banco fora = bloqueia normal). **E toda jaula de web tem
  `port = http,https`**: sem isso o padrão do fail2ban é `0:65535` e o bloqueio derruba o **SSH** — foi o que me
  aconteceu em 22/09 testando a varredura do meu próprio IP (1 h sem site e sem servidor). Mudou a porta? Precisa de
  `systemctl restart fail2ban` (o `reload` não refaz a regra) e `nft list table inet f2b-table` tem de mostrar
  `tcp dport { 80, 443 }`. Bloqueado sem querer: `/usr/local/bin/brgol-liberar.sh <ip>`. Para testar varredura sem
  se bloquear, bater direto na API de dentro da VPS (`curl -H "X-Real-IP: …" http://127.0.0.1:4310/…`): não passa
  pelo nginx, não conta no fail2ban. **O aviso de gracinha NUNCA bloqueia ninguém** — quem bloqueia é o fail2ban, e
  só nos padrões de varredura de arquivo; `/api/matches/<número gigante>` e injeção de SQL não bloqueiam nada.
- **Postgres reiniciou** (22/09/2026 às 03:23: o unattended-upgrades trocou a libxml2 e o `needrestart` reiniciou o
  `postgresql@17-main` — 2 s fora, todas as conexões do pool caíram com 57P01, a volta dos bots falhou e o Telegram
  recebeu "🔴 Bots (motor)"; ninguém viu erro, o Prisma reconecta sozinho): `dbDropped(e)`/`avisarDbDropped(onde, e)`
  em `src/prisma.js` — scheduler, bots e o handler de 500 (`lib/errors.js`, que responde **503** "banco reiniciando")
  mandam um único "🗄️ Postgres reiniciou" a cada 10 min em vez do erro vermelho. Decisão: manter o reinício
  automático (a janela do apt é 3h–4h de Brasília, a mais vazia) — travar o needrestart deixaria o banco com
  biblioteca velha até alguém lembrar.
- **Banir IP** (primeira vez em 17/09/2026, pedido do dono): o CÓDIGO não tem ban por IP — o bloqueio é no nginx,
  em `/etc/nginx/snippets/brgol-bloqueados.conf` (um `deny <ip>;` por linha, com data e motivo), incluído no
  bloco `server` de jogagol.com.br (linha logo abaixo do `brgol-headers.conf`). Mexeu? `nginx -t` e
  `systemctl reload nginx`; para liberar alguém, apague a linha e recarregue. **Cuidado ao editar com `sed`**:
  a linha do `brgol-headers.conf` aparece em várias `location`, e um `sed` global duplica o include (aconteceu;
  foi limpo na hora). Conferido bloqueando o próprio IP por 10 s: página, rotas do SPA e API todas em 403.
  Primeiro bloqueado: `177.23.227.136` (jogador ivictor — varredura do jogo com contas testadmin99,
  massassign99 e audit_6586; 1.774 pedidos num dia). Backup do arquivo antes:
  `/root/brgol-nginx-antes-bloqueio-2026-09-17.conf`.
- **Telegram** (`lib/telegram.js`, `tg.info/warn/error`, mesmo bot do Managol (@Managol_bot) via `TELEGRAM_BOT_TOKEN`/
  `TELEGRAM_CHAT_ID`; pedido do dono, 15/09/2026; **desde 16/09 o chat é o grupo "JogaGol - ADMIN" (dono + Erickles),
  id em `docs/SEGURANCA.md` — trocar de chat = `api/.env` + `/etc/brgol-telegram.conf` + `pm2 restart`**): cadastro, cadastro barrado, conta trancada, PIX gerado/pago,
  denúncia, exclusão de conta, ações do painel, erro 500, scheduler, exceção e **"API subiu"**, que lista
  **o que aquela versão trouxe** (`lib/versao.js`; dono, 19/09/2026): os títulos dos commits entre o antes e o
  depois da última linha de `/var/log/brgol-deploy.log`. Restart que não é publicação (queda, watchdog,
  `pm2 restart`) sai só com o commit — a lista só aparece se a publicação foi nos últimos 10 min e o commit
  bate com o que está rodando. `{ key, every }`
  agrupa repetidos. Evento novo importante para o dono = chamar `tg.*` (com `tg.esc()` em dado de usuário).
  Na VPS: `brgol-watchdog.sh` (API caiu/voltou a cada 2 min; resumo 09h) e fail2ban → Telegram (🚫 BLOQUEADO, via
  `brgol-f2b-aviso.sh` — consertado em 22/09, ver "Gracinhas"). 🕵️ gracinha (SQL/XSS/varredura…, com o veredito) e
  🗄️ Postgres reiniciou também são `tg.warn`.
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
- **Painel de admin** (`routes/adminPanel.js` em `/api/painel`; tela `/admin`, lazy, fora das abas):
  SÓ usuários com `User.isAdmin` (ericklesv e MVGIC, marcados na migração 0015; middleware
  `requireAdmin` = JWT + isAdmin no banco). Lista/busca/edita jogadores, dá gols de verdade
  (kind `AUTO` via `applyResult`, 1–100 por chamada) e exp (`levelBonus`), bane (`banHours`;
  0 desbane) e mostra IP + geolocalização (`lib/ip.js`: `User.lastIp` capturado no
  cadastro/login/heartbeat; ip-api.com server-side com cache de 24 h — nunca chamar do front).
  Toda ação fica na tabela `AdminAction` (`GET /api/painel/log`). Entrada discreta no perfil.
  Aba **Contas criadas** (pedido do dono, 14/09/2026): a mesma lista em ordem de criação, mais nova primeiro
  (`GET /api/painel/users?order=criadas`), com e-mail, gols, "criada dd/mm às hh:mm" e "convite de X" (convites).
  Aba **X1** (pedido do dono, 15/09/2026; `GET /api/painel/x1?page=`, ou `/futprego`): histórico dos confrontos de
  verdade (`X1Match`; contra bot não grava), o mais recente primeiro — jogo (FutPrego/Botão), data/hora, os dois jogadores com time,
  vencedor e motivo, jogadas, aposta, se o gol contou (e de qual time saiu 1 gol), selo "mesma internet"
  (`aIp === bIp`) e selo "amistoso" (`sameTeam`: os dois do mesmo time, só dinheiro). Tocar no nick abre o detalhe do jogador.
  Aba **Multiconta** (pedido do dono, 15/09/2026; `GET /api/painel/multicontas?page=&q=`): IPs com 2+ contas vivas
  (o IP do cadastro E o último visto contam — SQL cru com UNION em `adminPanel.js`), os com mais contas primeiro;
  cada grupo traz geolocalização com avisos **celular/IP compartilhado** (CGNAT: um IP para muita gente — NÃO
  prova nada sozinho), VPN/proxy, datacenter, selo "convite entre elas" (uma conta entrou pelo link da outra) e
  as contas com e-mail, criada em, visto, "IP do cadastro/atual", outro IP e VIP no banco. Busca por IP, nick ou
  e-mail. O detalhe do jogador mostra "Outras contas nesta internet" (`sameIp`) e o **mapa** (iframe do
  OpenStreetMap, `GeoMap` em `Admin.tsx`) com o centro da cidade que a geolocalização devolve — `geoForIp`
  (`lib/ip.js`) agora traz `lat/lon/mobile/proxy/hosting` e não grava "sem dados" por 24 h quando o ip-api
  responde 429 (limite de 45/min).
  **Dar/retirar VIP e saldo** (pedido do dono, 15/09/2026): `POST /api/painel/users/:id/vip|saldo {qtd}` (negativo
  retira; nunca abaixo de 0; ações `vip`/`vip-retirar`/`saldo`/`saldo-retirar` no log) — painel "VIP E SALDO" no
  detalhe do jogador.
  Não confundir com `/api/admin` (x-admin-key, uso via curl) — intocado.
- **LEIA: `docs/INCIDENTE-2026-09-16-cadastro-falsos-positivos.md`** — o anti-robô barrou jogadores reais (honeypot
  preenchido por autofill; "rápido demais" por relógio adiantado) que nunca voltaram. Tem evidências, o que já foi feito e
  uma lista de PENDÊNCIAS para a IA do Erickles investigar e levar a ele (contato com as pessoas, varredura de outros
  falsos positivos, decisão sobre Turnstile).
- **Anti-robô do cadastro** (`lib/security.js`): tempo mínimo de 3 s no formulário — **sem honeypot** desde 16/09/2026
  (o autofill do Android no WebView do Instagram preenchia o campo escondido `website` e barrou 10x um jogador real,
  zero robôs; não reintroduzir). O front
  manda **`elapsedMs`** (abriu → enviou, medido no MESMO relógio do aparelho); o servidor NÃO compara com o relógio
  dele — comparar `startedAt` do cliente com `Date.now()` do servidor barrava quem tinha o PC adiantado ("rápido
  demais" depois de 1 min no formulário; caso real de 15/09/2026). `startedAt` ainda é aceito de fronts em cache,
  mas só barra diferença positiva. O `registerLimiter` (5/h por IP) conta só cadastros que DERAM CERTO
  (`skipFailedRequests`): recusa não gasta a cota. Teste: `node scripts/test-seguranca.js` (pasta api/, banco LOCAL).
- **Termo do dia** (`lib/termo/`): 5 letras, 6 tentativas; a palavra **nunca** vai para o
  cliente antes do fim (nem no JSON). Acertar = 1 gol normal (`applyResult` com kind `TERMO`:
  placar, artilharia, lances) + pontos de nível pela tentativa (`TERMO.levelPoints`, 30→5);
  não dá dinheiro. Respostas em `answers.js` (a lista do Termo do Corujão, 46 dias à frente,
  + 21 palavras do dono intercaladas): **palavra nova entra no fim**, antes do dia #114
  (03/01/2027). Dicionário em `palavras.txt` (resposta fora do léxico entra lá, à mão).
  **Chat sem spoiler** (dono, 15/09/2026: "proibir mandar a palavra do dia do Termo no chat; quando enviar, ficar com
  ****"; `lib/termo/spoiler.js` → `maskTermo`, chamado em `routes/chat.js` no GET e na resposta do POST): a palavra de
  HOJE vira `*****` — maiúscula/minúscula, com/sem acento, letras separadas ("s a n t o"), esticadas ("santooo") e com
  número ("s4nt0"); só a palavra inteira ("santos" fica). É só na LEITURA: o banco guarda o texto real (denúncia vê o
  escrito) e a de ontem volta a aparecer depois da meia-noite. Dia de palavra comum (JOGOS, LIGAS) esconde também a
  conversa normal — é a regra. **Mexeu? Rode `node scripts/test-termo-chat.js`** (pasta api/, banco LOCAL, API no ar).
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

- **Falta PRO** (`lib/faltapro.js` = física pura; `services/faltapro.js`; tela `FaltaPro.tsx`; nível 8,
  vira às 19h): cobrança de falta 3D estilo Free Kick Classic — câmera baixa atrás da Trionda, cena
  do pênalti/falta reaproveitada (StadiumModel/GoalModel/BallModel/KeeperModel com kit do adversário).
  O jogador ARRASTA a partir da bola (pointer events): a tela resume o rastro em `dirX` (mira do
  ponto de chegada), `dirY` (altura), `power` (velocidade média do gesto) e `spin` (arco do rastro).
  **A bola SEGUE o arco desenhado** (14/09): sai aberta pro lado do arco e o Magnus traz de volta
  pra mira (`spinComp` compensa a deriva no servidor); curva de última hora engana o goleiro (ele
  lê o chute em linha reta a partir da barreira) — **a curva é a arma principal**. A câmera de
  descanso dá CORTE SECO ao enquadrar cobrança nova e amortece por TEMPO, não por quadro (lerp por
  quadro deixava a bola fora da tela por segundos em celular lento — era o bug da "bola invisível").
  O SERVIDOR sorteia as 5 cobranças no start (distância,
  barreira 3–5 que pode pular — o pulo é secreto —, goleiro sorteado secreto, 2 alvos bônus no
  ângulo), simula tudo e devolve o voo (amostras [x, z, y] a 30/s) para a tela animar. 5 cobranças;
  3+ gols = exatamente 1 gol do time (kind `FALTAPRO`, na 3ª conversão); +4 de nível por conversão
  (até +20); alvo bônus = +R$ 50 (alvo é gol certo). Rasteira passa por baixo da barreira que pulou.
  Calibrar: `node scripts/faltapro-balance.js` (bom ~36% de gol e vence 25% dos dias — curva
  converte ~50% —, médio ~23%, iniciante ~17%). Rota oculta `/debug-faltapro` (sem login):
  a MESMA cena com cobrança mockada — `?flight=1` anima um voo com curva, `?t=<s>` congela,
  `?bx=&bz=` mudam a bola. `MINIGAMES_LIVRES=1` também vale aqui.
- **Goleada** (`lib/goleada.js` = matemática pura; `services/goleada.js`; tela `Goleada.tsx`; nível 3, vira
  às 22h): **você é o batedor**. Porte do "Mini Cup" do Google (dono, 17/09/2026: "monte o mais próximo
  possível do mini cup sem perder a identidade do jogo"; e depois de jogar a 1ª versão: "no minicup você é
  o jogador e não o goleiro", "o goleiro está parado no meio, ele tem que se movimentar de um lado pro
  outro", "o chute tem que ser mais rápido sem mira", "a velocidade do goleiro tem que ir aumentando
  conforme o tempo que você tá com o jogo aberto"). **Puxa o dedo a partir da bola, como na Falta PRO**
  (dono, 18/09/2026: "a ideia não é clicar onde você quer chutar a bola, é fazer o movimento do chute assim
  como no falta pro") — o gesto é a mira: direção, velocidade do puxão = força e o arco = efeito. A cena é
  a MESMA do pênalti (estádio, trave com rede, goleiro 3D de uniforme e a Trionda — dono: "você não
  consegue melhorar o visual?"). **Os clipes `dive`/`save_low` do goleiro terminam DEITADOS e seguram o
  último quadro**: entre um chute e outro a tela chama `pose('idle')` para ele levantar, e espelha o grupo
  (`scale.x`) quando o mergulho é para a esquerda — sem isso ele ficava estatelado no gramado e caía ~1,8 m
  fora do lugar (dono, 18/09/2026). O MESMO descuido existia na Falta PRO, corrigido junto. O goleiro **veste o uniforme do adversário da rodada** e faz RONDA de uma trave à outra o
  tempo todo; ao ver a bola ele reage e mergulha. **Tudo aperta pelo RELÓGIO da série** (`ramp` = 100 s):
  a ronda vai de **4,1 s** para 1,15 s, a reação de **450 ms** para 140, o mergulho de **0,60** para 2,70
  largura/s e o voo da bola de 820 ms para 460 — ninguém fica no gol para sempre. O COMEÇO é de propósito
  um meio-termo (dono, 18/09/2026: primeiro "tá muito rápido até no nível inicial", depois, com o passeio,
  "agora ficou lento demais, deixe no meio termo"): no 1º segundo ele fecha ~24% da boca do gol (eram 31%
  no difícil e 18% no lento); aos 100 s fecha 78%, o aperto de sempre. Bola rente à trave ou por cima é FORA e
  acaba a série. No lugar do contador de países: **o placar de gols do seu time contra o adversário da
  rodada** (`GoleadaTeam`, zera com a rodada). **A cada 3 gols seguidos = 1 gol do time** (kind `GOLEADA`), **até 3 no dia** (`goalEvery`/`maxGoals`; dono, 18/09/2026: "10 gols seguidos é MUITO difícil", e o teto foi escolha dele) — sai num lance só, com `vale` no `applyResult` (uma linha de `Goal` por gol). Cada gol traz o dinheiro
  de `MINIGAME_MONEY`; cada gol dá 3 de nível, até 30; recorde em `User.goleadaBest`.
  **Sem internet no meio da série**: o servidor manda só a FASE da ronda (`state.phase`) e a tela roda as
  mesmas contas de `lib/goleada.js` para animar (o goleiro é uma função do tempo, com a fase sorteada por
  partida). No fim ela manda os toques (`/end`) e **o servidor refaz a série** (`judge`), que também recusa
  chute fora de ordem ou antes de a bola voltar. Calibrar: `node scripts/goleada-balance.js` (craque ~60
  ~73 gols, bom ~54, mediano ~33, iniciante ~13). **Mexeu? Rode `node scripts/test-goleada.js`**
  (pasta api/, banco LOCAL).
- **Frangaço — DESATIVADO em 14/09/2026 pelo dono ("muito bugado")**: `soon: true` no `MINIGAMES` (some do slider e
  do `/api/meta`), `/api/frangaco/*` responde 503 "em manutenção" e `/frangaco` mostra o aviso. Para religar:
  tirar o `soon` (o resto se ajusta sozinho). Documentação original abaixo.
- **Frangaço** (nível 10, vira às **20h**; **porte 1:1 do Managol — o jogo é o cliente Unity
  WebGL** `ManagolTV` em `/tv/?mode=penalty`, decisão do dono 13/09/2026): a API do JogaGol fala
  O CONTRATO do Unity em **`/api/frangaco/*`** (`routes/frangacoTv.js`; serviço
  `services/frangaco.js`; matemática pura em `lib/frangaco.js`; contrato lido de
  `ManagolTV/Assets/Managol/ManagolPenalty.cs` + `Managol2.0/.../frangaco_models.dart` — NÃO
  mudar shape/motivos sem conferir lá): `GET state` (temporada da liga, meu time com `kitHome`
  `{shirt,shorts,socks}{model:'solid',primary,secondary}`, batedor/goleiro = o próprio jogador
  — `precisao` da destreza, `reflexo` do nível 0,35–0,8 —, títulos e ranking da temporada, run),
  `POST run` (inicia o torneio), `POST incoming` (cobrança da IA que EU defendo),
  `POST kick {xAnunciado, xReal|null}` (seta anuncia, finta opcional — **sem `xReal` o goleiro
  quase sempre pega**), `POST save {ms, x?, y?}`. Motivos EXATOS que o Unity traduz: kick perdeu
  = `travessao|fora|defendeu` (gol = `gol|tirou-tinta|rebote-trave|vazou`); save =
  `tarde|antecipou|parado|esticou|tirou-tinta|rebote-trave|vazou`; fases = `NomesFases` do
  Telas.cs ("Primeira Fase"…"Final"). **Torneio INTEIRO numa sessão**: 5 fases contra clubes da
  MESMA série (sorteio no servidor, sem repetir), duelo de 5 cobranças alternadas, morte súbita
  (até 3 rodadas; persistindo, a defesa mais rápida decide). Defesa validada no relógio do
  servidor: janela 1250→970 ms por fase (−60 na morte súbita), alvo PEQUENO com raio por fase
  0,011→0,008 (`saveRadiusFase`) validado em METROS = exatamente o círculo que o Unity desenha
  (`DimensionarAlvo` tem piso de 15 cm de diâmetro — `raioMetros` espelha), tolerância de rede
  250 ms; estourou com a aba fechada = gol da IA. **REGRA DE OURO (dono, 14/09/2026): em jogo
  legítimo o `/save` NUNCA responde erro** — sem pendência ele REPRISA a última defesa
  (`run.lastSave`); e um torneio que atravessa a virada das 20h **continua na linha de ontem**
  (`withFrangaco` tranca a linha do dia anterior com run ativo — trocar de linha no meio era o
  "ERRO — defesa não registrada"). A máquina de estados é pura em `lib/frangaco.js`
  (`stepEntry/stepIncoming/stepKick/stepSave`); **mexeu no Frangaço? Rode
  `node scripts/frangaco-fluxo.js`** (pasta api/, sem banco): 500 torneios por perfil com o
  fluxo exato do Unity + casos degenerados, tem de dar 0 erros de API.
  **1 torneio por dia** (`DailyGame`, estado do run inteiro no `state`; `champion` no topo do
  JSON por causa da query do ranking). Só o CAMPEÃO pontua: **1 gol** (kind `FRANGACO`) +
  R$ 500 + 20 de nível; eliminado = nada. Tela `Frangaco.tsx` = wrapper (header do kit +
  iframe de `/tv/?mode=penalty&apiBase=<origem>`; token por `postMessage`
  `managol-frangaco-auth` a cada 400 ms até `managol-tv-pronto`, NUNCA na URL; sem resposta em
  ~20 s mostra "TV 3D indisponível"). Escudo: o Unity só decodifica PNG (SVG = sem escudo,
  fallback silencioso). `GET /api/daily/frangaco` = só o estado do slider. `MINIGAMES_LIVRES=1`
  também vale aqui. **Pendente: hospedar o build do ManagolTV em `/tv/` na VPS (nginx).**

## Endpoints
`POST /api/auth/register|login|forgot{email}|reset{token,password}` · `GET /api/me` (inclui `items`, `nickColor`, `nickFade`, `captchaRequired`) · `GET /api/me/opponent` (adversário da rodada — cores/escudo para o kit 3D) · `POST /api/me/heartbeat|buy-dexterity|activate-vip|change-team{teamSlug,currency} (PAGA, = /api/shop/team)|nerf/:nick|nick-fade{from,to}` · `PUT /api/me/bio`
`POST /api/play/auto|penalty{direction}|foul{direction}|trail{index}|party` (+`captchaId`,`answer` quando `captchaRequired`) · `GET /api/play/captcha` · `POST /api/play/captcha{captchaId,answer}`
`GET /api/shop` · `POST /api/shop/buy{key,currency}|equip{key}|nick{nick}|nick-color{color}|team{teamSlug,currency}` (loja; catálogo também em `/api/meta.items`)
`GET /api/tutorial` · `POST /api/tutorial/start|skip|done/:step` (tutorial de boas-vindas) · `GET /api/pass` · `POST /api/pass/claim` (Presença da Semana — login diário) · `GET /api/ref/me` · `GET /api/ref/:code` (convites; o cadastro aceita `ref`)
`GET /api/club|club/candidates` · `POST /api/club/claim|resign|directors{nick}|directors/remove{nick}|pass{nick}|offers{nick,vip,message}|offers/:id/accept|offers/:id/refuse|offers/:id/cancel|gift{nick,days}` (diretoria e contratações; a diretoria pública vem em `GET /api/teams/:slug` → `board`)
`GET /api/vip|vip/purchases/:id` · `POST /api/vip/buy{pack}|vip/purchases/:id/test-pay` (só `EFI_FAKE`) · `POST /api/pay/efi/:secret[/pix]` (aviso da Efí, sem login)
`POST /api/uploads/avatar` (multipart `avatar`, ≤5 MB, PNG/JPG/WEBP/GIF) · `DELETE /api/uploads/avatar` · arquivos em `/api/uploads/avatars/*`
`GET /api/players/active` (24 h)
`GET /api/daily|daily/hub|daily/termo|daily/quiz|daily/memoria|daily/qualtime|daily/alvo|daily/stats|daily/camisas|daily/hattrick|daily/faltapro` · `POST /api/daily/termo/guess{word,day}|daily/quiz/next{day}|daily/quiz/answer{index,choice,day}|daily/memoria/flip{index,day}|daily/qualtime/next{day}|daily/qualtime/answer{index,choice,day}|daily/alvo/shot{index,day}|daily/stats/start|daily/stats/pick{side}|daily/camisas/start|daily/camisas/guess{guess:maior|menor}|daily/hattrick/start|daily/hattrick/shoot{i,dirX,dirY,power,strike:{sx,sy}|null}|daily/faltapro/start|daily/faltapro/kick{i,dirX,dirY,power,spin}` (minigames)
`GET /api/daily|daily/hub|daily/termo|daily/quiz|daily/memoria|daily/qualtime|daily/alvo|daily/stats|daily/camisas|daily/hattrick` · `POST /api/daily/termo/guess{word,day}|daily/quiz/next{day}|daily/quiz/answer{index,choice,day}|daily/memoria/flip{index,day}|daily/qualtime/next{day}|daily/qualtime/answer{index,choice,day}|daily/alvo/shot{index,day}|daily/stats/start|daily/stats/pick{side}|daily/camisas/start|daily/camisas/guess{guess:maior|menor}|daily/hattrick/start|daily/hattrick/shoot{i,dirX,dirY,power,strike:{sx,sy}|null}` (minigames)
`GET /api/frangaco/state` · `POST /api/frangaco/run|incoming|kick{xAnunciado,xReal|null}|save{ms,x?,y?}` (Frangaço — contrato do cliente Unity em /tv/?mode=penalty) · `GET /api/daily/frangaco` (estado do slider)
`GET /api/chat/:room?after=` · `POST /api/chat/:room{text,color?}` (salas `geral` e `time`; cor só do nível 8; 3 s entre mensagens; sem links; não traz mensagens de quem eu bloqueei)
`DELETE /api/account{password}` (exclui/anonimiza a conta) · `GET /api/account/blocks` · `POST|DELETE /api/account/blocks/:nick` · `POST /api/account/reports{nick,messageId?,reason,details?}` (Play Store: bloqueio e denúncia)
`GET /api/painel/denuncias?status=OPEN|RESOLVED&page=` · `POST /api/painel/denuncias/:id/resolver{acao,horas?}` · `GET /api/painel/x1?page=` (ou `/futprego`) · `GET /api/painel/multicontas?page=&q=` (painel de admin)
`GET /api/meta|home?team=|rankings/:scope` (`hora|rodada|temporada|geral|penal|falta|trilha|x1-rodada|x1-temporada|x1-geral`)`|league|league/rounds/:n|league/titles|teams|teams/:slug|players/:nick|players/search?q=|feed|matches/:id`
`GET /api/x1/status` (jogo do dia, desafios abertos, jogando) · WebSocket `/api/ws/x1?token=&mode=lobby|game` (X1: convite, partida, fim)
`POST /api/admin/advance-round|close-hour|vip|money|level|reset-daily{nick}|ban` (header `x-admin-key`)
`GET /api/painel/users?q=&page=&order=recentes|criadas|painel/users/:id|painel/log?page=` · `PATCH /api/painel/users/:id{nick,email,bio,money,vipDays,dexterity,nickColor,teamSlug,banHours}` · `POST /api/painel/users/:id/gols{qtd}|exp{qtd}` (painel de admin; JWT + `isAdmin`)
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
- **SEMPRE avisar no grupo do Telegram o que foi ajustado/adicionado** (dono, 20/09/2026: "para todos sabermos,
  tanto mudança nossa quanto mudança do Erickles" — vale para toda IA e todo colaborador): depois de publicar (ou de
  concluir um ajuste no servidor/banco), mandar ao grupo "JogaGol - ADMIN" um resumo em PT-BR, curto e em linguagem
  de jogador/dono (o que mudou, por que, onde ver), não a lista de commits — o "API subiu" automático já lista os
  títulos dos commits, e não substitui o resumo. Como mandar, na VPS (pasta api/, com o .env):
  `set -a && . ./.env && set +a && node -e "import('./src/lib/telegram.js').then(({tg}) => tg.raw('<b>Título</b>\n\ntexto em HTML').then(console.log))"`
  (sem carregar o `.env` o token fica vazio e o `tg.raw` devolve `false` CALADO — nada chega ao grupo; confira o `true`) — ou o
  `tools/vps/tg-aviso.sh "<texto>"` (lê o token de `/etc/brgol-telegram.conf`).
- **Publicar só uma parte do `main`** (usado em 15/09/2026): se o `main` tiver trabalho inacabado de alguém,
  criar um ramo `prod` a partir do commit que está em produção (`grep "commit " /var/log/brgol-deploy.log |
  tail -1` na VPS), cherry-pick do que vai subir e deploy com
  `sed 's/^BRANCH=main/BRANCH=prod/' /usr/local/bin/brgol-deploy.sh | bash`. **Antes, avisar o outro
  colaborador**: se ele rodar o deploy padrão no meio, o `main` inteiro vai ao ar por cima (aconteceu em
  15/09 — o Futprego foi publicado por ele mesmo e o `prod` foi aposentado). Apagar o ramo `prod` depois.
- **O jogo roda SOMENTE na VPS do Managol** (`root@187.127.17.121`, projeto em
  `/var/www/brgol/app`). Não existe ambiente local nem outra hospedagem. Todo deploy é
  `bash /usr/local/bin/brgol-deploy.sh` na VPS, rodado manualmente via SSH (faz `git reset --hard
  origin/main`, `npm ci`, `prisma migrate deploy`, **trava a busca do X1 e espera as partidas em andamento
  acabarem** (até 4 min; o que sobrar é cancelado com a aposta devolvida — ver "Trava de atualização" no X1),
  `pm2 restart brgol-api` e build do web). O script está em `tools/vps/brgol-deploy.sh` — mudou, copie para a
  VPS. Não há CI: push no GitHub não dispara nada.
- **Banco local para os testes** (15/09/2026): Postgres 17 do PC, banco `brgol`, `api/.env` local (gitignored) com
  `DATABASE_URL`, `JWT_SECRET=dev-secret`, `PORT=4320`, `ADMIN_KEY=dev-admin`, `X1_JOGO=…`, `FUTPREGO_MESMO_IP=1`.
  Os scripts `test-*.js` só rodam com `localhost` no `DATABASE_URL`; o `test-botao.js` e o `test-futprego.js` NÃO
  apagam os jogadores que criam (`bt…`/`fp…`, e-mail `@local.test`): depois de muitas rodadas o Ranking X1 do banco local
  passa de 100 nomes e a checagem de ranking do test-botao falha (a rota corta em 100) — é o banco, não o código; a API local sobe com
  `set -a && . ./.env && set +a && node src/index.js` (pasta api/).
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
- **Atualização do app (PWA)** (15/09/2026): `registerType: 'prompt'` + `lib/pwa.ts` — checa versão nova a cada 5 min e
  ao voltar para a aba; quando há, `updateReady` liga e o Layout mostra o banner laranja "Nova versão — toque para
  atualizar" (`applyUpdate` = skipWaiting + reload). NUNCA recarregar sozinho (partida do X1 no meio). Antes era
  `autoUpdate` sem reload: a tela aberta ficava com o JS antigo e mensagens/ícones novos apareciam "sem formato".
- **SEO e preview do link** (pedido do dono, 15/09/2026): tudo no **`web/index.html`** — título/descrição com as
  palavras que o público procura (BRGOL/BR GOL, jogo de fazer gols, disputa de gols online), Open Graph + Twitter
  card (`/og.jpg` 1200×630 < 300 KB e `/og-square.jpg` 600×600, gerados de `assets/play-store/destaque-1024x500.png`
  e `icone-512.png` com PIL; URLs absolutas), JSON-LD (VideoGame + WebSite + FAQPage) e um **bloco estático dentro
  de `#root`** (h1, seções, FAQ) que é o que os robôs sem JavaScript leem e a tela até o React montar (`createRoot`
  troca tudo). Os robôs de WhatsApp/Telegram/Facebook NÃO rodam JS: mudou texto de apresentação, mudar no
  `index.html` E na `Landing.tsx` (mesmos assuntos; conferir os fatos com as regras). Páginas públicas usam
  `useSeo()` (`lib/seo.ts`: título, descrição, canonical, og:* por rota; volta ao padrão ao sair). `robots.txt`
  (bloqueia /api, /admin, /debug*) e `sitemap.xml` (só páginas públicas) em `web/public/`. Preview em cache nos
  apps: depois de mudar, forçar com o depurador do Facebook / @WebpageBot no Telegram.
- Escudos reais em `web/public/escudos/<slug>.svg|png` (projeto privado para amigos);
  `Shield.tsx` renderiza `<img>` com fallback de sigla.
- 3D: modelos glTF em `web/public/3d/` gerados dos packs comprados via `tools/3d/` (README lá).
  `scenes/models.tsx` (estádio, trave, bola = **Trionda** `trionda.glb`) e `scenes/keeper.tsx`
  (jogador com clipes procedurais de salto em arco + **uniforme composto em runtime**:
  `kit-mask.png` + `kit-ao.png` + cores + escudo no peito). Goleiro e barreira vestem a camisa
  do **adversário da rodada** (`GET /api/me/opponent`; sem partida, kit padrão amarelo/vermelho).
  Rota oculta `/debug3d?view=&pose=&at=&badge=&c1=&c2=` para conferir por screenshot.
- Trilha: a bola é `components/TrailBall.tsx` (arte SVG cartoon no traço do kit + animação por
  requestAnimationFrame; o rastro é pintado por ela). Não usar `motion.g animate={{ x, y }}`
  dentro do `<svg>` da Trilha: a bola antiga, feita assim, nunca se moveu (ficava presa no
  canto 0,0 do campo).
- Termo: casas `.tile tile-{slot,now,typed,correct,present,absent}` (Label_Round01_White e
  item-*) e teclas `.key key-{correct,present,absent,kick}` (Button01_195) em `index.css`.
  Cores: verde = letra no lugar, laranja = em outro lugar, cinza = não tem.
- Antes de mexer em produção/servidor: mostrar o comando e pedir autorização.
- Ao concluir itens, atualizar `docs/ROADMAP.md` e este arquivo.
