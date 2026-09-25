#!/usr/bin/env bash
# Aviso no Telegram quando o fail2ban BLOQUEIA um IP (chamado por action.d/brgol-telegram.conf, como root).
# Explica em português o motivo (o nome da jaula) e por quanto tempo — o dono quer saber "se passou ou conseguiu
# bloquear" (22/09/2026). Cópia na VPS: /usr/local/bin/brgol-f2b-aviso.sh (token e chat em /etc/brgol-telegram.conf).
#
# SÓ AVISA SE O IP TEM CONTA NO JOGO, e diz qual (Guilherme, 24/09/2026: "o Telegram está spammando de IP bloqueado.
# Só envie se o IP tiver uma conta no nosso jogo e diga qual a conta; de qualquer outra maneira, não precisa
# notificar"). Naquela noite um robô de varredura de PHP (/wp-22.php, /mini.php…) trocava de IP a cada 20 s pela rede
# da Cloudflare — cada ban virava uma mensagem. "Tem conta" = User.lastIp ou User.createdIp (a mesma regra das
# gracinhas da API, lib/gracinha.js). Sem conta, ou banco fora do ar: só uma linha no syslog (tag brgol-f2b).
#
# Uso: brgol-f2b-aviso.sh <ip> <jaula> <ocorrências> <segundos>      (DRY_RUN=1 = mostra a mensagem e não manda)
set -uo pipefail
IP="${1:-?}"; JAIL="${2:-?}"; N="${3:-?}"; SEG="${4:-0}"

# contas nesse IP (as mais recentes primeiro; no máximo 5 nomes + "e mais N")
CONTAS=""; TOTAL=0
if [[ "$IP" =~ ^[0-9a-fA-F.:]{3,45}$ ]]; then   # só o que tem cara de IP (nada de SQL vindo daqui)
  URL=$(grep -m1 '^DATABASE_URL=' /var/www/brgol/app/api/.env 2>/dev/null | cut -d= -f2- | tr -d '"')
  URL="${URL%%\?*}"   # o ?schema=public é do Prisma; o psql recusa
  if [[ -n "$URL" ]]; then
    ROWS=$(timeout 4 psql "$URL" -tA -F '|' -c "select count(*) over (), nick from \"User\" where \"deletedAt\" is null and not \"isBot\" and (\"lastIp\" = '$IP' or \"createdIp\" = '$IP') order by \"lastSeenAt\" desc nulls last limit 5" 2>/dev/null) || ROWS=""
    if [[ -n "$ROWS" ]]; then
      TOTAL=$(head -1 <<<"$ROWS" | cut -d'|' -f1)
      CONTAS=$(cut -d'|' -f2- <<<"$ROWS" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/.*/<b>&<\/b>/' | paste -sd, - | sed 's/,/, /g')
      (( TOTAL > 5 )) && CONTAS="$CONTAS e mais $(( TOTAL - 5 ))"
    fi
  fi
fi
if [[ -z "$CONTAS" ]]; then
  logger -t brgol-f2b "ban $IP ($JAIL, $N ocorrências): nenhuma conta do JogaGol nesse IP — sem aviso no Telegram"
  exit 0
fi

source /etc/brgol-telegram.conf   # TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
case "$JAIL" in
  sshd)            MOTIVO="tentou entrar no SSH da VPS com senha/chave errada $N vezes. Não entrou.";;
  nginx-limit-req) MOTIVO="estourou o limite de pedidos por segundo $N vezes (rajada na API). Os pedidos além do limite já vinham recebendo 429.";;
  nginx-botsearch) MOTIVO="procurou $N endereços de phpMyAdmin/WordPress/webmail que não existem aqui. Nada passou (404 em todos).";;
  brgol-probes)    MOTIVO="procurou $N arquivos sensíveis que não existem (/.env, /.git, .sql, .zip, chaves, package.json…). Nada passou (404 em todos).";;
  *)               MOTIVO="jaula $JAIL, $N ocorrências.";;
esac
MIN=$(( SEG / 60 ))
[[ "$TOTAL" == "1" ]] && QUEM="Conta nesse IP: $CONTAS." || QUEM="Contas nesse IP ($TOTAL): $CONTAS."
TEXT="⚽ <b>JogaGol</b> 🚫 <b>BLOQUEADO</b> o IP <code>$IP</code> por ${MIN} min: $MOTIVO $QUEM Até lá, todo pedido desse IP é recusado no firewall."
if [[ "${DRY_RUN:-}" == "1" ]]; then echo "$TEXT"; exit 0; fi
BODY=$(jq -cn --arg chat "$TELEGRAM_CHAT_ID" --arg text "$TEXT" '{chat_id: $chat, text: $text, parse_mode: "HTML", disable_web_page_preview: true}')
curl -sS --max-time 15 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -H 'content-type: application/json' -d "$BODY" -o /dev/null -w "telegram HTTP %{http_code}
" || true
