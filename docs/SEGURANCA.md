# Segurança do JogaGol — DDoS, cadastro em massa e abuso

Plano combinado com o dono em 15/09/2026 ("o concorrente sofre com DDoS e similares"). Ordem de
impacto: **1. Cloudflare na frente** (segura o DDoS de verdade) → 2. cadastro → 3. login/API →
4. VPS (nginx/ufw/fail2ban) → 5. multi-conta. Os blocos 2 e 3 estão no código (`api/src/lib/security.js`,
teste `node scripts/test-seguranca.js`); 1 e 4 dependem de ações do dono e de comandos na VPS.

## 1. Cloudflare (grátis) — o que resolve DDoS

Sem isso, qualquer flood chega direto no Node da VPS e derruba tudo antes de o rate limit rodar.
Com a Cloudflare na frente, o IP da VPS some da internet e os ataques morrem na borda deles.

### 1a. Conta e DNS (dono)
- [ ] Criar conta em https://dash.cloudflare.com → *Add a site* → `jogagol.com.br` → plano **Free**.
- [ ] Ela importa os registros DNS atuais. Conferir que existem `A jogagol.com.br → 187.127.17.121` e
  `A www → 187.127.17.121` (ou CNAME), ambos com a **nuvem laranja (Proxied)** ligada.
  `brgol.managol.com.br` é outra zona (managol.com.br) — pode ir para a Cloudflare depois, do mesmo jeito.
- [ ] Trocar os **nameservers** no registrador do domínio (onde `jogagol.com.br` foi comprado) pelos dois
  que a Cloudflare mostrar. Propaga em minutos a algumas horas; o site não cai no meio.
- [ ] *SSL/TLS → Overview* → **Full (strict)** (o certificado do Certbot na VPS continua valendo).
  *Edge Certificates*: **Always Use HTTPS** = on, **HSTS** pode ligar depois de um dia sem problemas.

### 1b. Proteções (dono, no painel da Cloudflare)
- [ ] *Security → Settings*: **Bot Fight Mode** = on. **Security Level** = Medium.
- [ ] *Security → WAF → Rate limiting rules* (o Free dá 1 regra): `(http.request.uri.path contains "/api/auth/")`
  → 10 requisições por 10 s por IP → Block por 1 min. (A API já limita por conta; isto segura a rajada
  antes de chegar nela.)
- [ ] *Security → WAF → Custom rules* (Free dá 5): bloquear `not ip.geoip.country in {"BR" "PT" "US"}` **só
  se** um ataque vier de fora — não deixar ligado sempre (jogador em viagem).
- [ ] Saber onde fica o **Under Attack Mode** (*Overview* → Quick Actions): é o botão de pânico, liga um
  desafio JS para todo mundo por 5 s; usar durante um ataque e desligar depois.
- [ ] *Caching → Configuration*: **Browser Cache TTL** = Respect existing headers. *Rules → Cache Rules*:
  `/ui/*`, `/escudos/*`, `/3d/*`, `/tv/*`, `/brand/*`, `/assets/*` → Eligible for cache, Edge TTL 1 dia.
  **Nunca** cachear `/api/*` (regra: Bypass cache para `http.request.uri.path starts_with "/api/"`).
- [ ] **Turnstile** (*Turnstile* no menu): *Add site* → `jogagol.com.br`, tipo **Managed** (invisível na
  maioria dos casos) → copiar **Site Key** e **Secret Key** → na VPS, `api/.env`:
  `TURNSTILE_SITE_KEY=…` e `TURNSTILE_SECRET=…` → `pm2 restart brgol-api`. O cadastro passa a exigir
  o token; sem as duas chaves fica desligado (`/api/meta.turnstileSiteKey = null`).

### 1c. VPS depois que o DNS estiver na Cloudflare (comandos para autorizar)
O nginx precisa ler o IP real do jogador (senão rate limit, `lastIp`, teto de contas e geolocalização
veem só IPs da Cloudflare) e o firewall precisa recusar quem tenta bater direto no IP da VPS.
```bash
# 1) IP real a partir do cabeçalho da Cloudflare (arquivo novo, incluído pelo nginx.conf)
cat > /etc/nginx/conf.d/cloudflare-realip.conf <<'EOF'
# faixas oficiais: https://www.cloudflare.com/ips/ (revisar 1x por ano)
set_real_ip_from 173.245.48.0/20;  set_real_ip_from 103.21.244.0/22;  set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;    set_real_ip_from 141.101.64.0/18;  set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;  set_real_ip_from 188.114.96.0/20;  set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;  set_real_ip_from 162.158.0.0/15;   set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;    set_real_ip_from 172.64.0.0/13;    set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;   set_real_ip_from 2606:4700::/32;   set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;   set_real_ip_from 2405:8100::/32;   set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
EOF
nginx -t && systemctl reload nginx
# a API continua com `trust proxy 1` (o nginx é o único proxy que ela vê) — nada muda no Node.

# 2) firewall: 80/443 só das faixas da Cloudflare; 22 continua aberto (chave SSH)
ufw allow 22/tcp
for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do ufw allow proto tcp from $ip to any port 80,443; done
ufw deny 80/tcp; ufw deny 443/tcp   # regras específicas acima têm prioridade
ufw --force enable && ufw status numbered
```
Atenção: a VPS também hospeda o Managol e outros sites — o bloqueio de 80/443 vale para todos eles.
Só rodar o passo 2 quando **todos** os domínios da VPS estiverem atrás da Cloudflare; até lá, ficar só
com o passo 1 e a Cloudflare já segura o grosso (o IP de origem fica "secreto" enquanto ninguém o descobre).

## 2. Cadastro em massa (feito 15/09 — `lib/security.js`)
- Limite de **5 cadastros por hora por IP** (`registerLimiter`) e **3 contas por IP em 24 h**
  (`User.createdIp`, migração 0026; erro `too-many-accounts`).
- **E-mail descartável** barrado (`disposable-email-domains`, ~120 mil domínios, subdomínios inclusos).
- **Tempo mínimo de 3 s** no formulário (`elapsedMs` do cliente). O **honeypot** `website` foi REMOVIDO em
  16/09/2026: o autofill do Android (Samsung Pass/Google) no WebView do Instagram preenchia o campo escondido
  mesmo com `autocomplete=off` — 10 bloqueios, todos de um único jogador real, zero robôs. Não reintroduzir
  campo escondido com nome que autofill reconheça; se precisar de mais defesa, ligar o Turnstile.
- **Turnstile** quando configurado (1b). Cloudflare fora do ar não trava o cadastro (registra e deixa passar).
- Painel de admin recebe `createdIp` na lista (ver contas em série do mesmo IP).

## 3. Login e API (feito 15/09)
- **Trava por conta**: 10 senhas erradas em 15 min → 15 min sem entrar naquela conta (429 `locked`),
  mesmo de IPs diferentes; acertou, zera. (O limite por IP de 40/15 min continua.)
- **Cache de 5 s** (10 s na meta/títulos, 30 s na lista de times) nas rotas públicas: `/api/rankings/*`,
  `/api/league*`, `/api/home`, `/api/teams*`, `/api/players/active`, `/api/feed`, `/api/meta`. Numa
  rajada o banco responde uma vez a cada 5 s. Cabeçalho `x-cache: hit|miss`. Nada com dado do usuário
  logado passa pelo cache.
- Busca de jogadores 60/min por IP; envio de foto 10 por 15 min; chat já tinha 3 s entre mensagens.
- `helmet` na API (nosniff, x-frame-options, referrer-policy…; CSP fica para o nginx). **Se um dia ligar CSP no
  nginx:** o painel de admin embute o mapa do OpenStreetMap num iframe (`frame-src https://www.openstreetmap.org`).
- Já existia: recargas validadas no servidor, captcha a cada 10 chutes, teto global de 300 req/min/IP.

## 4. VPS — FEITO em 15/09/2026 (independe da Cloudflare)
O que está na VPS (conferido de fora depois de aplicar):
- **nginx** — `/etc/nginx/conf.d/brgol-limits.conf`: zonas `brgol_api` (20 req/s por IP, rajada 40),
  `brgol_auth` (5 req/s, rajada 10 — no `location /api/auth/`), `brgol_conn` (30 conexões por IP),
  excedente = **429**, `server_tokens off`. Teste feito: 20 POSTs seguidos em `/api/auth/login` →
  10× 401 e depois 10× 429. Cabeçalhos em `/etc/nginx/snippets/brgol-headers.conf` (nosniff,
  X-Frame-Options SAMEORIGIN, Referrer-Policy, Permissions-Policy) incluídos no server e nos
  `location` que têm `add_header` próprio (senão o nginx não herda). Backup do site antes da edição em
  `/root/brgol.nginx.bak-<data>`. Bônus: `manifest.webmanifest` agora sai como `application/manifest+json`.
- **fail2ban** — `/etc/fail2ban/jail.d/brgol.conf` (cópia em `tools/vps/fail2ban/`): `sshd` (5 erros → 1 h),
  `nginx-limit-req` (30 estouros/min → 10 min), `nginx-botsearch` (10 buscas de phpMyAdmin/WordPress → 10 min) e,
  desde 22/09/2026, **`brgol-probes`** (`filter.d/brgol-probes.conf`: /.env, /.git, *.sql, *.zip, *.key, package.json,
  /api/swagger|graphql… — 4 em 5 min → 1 h). Ver: `fail2ban-client status brgol-probes`.
  **Consertos de 22/09** (uma semana depois de ligar, nada tinha funcionado): 1) as jaulas do nginx liam o journal do
  systemd (`backend = systemd`, padrão do Ubuntu) e o nginx grava em arquivo → `backend = auto` nas três (conferir com
  `fail2ban-client status <jaula>` → "File list" tem de mostrar o log); 2) o `action.d/brgol-telegram.conf` estava com
  token e chat vazios → agora chama `/usr/local/bin/brgol-f2b-aviso.sh <ip> <jaula> <n> <s>`, que explica a jaula em
  português e diz que nada passou; 3) **`port = http,https` em TODA jaula de web**: sem isso o padrão é `0:65535` e o
  bloqueio derruba também o **SSH** — foi o que aconteceu comigo em 22/09 (testei a varredura do meu IP e fiquei 1 h
  sem site E sem servidor). Mudar a porta exige `systemctl restart fail2ban`: o `reload` não refaz a regra do
  firewall (conferir com `nft list table inet f2b-table` → tem de ser `tcp dport { 80, 443 }`).
- **Admin NUNCA é bloqueado** (dono, 22/09/2026: "vai banir o admin? espero que não"): `ignorecommand =
  /usr/local/bin/brgol-admin-ip.sh <ip>` no `[DEFAULT]` das nossas jaulas — o script pergunta ao banco se o IP é de
  uma conta com `isAdmin` (`User.lastIp`, gravado a cada login/heartbeat, ou `createdIp`), então acompanha o IP de
  casa mudando. Banco fora do ar = bloqueia normal (segurança primeiro). `ignoreip` cobre localhost e o IP público da
  VPS. Conferir: `/usr/local/bin/brgol-admin-ip.sh <ip>` (sai 0 = admin) e `journalctl -t brgol-f2b`. Testado em
  22/09 com uma jaula de mentira (`action = dummy`, log em /tmp): 5 varreduras do IP do dono = 5 "ignorando", 5 de um
  IP comum = bloqueado.
- **Me bloqueei sem querer?** `/usr/local/bin/brgol-liberar.sh <ip>` tira o IP de todas as jaulas e avisa se ele
  também está na lista manual do nginx. Testar varredura SEM se bloquear: de dentro da VPS, na API direto
  (`curl -H "X-Real-IP: 198.51.100.77" http://127.0.0.1:4310/…`) — não passa pelo nginx, logo não conta no fail2ban. Testar sem prejudicar ninguém: `fail2ban-client set brgol-probes banip 203.0.113.9`
  (IP de documentação) → aviso no grupo → `unbanip`. Testar o filtro: `fail2ban-regex /var/log/nginx/access.log
  /etc/fail2ban/filter.d/brgol-probes.conf` (varredura de 17/09: 29 de 582 linhas; tráfego normal: 0).
- **nginx: 404 seco para arquivos sensíveis** (22/09/2026, `tools/vps/nginx-varredura.conf`, no `server` de
  jogagol.com.br logo abaixo do include dos bloqueados): `/.env`, `/.git/config`, `/dump.sql`, `/jwt.key`,
  `/package.json`, `/docker-compose.yml`… na raiz respondem 404 em vez do index.html do SPA (200 — o robô achava que
  tinha encontrado). Só raiz e dotfiles: `/tv/`, `/assets/`, `/escudos/` e `/.well-known/` (certbot) não são tocados.
  Backup de antes: `/root/brgol-nginx-antes-varredura-2026-09-22.conf`.
- **SSH só por chave** — `/etc/ssh/sshd_config.d/00-brgol-hardening.conf` (`PasswordAuthentication no`,
  `PermitRootLogin prohibit-password`, `MaxAuthTries 4`). O `00-` é de propósito: no sshd vale o primeiro
  valor lido e o `50-cloud-init.conf` da imagem ligava a senha. Quem precisar entrar (ericklesv) tem de
  mandar a chave pública — igual já estava previsto no CLAUDE.md.
- **unattended-upgrades** ligado (atualizações de segurança do Ubuntu sozinhas).
- Postgres já escutava só em 127.0.0.1; ufw já era 22/80/443.
- [ ] Monitor externo grátis (dono): https://uptimerobot.com → monitor HTTP em
  `https://jogagol.com.br/api/health` a cada 5 min, alerta por e-mail para `contato@jogagol.com.br`.

## Backup — FEITO em 15/09/2026 (na própria VPS + cópia mensal no PC)
Decisão do dono: "não é o recomendado, mas é o que tem pra hoje".
- **Diário na VPS**: `/usr/local/bin/brgol-backup.sh` (fonte em `tools/vps/brgol-backup.sh`), cron
  `/etc/cron.d/brgol-backup` às 03:40. Gera `/var/backups/brgol/daily/jogagol-<data>.tar` (só root) com
  `brgol-<data>.dump` (pg_dump formato custom), `uploads-<data>.tgz` (fotos) e `env-<data>` (o `api/.env`).
  Guarda 14 diários; o do dia 01 vai para `monthly/` e fica 12 meses. Confere o dump com `pg_restore -l`.
  Log: `/var/log/brgol/backup.log`. Testado com restore real num banco de teste (84 usuários = 84).
- **Mensal no PC do Guilherme**: `tools/backup-local.ps1` puxa o pacote mais novo por scp para
  `C:\Users\guicp\Backups\jogagol\<ano-mês>\` (guarda 12 meses; log `backup-local.log` na pasta).
  Tarefa agendada do Windows **"JogaGol backup mensal"** (dia 1, 12:00; se o PC estiver desligado roda
  quando ligar). Primeira cópia feita em 15/09.
- **Restaurar** (na VPS): `T=$(mktemp -d); tar -xf /var/backups/brgol/daily/jogagol-<data>.tar -C $T;
  chmod 755 $T; chmod 644 $T/*` → banco: `sudo -u postgres psql -c "CREATE DATABASE brgol_novo"` +
  `sudo -u postgres pg_restore --no-owner -d brgol_novo $T/brgol-<data>.dump` (trocar o nome no
  `DATABASE_URL` ou restaurar por cima do `brgol` com `--clean`) → fotos: `tar -xzf $T/uploads-<data>.tgz
  -C /var/www/brgol/` → `.env`: copiar para `api/.env` → `pm2 restart brgol-api`.

## Avisos no Telegram — FEITO em 15/09/2026
Mesmo bot do Managol (@Managol_bot), mas **desde 16/09/2026 o chat do JogaGol é o grupo "JogaGol - ADMIN"**
(`TELEGRAM_CHAT_ID=-5485010092`, com o dono e o Erickles; antes era o privado do dono — o Managol continua no
privado). `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` no `api/.env` da VPS e em `/etc/brgol-telegram.conf`
(root, para os scripts). Toda mensagem começa com "⚽ JogaGol". Vazio = desligado.
- **API** (`api/src/lib/telegram.js`, `tg.info/warn/error`): 👤 cadastro novo (nick, time, e-mail, IP,
  convite) · 🧱 cadastro barrado (rápido demais, captcha, e-mail descartável, teto por IP — 1
  aviso por IP a cada 10 min, repetidos viram "+N iguais") · 🔒 conta trancada por senhas erradas ·
  🛒 PIX gerado · 💰 **VIP pago** (nick, dias, valor) · Efí com problema · 🚩 denúncia (com o texto) ·
  🗑️ conta excluída · 🛡️ toda ação do painel de admin · 🔴 erro 500 (rota + mensagem, 1 por rota a
  cada 5 min) · scheduler com erro · exceção não tratada · 🚀 API subiu (todo restart do PM2 avisa —
  restart sem deploy = suspeito) · **🕵️ gracinha** (22/09/2026, `lib/gracinha.js`: injeção de SQL, XSS, id
  gigante, varredura de endereços, chave de admin errada, token forjado, rajada de senhas — com o veredito
  🛡️ BARRADA / ✅ SEM EFEITO / ⚠️ PASSOU / 💥 QUEBROU, quem é o IP e as contas dele; a 1ª na hora, o resto num
  resumo de 10 min) · **🗄️ Postgres reiniciou** (conexão caiu no meio de uma consulta — atualização automática do
  sistema entre 3h e 4h; a API reconecta sozinha). Fila de 1 msg/s; rajada vira uma mensagem só.
- **VPS**: `brgol-watchdog.sh` (`tools/vps/`) a cada 2 min → 🔴 "API fora do ar" quando `/api/health`
  para de responder e ✅ "voltou" com o tempo fora; 09h → resumo do dia (disco, último backup, reinícios
  do PM2, bans do fail2ban) e ⚠️ se o disco passar de 85 % ou o backup não tiver rodado em 26 h.
  **fail2ban** manda 🚫 BLOQUEADO a cada ban (SSH, limit_req do nginx, phpMyAdmin/WordPress, arquivos sensíveis) —
  `action.d/brgol-telegram.conf` → `brgol-f2b-aviso.sh` (consertado em 22/09: antes saía mudo).
- O que este esquema NÃO pega: a VPS inteira fora do ar (o vigia mora nela). Para isso, quando quiser:
  https://uptimerobot.com → monitor em `https://jogagol.com.br/api/health` com alerta por Telegram
  (integração nativa deles) — precisa da conta do dono.
- Teste: `node -e "import('./src/lib/telegram.js').then(({tg})=>{tg.info('teste'); setTimeout(()=>process.exit(),3000)})"`
  na pasta `api/` da VPS (como `brgol`, com o `.env` carregado) ou `/usr/local/bin/brgol-watchdog.sh --daily`.

## 5. Multi-conta (parcial)
Já existe: contas da mesma conexão não negociam nem trocam VIP (diretoria), `lastIp` no painel.
Feito 15/09: `createdIp` no painel. Ideias para depois: impressão digital do aparelho no cadastro,
prêmio de convite só para convidado com IP/aparelho diferente do convidador.

## Resposta a incidente (colar quando estiver acontecendo)
1. Cloudflare → *Under Attack Mode* ON. 2. Ver de onde vem: Cloudflare *Analytics → Security* ou
`sudo -u brgol pm2 logs brgol-api --lines 200` e `tail -f /var/log/nginx/access.log | cut -d' ' -f1 | sort | uniq -c | sort -rn | head`.
3. Bloquear IP/ASN/país na Cloudflare (*Security → WAF → Tools*). 4. Se for cadastro em massa: painel
de admin → "Contas criadas" (IP do cadastro) → banir em lote; baixar `registerPerIpPerDay` em
`lib/security.js` se precisar. 5. Depois: desligar Under Attack e anotar aqui o que aconteceu.
