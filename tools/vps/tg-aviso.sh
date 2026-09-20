#!/usr/bin/env bash
# Aviso de mudança no grupo do Telegram "JogaGol - ADMIN" (dono, 20/09/2026: "SEMPRE notifique no telegram o que foi
# ajustado/adicionado para todos sabermos, tanto mudança nossa quanto mudança do Erickles").
# Cópia na VPS: /usr/local/bin/tg-aviso.sh (token e chat em /etc/brgol-telegram.conf, o mesmo do watchdog).
#
# Uso:  tg-aviso.sh "<b>Título</b>%0A%0Atexto"      (HTML do Telegram; %0A = quebra de linha)
#       tg-aviso.sh - < arquivo.txt                  (lê o texto do stdin — quebras de linha de verdade)
# Sai com 0 se o Telegram aceitou.
set -euo pipefail
source /etc/brgol-telegram.conf   # TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
if [[ "${1:-}" == "-" ]]; then TEXT="$(cat)"; else TEXT="${1:-}"; fi
if [[ -z "$TEXT" ]]; then echo "uso: tg-aviso.sh \"<texto>\"  ou  tg-aviso.sh - < arquivo" >&2; exit 2; fi
TEXT="${TEXT//%0A/$'\n'}"
BODY=$(jq -cn --arg chat "$TELEGRAM_CHAT_ID" --arg text "🛠 $TEXT" '{chat_id: $chat, text: $text, parse_mode: "HTML", disable_web_page_preview: true}')
RESP=$(curl -sS --max-time 15 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -H 'content-type: application/json' -d "$BODY")
if echo "$RESP" | grep -q '"ok":true'; then echo "aviso enviado"; else echo "falhou: $RESP" >&2; exit 1; fi
