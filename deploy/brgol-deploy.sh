#!/usr/bin/env bash
# Deploy do BRGOL na VPS (rodar manualmente via SSH após cada push em main).
# Instalado em /usr/local/bin/brgol-deploy.sh. Roda como root; a app roda como usuário `brgol`.
set -euo pipefail

APP_DIR=/var/www/brgol/app
APP_USER=brgol
BRANCH=main
LOG=/var/log/brgol-deploy.log

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "==> deploy iniciado"
cd "$APP_DIR"
# git sempre como o dono do repo (root vê "dubious ownership")
g() { sudo -u "$APP_USER" -H git -C "$APP_DIR" "$@"; }
OLD=$(g rev-parse HEAD)
g fetch --quiet origin "$BRANCH"
g reset --hard --quiet "origin/$BRANCH"
NEW=$(g rev-parse HEAD)
log "commit $OLD -> $NEW"

CHANGED=$(g diff --name-only "$OLD" "$NEW" || echo "all")
FIRST=0; [ "$OLD" = "$NEW" ] && FIRST=1

need() { [ "$FIRST" = 1 ] || echo "$CHANGED" | grep -q "^$1" ; }

if need api/; then
  log "api: instalando dependências"
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR/api && npm ci --omit=dev --no-audit --no-fund"
  log "api: migrando banco"
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR/api && npx prisma migrate deploy && npm run seed"
  log "api: reiniciando pm2"
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR/api && (pm2 describe brgol-api >/dev/null 2>&1 && pm2 restart brgol-api --update-env || pm2 start src/index.js --name brgol-api --cwd $APP_DIR/api) && pm2 save"
fi

if need web/; then
  log "web: build"
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR/web && npm ci --no-audit --no-fund && VITE_API_URL= npm run build"
fi

log "==> deploy concluído ($NEW)"
