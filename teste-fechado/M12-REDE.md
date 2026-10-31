# M12 — conexão da página e do processo Node, separadas

A redefinição do operador em 31/10/2026 substitui o critério anterior que incluía todo o navegador. **A aceitação exige as três partes abaixo.** Não há automação de navegador ou controle de janela neste procedimento.

## 1. Página: trava por código

O HTML de `scripts/integracoes-p0.mjs` é servido por `src/integracoes/html-local-node.ts`, com o cabeçalho exato `Content-Security-Policy: connect-src 'self'`. A ponte conserva autenticação, Host/Origin e marcador. Nenhuma diretiva `script-src` foi adicionada; scripts inline e compilação WASM não são restringidos por esta política. O teste HTTP em `testes/integracoes-html.test.ts` confere as três URLs HTML, conteúdo, CSP e recusas existentes.

Essa diretiva impede conexões externas iniciadas pela página por fetch/XHR/WebSocket/EventSource/beacon nos navegadores que a aplicam. **Não é firewall do Node e não bloqueia toda categoria de recurso, como imagem, script ou navegação.** Por isso a parte 3 permanece obrigatória. Build e resposta HTTP não demonstram renderização/execução de WASM no navegador; o ensaio Node confere Z3 real, e a conferência da página é manual.

## 2. Processo Node: ensaio automático

Preparação, sem abrir navegador nem ler conta real:

```powershell
node scripts/m12-preparar.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/m12-rede-node.ps1 -Saida tmp/missoes/m12-node-NOVO
```

A saída precisa ser nova; não há repetição automática. O coletor cria um Node exclusivo, cujo PID aparece em `coletor-meta.json`. Serviço e driver HTTP do ensaio usam o mesmo PID. API, ponte, HTML, Ollama e worker Z3 são reais; não há mock de transporte, modelo ou solver. A fixture usa `criarCofreTeste` e desafio assinado, como `integracoes-ollama.test.ts`; chave, cofre e tokens ficam em memória. Apenas a chave pública descartável é gravada em `dono-fixture-publico.json`, sob a saída temporária. Não se acessa `privado/ia-dono.json` nem cofre do operador.

Sem opção Groq e sem leitura de chave; estado do serviço precisa omitir nuvem. Modelo esperado qwen3:4b, digest 359d7dd4…; GPU integrada, não usada pelo modelo. Três argumentos públicos fixos são enviados a `/cosmos/__p0/ollama`, depois `/ollama/conferir`; o salto independente aciona `/ollama/ponte`. Nenhum pedido com `nuvem:true`. As rotas compartilham a mesma origem, sessão e validações da aplicação. Modelo e Z3 se revezam, sem medição paralela.

A cada segundo-alvo, `Get-NetTCPConnection -OwningProcess <PID>` registra estado e destino, sem conteúdo, headers ou tokens. Listen/Bound com porta remota zero são registrados separadamente como sem destino, não conexões externas. Toda conexão com destino deve ser `127.0.0.1` ou `::1`; outro destino interrompe o processo próprio e é achado grave. Falha de consulta também interrompe; ausência momentânea de sockets é distinguida. O resumo registra intervalos reais e duração das consultas. Amostragem TCP pode perder conexões curtas e não mede UDP ou filhos; não constitui prova universal de ausência de tráfego.

Chrome (atualizações/componentes) e o processo Ollama estão explicitamente fora do escopo. Tráfego de atualização Chrome foi identificado anteriormente; não é atribuído à página Cosmos. Sua exclusão não dispensa a captura Network da página. Não se iniciam nem monitoram contas ou processos de navegador nesta etapa.

## 3. Página: Gustavo, manual, cerca de cinco minutos de operação (mais a espera do modelo)

1. Inicie você mesmo a instância local: `node scripts/integracoes-p0.mjs --ollama`, **sem `--groq`**. Abra manualmente `http://127.0.0.1:4175/cosmos/#/i-ai`. Use sua sessão local normalmente, sem fornecer senha/chave a ninguém. Se o ensaio Node ainda estiver rodando, espere a porta ser liberada.
2. Abra DevTools → Network, marque **Preserve log**, limpe a lista e recarregue a página. Não ative nuvem. No pedido do documento `/cosmos/`, confira Response Headers: `Content-Security-Policy: connect-src 'self'`.
3. Envie, um por vez, esperando terminar:
   - Todo cliente tem suporte. A loja é cliente. Então a loja tem suporte.
   - Todo cliente tem suporte. A loja tem suporte. Então a loja é cliente.
   - Clientes do plano anual normalmente renovam. A padaria é cliente do plano anual. Então a padaria renova.
4. Confirme que Conversa mostra respostas, conferência Z3 e, no salto independente, ligações. Registre horário inicial/final e qualquer erro. Esta confirmação é da página real, não apenas do build.
5. No filtro Network, use exatamente `-domain:127.0.0.1 -domain:localhost`. **Critério: lista filtrada vazia.** O Network mostra requisições da página, não do atualizador do Chrome. Não descarte um destino da página alegando que é do Chrome. Tentativa externa bloqueada pela CSP ainda é informação a relatar.
6. Registre se a lista ficou vazia. Limpe o filtro antes de exportar **todo** o HAR, para conservar os pedidos locais das três perguntas. Salve fora do Git. Não envie o HAR bruto: até a opção sanitizada do navegador pode manter `X-Cosmos-Sessao`, corpos e respostas. Não cole headers ou sessão em chat.
7. Execute você mesmo no arquivo local:

```powershell
python -I -X utf8 -B scripts/m12-resumir-har.py "C:/caminho-local/cosmos-m12.har" "C:/caminho-local/m12-resumo.json"
```

O script lê o HAR local e cria arquivo novo só com origens, contagens e status; não copia URLs completas, queries, headers, conteúdo ou credenciais. Compartilhe **somente o resumo** e a confirmação de três respostas/horários/filtro vazio. Um resumo vazio, incompleto ou com entrada inválida não aprova o teste. Guarde o HAR bruto localmente se precisar auditá-lo; não adicione ao Git.

## Situação de aceitação

Resultados automáticos são registrados separadamente no relatório de execução. **Parte 3 pendente até o Gustavo fornecer evidência manual. M12 não aceita antes disso.** Nenhum resultado histórico de outra missão ou fixture visual substitui esta parte.
