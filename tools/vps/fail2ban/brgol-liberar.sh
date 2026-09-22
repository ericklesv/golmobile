#!/usr/bin/env bash
# Tira um IP de TODOS os bloqueios do fail2ban (e mostra se ele está na lista manual do nginx).
# Cópia na VPS: /usr/local/bin/brgol-liberar.sh — uso: brgol-liberar.sh 168.0.233.250
set -uo pipefail
IP="${1:-}"
[[ -n "$IP" ]] || { echo "uso: brgol-liberar.sh <ip>" >&2; exit 2; }
for J in $(fail2ban-client status | sed -n 's/.*Jail list:\s*//p' | tr ',' ' '); do
  if fail2ban-client set "$J" unbanip "$IP" >/dev/null 2>&1; then echo "liberado em $J"; fi
done
if grep -q "deny $IP;" /etc/nginx/snippets/brgol-bloqueados.conf 2>/dev/null; then
  echo "ATENÇÃO: $IP também está bloqueado À MÃO no nginx (snippets/brgol-bloqueados.conf) — apague a linha e rode: nginx -t && systemctl reload nginx"
fi
echo "pronto."
