# JogaGol na Google Play — requisitos e passo a passo

Guia escrito em 14/09/2026 (decisões do dono nesse dia). Vale para o Guilherme e para o
ericklesv. Marque `[x]` conforme for fazendo; o que depende do Play Console está indicado.

## Decisões tomadas (14/09/2026)

- **Conta:** Google Play Developer **"Managol Softwares"**, conta **pessoal**, taxa única de US$ 25 já
  paga (a mesma conta publica o Managol depois). Conta pessoal ⇒ o Google exige **teste fechado com
  ≥ 12 testadores inscritos por 14 dias seguidos** antes de liberar a produção (ver passo 6).
- **Formato do app:** **TWA (Trusted Web Activity)** com **Bubblewrap**. O app é uma casca do Chrome
  que abre `https://jogagol.com.br` em tela cheia. Todo deploy do site atualiza o app; `.aab` novo
  só para ícone/nome/`start_url` ou quando o Google sobe o Android-alvo (uma vez por ano, prazo 31/08).
- **Pagamento (modelo Pokémon GO):** dentro do app o VIP é vendido pelo **Google Play Billing**
  (Digital Goods API; Google fica com 15 % até US$ 1 mi/ano); no **site** continua o **PIX na Efí**
  (sem taxa, pode ser mais barato). **O app nunca aponta para a loja do site** (política anti-steering:
  nem link, nem "mais barato em…"). A divulgação do preço do site é feita fora do app. Como é a
  mesma conta, VIP comprado no site vale no app na hora. Enquanto o Play Billing não está pronto, o
  app **esconde** os pacotes PIX (`web/src/lib/twa.ts` + `Vip.tsx`: "A compra de dias de VIP dentro
  do app chega em breve").
  - *Por que não o "User Choice Billing" (opção C)?* Nele o PIX apareceria dentro do app ao lado do
    Google, mas o Google cobra a taxa do mesmo jeito (só −4 %). Não fica mais barato para ninguém.
- **Público-alvo: 13+** (nunca marcar menores de 13: cai na política de Famílias — chat e compras viram
  problema). Categoria **Jogos › Esportes**, grátis, sem anúncios, com compras no app.

## O que o jogo já tem para a loja (feito 14/09/2026)

| Exigência do Google | Onde está |
|---|---|
| Política de privacidade com URL pública | `https://jogagol.com.br/privacidade` (`web/src/screens/Legal.tsx`) |
| Termos de uso | `https://jogagol.com.br/termos` |
| Exclusão de conta **dentro do app** e **por link** | Perfil → "Excluir minha conta" (`components/Account.tsx`, `DELETE /api/account`) e `https://jogagol.com.br/excluir-conta` (URL para o formulário "Segurança dos dados") |
| Conteúdo gerado por usuário: denunciar, bloquear, moderar | Bandeirinha em cada mensagem do chat e botões no perfil do jogador (`POST /api/account/reports`, `POST/DELETE /api/account/blocks/:nick`); painel de admin → aba **Denúncias** (ignorar / apagar mensagem / banir 24 h, tudo no log) |
| Ícone maskable (zona segura) | `web/public/icon-512-maskable.png` (manifest `purpose: maskable`) |
| App esconde a compra PIX quando roda como TWA | `web/src/lib/twa.ts` (`?src=twa` no `startUrl` do Bubblewrap ou `document.referrer = android-app://…`) |
| Ícone da ficha (512×512) e gráfico de destaque (1024×500) | `assets/play-store/icone-512.png`, `assets/play-store/destaque-1024x500.png` |
| Teste automatizado do bloco de conta | `node scripts/test-conta.js` (pasta api/, só banco local) → "TUDO OK" |

**Pendências que precisam de decisão/ação do dono:**
- [ ] **E-mail de contato `contato@jogagol.com.br`** está nos textos de privacidade/termos/exclusão
  (`CONTACT_EMAIL` em `Legal.tsx`). Criar a caixa (ou redirecionamento) no painel do domínio — o
  Google e os jogadores vão escrever para ele. Se preferir outro e-mail, trocar a constante.
- [ ] Nome do responsável nos textos: **"Managol Softwares"** (`RESPONSIBLE` em `Legal.tsx`). Se a
  conta virar CNPJ/organização, atualizar.

## Passo a passo

### 1. Play Console — conferências (dono)
- [ ] `play.google.com/console` → conta "Managol Softwares": **verificação de identidade** concluída
  (documento) e e-mail/telefone confirmados. Sem isso não publica.
- [ ] *Criar app*: nome **JogaGol**, idioma padrão **português (Brasil)**, **Jogo**, **Grátis**
  (grátis não tem volta: um app grátis nunca vira pago; compras no app são outra coisa).
- [ ] *Configuração › Integridade do app › Assinatura de apps*: aceitar o **Play App Signing**
  (padrão). Depois do primeiro upload aparece o **SHA-256 do certificado de assinatura do app** — é
  ele que entra no `assetlinks.json` (passo 3). Anote também o SHA-256 da **chave de upload**.

### 2. Código (feito; ver tabela acima) + deploy
- [x] Páginas legais, exclusão de conta, denúncias/bloqueio, ícone maskable, TWA sem PIX.
- [ ] Deploy na VPS (`bash /usr/local/bin/brgol-deploy.sh`) — a migração **0023_play_store** cria
  `User.deletedAt`, `UserBlock` e `Report`.
- [ ] Conferir no ar: `/privacidade`, `/termos`, `/excluir-conta`, `/manifest.webmanifest`,
  `/icon-512-maskable.png`.

### 3. Digital Asset Links (sem isso o app abre com a barra do Chrome)
Arquivo `https://jogagol.com.br/.well-known/assetlinks.json` com **os dois** SHA-256 (assinatura do
app + chave de upload), no formato:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "br.com.jogagol.app",
    "sha256_cert_fingerprints": [
      "AA:BB:...:ZZ",
      "11:22:...:99"
    ]
  }
}]
```
- [ ] Colocar em `web/public/.well-known/assetlinks.json` (o Vite copia para o build) **e** conferir
  que o nginx do site `brgol` **não bloqueia** caminhos que começam com ponto (muitas configs têm
  `location ~ /\.` → deny; se tiver, abrir exceção para `/.well-known/`). Teste:
  `curl -sI https://jogagol.com.br/.well-known/assetlinks.json` → `200` e `content-type: application/json`.
- [ ] Validar: https://developers.google.com/digital-asset-links/tools/generator (ou o próprio
  `bubblewrap doctor`/`bubblewrap validate`).

### 4. Empacotar com o Bubblewrap (qualquer máquina com Node 20)
```bash
npm i -g @bubblewrap/cli
mkdir jogagol-twa && cd jogagol-twa
bubblewrap init --manifest https://jogagol.com.br/manifest.webmanifest
```
Respostas no `init` (o resto pode ficar no padrão):
- Application ID: **`br.com.jogagol.app`** (não muda nunca mais).
- Name: **JogaGol** · Launcher name: **JogaGol**.
- **Start URL: `/?src=twa`** ← é o que liga o modo "app" (`lib/twa.ts`). O manifest do site continua
  com `start_url: /` para o PWA instalado pelo navegador.
- Display mode: `standalone` · Orientation: `portrait` · Status bar color: `#04101B`.
- Icon URL: `https://jogagol.com.br/icon-512.png` · Maskable icon: `https://jogagol.com.br/icon-512-maskable.png`.
- **Include support for Play Billing? → yes** (necessário para o passo 8).
- Signing key: deixar o Bubblewrap criar (`android.keystore`) — **guardar o arquivo e as senhas em
  lugar seguro (gerenciador de senhas)**. Perdeu = nunca mais atualiza o app.
- O Bubblewrap baixa o JDK e o Android SDK sozinho na primeira vez (aceitar as licenças).

```bash
bubblewrap build        # gera app-release-bundle.aab (loja) e app-release-signed.apk (teste)
bubblewrap install      # instala o APK num celular ligado por USB com depuração ativa
```
- [ ] No celular: o app abre **sem** barra de endereço (assetlinks OK), tela cheia, ícone certo,
  `/vip` mostra "chega em breve" no lugar dos pacotes PIX.
- [ ] Guardar a pasta `jogagol-twa/` (tem o `twa-manifest.json`) — é ela que gera as versões seguintes
  (`bubblewrap update` + `bubblewrap build`; subir `appVersionCode` a cada envio).

### 5. Play Console — formulários (dono)
*Configuração do app › Conteúdo do app*:
- [ ] **Política de privacidade:** `https://jogagol.com.br/privacidade`.
- [ ] **Anúncios:** não contém anúncios.
- [ ] **Acesso ao app:** "todas ou algumas funcionalidades restritas" → cadastrar uma conta de revisor
  (criar no jogo, ex.: nick `revisor.google`, senha só no formulário) e explicar: "Login com
  nick/senha; minigames liberam por nível; a compra de VIP no app ainda não está ativa".
- [ ] **Classificação de conteúdo (IARC):** questionário — jogo de esporte; **interação entre
  usuários (chat) = sim**; compras digitais = sim; sem violência/apostas com dinheiro real. Resultado
  esperado: Livre/10+ ou 12.
- [ ] **Público-alvo:** 13 anos ou mais (não marcar faixas menores).
- [ ] **Apps de notícias / COVID / governo / financeiros / saúde:** não.
- [ ] **Segurança dos dados:** coleta = e-mail, nome de usuário (nick), fotos (perfil), mensagens
  (chat), histórico de compras, IP/localização aproximada (segurança). Compartilhamento com
  terceiros = não (Efí/Google processam pagamento como operadores). Dados criptografados em
  trânsito = sim. **Exclusão de dados = sim**, URL `https://jogagol.com.br/excluir-conta`.
- [ ] **Conteúdo gerado por usuários:** sim — descrever: denúncia por mensagem e por perfil,
  bloqueio, moderação humana pelo painel, termos de uso.

*Ficha da loja principal*:
- [ ] Nome: **JogaGol** (≤ 30) · Descrição curta (≤ 80): ex. "Chute, marque e leve seu time ao topo
  no jogo de gols do Brasil." · Descrição completa (≤ 4000): o que é o jogo, chutes, minigames diários,
  liga com rodadas de 24 h, times reais, rankings, VIP. **Nada de prometer prêmio em dinheiro real**
  (o R$ do jogo é virtual; não usar a palavra "aposta").
- [ ] Ícone: `assets/play-store/icone-512.png` · Gráfico de destaque: `assets/play-store/destaque-1024x500.png`.
- [ ] Screenshots de celular: mínimo 2, ideal 6 (9:16, 1080×2400) — Home com os chutes, Liga,
  Rankings, pênalti 3D, um minigame, perfil. (Dá para gerar com o puppeteer de `tools/`.)
- [ ] Categoria: Jogos › Esportes · E-mail de contato: `contato@jogagol.com.br` · Site: `https://jogagol.com.br`.

### 6. Teste interno → teste fechado (obrigatório para conta pessoal)
- [ ] *Teste › Teste interno*: subir o `.aab`, criar lista de testadores (e-mails Google de vocês),
  instalar pelo link e usar de verdade por alguns dias.
- [ ] *Teste › Teste fechado*: faixa "Alpha", subir o mesmo `.aab`, adicionar **≥ 12 testadores** (a
  torcida do jogo: os VIPs pagantes são candidatos) e pedir que **instalem e fiquem inscritos**. O
  contador dos **14 dias** só corre com 12+ inscritos ao mesmo tempo.
- [ ] Depois dos 14 dias: *Painel › Solicitar acesso à produção* → questionário (o que testou, o que
  mudou). Google responde em alguns dias.

### 7. Produção
- [ ] *Produção › Criar versão*: `.aab`, notas da versão em pt-BR, países = Brasil (ou todos).
- [ ] *Enviar para revisão*. Primeira revisão costuma levar de 1 a 7 dias; recusas vêm com o motivo
  (quase sempre política de UGC, privacidade ou pagamentos — as três já cobertas).
- [ ] Depois: deploy do site = atualização do app. `.aab` novo só para ícone/nome/start_url ou quando
  o console avisar "nível de API alvo" (todo ano, prazo 31/08).

### 8. Google Play Billing dentro do app (próxima etapa de código)
Só faz sentido depois que o app existir no console (os produtos são cadastrados lá).
1. *Monetizar › Produtos › Produtos no app*: criar um produto **consumível** por pacote, com o mesmo
   `key` do `VIP_PACKS` (`vip10`, `vip30`, `vip60`, `vip120`, `vip250`, `vip500`) e preço em R$.
2. API: `POST /api/vip/play/verify {productId, purchaseToken}` → confere na **Google Play Developer
   API** (`purchases.products.get`, conta de serviço com acesso ao console) que `purchaseState = 0`,
   credita os dias **uma vez só** (tabela nova `PlayPurchase` com `purchaseToken` único, mesma
   disciplina do PIX: gravar antes, creditar numa transação) e devolve OK; o cliente então chama
   `consume()` para poder comprar de novo.
3. Web (só quando `isTwa()`): `window.getDigitalGoodsService('https://play.google.com/billing')` →
   `getDetails([ids])` para os preços, `new PaymentRequest([{ supportedMethods:
   'https://play.google.com/billing', data: { sku } }])` → `show()` → manda o `purchaseToken` para a
   API → `consume(token)`. Referência: https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing
4. Ligar o programa de **15 %** (Play Console › Configuração › Programa para pequenas empresas).

## Regras rápidas para não ser reprovado
- Dentro do app, **nunca** citar PIX, preço do site ou "compre no site". Fora do app, à vontade.
- A ficha da loja não pode prometer dinheiro real nem usar "aposta"/"cassino".
- Manter `/privacidade` e `/excluir-conta` no ar para sempre (o Google confere de tempos em tempos).
- Responder denúncias no painel (aba Denúncias) — a política de UGC exige moderação ativa.
- Não subir o mesmo `versionCode` duas vezes; não trocar o `applicationId` nem a chave de upload.
