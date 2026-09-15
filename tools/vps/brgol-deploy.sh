#!/usr/bin/env bash
# Deploy do JogaGol na VPS — rodado À MÃO via SSH (não há GitHub Actions): `bash /usr/local/bin/brgol-deploy.sh`.
# Instalado em /usr/local/bin/brgol-deploy.sh (cópia de tools/vps/brgol-deploy.sh no repo — mudou aqui, copie lá).
# Roda como root; a app roda como usuário `brgol`.
#
# X1 sem partida travada (pedido do dono, 15/09/2026): o `pm2 restart` derrubava as partidas em andamento no meio.
# Agora, quando a API muda: 1) trava a busca do X1 (`/api/admin/x1/drain`: ninguém desafia/aceita/treina, os desafios
# abertos são cancelados com o motivo e a tela mostra "atualizando"); 2) instala/migra; 3) espera as partidas em
# andamento acabarem (até X1_WAIT_SEC); 4) o que sobrou é cancelado com a aposta devolvida (`/api/admin/x1/cancel`);
# 5) só então reinicia. Abortou no meio? `curl -X POST -H "x-admin-key: $ADMIN_KEY" $API/api/admin/x1/resume`.
set -euo pipefail

APP_DIR=/var/www/brgol/app
APP_USER=brgol
BRANCH=main
LOG=/var/log/brgol-deploy.log
API=http://127.0.0.1:4310
X1_WAIT_SEC=${X1_WAIT_SEC:-240}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
ADMIN_KEY=$(grep -E '^ADMIN_KEY=' "$APP_DIR/api/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
x1_admin() { curl -s -m 8 -X POST -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' "$API/api/admin/x1/$1" -d "${2:-{\}}" || echo '{"erro":"api fora do ar"}'; }
x1_matches() { curl -s -m 5 "$API/api/x1/status" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("matches",0))' 2>/dev/null || echo 0; }

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
  log "x1: travando a busca ($(x1_matches) partida(s) em andamento) — $(x1_admin drain '{"seconds":600}')"
  log "api: instalando dependências"
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR/api && npm ci --omit=dev --no-audit --no-fund"
  log "api: migrando banco"
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR/api && npx prisma migrate deploy && npm run seed"
  # as partidas em andamento terminam sozinhas (Botão ~1 min, FutPrego até ~3 min); o que passar do prazo é cancelado
  # com a aposta devolvida e o motivo na tela
  WAITED=0
  while [ "$(x1_matches)" != "0" ] && [ "$WAITED" -lt "$X1_WAIT_SEC" ]; do
    [ $((WAITED % 30)) -eq 0 ] && log "x1: $(x1_matches) partida(s) em andamento, esperando acabar (${WAITED}s)"
    sleep 5; WAITED=$((WAITED + 5))
  done
  log "x1: cancelando o que sobrou — $(x1_admin cancel)"
  log "api: reiniciando pm2"
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR/api && (pm2 describe brgol-api >/dev/null 2>&1 && pm2 restart brgol-api --update-env || pm2 start src/index.js --name brgol-api --cwd $APP_DIR/api) && pm2 save"
fi

if need web/; then
  log "web: build"
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR/web && npm ci --no-audit --no-fund && VITE_API_URL= npm run build"
fi

log "==> deploy concluído ($NEW)"
