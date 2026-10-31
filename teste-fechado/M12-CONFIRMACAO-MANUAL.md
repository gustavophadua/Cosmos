# M12 — confirmação manual do operador, 31/10/2026

## Fato, fonte e limite

| Fato | Fonte | Limite |
|---|---|---|
| Keep log marcado durante as perguntas | Confirmação do operador “1 e 2 ok” e captura do DevTools mostrando a caixa marcada | Não é log assinado nem medição automatizada |
| Três perguntas respondidas completamente | Confirmação manual do operador | Não demonstra por si só fidelidade da tradução ou certificado por resposta |
| HAR sanitizado: 15 entradas válidas, todas HTTP 127.0.0.1:4175, todas 200, zero destinos externos | [Resumo sanitizado](m12-har-resumo.json), gerado pelo script público do projeto | Contadores visuais posteriores de 17/20 não foram reconciliados; não se afirma captura de toda a sessão posterior |
| O filtro original deixou dom.build.min.js e data:font/woff2 | Captura e leitura de Request URL pelo operador, que informou protocolo chrome-extension para o script | URL completa/ID da extensão não foram coletados; a classificação do script é informação manual |
| Lista vazia com filtro complementar | Operador confirmou “esvaziou” | Resultado é da janela observada, não garantia universal de ausência de vazamento |

Filtro complementar aplicado:

```text
-domain:127.0.0.1 -domain:localhost -scheme:chrome-extension -scheme:data
```

`data:` é recurso embutido; `chrome-extension:` identifica recurso da extensão, não um servidor HTTP externo do Cosmos. Essas exclusões não descartam destinos HTTP/HTTPS externos que a página venha a acessar. O tráfego interno do Chrome e o processo Ollama continuam fora do escopo determinado pelo operador. Não se executou controle de janela ou automação de navegador.

O cabeçalho `connect-src 'self'` foi conferido no HTML real por teste HTTP; não se afirma confirmação humana separada da leitura desse cabeçalho no DevTools. Nenhuma diretiva script-src foi adicionada. A operação manual da Conversa complementa as conferências reais de Z3 e ponte pelo Node.

## Estado da missão

**As três partes têm evidência registrada, com as ressalvas do ensaio.** A pendência de confirmação manual foi atendida. Isso não converte o coletor original em execução verde: seu ExitCode ficou nulo e a orquestração terminou com saída 1; três perguntas e 774 amostras foram preservadas, sem repetição. A mediana do intervalo TCP foi 1.010 ms e o máximo 5.103 ms; conexões curtas podem escapar. Ver [resultados M12](M12-RESULTADOS.md).

Não publicar HAR bruto, headers, tokens, contas ou cofres. Este documento e o resumo contêm somente evidência sanitizada e declarações do operador. Não foram realizadas novas perguntas, chamadas Groq ou medições para preencher este registro.

## Validação antes da integração autorizada

Em 31/10/2026: `npm.cmd run typecheck` e `npm.cmd run build` com saída zero; `VERIFICADOR_EXIGE_DIST=1 npm.cmd test -- --maxWorkers=1`: 1.177 aprovados, 17 pulados, zero falhas, 97 arquivos aprovados e seis pulados, 300,97 s. Protegidos 13/13 após build e após suíte; avisos SQLite/cleanupThread/chunk preservados. M11 permanece não executada por ausência da variável Groq; não é substituída por esses testes nem pelo deploy.
