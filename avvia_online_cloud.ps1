$localDir = "$env:LOCALAPPDATA\GestionaleAgenti"
$cloudflared = "$localDir\cloudflared.exe"
$pythonExe = "C:\Users\Utente10\AppData\Local\python\bin\python.exe"
$logFile = "$localDir\cloudflared.log"
$linkFile = "R:\App Agenti\LINK_ONLINE.txt"

# 1. Verifica se Uvicorn è già in esecuzione sulla porta 8000
$portInUse = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if (-not $portInUse) {
    Write-Host "Avvio server Uvicorn su porta 8000..." -ForegroundColor Cyan
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"R:\App Agenti`" && `"$pythonExe`" -m uvicorn main:app --host 0.0.0.0 --port 8000" -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "Server Uvicorn gia' attivo su porta 8000." -ForegroundColor Green
}

# 2. Chiudi eventuali istanze precedenti di cloudflared
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 3. Rimuovi vecchio log
if (Test-Path $logFile) { Remove-Item $logFile -Force -ErrorAction SilentlyContinue }

# 4. Avvia cloudflared tunnel con protocollo HTTP/2
Write-Host "Creazione del tunnel Cloudflare sicuro (protocollo HTTP/2)..." -ForegroundColor Cyan
Start-Process -FilePath $cloudflared -ArgumentList "tunnel --protocol http2 --url http://127.0.0.1:8000 --logfile `"$logFile`"" -WindowStyle Hidden

# 5. Attendi estrazione URL dal log (max 20 secondi)
$url = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -ErrorAction SilentlyContinue | Out-String
        if ($content -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
            $url = $matches[1]
            break
        }
    }
}

if ($url) {
    $out = @"
LINK APPLICAZIONE GESTIONALE AGENTI:

$url

(Invia questo link su WhatsApp ai colleghi per il test da smartphone/4G)
"@
    $out | Out-File -FilePath $linkFile -Encoding utf8
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  LINK ONLINE GENERATO CON SUCCESSO!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  $url" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Il link e' stato salvato anche in LINK_ONLINE.txt" -ForegroundColor Cyan
    Write-Host "  I colleghi possono aprirlo da qualsiasi telefono (anche in 4G/5G)."
    Write-Host "========================================================" -ForegroundColor Green
} else {
    Write-Host "Errore nel recupero del link. Controlla il log in $logFile" -ForegroundColor Red
}
