@echo off
rem Abre o Cosmos para o telefone: login da dona, tunel da Cloudflare ate este computador.
rem Na primeira vez, pede a senha (digitada aqui, sem aparecer). O modo local cifrado continua no Abrir-Cosmos-IA.cmd.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo O Node.js não está instalado. Instale o Node 22 e abra de novo. & pause & exit /b 1)
if not exist node_modules (echo Falta instalar as dependências: rode "npm ci" nesta pasta uma vez. & pause & exit /b 1)
where cloudflared >nul 2>nul || (echo Falta o cloudflared, o túnel até este computador. Instale com: winget install --id Cloudflare.cloudflared & echo e abra este atalho de novo. & pause & exit /b 1)
curl -s -o nul http://127.0.0.1:11434/api/version
if errorlevel 1 if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
if not exist privado\remoto-conta.json (
  echo Primeira vez: crie a senha da dona. Ela é pedida no telefone para entrar.
  node scripts\cosmos-remoto.mjs --definir-senha || (pause & exit /b 1)
)
node scripts\cosmos-remoto.mjs
pause
