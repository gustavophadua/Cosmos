@echo off
rem Abre o Cosmos com a formalizacao pelo Ollama local: confere o Ollama, sobe o servico e abre o navegador no Labs.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo O Node.js não está instalado. Instale o Node 22 e abra de novo. & pause & exit /b 1)
if not exist node_modules (echo Falta instalar as dependências: rode "npm ci" nesta pasta uma vez. & pause & exit /b 1)
curl -s -o nul http://127.0.0.1:11434/api/version
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
    echo Abrindo o Ollama...
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
    for /l %%i in (1,1,30) do (curl -s -o nul http://127.0.0.1:11434/api/version && goto pronto & timeout /t 1 /nobreak >nul)
  )
  echo O Ollama não respondeu. Instale e abra o Ollama ^(ollama.com^), rode "ollama pull qwen3:4b" e abra de novo.
  pause & exit /b 1
)
:pronto
node scripts\integracoes-p0.mjs --ollama --abrir
pause
