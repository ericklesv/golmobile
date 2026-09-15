#!/usr/bin/env bash
# Vigia do JogaGol na VPS → avisos no Telegram (mesmo bot/chat do Managol; token em /etc/brgol-telegram.conf).
# Instalado em /usr/local/bin/brgol-watchdog.sh; cron em /etc/cron.d/brgol-watchdog:
#   a cada 2 min:  brgol-watchdog.sh          → API respondendo? (avisa quando cai e quando volta)
#   1x por dia 09h: brgol-watchdog.sh --daily → disco, backup do dia, reinícios do PM2, bans do fail2ban
# Fonte no repo: tools/vps/brgol-watchdog.sh. O "VPS inteira fora do ar" este vigia não pega (ele mora nela);
# para isso, UptimeRobot com alerta no Telegram — docs/SEGURANCA.md.
set -uo pipefail
source /etc/brgol-telegram.conf   # TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
STATE=/var/lib/brgol-watchdog.state
LOG=/var/log/brgol/watchdog.log
mkdir -p "$(dirname "$LOG")"

tg() { # tg "<prefixo>" "<texto html>"
  curl -sS --max-time 10 -o /dev/null -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" -d parse_mode=HTML -d disable_web_page_preview=true \
    --data-urlencode "text=⚽ <b>JogaGol</b> $1 $2" || true
  echo "[$(date '+%F %T')] $1 $2" >> "$LOG"
}

if [ "${1:-}" = "--daily" ]; then
  uso=$(df --output=pcent / | tail -1 | tr -dc '0-9')
  [ "$uso" -ge 85 ] && tg "⚠️" "Disco da VPS em ${uso}% (/)."
  ult=$(ls -1t /var/backups/brgol/daily/jogagol-*.tar 2>/dev/null | head -1)
  if [ -z "$ult" ] || [ $(( $(date +%s) - $(stat -c %Y "$ult") )) -gt $((26 * 3600)) ]; then
    tg "⚠️" "Backup diário NÃO rodou nas últimas 26 h (último: ${ult:-nenhum}). Ver /var/log/brgol/backup.log"
  fi
  rest=$(sudo -u brgol pm2 jlist 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['pm2_env']['restart_time'] if d else '?')" 2>/dev/null || echo '?')
  bans=$(fail2ban-client status 2>/dev/null | grep -o 'Jail list:.*' | sed 's/Jail list:\s*//' | tr ',' '\n' | while read -r j; do [ -n "$j" ] && printf '%s=%s ' "$j" "$(fail2ban-client status "$j" 2>/dev/null | grep 'Total banned' | grep -o '[0-9]*$')"; done)
  tg "ℹ️" "Bom dia. Disco ${uso}% · último backup $(basename "${ult:-nenhum}") · PM2 reinícios acumulados: ${rest} · fail2ban bans totais: ${bans:-0}"
  exit 0
fi

# a cada 2 min: saúde da API
if curl -fsS --max-time 8 http://127.0.0.1:4310/api/health 2>/dev/null | grep -q '"ok":true'; then
  if [ -f "$STATE" ]; then
    desde=$(cat "$STATE"); min=$(( ( $(date +%s) - desde ) / 60 ))
    rm -f "$STATE"
    tg "✅" "API voltou (ficou ~${min} min fora)."
  fi
else
  if [ ! -f "$STATE" ]; then
    date +%s > "$STATE"
    pm2s=$(sudo -u brgol pm2 jlist 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['pm2_env']['status'] if d else 'sem pm2')" 2>/dev/null || echo '?')
    tg "🔴" "<b>API fora do ar</b> — /api/health não responde (PM2: ${pm2s}). Ver: sudo -u brgol pm2 logs brgol-api --lines 100"
  fi
fi
