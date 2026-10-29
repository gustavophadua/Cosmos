@echo off
rem Instala o Cosmos com a IA local (Node.js, Ollama, dependencias, modelo e atalho). Sem administrador.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalar-windows.ps1" %*
pause
