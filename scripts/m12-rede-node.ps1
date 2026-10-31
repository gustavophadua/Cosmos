param([Parameter(Mandatory=$true)][string]$Saida)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $raiz
$alvo = [IO.Path]::GetFullPath((Join-Path $raiz $Saida))
$permitido = [IO.Path]::GetFullPath((Join-Path $raiz 'tmp/missoes')) + [IO.Path]::DirectorySeparatorChar
if (-not $alvo.StartsWith($permitido, [StringComparison]::OrdinalIgnoreCase)) { throw 'Saida fora de tmp/missoes' }
if (Test-Path -LiteralPath $alvo) { throw 'Saida existente; nao repetir ensaio' }
New-Item -ItemType Directory -Path $alvo | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
function Gravar($nome, $valor) { [IO.File]::WriteAllText((Join-Path $alvo $nome), ($valor | ConvertTo-Json -Depth 10) + "`n", $utf8) }
$node = (Get-Command node.exe).Source
$hospedeiro = Start-Process -FilePath $node -ArgumentList @('tmp/m12-runtime/m12-node.mjs', ('"' + $alvo + '"')) -WorkingDirectory $raiz -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $alvo 'stdout.log') -RedirectStandardError (Join-Path $alvo 'stderr.log')
# Reter Handle antes do fim: Start-Process pode devolver ExitCode nulo sem isso.
$null = $hospedeiro.Handle
Gravar 'coletor-meta.json' @{ formato='cosmos-m12-coleta-tcp-v1'; pid=$hospedeiro.Id; intervaloAlvoMs=1000; inicio=[DateTime]::UtcNow.ToString('o'); criterio='RemoteAddress 127.0.0.1 ou ::1; Listen/Bound sem destino separados'; chrome='fora-do-escopo'; ollama='fora-do-escopo' }
$relogio = [Diagnostics.Stopwatch]::StartNew()
$amostras=0; $externos=0; $consultasSemSocket=0; $ultimoInicio=0L; $maxIntervalo=0L; $maxConsulta=0L
try {
  while (-not $hospedeiro.HasExited) {
    $t = $relogio.ElapsedMilliseconds
    if ($amostras -gt 0) { $maxIntervalo=[Math]::Max($maxIntervalo, $t-$ultimoInicio) }
    $ultimoInicio=$t
    $linhas=@()
    try { $linhas=@(Get-NetTCPConnection -OwningProcess $hospedeiro.Id -ErrorAction Stop) }
    catch { if ($_.CategoryInfo.Category -ne 'ObjectNotFound') { throw }; $consultasSemSocket++ }
    $duracao=$relogio.ElapsedMilliseconds-$t; $maxConsulta=[Math]::Max($maxConsulta,$duracao)
    $conexoes=@($linhas | ForEach-Object {
      $semDestino=($_.State.ToString() -in @('Listen','Bound')) -and ($_.RemotePort -eq 0)
      if (-not $semDestino -and $_.RemoteAddress -notin @('127.0.0.1','::1')) { $externos++ }
      @{ estado=$_.State.ToString(); remoto=$_.RemoteAddress; portaRemota=$_.RemotePort; portaLocal=$_.LocalPort; semDestino=$semDestino }
    })
    [IO.File]::AppendAllText((Join-Path $alvo 'tcp.jsonl'), ((@{ amostra=$amostras; instante=[DateTime]::UtcNow.ToString('o'); inicioMs=$t; consultaMs=$duracao; pid=$hospedeiro.Id; conexoes=$conexoes } | ConvertTo-Json -Depth 8 -Compress) + "`n"), $utf8)
    $amostras++
    if ($externos -gt 0) { throw 'ACHADO GRAVE: destino nao loopback no PID Node; ensaio interrompido' }
    if (Test-Path -LiteralPath (Join-Path $alvo 'meta-node.json')) { [IO.File]::WriteAllText((Join-Path $alvo 'iniciar'), '', $utf8) }
    if ($relogio.ElapsedMilliseconds -gt 1800000) { throw 'Prazo total de 30 minutos excedido; sem reinicio automatico' }
    $restante=1000-($relogio.ElapsedMilliseconds-$t)
    if ($restante -gt 0) { Start-Sleep -Milliseconds $restante }
    $hospedeiro.Refresh()
  }
  $hospedeiro.WaitForExit()
  Gravar 'coletor-resumo.json' @{ pid=$hospedeiro.Id; exitCode=$hospedeiro.ExitCode; amostras=$amostras; destinosExternos=$externos; consultasSemSocket=$consultasSemSocket; maiorIntervaloMs=$maxIntervalo; maiorConsultaMs=$maxConsulta; duracaoMs=$relogio.ElapsedMilliseconds; fim=[DateTime]::UtcNow.ToString('o'); limite='Amostragem TCP pode perder conexoes curtas; nao mede UDP, Chrome, Ollama ou processos filhos' }
  if ($null -eq $hospedeiro.ExitCode) { throw 'Codigo de saida nao aferido; isso nao demonstra falha das perguntas. Conferir recibos, sem repetir automaticamente' }
  if ($hospedeiro.ExitCode -ne 0) { throw 'Processo Node terminou com erro; consultar recibos sem repetir automaticamente' }
} catch {
  Gravar 'coletor-falha.json' @{ amostras=$amostras; destinosExternos=$externos; fim=[DateTime]::UtcNow.ToString('o'); erro=$_.Exception.Message }
  if (-not $hospedeiro.HasExited) { Stop-Process -Id $hospedeiro.Id }
  throw
}
