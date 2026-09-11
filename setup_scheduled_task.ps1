$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"R:\App Agenti\run_auto_update_silent.vbs`""
$trigger = New-ScheduledTaskTrigger -Daily -At "08:55"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "08:55" -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours 8)).Repetition
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "Gestionale Agenti - Aggiornamento Automatico" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Aggiorna automaticamente i dati del gestionale agenti ogni ora dalle 8:55 alle 16:55 (online ore 9:00-17:00)" `
    -Force

Write-Output "SUCCESS: TASK REGISTRATO CORRETTAMENTE!"
