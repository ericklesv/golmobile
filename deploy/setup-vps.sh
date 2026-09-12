#!/usr/bin/env bash
# Setup inicial do BRGOL na VPS do Managol (rodar UMA vez, como root).
# Cria usuário, banco Postgres, clona o repo, .env, PM2, Nginx + Certbot e o script de deploy.
# Uso: bash setup-vps.sh <DB_PASSWORD> <JWT_SECRET> <ADMIN_KEY>
set -euo pipefail

DB_PASS="${1:?DB_PASSWORD}"; JWT="${2:?JWT_SECRET}"; ADMIN="${3:?ADMIN_KEY}"
REPO=https://github.com/ericklesv/golmobile.git
APP_DIR=/var/www/brgol/app
APP_USER=brgol
DOMAIN=brgol.managol.com.br

echo "==> usuário e pastas"
id -u $APP_USER >/dev/null 2>&1 || useradd -m -s /bin/bash $APP_USER
mkdir -p /var/www/brgol && chown -R $APP_USER:$APP_USER /var/www/brgol

echo "==> banco postgres"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='brgol'" | grep -q 1 || sudo -u postgres psql -c "CREATE ROLE brgol LOGIN PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='brgol'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE brgol OWNER brgol;"

echo "==> clone"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u $APP_USER -H git clone --branch main "$REPO" "$APP_DIR"
fi

echo "==> .env da api"
cat > "$APP_DIR/api/.env" <<EOF
DATABASE_URL=postgresql://brgol:${DB_PASS}@localhost:5432/brgol?schema=public
JWT_SECRET=${JWT}
PORT=4310
CORS_ORIGINS=https://${DOMAIN}
ADMIN_KEY=${ADMIN}
NODE_ENV=production
EOF
chown $APP_USER:$APP_USER "$APP_DIR/api/.env" && chmod 600 "$APP_DIR/api/.env"

echo "==> pm2 para o usuário $APP_USER"
command -v pm2 >/dev/null || npm i -g pm2
sudo -u $APP_USER -H bash -c "pm2 ping >/dev/null"
env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp /home/$APP_USER >/dev/null || true

echo "==> script de deploy"
install -m 755 "$APP_DIR/deploy/brgol-deploy.sh" /usr/local/bin/brgol-deploy.sh

echo "==> nginx"
install -m 644 "$APP_DIR/deploy/nginx-brgol.conf" /etc/nginx/sites-available/brgol
ln -sf /etc/nginx/sites-available/brgol /etc/nginx/sites-enabled/brgol
mkdir -p "$APP_DIR/web/dist"
nginx -t && systemctl reload nginx

echo "==> primeiro deploy (instala, migra, builda, sobe pm2)"
bash /usr/local/bin/brgol-deploy.sh

echo "==> certbot"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect -m admin@managol.com.br || echo "certbot falhou — rodar manualmente"

echo "==> pronto: https://$DOMAIN"
curl -s "http://127.0.0.1:4310/api/health" || true
