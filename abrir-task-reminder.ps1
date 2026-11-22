# Abre Task Reminder en local (servidor estatico Node en el puerto 8095). Pensado para My Tools (se ejecuta sin consola).
# Uso: abrir-task-reminder.ps1 [-Parar] [-SoloComprobar]
#   (sin parametros)  arranca el servidor y termina cuando responde
#   -Parar            para el servidor (solo el proceso que escucha en el puerto)
#   -SoloComprobar    verifica requisitos sin arrancar nada
# Texto sin acentos a proposito: Windows PowerShell 5.1 lee los .ps1 sin BOM como ANSI.
param([switch]$Parar, [switch]$SoloComprobar)
$ErrorActionPreference = 'Continue'

$root = $PSScriptRoot
$port = 8095
$url = "http://localhost:$port/"
$check = "http://127.0.0.1:$port/"   # el servidor escucha en IPv4; localhost puede probar antes ::1 y tardar
$logOut = Join-Path $env:TEMP 'task-reminder.log'
$logErr = Join-Path $env:TEMP 'task-reminder.err.log'

function Say($m) { Write-Host ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $m) }
function Port-Pids($p) {
    return @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Select-Object -Unique)
}
function Responde {
    try { $r = Invoke-WebRequest -Uri $check -UseBasicParsing -TimeoutSec 2; return ($r.StatusCode -eq 200) } catch { return $false }
}

$nodeExe = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cmd) { $nodeExe = $cmd.Source }

if ($SoloComprobar) {
    $fallos = 0
    if ($nodeExe) { Say ('Node: OK ({0})' -f $nodeExe) } else { Say 'Node: FALTA'; $fallos++ }
    if (Test-Path (Join-Path $root 'serve.mjs')) { Say 'serve.mjs: OK' } else { Say 'serve.mjs: FALTA'; $fallos++ }
    Say ('Puerto {0}: {1}' -f $port, $(if ((Port-Pids $port).Count) { 'en uso' } else { 'libre' }))
    exit $(if ($fallos) { 1 } else { 0 })
}

if ($Parar) {
    $pids = Port-Pids $port
    if (-not $pids.Count) { Say ('No hay nada escuchando en el puerto {0}.' -f $port); exit 0 }
    foreach ($p in $pids) {
        Say ('Parando el proceso {0}...' -f $p)
        & taskkill.exe /PID $p /T /F | Out-Null
    }
    Say 'Task Reminder parado.'
    exit 0
}

if (-not $nodeExe) { Say 'FALTA: Node.js (node.exe no esta en el PATH).'; exit 1 }

if (Port-Pids $port) {
    if (Responde) { Say ('Task Reminder ya esta en marcha: {0}' -f $url); exit 0 }
    Say ('El puerto {0} esta ocupado por otro programa.' -f $port); exit 1
}

Say ('Arrancando Task Reminder en el puerto {0}...' -f $port)
Start-Process -FilePath $nodeExe -ArgumentList @('serve.mjs', "$port") -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr | Out-Null

for ($i = 0; $i -lt 20; $i++) {
    if (Responde) { Say ('Listo: {0}' -f $url); exit 0 }
    Start-Sleep -Milliseconds 500
}
Say ('No ha respondido. Revisa {0}' -f $logErr)
exit 1
