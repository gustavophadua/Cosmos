# Instala o Cosmos com a IA local num Windows 10 ou 11, sem administrador: confere o Node.js 22 e o Ollama (e, se
# faltar, instala pelo winget, que pede a sua confirmação), instala as dependências do Cosmos, baixa o modelo
# qwen3:4b (cerca de 2,5 GB) e põe na Área de Trabalho o atalho "Cosmos", que abre tudo. Nada é enviado para fora
# do computador além dos downloads do Node, do Ollama, das dependências e do modelo.
#
#   Instalar-Cosmos.cmd                                                               (o jeito de um clique)
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-windows.ps1 -Conferir   (só confere, não instala nada)
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-windows.ps1 -Remover    (tira o atalho)

param([switch]$Conferir, [switch]$Remover)

$ErrorActionPreference = 'Stop'
$projeto = Split-Path -Parent $PSScriptRoot
$modelo = 'qwen3:4b'
$atalho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Cosmos.lnk'
$falhas = 0

function Passo($texto) { Write-Host ''; Write-Host "== $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "   ok: $texto" -ForegroundColor Green }
function Falta($texto) { Write-Host "   falta: $texto" -ForegroundColor Yellow; $script:falhas++ }

# o PATH novo que o winget grava só vale em janelas novas: relê o do usuário e o da máquina nesta
function Reler-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Versao-Node {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return 0 }
  $v = (& node -v) -replace '^v', ''
  return [int]($v.Split('.')[0])
}
function Caminho-Ollama {
  $c = Get-Command ollama -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $p = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
  if (Test-Path $p) { return $p }
  return $null
}
function Ollama-Responde {
  try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}
function Instalar-Winget($id, $nome) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "   O winget não está neste Windows. Instale o $nome à mão e rode este instalador de novo." -ForegroundColor Yellow
    exit 1
  }
  Write-Host "   Instalando o $nome pelo winget (confirme se ele perguntar)..."
  & winget install --id $id -e --source winget
  if ($LASTEXITCODE -ne 0) { Write-Host "   O winget não terminou a instalação do $nome (código $LASTEXITCODE)." -ForegroundColor Yellow; exit 1 }
  Reler-Path
}

if ($Remover) {
  Remove-Item -LiteralPath $atalho -ErrorAction SilentlyContinue
  Write-Host 'Atalho removido. O Node, o Ollama e o modelo continuam instalados; tire-os pelo Windows se quiser.'
  exit 0
}

Write-Host "Cosmos: instalação local em $projeto"
if ($Conferir) { Write-Host '(modo conferir: nada será instalado nem baixado)' }

Passo 'Node.js 22 ou mais novo'
if ((Versao-Node) -ge 22) { Ok "node $(& node -v)" }
elseif ($Conferir) { Falta 'o Node.js 22 (winget install OpenJS.NodeJS.LTS)' }
else {
  Instalar-Winget 'OpenJS.NodeJS.LTS' 'Node.js'
  if ((Versao-Node) -lt 22) { Write-Host '   O Node instalado não aparece nesta janela. Feche e abra o instalador de novo.' -ForegroundColor Yellow; exit 1 }
  Ok "node $(& node -v)"
}

Passo 'Ollama'
$ollama = Caminho-Ollama
if ($ollama) { Ok $ollama }
elseif ($Conferir) { Falta 'o Ollama (winget install Ollama.Ollama)' }
else {
  Instalar-Winget 'Ollama.Ollama' 'Ollama'
  $ollama = Caminho-Ollama
  if (-not $ollama) { Write-Host '   O Ollama instalado não foi encontrado. Feche e abra o instalador de novo.' -ForegroundColor Yellow; exit 1 }
  Ok $ollama
}

Passo 'Dependências do Cosmos'
# o npm ls confere as dependências instaladas contra o package-lock.json (sem rede)
$instaladas = $false
if ((Versao-Node) -ge 22 -and (Test-Path (Join-Path $projeto 'node_modules'))) {
  Push-Location $projeto
  try { & npm ls --depth=0 --silent *> $null; $instaladas = ($LASTEXITCODE -eq 0) } finally { Pop-Location }
}
if ($instaladas) { Ok 'já instaladas' }
elseif ($Conferir) { Falta 'as dependências (npm ci)' }
else {
  Push-Location $projeto
  try {
    & npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Write-Host "   O npm ci falhou (código $LASTEXITCODE)." -ForegroundColor Yellow; exit 1 }
  } finally { Pop-Location }
  Ok 'instaladas'
}

Passo "Modelo $modelo"
if (-not (Ollama-Responde) -and $ollama -and -not $Conferir) {
  $app = Join-Path (Split-Path -Parent $ollama) 'ollama app.exe'
  if (Test-Path $app) { Start-Process $app } else { Start-Process $ollama -ArgumentList 'serve' -WindowStyle Hidden }
  for ($i = 0; $i -lt 30 -and -not (Ollama-Responde); $i++) { Start-Sleep -Seconds 1 }
}
if (-not (Ollama-Responde)) {
  if ($Conferir) { Falta 'o Ollama aberto (abra o Ollama)' } else { Write-Host '   O Ollama não respondeu. Abra o Ollama e rode este instalador de novo.' -ForegroundColor Yellow; exit 1 }
} else {
  $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10
  if ($tags.models | Where-Object { $_.name -eq $modelo }) { Ok 'já baixado' }
  elseif ($Conferir) { Falta "o modelo (ollama pull $modelo)" }
  else {
    Write-Host '   Baixando o modelo (cerca de 2,5 GB; pode levar alguns minutos)...'
    & $ollama pull $modelo
    if ($LASTEXITCODE -ne 0) { Write-Host '   O download do modelo falhou. Confira a internet e rode de novo.' -ForegroundColor Yellow; exit 1 }
    Ok 'baixado'
  }
}

Passo 'Atalho na Área de Trabalho'
if (Test-Path $atalho) { Ok $atalho }
elseif ($Conferir) { Falta 'o atalho "Cosmos"' }
else {
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($atalho)
  $s.TargetPath = Join-Path $projeto 'Abrir-Cosmos-IA.cmd'
  $s.WorkingDirectory = $projeto
  $s.IconLocation = Join-Path $projeto 'servidor\caderno.ico'
  $s.Description = 'Abre o Cosmos com a IA local (Ollama)'
  $s.Save()
  Ok $atalho
}

Write-Host ''
if ($Conferir) {
  if ($falhas) { Write-Host "Faltam $falhas item(ns). Rode o Instalar-Cosmos.cmd para instalar." -ForegroundColor Yellow; exit 1 }
  Write-Host 'Tudo pronto: abra o atalho "Cosmos" na Área de Trabalho.' -ForegroundColor Green
  exit 0
}
Write-Host 'Pronto. Abra o atalho "Cosmos" na Área de Trabalho: ele liga o serviço e abre o navegador no Labs.' -ForegroundColor Green
Write-Host 'Em computador com placa integrada AMD (Radeon Vega), o modelo fica cerca de duas vezes mais rápido com a'
Write-Host 'variável OLLAMA_IGPU_ENABLE=1 (setx OLLAMA_IGPU_ENABLE 1 e reabrir o Ollama). Ela não é ligada sozinha.'
