#!/usr/bin/env bash
# Aviso no Telegram quando o fail2ban BLOQUEIA um IP (chamado por action.d/brgol-telegram.conf, como root).
# Explica em português o motivo (o nome da jaula) e por quanto tempo — o dono quer saber "se passou ou conseguiu
# bloquear" (22/09/2026). Cópia na VPS: /usr/local/bin/brgol-f2b-aviso.sh (token e chat em /etc/brgol-telegram.conf).
# Uso: brgol-f2b-aviso.sh <ip> <jaula> <ocorrências> <segundos>
set -uo pipefail
IP="${1:-?}"; JAIL="${2:-?}"; N="${3:-?}"; SEG="${4:-0}"
source /etc/brgol-telegram.conf   # TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
case "$JAIL" in
  sshd)            MOTIVO="tentou entrar no SSH da VPS com senha/chave errada $N vezes. Não entrou.";;
  nginx-limit-req) MOTIVO="estourou o limite de pedidos por segundo $N vezes (rajada na API). Os pedidos além do limite já vinham recebendo 429.";;
  nginx-botsearch) MOTIVO="procurou $N endereços de phpMyAdmin/WordPress/webmail que não existem aqui. Nada passou (404 em todos).";;
  brgol-probes)    MOTIVO="procurou $N arquivos sensíveis que não existem (/.env, /.git, .sql, .zip, chaves, package.json…). Nada passou (404 em todos).";;
  *)               MOTIVO="jaula $JAIL, $N ocorrências.";;
esac
MIN=$(( SEG / 60 ))
TEXT="⚽ <b>JogaGol</b> 🚫 <b>BLOQUEADO</b> o IP <code>$IP</code> por ${MIN} min: $MOTIVO Até lá, todo pedido desse IP é recusado no firewall."
BODY=$(jq -cn --arg chat "$TELEGRAM_CHAT_ID" --arg text "$TEXT" '{chat_id: $chat, text: $text, parse_mode: "HTML", disable_web_page_preview: true}')
curl -sS --max-time 15 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -H 'content-type: application/json' -d "$BODY" -o /dev/null -w "telegram HTTP %{http_code}
" || true
