@echo off
chcp 65001 > nul
title Sblocco Firewall Porta 8000 - Gestionale Agenti

:: Verifica permessi amministratore con richiesta UAC automatica
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Richiesta permessi di amministratore in corso...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ========================================================
echo     SBLOCCO PORTA 8000 NEL FIREWALL DI WINDOWS
echo ========================================================
echo.
echo Aggiunta regola Firewall in corso...

netsh advfirewall firewall delete rule name="Gestionale Agenti (Porta 8000)" >nul 2>&1
netsh advfirewall firewall add rule name="Gestionale Agenti (Porta 8000)" dir=in action=allow protocol=TCP localport=8000 profile=any

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo   [OK] PORTA 8000 SBLOCCATA CON SUCCESSO!
    echo ========================================================
    echo   Ora gli altri dispositivi e smartphone connessi al Wi-Fi
    echo   potranno aprire il link dell'app.
    echo.
) else (
    echo.
    echo [ERRORE] Impossibile aggiungere la regola nel Firewall.
    echo.
)

pause
