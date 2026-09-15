# Cópia MENSAL do backup do JogaGol da VPS para este PC (decisão do dono, 15/09/2026).
# Puxa o pacote diário mais recente de /var/backups/brgol/daily (banco + fotos + .env) via scp
# para C:\Users\guicp\Backups\jogagol\<ano-mes>\ e guarda os últimos 12 meses.
# Agendado no Windows: tarefa "JogaGol backup mensal" (dia 1, 12:00, só com o PC ligado — se
# estiver desligado, roda na próxima vez que ligar). Rodar na mão: powershell -File tools\backup-local.ps1
$ErrorActionPreference = 'Stop'
$key  = 'C:\Users\guicp\.ssh\id_ed25519_hostinger'
$host_ = 'root@187.127.17.121'
$dest = Join-Path 'C:\Users\guicp\Backups\jogagol' (Get-Date -Format 'yyyy-MM')
$log  = 'C:\Users\guicp\Backups\jogagol\backup-local.log'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
function Log($m) { $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; $line | Tee-Object -FilePath $log -Append }

Log "==> cópia mensal iniciada"
$latest = (& ssh -i $key -o BatchMode=yes $host_ 'ls -1t /var/backups/brgol/daily/jogagol-*.tar | head -1').Trim()
if (-not $latest) { Log "ERRO: nenhum backup na VPS"; exit 1 }
$name = Split-Path $latest -Leaf
& scp -i $key -o BatchMode=yes -q "${host_}:$latest" (Join-Path $dest $name)
if ($LASTEXITCODE -ne 0) { Log "ERRO: scp falhou ($LASTEXITCODE)"; exit 1 }
$size = [math]::Round((Get-Item (Join-Path $dest $name)).Length / 1MB, 1)
# guarda 12 meses
Get-ChildItem 'C:\Users\guicp\Backups\jogagol' -Directory | Sort-Object Name -Descending | Select-Object -Skip 12 | Remove-Item -Recurse -Force
Log "ok: $dest\$name ($size MB)"
