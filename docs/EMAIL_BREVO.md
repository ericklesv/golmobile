# E-mail do JogaGol pelo Brevo

O JogaGol manda e-mail por SMTP (`api/src/lib/mail.js`): o "esqueci a senha" e os e-mails de campanha (o primeiro é
o "volta pro JogaGol" de 22/10/2026, `services/emailVolta.js`). Até 22/10/2026 **nenhum e-mail saía**: a VPS não
tinha `SMTP_HOST` e o domínio não tinha os registros que provam ao Gmail que o e-mail é dele. O "esqueci a senha"
só gravava o link no log.

Serviço escolhido: **Brevo** (plano grátis, 300 e-mails por dia). O domínio `jogagol.com.br` está na **Hostinger**,
na conta do Erickles (nameservers `dns-parking.com`).

## 1. Criar a conta no Brevo

1. Abra <https://www.brevo.com> → **Sign up free** (ou "Cadastre-se grátis"). Use um e-mail que vocês leiam.
2. Preencha o perfil que ele pede (nome, empresa = JogaGol / Managol Softwares, site = jogagol.com.br). O plano
   **Free** basta.
3. Confirme o e-mail da conta pelo link que o Brevo manda.

## 2. Autenticar o domínio (Brevo → Hostinger)

No Brevo:

1. Menu do canto superior direito (nome da conta) → **Senders, Domains & Dedicated IPs** (Remetentes, domínios e
   IPs) → aba **Domains** → **Add a domain**.
2. Domínio: `jogagol.com.br`. Quando ele perguntar como autenticar, escolha **fazer você mesmo / manualmente**
   ("Authenticate the domain yourself"). Ele mostra uma lista de registros. Hoje costumam ser estes (os valores
   são da SUA conta, copie do Brevo):

| Tipo  | Nome (na Hostinger)  | Valor                                                    |
|-------|----------------------|----------------------------------------------------------|
| TXT   | `@`                  | `brevo-code:xxxxxxxxxxxxxxxx`                            |
| CNAME | `brevo1._domainkey`  | `b1.jogagol-com-br.dkim.brevo.com`                       |
| CNAME | `brevo2._domainkey`  | `b2.jogagol-com-br.dkim.brevo.com`                       |
| TXT   | `_dmarc`             | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`       |

   Se a lista do Brevo tiver mais algum (por exemplo um TXT `v=spf1 include:spf.brevo.com ~all` no `@`), coloque
   também. Vale sempre o que o Brevo mostrar.

Na Hostinger (conta do Erickles):

1. **hPanel** → **Domínios** → `jogagol.com.br` → **DNS / Nameservers** → **Registros DNS** (Gerenciar registros
   DNS).
2. Para cada linha da tabela: **Adicionar registro** → Tipo, Nome e "Aponta para"/"Conteúdo" iguais aos do Brevo,
   TTL padrão → **Adicionar**. No campo Nome vai só o pedaço (`brevo1._domainkey`, `_dmarc`, `@`): a Hostinger
   completa com `.jogagol.com.br` sozinha.
3. **Não apague nem mude nenhum registro que já existe.** Os registros `A`/`CNAME` do `@` e do `www` são o site no
   ar; o TXT `google-site-verification` é o Search Console. Só **adicionar**.
4. Um domínio só pode ter **um** registro SPF (TXT que começa com `v=spf1`). Hoje não tem nenhum; se aparecer um
   antes de vocês, junte os dois num só em vez de criar outro.

De volta ao Brevo: na tela do domínio, **Authenticate this domain** / **Verify**. Na Hostinger costuma valer em
minutos; pode levar algumas horas. Ficou tudo verde = pronto.

## 3. Remetente

Brevo → **Senders, Domains & Dedicated IPs** → aba **Senders** → **Add a sender**:

- Nome: `JogaGol`
- E-mail: `nao-responda@jogagol.com.br`

Com o domínio autenticado ele costuma aceitar direto. Se pedir um **código enviado para esse endereço**, o domínio
não recebe e-mail (não tem MX): avise a IA do projeto que ela monta um encaminhamento só para receber o código.

## 4. Chave SMTP

Brevo → menu da conta → **SMTP & API** → aba **SMTP** → **Generate a new SMTP key** (dê o nome `jogagol-vps`).
A tela mostra:

- Servidor `smtp-relay.brevo.com`, porta `587`
- **Login** (algo como `9a8b7c001@smtp-brevo.com`; não é o e-mail da conta)
- A **chave** (aparece uma vez só: copie na hora)

**Não cole a chave no chat.** Salve num arquivo de texto no PC, `C:\Users\guicp\brevo-smtp.txt`, com duas linhas:

```
login: 9a8b7c001@smtp-brevo.com
chave: xsmtpsib-....
```

e avise a IA. Ela passa para o `api/.env` da VPS sem mostrar a chave, apaga o arquivo do PC e reinicia a API com
a trava do X1 (sem derrubar partida). No `.env` da VPS fica:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<login>
SMTP_PASS=<chave>
MAIL_FROM="JogaGol <nao-responda@jogagol.com.br>"
```

**IP autorizado.** O Brevo recusa o SMTP de servidor que ele não conhece (`525 5.7.1 Unauthorized IP address`).
Libere o IP da VPS, **187.127.17.121**, em ⚙ → **Segurança** → **IPs autorizados** (<https://app.brevo.com/security/authorised_ips>).
Cuidado: o botão "adicionar meu IP atual" põe o IP do SEU PC, não o da VPS (foi o que aconteceu em 22/10/2026).

## 4b. Aviso de quem abriu (webhook)

O Brevo **reescreve todos os links** (passam por `sendibt2.com`) e **troca as imagens por cópias dele**, baixadas na
hora do envio — no plano grátis isso não desliga. Por isso imagem de rastreio nossa não serve (todo e-mail apareceria
como aberto no envio). Quem mede a abertura é a imagem do próprio Brevo, e ele avisa a API:

1. Na VPS, `BREVO_WEBHOOK_SECRET` no `api/.env` (um texto aleatório longo) e reiniciar a API.
2. Brevo → **Transacional** → **Configurações** → **Webhooks** (ou ⚙ → Webhooks) → **Adicionar webhook**:
   - URL: `https://jogagol.com.br/api/email/brevo/<BREVO_WEBHOOK_SECRET>`
   - Eventos: **Aberto** (Opened), **Primeira abertura** (Unique opened) e **Spam** (Complaint).
3. Cada abertura vira "👀 fulano abriu o e-mail de volta" no Telegram; spam tira a pessoa da lista.

## 5. Conferir

1. Prova da campanha para um e-mail nosso (pasta api/ na VPS, usuário brgol, com o .env carregado):
   `node scripts/email-volta.js teste gclithg@gmail.com` — chega na caixa de entrada? Clicar no botão avisa no
   Telegram com "(teste)" e não dá VIP.
2. No Gmail, abra o e-mail → ⋮ → **Mostrar original**: SPF, DKIM e DMARC têm de aparecer como **PASS**.
3. "Esqueci a senha" no site com um e-mail nosso: o link tem de chegar.

Se o envio falhar com "account not activated"/"unauthorized", o Brevo às vezes segura o SMTP de conta nova até
revisar: abra um chamado no suporte do Brevo pedindo a ativação do envio transacional (SMTP).

## Limites

- Plano grátis: **300 e-mails por dia**. A campanha de volta tem ~215; o script manda 1 a cada 3 s.
- O Gmail exige o "cancelar inscrição" de um clique em e-mail de campanha: o script já manda o cabeçalho
  `List-Unsubscribe` + `List-Unsubscribe-Post` (rota `POST /api/email/sair`).
