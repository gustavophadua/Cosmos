# Revisor de planos v1: fato e visão

Estado em 29/10/2026: código e testes prontos (`src/motor/revisor.ts`, `testes/revisor.test.ts`, rota no serviço local,
tela Labs → Revisar plano). **Ainda não medido com o modelo real**: o número de quanto o extrator acerta só sai do
teste em planos reais conferidos à mão (§5). Até lá, nenhuma taxa de acerto do revisor pode ser afirmada.

## 1. O que é

O revisor recebe o texto de um plano, projeto ou proposta e diz, para cada conclusão que o texto apresenta como
consequência de outras afirmações, se ela **decorre do que o próprio plano afirma**. O que se classifica é o
argumento, nunca a pessoa.

| Veredito | Quer dizer |
|---|---|
| provado | a conclusão decorre das afirmações em que o plano a apoia (o Z3 prova) |
| salto | não decorre: o plano a apresenta como consequência, mas ela é visão; vem com um cenário em que todos os apoios valem e ela falha |
| contradição | os próprios apoios provam o contrário da conclusão |
| afirmações incompatíveis | os apoios não podem valer juntos |
| sem tradução | o modelo não produziu fórmulas que se leem |

As afirmações que servem de apoio e não são conclusão de nada saem listadas como **afirmações de base**: o plano não
as prova, e elas precisam de fonte (dado, contrato, pesquisa). Se elas são verdade no mundo, o revisor não diz.

## 2. Como funciona

1. **Extrator** (`EXTRATOR = 'extrator-v1'`): o texto se divide em trechos de até 1.500 caracteres (sem partir
   parágrafo). Para cada trecho, o modelo devolve, preso a um esquema JSON, a lista de afirmações (uma ideia por frase,
   pronomes trocados pelo nome) e os argumentos (conclusão e de 1 a 4 apoios). Temperatura 0, contexto 8.192. A
   resposta é conferida (`lerExtracao`): ids repetidos e apoios inexistentes saem.
2. **Tradução**: cada argumento passa pela formalização assistida (o mesmo pedido e o mesmo reparo do serviço local,
   `formalizacao-v1.md`), sem vocabulário dado.
3. **Juiz**: o modelo sai da memória e o Z3 classifica cada argumento. No salto, o motor finito do Caderno (sem Z3)
   procura o menor cenário com os apoios verdadeiros e a conclusão falsa, e ele sai em português pelas leituras do
   vocabulário.

Tudo roda no serviço local (`node scripts/integracoes-p0.mjs --ollama`), rotas `ollama/revisar` (POST, até 20.000
caracteres) e `ollama/revisar/estado` (GET). Uma revisão de cada vez, em segundo plano; enquanto ela roda, as outras
rotas que usam o modelo respondem "ocupado". O texto não sai do computador. O relatório se baixa em Markdown ou JSON.

## 3. Limites conhecidos

- **O tradutor entorta premissas para a conclusão seguir** (`formalizacao-v1.md` §8, frases G-): exatamente o erro
  que transforma um salto em "provado". Enquanto ele não for corrigido (pedido v4, tradução cega, treino), o
  revisor pode dizer "provado" onde há salto. Esse é o defeito mais grave para este produto.
- O extrator é o mesmo modelo de 4B, sem medição: pode juntar ou partir ideias, ligar a conclusão aos apoios errados
  ou não achar conclusões implícitas (as que o texto não marca com "portanto", "então"…).
- O m2 não faz contas: "a margem é de 30%, logo o lucro cobre o custo" não se decide.
- Cada argumento é traduzido sozinho, com vocabulário próprio: contradições entre partes distantes do plano não
  aparecem.
- Na Vega 8, cerca de um minuto por trecho e outro por conclusão.

## 4. Instalação

`Instalar-Cosmos.cmd` (na raiz) roda `scripts/instalar-windows.ps1`, sem administrador: confere o Node.js 22 e o
Ollama e, se faltar, instala pelo winget (que pede confirmação); roda `npm ci`; abre o Ollama e baixa o qwen3:4b; põe
o atalho "Cosmos" na Área de Trabalho, que abre o `Abrir-Cosmos-IA.cmd`. `-Conferir` só confere, sem instalar nada;
`-Remover` tira o atalho. A variável da placa integrada (`OLLAMA_IGPU_ENABLE`) não é ligada sozinha.

## 5. Antes de afirmar qualquer número

O teste em 5 a 10 planos reais, cada um conferido à mão: quantas conclusões o extrator achou das que existem, quantas
ligou aos apoios certos, e quantas o revisor classificou certo. Os planos ficam fora do Git.

## 6. Versão em servidor

O serviço local foi desenhado para não ter login: aceita só a origem `127.0.0.1` e confia em quem está no computador.
O servidor é outra peça (`src/integracoes/revisor-servidor-node.ts`, `scripts/servidor-revisor.mjs`, testes em
`testes/revisor-servidor.test.ts`), com o mesmo núcleo (`revisarPlano`):

- **Conta por cliente:** `node scripts/servidor-revisor.mjs --nova-conta "Empresa X" --limite 20` cria a conta e mostra
  a chave uma vez; o arquivo de contas (`privado/revisor/contas.json`, fora do Git, ou `COSMOS_REVISOR_CONTAS`) guarda só
  o SHA-256 dela. `--contas` lista e `--remover-conta ID` remove, sem reiniciar.
- **API:** `POST /api/revisoes` com `Authorization: Bearer <chave>` e `{"texto": "..."}` (até 20.000 caracteres) responde
  202 com o id; `GET /api/revisoes/<id>` dá a posição na fila, o progresso e o relatório; `DELETE` apaga antes do prazo;
  `GET /api/saude` não pede chave. A revisão de outra conta responde 404.
- **Fila e limites:** uma revisão de cada vez (o modelo não roda duas); até 2 em andamento por conta, o limite por dia
  de cada conta, até 20 na fila; 20 chaves erradas por minuto do mesmo endereço bloqueiam o resto do minuto.
- **Dados:** o texto do plano sai da memória quando a revisão termina; o relatório fica 24 horas e some; nada vai para
  disco; os registros têm conta, id, tamanho, tempo e quantidade de conclusões, nunca o conteúdo.
- **Rede:** escuta em `127.0.0.1:4180` por padrão (`COSMOS_REVISOR_HOST`, `COSMOS_REVISOR_PORTA`); o HTTPS fica com um
  proxy reverso na frente (Caddy ou nginx, com certificado). O Ollama roda no mesmo computador.

Falta, e é do dono: a máquina (com placa; o provedor e o custo), o domínio e o certificado, os termos de uso e de
tratamento de dados (LGPD; GDPR para clientes na Europa) e a decisão de abrir para clientes, depois do teste do §5.
