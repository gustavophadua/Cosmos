# M12 redefinida — resultado em 31/10/2026

**M12 ainda não aceita: falta a parte manual do Gustavo.** Sem automação de navegador, conta real, acesso a privado/cofre, Groq ou alteração de autenticação. A definição anterior que contabilizava todo o Chrome foi substituída pelo operador. O monitor antigo de controle de navegador foi excluído.

| Parte | Fato | Fonte | Limite |
|---|---|---|---|
| 1 — CSP | HTML HTTP 200, `Content-Security-Policy: connect-src 'self'`, sem `script-src` adicionado | `src/integracoes/html-local-node.ts`, `testes/integracoes-html.test.ts`; captura local `tmp/missoes/m12-node-v3/html.json` | HTTP/build não demonstram renderização e execução WASM no navegador; validar manualmente na parte 3 |
| 2 — Node | Três perguntas concluídas; tradução 3×, Z3 3×, ponte 1×; 774 amostras TCP, somente `127.0.0.1`, zero destinos externos observados | `perguntas.jsonl`, `tcp.jsonl`, `resultado-node.json`, `fim-node.json`, `conferencia-artefatos.json` na saída local | ExitCode original não aferido; mediana de intervalo 1.010 ms, máximo 5.103 ms. Amostragem pode perder conexões curtas e não mede UDP |
| 3 — Página | Roteiro e resumo HAR sanitizado preparados | `teste-fechado/M12-REDE.md`, `scripts/m12-resumir-har.py` | **Pendente: Gustavo deve confirmar três respostas, filtro vazio e fornecer resumo sanitizado.** |

## Ensaio Node observado

Preparado por `node scripts/m12-preparar.mjs`. Executado uma única vez:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/m12-rede-node.ps1 -Saida tmp/missoes/m12-node-v3
```

PID 1584; origem `http://127.0.0.1:4175`; serviço e driver de ensaio no mesmo PID. Ponte, HTTP, autenticação por desafio assinado, modelo e worker Z3 reais; sem adaptador mockado. Fixture criptográfica é a mesma família dos testes `integracoes-ollama.test.ts`; nenhum token ou seed foi gravado. Arquivo temporário de dono contém somente chave pública descartável, não conta real. Nuvem ausente no estado, nenhuma opção Groq fornecida. Modelo qwen3:4b, digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`, Ollama 0.40.12. GPU integrada, não usada pelo modelo.

| ID | Texto público | Conferência Z3 | Tempo do fluxo |
|---|---|---|---|
| M12-01 | Todo cliente tem suporte. A loja é cliente. Então a loja tem suporte. | segue | 291.386 ms |
| M12-02 | Todo cliente tem suporte. A loja tem suporte. Então a loja é cliente. | independente; uma opção de ponte | 243.503 ms |
| M12-03 | Clientes do plano anual normalmente renovam. A padaria é cliente do plano anual. Então a padaria renova. | segue nas fórmulas traduzidas | 254.192 ms |

São classes das fórmulas, não prova de tradução fiel. “Normalmente” exige o aviso linguístico da Conversa; a captura Node não demonstra sua apresentação na UI.

Coleta: primeira amostra `2026-10-31T18:20:28.9304314Z`, última `2026-10-31T18:33:39.4146486Z`; perguntas de `18:20:30.689Z` a `18:33:39.781Z`. Duração total do coletor 794.294 ms, mediana de intervalo 1.010 ms, máximo 5.103 ms; consulta mais demorada 5.014 ms. Não se alega periodicidade exata de um segundo ou captura contínua. Listen/Bound com porta remota zero, registrados como sem destino, não foram contados como conexão externa. O relatório não atribui `0.0.0.0` desses estados a uma conexão externa.

### Defeito de contabilização do coletor — evidência preservada

`Start-Process` forneceu `ExitCode=null`; o teste `$hospedeiro.ExitCode -ne 0` o tratou como erro. Assim o **script PowerShell terminou com saída 1**, apesar de `resultado-node.json` conter as três perguntas e `fim-node.json` registrar `sucesso:true`. stdout/stderr do Node estão vazios. **Não se converteu o código nulo em zero e não se repetiu o ensaio.** `coletor-falha.json` e `coletor-resumo.json` originais permanecem intactos.

Versão seguinte retém o Handle do processo antes de terminar e distingue código não aferido de falha das perguntas. Ensaios triviais de saída 0 e 3 devolveram os valores esperados; não reproduziram o nulo e não provam causa única. A versão corrigida não foi usada para inventar novo resultado do ensaio original. A conferência derivada dos artefatos registra esse limite.

SHA-256 do coletor usado: `3c8f93d20f8990defb007610a4021283ab0e83160af25245cece3f2380e45c18`. Perguntas `dado público`; HAR bruto, tokens, cofre, logs brutos e dados temporários ficam fora do commit. Recibos locais têm hashes próprios em `conferencia-artefatos.json`.

## Chrome e Ollama, separados do escopo

O Ollama esteve ativo no ensaio; suas conexões próprias não foram capturadas. Tráfego interno de atualização/componentes Chrome foi identificado na investigação histórica, fora do escopo atual; nenhum Chrome foi aberto ou controlado aqui. Isso **não** permite descartar requisições externas que apareçam no Network da página Cosmos. A lista filtrada manual deve estar vazia.

## Validação de código

- `npm.cmd run typecheck`: saída 0.
- `npm.cmd test -- testes/integracoes-html.test.ts testes/m12-har.test.ts testes/integracoes-ollama.test.ts --maxWorkers=1`: **16/16**, três arquivos, 7,40 s.
- `npm.cmd run build`: saída 0, dois builds concluídos; aviso de chunk >500 KiB preservado, último build 2,62 s.
- `VERIFICADOR_EXIGE_DIST=1 npm.cmd test -- --maxWorkers=1`: saída 0, **1.177 aprovados, 17 pulados, zero falhas**, 97 arquivos aprovados + seis pulados (103), 299,77 s. Quatro testes novos em relação ao snapshot 1.173/17.
- Conferência dos protegidos: **13/13** antes do build, após build e após suíte; incluindo `config.ts` byte a byte e exportação histórica.
- HAR bruto ignorado por `*.har`; teste do resumo comprova remoção de sessão, userinfo, caminho, query e corpos; captura vazia/inválida não é aceita. O resumo sozinho não autentica a completude da captura.

Logs locais: `tmp/missoes/m12-node-v3/{typecheck.log,focados.log,build-final.log,suite.log,preservacao-apos-build.json,preservacao-apos-suite.json}`. Primeira orquestração Windows PowerShell interrompeu no aviso normal `PLUGIN_TIMINGS`, tratado como NativeCommandError pela opção Stop. Log `build.log` preservado; fechamento seguinte usa códigos de saída nativos, mantém todos os avisos e terminou com saída zero. A suíte completa foi executada uma única vez nesta rodada.

Os dados acima não dependem de repetir as medições M1–M15. Não há autorização de merge/main/deploy nesta entrega. Instruções de aceitação e proteção do HAR: [M12-REDE.md](M12-REDE.md).
