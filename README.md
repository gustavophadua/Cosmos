# Cosmos

Aplicacao local para consulta, registro e verificacao de conhecimento. Interfaces `#/i-ai`, `#/lab`, `#/terminal` e configuracoes locais de integracao. Terminal e carteira usam simulacao sem valor financeiro; nao ha mercado publico ou consenso distribuido.

## Desenvolvimento

Node 22.14.0. Instale dependencias com `npm ci`. Execute `npm run typecheck`, `npm test -- --maxWorkers=1` e `npm run build`. `npm run dev` abre o ambiente de desenvolvimento; a base do site publico e `/Cosmos/`. Integracoes locais: `node scripts/integracoes-p0.mjs`. Credenciais de provedor somente no processo servidor, nunca em VITE_*, navegador ou Git. Nenhuma credencial acompanha este repositorio.

## Exportacao independente

Esta copia foi preparada a partir do checkout do marco aacecce9f606fe73789fbd74135fc01abd5ea356, incluindo as alteracoes locais revisadas do parser Python, especificacao de numeros inteiros e encaminhamento do gerador de icones. Nao contem o historico Git original, cofres, dados cifrados pessoais, dependencias instaladas, bancos, logs, executaveis, testemunhos binarios, Cargo.lock ou metadados de bancada.

A implementacao do produto, testes e especificacoes acompanham a entrega. Scripts de selagem e hosts experimentais vinculados aos artefatos historicos foram excluidos; esta copia nao reproduz automaticamente a bancada GPU. O pacote `software-public-v1/` contem a prova e fontes sanitizadas para a instancia fixa 5p/4c. Recibos desse pacote descrevem resultados historicos, nao certificam esta exportacao nem atestam hardware.

Deploy GitHub Pages autorizado em 25/10/2026, com workflow proprio e sem credenciais de provedor. URL: https://gustavophadua.github.io/Cosmos/. O site publico oferece catalogo e demonstracao; conta/cofre e integrações operacionais continuam restritos ao ambiente local. O novo repositorio nao herda tags, assinaturas de commits ou resultados CI do original. Os hashes dos dados historicos sao preservados. OTS e ancora independente permanecem com seus limites registrados nos respectivos dados; nao se afirma confirmacao nova.

O sistema pessoal cifrado foi omitido deliberadamente. Licencas, creditos e avisos de terceiros permanecem em LICENSE, LICENCAS.md, LICENSES/ e THIRD_PARTY_NOTICES.md. Os links para o repositorio original nesses avisos sao atribuicao historica, nao destino de publicacao desta copia.
