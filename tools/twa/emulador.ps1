# Liga o emulador Android "jogagol" (Pixel, Android 15 com Play Store) montado em 14/09/2026 na
# máquina do Guilherme (SDK em C:\Users\guicp\dev\android-sdk; AVD em %USERPROFILE%\.android\avd).
# Uso (PowerShell, qualquer pasta):
#   tools\twa\emulador.ps1            # só liga
#   tools\twa\emulador.ps1 -Instalar  # liga e instala o APK de teste (chave de upload) por adb
# Dentro do emulador: Play Store → Sign in com a conta Google → abrir o link do teste interno
# (docs/PLAY_STORE.md) → "Tornar-se testador" → instalar pela loja.
param([switch]$Instalar)

$sdk = 'C:\Users\guicp\dev\android-sdk'
$env:ANDROID_HOME = $sdk; $env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_AVD_HOME = "$env:USERPROFILE\.android\avd"
$env:Path = "$sdk\emulator;$sdk\platform-tools;$env:Path"

if (-not (Test-Path "$sdk\emulator\emulator.exe")) { Write-Error "Emulador não instalado (ver docs/PLAY_STORE.md, passo 4b)."; exit 1 }

Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList '-avd','jogagol','-gpu','auto','-netdelay','none','-netspeed','full'
Write-Host "Emulador iniciando... (janela própria; a primeira carga leva ~1 min)"

if ($Instalar) {
  $apk = 'C:\Users\guicp\dev\jogagol-twa\app-release-signed.apk'
  do { Start-Sleep -Seconds 5; $boot = (& adb shell getprop sys.boot_completed 2>$null) } until ("$boot".Trim() -eq '1')
  & adb install -r $apk
  & adb shell monkey -p com.jogagol.com.br -c android.intent.category.LAUNCHER 1 | Out-Null
  Write-Host "JogaGol instalado e aberto no emulador."
}
