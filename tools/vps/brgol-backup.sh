#!/usr/bin/env bash
# Backup do JogaGol NA PRÓPRIA VPS (decisão do dono, 15/09/2026: "não é o recomendado, mas é o que tem
# pra hoje"; a cópia mensal para o PC é o tools/backup-local.ps1). Instalado em
# /usr/local/bin/brgol-backup.sh e chamado pelo cron (/etc/cron.d/brgol-backup) todo dia às 03:40.
#   - banco `brgol`: pg_dump em formato custom (comprimido; restaura com pg_restore)
#   - fotos de perfil: /var/www/brgol/uploads (tar.gz)
#   - api/.env (segredos: JWT, Efí, admin) — sem ele não se sobe o jogo de novo
# Guarda: diários por 14 dias; o do dia 01 de cada mês fica 12 meses. Tudo em /var/backups/brgol
# (só root lê). Log em /var/log/brgol/backup.log. Restaurar: ver docs/SEGURANCA.md → "Backup".
set -euo pipefail

DEST=/var/backups/brgol
APP=/var/www/brgol/app
UPLOADS=/var/www/brgol/uploads
LOG=/var/log/brgol/backup.log
DIA=$(date +%F)
KEEP_DAILY=14
KEEP_MONTHLY_MONTHS=12

mkdir -p "$DEST/daily" "$DEST/monthly" "$(dirname "$LOG")"
chmod 700 "$DEST"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "==> backup iniciado"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

sudo -u postgres pg_dump -Fc --no-owner brgol > "$TMP/brgol-$DIA.dump"
tar -czf "$TMP/uploads-$DIA.tgz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")" 2>/dev/null || true
cp "$APP/api/.env" "$TMP/env-$DIA" 2>/dev/null || log "aviso: api/.env não encontrado"

# um único pacote por dia
PKG="$DEST/daily/jogagol-$DIA.tar"
tar -cf "$PKG" -C "$TMP" .
chmod 600 "$PKG"
[ "$(date +%d)" = "01" ] && cp "$PKG" "$DEST/monthly/" && chmod 600 "$DEST/monthly/jogagol-$DIA.tar"

# confere que o dump abre (lista o conteúdo) — dump corrompido = erro no log
pg_restore -l "$TMP/brgol-$DIA.dump" >/dev/null

# faxina
find "$DEST/daily" -name 'jogagol-*.tar' -mtime +"$KEEP_DAILY" -delete
find "$DEST/monthly" -name 'jogagol-*.tar' -mtime +"$((KEEP_MONTHLY_MONTHS * 31))" -delete

log "ok: $PKG ($(du -h "$PKG" | cut -f1)); diários: $(ls "$DEST/daily" | wc -l), mensais: $(ls "$DEST/monthly" | wc -l)"
