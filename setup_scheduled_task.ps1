$localDir = "$env:LOCALAPPDATA\GestionaleAgenti"
if (-not (Test-Path $localDir)) {
    New-Item -ItemType Directory -Path $localDir -Force | Out-Null
}

$localVbs = "$localDir\run_update_silent.vbs"
$localPs1 = "$localDir\run_update.ps1"

# Copia gli script di avvio locale
Copy-Item -Path "R:\App Agenti\run_auto_update_silent.vbs" -Destination "$localDir\run_auto_update_silent.vbs" -Force -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$localVbs`""
$trigger = New-ScheduledTaskTrigger -Daily -At "08:55"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "08:55" -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours 8)).Repetition
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "Gestionale Agenti - Aggiornamento Automatico" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Aggiorna automaticamente i dati del gestionale agenti ogni ora dalle 8:55 alle 16:55 (online ore 9:00-17:00) con fallback locale e auto-riconnessione di rete" `
    -Force

Write-Output "SUCCESS: TASK REGISTRATO CORRETTAMENTE CON ESECUZIONE LOCALE E TIMEOUT ANTI-BLOCCO!"
