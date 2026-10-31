# M11 — Cosmos + 120b, resultado parcial de 25/100

**Primeira fatia concluída. Restam 75 itens. Não é o resultado final do conjunto.**

## Resultado observado

| Medida | Resultado | Denominador/limite |
|---|---|---|
| Itens concluídos | 25 | Primeira fatia 0–25 dos 100 de teste |
| Respostas legíveis | 24 | 25 itens; G-030 ficou ilegível/sem classe |
| Acertos de classe pelo Cosmos/Z3 | 24 | 25 itens, incluindo o sem classe |
| Falso “segue” | 0 | 25 negativos nesta fatia; não usar 92 como denominador deste recorte |
| Sem classe | 1 | G-030 |
| Fórmulas equivalentes ao gabarito | Premissas 24/25; conclusão 24/25; ambas 24/25 | Equivalência lógica, não revisão humana da tradução |
| Cosmos + 4B, mesmos 25 ids na M1 | 25 | 25 itens; única mudança: G-030 contradiz → sem classe |

Todos os 25 gabaritos deste primeiro recorte são negativos (não seguem). **Não mede acerto em positivos nem demonstra superioridade do 120b.** Não comparar 24/25 com a pontuação 96/100 da M1 como se fossem o mesmo conjunto avaliado.

O tradutor cego não fornece classe; todas as `classe_modelo` são nulas por desenho. A métrica Cosmos usa `classe_z3`. O campo legado `completa` do avaliador também exige classe dita pelo modelo e dá 0/25 neste caso; não foi reescrito nem confundido com os 24 acertos de classe do Cosmos. A equivalência de fórmulas ao gabarito é separada da classe; não é prova de fidelidade ao português nem certificado Carcara por resposta.

## Protocolo e integridade

- Modelo: `openai/gpt-oss-120b` via adaptador Groq existente; temperatura 0, max_tokens 4096 por chamada, timeout 20 s, endpoint fixo.
- Formalização: `formalizacao-v3` / `cego-v2`, mesmos exemplos, vocabulário e metade G da M1. Sem ajuste de prompt após observar resultados.
- Conjunto local `tmp/frases-gpt/teste.jsonl`: 100 itens empacotados em `item`, SHA-256 `5ec5cf95dcd1dcf354a41e25b296eff3fd2c86600db11489131c33102623c53c`. Autorizado para Groq; não é o conjunto fechado. O arquivo não é incluído automaticamente nesta publicação.
- Formalizador: `e297fa24e6929f7a050f498e7238b16597a0ae0796ce8e1a033de65a04b866f8`; exemplos públicos: `82d4a13e91fb045432bc1b3e3cfe1f29c0d0a7c215f76540b3dabef7d2680f51`.
- Respostas: `46c003c17c6b868f9d00f5074ae5649f0bf0389559d49fefde3e18ac5e436aeb` (24 linhas); medições: `55b7f2bb1c99f3a0f6a4a041256e7c9f54b9acc21f4f637b894dcc45bcac3723` (25 linhas); notas Z3: `e84ebd17207133c8ce7825811d3d96a7142f70846f47ac6152b5dfb953b9e92d` (25 linhas).
- M1 preservada: notas `e711c7e733c65553da16a6cf14fc23b04e40cbfa687799b7d42e572c3993ec26`. Arquivos de respostas, notas e medições permanecem locais, fora do Git; hashes não substituem seu conteúdo.

A identidade registrada é o modelo solicitado à API. Não há digest dos pesos ou atestação do hardware da Groq; a identificação do modelo não prova que a revisão do serviço permaneça idêntica entre dias. A nota Z3 foi executada localmente, separada da coleta.

Coleta real em 31/10/2026, das **19:31:06 às 19:48:47, horário de São Paulo** (22:31:06–22:48:47 UTC), 1.061,51 s. Inclui espera mínima de 20 s entre chamadas, mais conservadora que o piloto antigo; **não é latência pura do modelo**. Uso reportado: 73.071 tokens de entrada e 21.806 de saída; isso não é auditoria de preço/cobrança ou garantia de cota disponível.

Ollama estava descarregado antes da nota. Teste `testes/nota.test.ts` em três processos sequenciais novos, `NOTA_FATIA=0-10`, depois `10-20` e `20-25`: todos saída zero, 1/1 por processo, 5,64 s / 4,89 s / 4,57 s. IDs e prefixos conferidos antes/depois; nenhuma linha repetida. Uma tentativa inicial de invocação com caminho relativo de CMD falhou antes de iniciar o Z3; log preservado e executável absoluto corrigido. Não houve repetição de nota já gravada.

## Entrada operacional

Na janela PowerShell confiável que contém a chave em memória, entre na pasta do projeto Cosmos e use o comando abaixo, sem fornecer a chave no comando ou no chat:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\m11-iniciar.ps1" -Fatia "25-50"
```

**Este é o próximo lote, não uma instrução para rodá-lo novamente no mesmo dia de controle.** As próximas fatias são 25–50, 50–75 e 75–100, uma por dia UTC conforme a guarda local; reserva de 31/10 já ocupada. A virada da guarda local não garante que a Groq renovou sua cota: qualquer HTTP 429 interrompe, sem retry/troca de conta/chave/provedor ou pasta. Em erro, não executar novamente; conferir os registros primeiro. Não repetir 0–25. Não iniciar notas Z3 ou outra medição em paralelo à coleta.

A chave fica apenas no ambiente do processo confiável. Verificação local de formato não é validação de autenticação no provedor. O script recusa formato inválido antes de reservar a fatia; nenhuma variável `VITE_*`, arquivo dotenv ou armazenamento de chave foi adicionado. Não há nova integração remota no site estático.

### Preparações anteriores, preservadas

O leitor inicial do runner novo confundiu o empacotamento `item`; corrigido com teste de regressão, sem alterar conjunto ou formalizador, antes de chamadas. Outra tentativa falhou por formato de chave antes de `fetch`; os três registros e a reserva dessa tentativa sem HTTP foram arquivados localmente com 4/4 hashes iguais, sem exclusão. Isso não autoriza liberar uma tentativa que tenha chegado ao provedor, apagar resultados ou contornar cota.

Os scripts são opt-in, usam gravação incremental e param em erro de transporte ou cota. Reparos de conteúdo continuam os mesmos da formalização cega existente. O caminho, os parâmetros e os códigos usados nesta primeira medição estão preservados, sem otimização guiada pelos resultados.

## Validação para publicação do apoio à medição

Em 31/10/2026: typecheck e build com saída zero; suíte completa serial, com medições reais explicitamente desativadas: **1.181 aprovados, 18 pulados, zero falhas**, 98 arquivos aprovados e seis pulados (104), 309,38 s. A diferença frente a 1.177/17 é de quatro testes unitários novos e uma medição opt-in pulada, não de quatro chamadas ao modelo. Protegidos 13/13 após build e após suíte; avisos SQLite/cleanupThread/chunk mantidos. Não se executou a segunda fatia nem se repetiu a primeira para publicar esses arquivos. Esta entrega será publicada em branch dedicada, sem deploy.
