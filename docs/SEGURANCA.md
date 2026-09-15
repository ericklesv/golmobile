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
- **Honeypot** (`website`, campo fora da tela no `Register.tsx`) + **tempo mínimo de 3 s** no formulário
  (`startedAt` do cliente).
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
- `helmet` na API (nosniff, x-frame-options, referrer-policy…; CSP fica para o nginx).
- Já existia: recargas validadas no servidor, captcha a cada 10 chutes, teto global de 300 req/min/IP.

## 4. VPS (comandos para autorizar — independem da Cloudflare)
```bash
# nginx: fila por IP na API (20 req/s com rajada de 40; excedente = 429) e sem versão no cabeçalho
# em /etc/nginx/nginx.conf, dentro de http { }:
#   limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
#   limit_conn_zone $binary_remote_addr zone=conn:10m;
#   server_tokens off;
# em /etc/nginx/sites-available/brgol, dentro do location /api/:
#   limit_req zone=api burst=40 nodelay;  limit_req_status 429;
#   limit_conn conn 30;
nginx -t && systemctl reload nginx

# fail2ban: SSH + quem toma 429/403 em série no nginx
apt-get install -y fail2ban
cat > /etc/fail2ban/jail.d/brgol.conf <<'EOF'
[sshd]
enabled = true
[nginx-limit-req]
enabled = true
logpath = /var/log/nginx/error.log
maxretry = 20
findtime = 60
bantime = 600
EOF
systemctl restart fail2ban && fail2ban-client status

# Postgres só em localhost (conferir): deve mostrar 127.0.0.1:5432, nunca 0.0.0.0
ss -ltnp | grep 5432
```
- [ ] Monitor externo grátis: https://uptimerobot.com → monitor HTTP em `https://jogagol.com.br/api/health`
  a cada 5 min, alerta por e-mail para `contato@jogagol.com.br`.
- [ ] Backup do banco: `pg_dump brgol` diário para fora da VPS (ainda não existe — item à parte).

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
