# COSMOS - pacote publico sanitizado v1

Preparacao local, sem publicacao. Origem: `aacecce9f606fe73789fbd74135fc01abd5ea356`, branch `codex/fase4-b-5p4c`.

Inclui SMT2 (20 variaveis, 75 clausulas), fonte WGSL, prova Alethe, hashes e recibo derivado. Os tres artefatos foram preservados byte a byte. Dispatch historico: 16.384 grupos de 64 invocacoes. O recibo foi reconstruido por selecao explicita de campos e tem hash proprio. A origem identifica o marco de codigo, nao afirma que o recibo final local esteja dentro daquele commit.

Os originais ja publicados permanecem no historico da branch para conferencia. Este pacote nao os remove nem torna privados. O artefato historico permanece intacto. Executaveis, testemunhos binarios, Cargo.lock completo, metadados de bancada e logs brutos nao integram este diretorio.

## Consumo por SHA-256

hashes.json distingue arquivos incluidos de referencias sem arquivo. Um loader local deve receber explicitamente o arquivo autorizado, conferir tamanho e SHA-256 antes de entrega-lo ao consumidor e recusar divergencias. Leitura Git local deve usar o commit completo acima, nunca branch movel, seguida da verificacao SHA-256 dos bytes. Nenhum loader, download automatico ou treinamento e executado ou fornecido nesta entrega. O consumidor publico dispoe da prova e das fontes selecionadas; para os testemunhos, somente tamanho e hash. Hash sozinho nao permite treinar.

Para conferir a prova formal e necessario obter separadamente o Carcara aprovado e verificar seu pin antes da execucao. Os resultados 1035/1035, 29/29 e Naga sao historicos, nao uma nova suite deste pacote. O recibo sanitizado nao e assinatura, OTS ou atestacao do hardware.

Este diretorio e uma selecao de distribuicao, nao uma limpeza do repositorio inteiro. Uma futura publicacao deve selecionar somente estes arquivos, sem incluir automaticamente o historico Git.
