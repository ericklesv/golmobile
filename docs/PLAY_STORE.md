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
- [x] **E-mail de contato `contato@jogagol.com.br`** criado (14/09) — está nos textos de
  privacidade/termos/exclusão (`CONTACT_EMAIL` em `Legal.tsx`).
- [ ] Nome do responsável nos textos: **"Managol Softwares"** (`RESPONSIBLE` em `Legal.tsx`). Se a
  conta virar CNPJ/organização, atualizar.

## Passo a passo

### 1. Play Console — conferências (dono)
- [x] `play.google.com/console` → conta "Managol Softwares" (pessoal), verificação OK (14/09).
- [x] *Criar app* feito (14/09) — nome **JogaGol**, idioma padrão **português (Brasil)**, **Jogo**, **Grátis**
  (grátis não tem volta: um app grátis nunca vira pago; compras no app são outra coisa).
- [ ] *Configuração › Integridade do app › Assinatura de apps*: aceitar o **Play App Signing**
  (padrão). Depois do primeiro upload aparece o **SHA-256 do certificado de assinatura do app** — é
  ele que entra no `assetlinks.json` (passo 3). Anote também o SHA-256 da **chave de upload**.

### 2. Código (feito; ver tabela acima) + deploy
- [x] Páginas legais, exclusão de conta, denúncias/bloqueio, ícone maskable, TWA sem PIX.
- [x] Deploy na VPS feito 14/09 (migração **0023_play_store**: `User.deletedAt`, `UserBlock`, `Report`).
- [x] No ar: `/privacidade`, `/termos`, `/excluir-conta`, `/manifest.webmanifest`, `/icon-512-maskable.png`.

### 3. Digital Asset Links (sem isso o app abre com a barra do Chrome)
Arquivo **`web/public/.well-known/assetlinks.json`** (o Vite copia para o build; o nginx do site
`brgol` serve caminhos com ponto normalmente — conferido em 14/09). Precisa dos **dois** SHA-256:
- [x] **chave de upload** (a que assina o que sai do Bubblewrap): já está no arquivo —
  `17:F8:59:74:CE:89:F0:F6:6D:86:96:7C:94:D2:55:93:CF:62:8F:BB:FB:E1:64:95:0E:8A:4F:A3:9A:42:D0:25`
  (`keytool -list -v -keystore android.keystore -alias jogagol`).
- [ ] **chave de assinatura do app** (Play App Signing): aparece no console **depois do primeiro
  upload** em *Testar e lançar → Configuração → Integridade do app → Assinatura de apps → "Certificado
  da chave de assinatura do app" → SHA-256*. Colar como segundo item de `sha256_cert_fingerprints`,
  commit + deploy. Sem ela, o app instalado **pela Play Store** (assinado pelo Google) abre com a barra
  do Chrome; o APK instalado por USB (assinado pela chave de upload) já abre sem barra.
- Conferir no ar: `curl -sI https://jogagol.com.br/.well-known/assetlinks.json` → `200` e
  `content-type: application/json`. Validador: https://developers.google.com/digital-asset-links/tools/generator

### 4. Empacotar com o Bubblewrap (feito em 14/09/2026 na máquina do Guilherme)
O `bubblewrap init` é todo interativo; em vez dele usamos **`node tools/twa/init-twa.cjs`** (mesmas
chamadas da biblioteca, respostas fixas). O projeto TWA fica **fora do repo** em
`C:\Users\guicp\dev\jogagol-twa\` (tem a chave de upload). Cópia de referência do
`twa-manifest.json` em `tools/twa/`.

Ferramentas (uma vez por máquina; ~1 GB):
- JDK 17 x64 (Temurin `17.0.11+9`, zip) em `C:\Users\guicp\dev\jdk-17.0.11+9`.
- Android command-line tools `6609375` em `C:\Users\guicp\dev\android-sdk` (fica `android-sdk\tools\...`),
  + `sdkmanager --sdk_root=C:\Users\guicp\dev\android-sdk "build-tools;36.1.0" "platforms;android-36" "platform-tools"`
  (aceitar licenças com `--licenses`).
- `npm i -g @bubblewrap/cli` e `%USERPROFILE%\.bubblewrap\config.json` =
  `{"jdkPath":"C:/Users/guicp/dev/jdk-17.0.11+9","androidSdkPath":"C:/Users/guicp/dev/android-sdk"}`.

Decisões que o Bubblewrap impôs: **Play Billing exige `enableNotifications: true`** (delegação de
notificações) e **`minSdkVersion: 23`** (a biblioteca de billing não aceita 21) — já estão no
`init-twa.cjs`. Resultado: `applicationId br.com.jogagol.app`, versionCode 1 / 1.0.0, minSdk 23,
**targetSdk 36 (Android 16)**, permissões INTERNET/BILLING/POST_NOTIFICATIONS.

Gerar/atualizar (PowerShell — pelo Git Bash o `gradlew.bat` não é encontrado):
```powershell
cd C:\Users\guicp\dev\jogagol-twa
$pw = '<senha do keystore>'          # está em SENHA-DA-CHAVE.txt — mover para o gerenciador de senhas
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = $pw; $env:BUBBLEWRAP_KEY_PASSWORD = $pw
$env:JAVA_HOME = 'C:\Users\guicp\dev\jdk-17.0.11+9'
$env:Path = "$env:JAVA_HOME\bin;C:\Users\guicp\dev\jogagol-twa;$env:Path"
bubblewrap update --skipVersionUpgrade   # só se mudou o twa-manifest.json (ou `bubblewrap update` para subir a versão)
bubblewrap build --skipPwaValidation     # → app-release-bundle.aab (loja) e app-release-signed.apk (teste por USB)
```
- [x] Primeiro build feito: `C:\Users\guicp\dev\jogagol-twa\app-release-bundle.aab` (3,7 MB).
- [ ] Testar no celular: `adb install app-release-signed.apk` (adb em `android-sdk\platform-tools`)
  — abre **sem** barra de endereço, `/vip` mostra "chega em breve" no lugar dos pacotes PIX.
- [ ] Versão nova: subir `appVersionCode` (e `appVersionName`) no `twa-manifest.json`, `bubblewrap
  update --skipVersionUpgrade`, `bubblewrap build`. Nunca subir o mesmo `versionCode` duas vezes.
- Chave de upload: `android.keystore` (alias `jogagol`), senha em `SENHA-DA-CHAVE.txt` → **guardar no
  gerenciador de senhas e apagar o .txt**. Perdeu a chave? O Play App Signing permite pedir troca da
  chave de upload no console (por isso ela é só "de upload").

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
