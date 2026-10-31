param([ValidateSet('0-25','25-50','50-75','75-100')][string]$Fatia='0-25')
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
if ($env:GROQ_API_KEY -cnotmatch '\A[\x21-\x7e]{8,512}\z') { throw 'Formato local da chave invalido ou ausente. Nenhuma chamada iniciada. Nao envie a chave pelo chat.' }
$medirAnterior=$env:MISSAO11_MEDIR
$fatiaAnterior=$env:MISSAO11_FATIA
try {
  $env:MISSAO11_MEDIR='1'
  $env:MISSAO11_FATIA=$Fatia
  & .\node_modules\.bin\vitest.cmd run testes/missao11-groq.test.ts --maxWorkers=1
  $codigo=$LASTEXITCODE
} finally {
  $env:MISSAO11_MEDIR=$medirAnterior
  $env:MISSAO11_FATIA=$fatiaAnterior
}
if ($codigo -ne 0) {
  $indice=[int]($Fatia.Split('-')[0])/25
  $saida='tmp/frases-gpt/cosmos120-teste/respostas/fatia-'+([int]$indice).ToString('00')
  if (Test-Path -LiteralPath $saida) { Write-Warning 'M11 interrompida. Nao repita; confira os resultados existentes. Nunca envie a chave.' }
  else { Write-Warning 'Validacao inicial interrompida antes das chamadas reais. Informe o erro e aguarde a correcao; nunca envie a chave.' }
}
exit $codigo
