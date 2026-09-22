#!/usr/bin/env bash
# `ignorecommand` do fail2ban: sai 0 quando o IP é de um ADMIN do JogaGol — e aí ele NUNCA é bloqueado.
# Cópia na VPS: /usr/local/bin/brgol-admin-ip.sh (chamado a cada falha detectada, precisa ser rápido).
#
# Por quê (dono, 22/09/2026: "vai banir o admin? espero que não"): nós dois testamos o jogo por baixo de vez em
# quando (a varredura de arquivos do dia 22/09 me bloqueou por 1 h e derrubou até o SSH). O IP de casa muda, então
# não adianta lista fixa: a pergunta é feita ao BANCO — "esse IP é de alguém com isAdmin?" (User.lastIp, gravado no
# login/heartbeat, ou User.createdIp). Banco fora do ar ou IP estranho = sai 1 (bloqueia normal): segurança primeiro.
set -uo pipefail
IP="${1:-}"
[[ "$IP" =~ ^[0-9a-fA-F.:]{3,45}$ ]] || exit 1   # só o que tem cara de IP (nada de SQL vindo daqui)
URL=$(grep -m1 '^DATABASE_URL=' /var/www/brgol/app/api/.env 2>/dev/null | cut -d= -f2- | tr -d '"')
URL="${URL%%\?*}"   # o ?schema=public é do Prisma; o psql recusa ("invalid URI query parameter")
[[ -n "$URL" ]] || exit 1
OUT=$(timeout 3 psql "$URL" -tAc "select 1 from \"User\" where \"isAdmin\" and \"deletedAt\" is null and (\"lastIp\" = '$IP' or \"createdIp\" = '$IP') limit 1" 2>/dev/null) || exit 1
if [[ "${OUT//[[:space:]]/}" == "1" ]]; then
  logger -t brgol-f2b "ignorando $IP: é IP de admin do JogaGol"
  exit 0
fi
exit 1
