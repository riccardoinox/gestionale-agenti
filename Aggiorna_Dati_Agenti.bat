@echo off
title Aggiornamento Gestionale Agenti - Inoxtubi Padova
color 0b
echo ========================================================
echo    INOXTUBI PADOVA - AGGIORNAMENTO GESTIONALE AGENTI
echo ========================================================
echo.
cd /d "%~dp0"
python update_and_deploy.py
echo.
pause
