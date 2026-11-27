@echo off
chcp 65001 > nul
title Gestionale Agenti - Web App Server

:: Assicura che la cartella corrente sia sempre quella dove risiede questo file .bat
:: (anche in caso di esecuzione tramite collegamento Desktop o percorso di rete UNC \\server\...)
pushd "%~dp0"

echo ========================================================
echo        GESTIONALE AGENTI - AVVIO SERVER WEB APP
echo ========================================================
echo.
echo Cartella di lavoro: %CD%
echo.

:: Verifica presenza di Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRORE] Python non e' installato o non e' presente nel PATH di questo computer.
    echo Per favore installa Python da https://www.python.org e spunta "Add Python to PATH".
    echo.
    pause
    popd
    exit /b 1
)

:: Rileva l'indirizzo IP locale
set LOCAL_IP=127.0.0.1
for /f "tokens=4" %%a in ('route print 0.0.0.0 ^| findstr 0.0.0.0 ^| findstr /v "Default" 2^>nul') do (
    set LOCAL_IP=%%a
)

echo [OK] Server in avvio...
echo.
echo --------------------------------------------------------
echo   LINK PER TE (su questo PC):
echo   http://localhost:8000
echo.
echo   LINK DA INVIARE SU WHATSAPP AI COLLEGHI:
echo   http://%LOCAL_IP%:8000
echo.
echo   Se i colleghi non riescono ad accedere:
echo   1. Devono essere connessi allo stesso Wi-Fi aziendale
echo   2. Fai clic destro su 'sblocca_firewall.bat' -> 'Esegui come amministratore'
echo --------------------------------------------------------
echo.
echo Premi CTRL+C per arrestare il server in qualsiasi momento.
echo.

:: Apre il browser dopo 2 secondi
start "" cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:8000"

:: Avvia il server FastAPI con uvicorn
python -m uvicorn main:app --host 0.0.0.0 --port 8000

popd
pause
