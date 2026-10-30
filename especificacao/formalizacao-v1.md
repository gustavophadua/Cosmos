# Formalização assistida v1 e o piloto sem treino

A primeira peça da I-AI que trabalha no Cosmos. Um modelo de linguagem **propõe** a formalização de frases curtas em
m2; o Cosmos lê a proposta, recusa o que não se lê e a **lê de volta em português**, sem modelo; a pessoa aprova ou
corrige; a verificação (Z3 e cvc5, Carcara) decide se a conclusão segue. O modelo não aprova nada nem decide nada.
Código: `src/motor/formalizacao.ts`, `src/interfaces/FormalizacaoAssistida.tsx`, `testes/formalizacao.test.ts` e
`testes/piloto.test.ts`.

## 1. O pedido ao modelo (versão `formalizacao-v1`)

Sempre o mesmo para a mesma entrada: as instruções de sintaxe do m2 e de leitura do português ("todo", "nenhum",
"algum", "nem todo", "só se", "ou" inclusivo, sem conhecimento do mundo, sem importação existencial), dois exemplos
resolvidos tirados dos **exemplos públicos** (nunca do conjunto fechado, e nunca o próprio item) e a entrada. A
resposta pedida é um objeto JSON com vocabulário, premissas, conclusão e classe. Uma medição só vale junto com a versão
do pedido; mudar o pedido é outra versão.

A versão `formalizacao-v2` (28/10/2026) acrescenta as regras que a revisão de erros (§8) mostrou faltarem: variável
sempre presa a um quantificador, "cada" e "se alguém é A, então é B", "todo A R algum B" contra "existe um B que todo A
R", "apenas se" numa direção só, "nem…nem", a conclusão escrita como está no texto mesmo quando falsa, e "independente"
para a conclusão que só não segue (com as falácias mais comuns como exemplo). A nota oficial de §5b é da v1 (commit
3cdfaeb). A `formalizacao-v3` (29/10/2026) pede uma fórmula por premissa, na ordem do texto: a v2 deixava premissas de
fora.

O reparo (`reparo-v1`, 29/10/2026, `formalizarComReparo`): a resposta que não se lê, ou que não tem uma fórmula para
cada premissa do texto, volta uma vez ao modelo com o erro do leitor ("'(' na coluna 4 não foi fechado", "o texto tem 2
premissa(s) e a resposta tem 1"), e a segunda resposta vale como vier. O serviço local repara sempre; o piloto, só com
`PILOTO_REPARO=1`, e a versão vai para meta.json. Uma medição com reparo é outra configuração: a medição 2 no fechado
(§5b) foi sem ele.

## 2. A leitura da resposta

- Tira o raciocínio entre `<think>` e as cercas de código; lê o primeiro objeto JSON.
- Com vocabulário dado (o piloto), usa exatamente aquele; sem vocabulário (a tela), aceita o proposto só no padrão:
  predicado com maiúscula sem acento, constante em minúscula, aridade de 0 a 4, sem símbolo repetido.
- Cada fórmula tem de se ler em m2 só com o vocabulário (`lerFormula` de `avaliacao.ts`); o que não se lê é recusado
  com o motivo. A classe proposta é opcional: classe desconhecida não derruba a proposta.
- A leitura de volta usa o leitor determinístico do Caderno (`lerEmPortugues`) com as palavras do vocabulário: "todo
  médico é paciente", "Ana não é paciente".

## 3. Na tela (Labs → Formalizar)

**Com o Ollama (o padrão desde 28/10/2026):** `node scripts/integracoes-p0.mjs --ollama`, com o Ollama aberto e o
`qwen3:4b` baixado, em `http://127.0.0.1:4175/cosmos/`. É o modelo da nota oficial, e o texto não sai do computador.
A ponte (`src/integracoes/ollama-node.ts`) aceita do navegador só premissas e conclusão (até 10 premissas de até 500
caracteres) e monta ela mesma o pedido fixo, com a saída presa ao esquema e temperatura 0: o navegador não escolhe
mensagens, modelo nem destino, e só fala com `127.0.0.1:11434`. Uma proposta de cada vez; na CPU, de 1 a 2,5 minutos.
Se o Ollama não estiver pronto, a tela usa o Groq, se estiver ligado. No Windows, o lançador `Abrir-Cosmos-IA.cmd`
confere o Ollama (abre o aplicativo se estiver fechado), sobe o serviço e abre o navegador no Labs. A rota não depende da
sessão P0 de 15 minutos, que é a da chave do Groq: vale enquanto o serviço estiver aberto.

**Placa de vídeo integrada:** o Ollama acha a AMD Vega 8 pelo Vulkan, mas a descarta por ser integrada. Com
`OLLAMA_IGPU_ENABLE=1` o modelo inteiro vai para ela (medido em 28/10/2026, mesmo pedido da tela, mesma resposta): a
leitura do pedido fica 2 vezes mais rápida (64 contra 32 tokens/s) e a escrita quase igual (8 contra 7,5), e a
proposta do Tico cai de 132 s para 68 s. A nota oficial foi medida na CPU; a placa pode mudar a resposta em casos
raros, por arredondamento, e não entra numa medição oficial sem dizer.

Sem vocabulário dado (a tela), o `qwen3:4b` propõe símbolos com acento ("Pássaro") e constantes com maiúscula
("Tico"); a leitura acerta a forma (sem acento, predicado com maiúscula, constante em minúscula) no vocabulário e nas
fórmulas, só como palavra inteira. Com o vocabulário dado (o piloto e a nota), nada muda. Primeiro teste real na tela,
em 28/10/2026: "Todo pássaro tem penas. Tico não tem penas." ⟹ "Tico não é pássaro." voltou com as três leituras
certas e a classe "segue", em cerca de 2 minutos e meio.

Símbolo usado nas fórmulas e não declarado no vocabulário (o caso real, a galinha de Diógenes: o modelo escreveu
`¬Penas(galinha)` sem declarar `Penas`) entra com o tipo e a aridade do uso e uma leitura provisória tirada do nome
("TemPenas" → "x tem penas", "Ave" → "x é ave"), marcada como completada na tela. Nome usado de dois jeitos, fora do
padrão ou já declarado de outro jeito continua recusado. Só sem vocabulário dado: o piloto e a nota não mudam.

### 3c. O modo automático (28/10/2026)

Para não aprovar uma por uma: a pessoa cola vários problemas (as premissas, uma por linha, a conclusão na última, uma
linha em branco entre eles; até 50), e o Cosmos faz o resto. Primeiro o modelo propõe todas, uma de cada vez; depois o
serviço local tira o modelo da memória e o Z3, numa thread à parte do processo Node (`src/integracoes/z3-trabalhador-node.ts`),
confere cada uma (rota `ollama/conferir`). **Passa só a proposta que se lê e em que a classe que o modelo disse é a que o
Z3 dá às fórmulas dele**; o resto é descartado com o motivo (até 29/10/2026; ver a regra nova no fim desta seção) (não se lê, classe diferente, premissas inconsistentes, Z3
sem decidir). A thread do Z3 se encerra antes de cada pedido ao modelo e depois de um minuto parada: os dois juntos não
cabem na memória deste computador.

As aceitas vão para Minha cadeia com um clique ("Levar as N aceitas"), e lá um clique assina todas, com a afirmação que o
Z3 deu e o estado "proposta". O resultado inteiro (aceitas, descartadas e motivos) pode ser exportado.

O limite é o mesmo da nota: a conferência pega fórmula que não diz o que o modelo achou que dizia (a classe não bate),
mas não pega o erro em que a fórmula errada e a classe errada concordam. Aplicada às respostas da nota oficial (§5b), a
regra aceitaria 95 dos 120 itens, 93 deles com as fórmulas fiéis (98%), e descartaria 25 (23 com a classe divergente e 2
que não se leram), dos quais 22 tinham as fórmulas certas: descarta mais do que o necessário, em troca de quase nada
errado passar. A classe que o modelo mais erra é "independente".

**A regra desde 29/10/2026** (pela revisão de erros, §8): passa a proposta que se lê, tem uma fórmula para cada premissa
do texto e que o Z3 decide; a classe é a do Z3, e a que o modelo disse fica só como registro. Proposta com mais ou menos
premissas que o texto é descartada com o motivo.

**Com o Groq:** só pelo serviço local com o Groq ligado (`node scripts/integracoes-p0.mjs --groq`, com `GROQ_API_KEY` no ambiente,
em `http://127.0.0.1:4175/cosmos/`): a chave fica no processo Node e nunca chega ao navegador. A tela avisa que o texto
sai do computador e não deve levar o Principia, dados pessoais nem itens do conjunto fechado. A pessoa escreve as
premissas e a conclusão, recebe a proposta com a leitura de volta de cada fórmula, corrige se preciso e aprova: a
aprovação leva fórmula, premissas e afirmação para o registro em Minha cadeia, onde a verificação de sempre decide.

**Medição de custo** (pedida na resposta do GPT ao contraponto): cada proposta registra o tempo do modelo, os tokens,
o tempo até a decisão e a decisão (aprovada como veio, corrigida, recusada, não lida). Fica só neste navegador e pode
ser exportada. Conta as recusas e as que não se leram, para o custo por formalização aproveitada não esconder falhas.

## 4. O piloto sem treino

`testes/piloto.test.ts` só roda quando chamado. O modelo propõe a formalização de cada item; as respostas vão para
`respostas.jsonl` e a nota vem depois, pelo Z3, em `testes/avaliacao.test.ts` (`AVALIACAO_RESPOSTAS`).

| Fase | Provedor | Conjunto | Para quê |
| --- | --- | --- | --- |
| Desenvolvimento | Groq, `openai/gpt-oss-120b` | só os 12 exemplos públicos | ajustar o pedido; grátis e rápido |
| Nota oficial | Ollama em 127.0.0.1 (Qwen3) | os 120 fechados | o número honesto, sem os itens saírem do computador |

O código recusa mandar o conjunto fechado para outro provedor que não o Ollama local. A nota separa a fidelidade das
fórmulas (o que importa: o Z3 decide a classe a partir delas) da classe dita pelo modelo.

**No Ollama** (`src/integracoes/provedores/ollama.ts`, só `127.0.0.1:11434`, API nativa `/api/chat`), o modelo padrão
é `qwen3:4b` e cada pedido sai com:

- `think: false`: o "modo pensando" do Qwen3 desligado, para tempo e formato comparáveis entre medições;
- `format` com o esquema JSON da resposta (`ESQUEMA_RESPOSTA`, versão `esquema-json-v1`): o modelo só gera JSON que
  cumpre o formato, então JSON quebrado deixa de existir sem treino; se as fórmulas se leem continua com `lerProposta`;
- temperatura 0, semente 0 e contexto de 4096 tokens fixos.

O `meta.json` de cada execução guarda o digest do modelo (o SHA-256 do manifesto, que fixa os pesos), a versão do
Ollama, a do pedido, a da saída e o SHA-256 das respostas. No conjunto fechado, as respostas têm de ficar na pasta dele
(fora do Git, porque revelam os itens), e cada medição é registrada em `medicoes-no-fechado.jsonl`, ao lado do
conjunto. O plano de fechamento permite **3 medições** nos 120 (linha de base, melhor configuração sem treino, modelo
final); uma quarta exige `PILOTO_ALEM_DO_LIMITE=declarado` e fica marcada no registro. Os ajustes se escolhem num
conjunto de validação à parte, nunca nos 120.

Para rodar (no PowerShell, na pasta do Cosmos, com o Ollama aberto):

```
$env:PILOTO_PROVEDOR='ollama'; $env:PILOTO_SAIDA='saida-piloto'; node node_modules/vitest/vitest.mjs run testes/piloto.test.ts
```

Sem `PILOTO_CONJUNTO`, roda nos 12 exemplos públicos (o passo B3 do plano).

**Votação** (passo D3): com `PILOTO_VOTOS=5`, cada item recebe 5 respostas (temperatura 0,7, sementes 1 a 5) e as que
se leem vão para `candidatos.jsonl`. `testes/votacao.test.ts` (`VOTACAO_CONJUNTO`, `VOTACAO_CANDIDATOS`,
`VOTACAO_SAIDA`, `VOTACAO_FATIA`) escolhe a resposta pelo Z3: a maior turma de fórmulas **equivalentes**, não de
texto igual, com a classe mais dita dentro dela. O custo é cerca de 5 vezes o tempo; só fica se o ganho na validação
pagar.

**Treino:** `testes/exportar-treino.test.ts` transforma um lote do gerador público em conversas com este mesmo
pedido e a resposta certa (recusa ids que não sejam do gerador público). O passo a passo do treino está em
`treino/README.md`.

## 5. Resultado do desenvolvimento (26/10/2026)

`openai/gpt-oss-120b` pelo Groq, pedido `formalizacao-v1`, nos 12 exemplos públicos: **12 de 12 completas** (classe
certa e fórmulas equivalentes às do gabarito, conferidas pelo Z3), inclusive a importação existencial e o "só se"
invertido; de 1,2 a 2,1 s por item, de 1.106 a 1.167 tokens de entrada e de 324 a 837 de saída, no plano grátis. **Não
é a nota oficial**: são 12 itens públicos, e o pedido traz as regras de leitura. Na tela, uma frase nova ("Nenhum gato
gosta de banho. Mimi é uma gata." ⟹ "Mimi não gosta de banho.") voltou certa em 1,7 s e foi levada ao registro com
fórmula, premissas e afirmação preenchidas.

## 5b. A nota oficial (28/10/2026)

`qwen3:4b` no Ollama local, sem treino, nos 120 itens fechados (medição 1 de 3): **115/120 fórmulas fiéis (95,8%)** e
classe certa pelo Z3 em 116/120; a classe que o próprio modelo diz acerta 95/120. A meta do dono, 85% de fórmulas
fiéis, foi batida; os números, os intervalos e os limites estão em `avaliacao-v1.md` §7.

Medição 2 de 3 (29/10/2026, pedido `formalizacao-v3`, o mesmo modelo na Vega 8): **117/120 fórmulas fiéis (97,5%,
IC 95% 92,9–99,1%)**, classe certa pelo Z3 em 117/120, classe dita em 97/120, completas 97/120 (eram 93). As três que
faltam não se leram (dois parênteses não fechados, um símbolo fora do vocabulário); todas as que se leram estavam
fiéis. Item a item contra a medição 1: duas fórmulas a mais, nenhuma a menos (McNemar p = 0,5; completas p = 0,39): a
melhora não é significativa com 120 itens. O pedido foi ajustado só com os lotes públicos R- (§8), nunca com o fechado.
Diferença de condição: a medição 1 rodou na CPU, a 2 na placa. Com a regra do modo automático (§3c), as 117 passariam,
nenhuma errada. Resta uma medição no fechado. O resumo público da medição 2 (`public/cosmos-iai-v1-medicao-2.txt`: o
modelo, a configuração, os hashes das respostas e das notas e os números, sem item nenhum) foi enviado ao OpenTimestamps
em 29/10/2026 e confirmado no Bitcoin no bloco 973687 (2026-10-29T11:32:47Z); a âncora está em
`src/dados/ancora-iai-medicao-2.json`, e o verificador público confere a prova a cada execução.

## 6. A memória de refutações

`src/motor/memoriaRefutacoes.ts`, com o desenho do capítulo 6 da resposta do GPT ao contraponto. Guarda cada tentativa
com a **obrigação exata** (semântica, afirmação, hash da teoria e hash da fórmula canônica), o tipo do resultado e onde
está a evidência. Só "contramodelo conferido" e "refutação conferida" estabelecem que a afirmação não vale; tempo
esgotado, regra não suportada e prova inválida dizem só que a tentativa não chegou lá. A consulta devolve as tentativas
da mesma obrigação e, como sugestão, as da mesma fórmula com outra teoria; **nunca bloqueia**, e o histórico só cresce.

`cadeias/exemplo-contraponto/` leva os casos ao verificador público, com o cvc5 e o Carcara de verdade (chave do teste
2 da RFC 8032, privada pública de propósito; gerada por `testes/gerar-cadeia-contraponto.test.ts`):

| Elo | Caso | O que a CI exige |
| --- | --- | --- |
| 0 | CP07: "Q(b) segue de ∀x (P(x) ⟹ Q(x)) e P(a)" | não se sustenta, com contramodelo exportável no contra-registro |
| 1 | CP08: o mesmo com P(b) acrescentado | abre com refutação e modelo das premissas; a memória com o elo 0 não o bloqueia |
| 2 | CP05: "R segue de S e ¬S" | abre só com a marca `vazio`; o resumo da CI diz que a conclusão segue só porque as premissas são inconsistentes |

Os outros casos têm teste próprio: CP01 (`verificado: true` vindo de fora é recusado, `testes/contraponto-cp01.test.ts`),
CP02 e CP03 (leitura estrita do veredito do Carcara, `scripts/testar-veredito-carcara.py`), CP04 (a prova trocada depois
do hash não muda o que o Carcara lê, e trocada antes dá R8, `scripts/testar-cp04.py`) e CP06 (prova correta contra outro
enunciado, recusada pelo vínculo, `especificacao/provas-t1/vinculo.py`).

## 7. Limites

- A leitura de volta ajuda a conferir, mas não substitui a pessoa: ela lê a fórmula, não o sentido pretendido.
- As frases do piloto são de um gerador; o uso real tem frases mais variadas.
- O Groq não treina modelos e só rodaria um modelo treinado no plano Enterprise com base Llama 3.1 8B; um Qwen3
  treinado roda localmente.

## 8. A revisão de erros (28/10/2026)

Para ver onde o modelo erra sem gastar o conjunto fechado: um lote público gerado, com os erros olhados um por um.
`scripts/gerar-frases.py revisao` gera 501 itens R- (167 por classe, as formas e o vocabulário do treino, semente
própria); o piloto roda com `PILOTO_PUBLICO=gerado` e `PILOTO_FATIA` (um processo por fatia de 50) e a nota com
`testes/nota.test.ts`. O lote fica fora do Git e nunca entra no treino (a exportação só aceita V- e T-). Corrigir o
pedido com base nele é permitido; a medida que vale continua a do conjunto fechado.

Primeira rodada (pedido v1, qwen3:4b na Vega 8, cerca de 30 s por item, 4 h no total):

| | itens |
|---|---|
| se leem | 497/501 (99,2%) |
| fórmulas fiéis | 477/501 (95,2%) |
| classe certa pelo Z3, a partir das fórmulas do modelo | 487/501 (97,2%) |
| classe dita certa | 410/501 (81,8%) |
| completas (fórmulas fiéis e classe dita certa) | 399/501 (79,6%) |

O modelo formaliza bem e classifica mal: nas 167 independentes disse "contradiz" 42 vezes e "segue" 33. Os erros de
fórmula se concentram em poucos padrões: "todo A R algum B" (10, com ∃ no lugar de ∀ ou a ordem dos quantificadores
trocada), "nem…nem" lido como ∨ (3), "apenas se" lido como ⟺ (2), a conclusão falsa trocada pela que segue (2), e quatro
que não se leram (três com a variável solta, sem quantificador, e um parêntese não fechado). A regra do modo automático
(§3c) aceitaria 414, 399 delas fiéis, e descartaria 87, 78 delas com as fórmulas certas; sem exigir a classe dita, só o
Z3, aceitaria 497 com 477 fiéis. A conferência pela classe dita quase não separa os erros (15 em 414 contra 20 em 497) e
joga fora uma em cada seis respostas certas. Daí a v2 do pedido (§1).

Segunda rodada, os mesmos 501 com o pedido v2 (28–29/10):

| | v1 | v2 |
|---|---|---|
| se leem | 497 | 500 |
| fórmulas fiéis | 477 (95,2%) | 475 (94,8%) |
| classe dita certa | 410 (81,8%) | 448 (89,4%) |
| completas | 399 (79,6%) | 424 (84,6%), McNemar p = 0,004 |

As regras novas consertaram o que miravam ("todo A R algum B" em 9 dos 10, "nem…nem" nos 3) e a classe dita nas
independentes subiu de 91 para 138 em 167. Mas apareceu um erro novo: em 22 respostas o modelo deixou uma premissa de
fora (16 delas nos itens com "só se", em que a segunda premissa repete um lado do condicional). Nenhuma resposta da v1
tinha esse defeito. A contagem é uma conferência mecânica: com ela e o Z3, e sem a classe dita, o modo automático
aceitaria 478 respostas da v2, só 3 com fórmula errada (99,4%), e não descartaria nenhuma certa; exigir também a classe
dita aceitaria 427, com as mesmas 3 erradas, e descartaria 51 certas. Daí a regra nova do modo automático (§3c) e a v3
do pedido (§1).

A medição 2 no conjunto fechado, com a v2, começou em 29/10 às 01:49 e foi interrompida às 01:55, antes de gravar
qualquer resposta, quando esse defeito apareceu; não conta como medição (o registro do fechado continua com uma). A
próxima é a da v3, depois de conferida numa segunda leva de 501 itens novos (`gerar-frases.py revisao … 167 2`), em
que o pedido não foi ajustado.

Leva 2, 501 itens novos com o pedido v3 (29/10, nenhum texto em comum com a leva 1):

| | leva 2, v3 |
|---|---|
| se leem | 501 (100%) |
| fórmulas fiéis | 495 (98,8%, IC 97,4–99,5%) |
| classe certa pelo Z3 | 499 (99,6%) |
| classe dita certa | 448 (89,4%) |
| completas | 444 (88,6%) |

Sobraram seis fórmulas erradas: quatro com uma premissa de fora (todas em "só se"), uma com a conclusão trocada pela que
segue e uma que perdeu um "não". O modo automático aceitaria 497, só as duas últimas erradas, e não descartaria nenhuma
certa. Com isso veio a medição 2 no fechado (§5b).

O reparo (§1), nas quatro respostas da leva 2 que deixaram uma premissa de fora: as quatro voltaram com as duas
premissas, iguais ao gabarito, em 60 a 110 s cada (a pergunta vai duas vezes ao modelo). Com ele, a v3 chega a 499/501
fórmulas fiéis na leva 2 (99,6%); as duas que sobram se leem, têm a contagem certa e passariam no modo automático. É
uma conferência nos itens que mostraram o defeito, não uma rodada nova: a primeira resposta, a temperatura 0, é a
mesma, e o reparo só age quando ela falha.

### 8b. Frases escritas por outro modelo (29/10/2026)

As frases R- saem do nosso gerador, com as mesmas formas em que o pedido foi ajustado: medem pouco a variedade. O dono
pediu ao GPT um lote de frases com perfis e jeitos de falar diferentes (`frases-gpt/`, fora do Git): 200 problemas sem
gabarito, 150 de 6 famílias de moldes em 25 cenários e 50 de fala livre ("então abre", "não vou usar os dois",
"pode misturar"). O `gerar.py` do GPT não foi executado: os literais dele foram lidos com `ast`, as frases refeitas e
conferidas contra o arquivo. Os gabaritos foram feitos à mão (os dos moldes por família) e o Z3 deu a classe esperada
nos 199 que entraram, com ids G-. Ficou de fora "A ficha azul fica com a ficha verde. Ela está incompleta.": o "ela"
é ambíguo de propósito, e o certo seria perguntar. Três frases livres admitem mais de uma fórmula razoável; contam na
classe e a fidelidade sai com e sem elas. Antes de olhar qualquer resposta, a divisão: metade de revisão (famílias 1, 5
e 6 e 25 livres sorteados) e metade de teste (famílias 2, 3 e 7 e 24 livres), por família, como o próprio lote
recomenda, para os moldes não vazarem de uma metade para a outra.

Pedido v3 com reparo, sem ajuste nenhum:

| | fórmulas fiéis | classe certa pelo Z3 |
|---|---|---|
| todas (199) | 174 (87,4%, IC 82,1–91,3%) | 185 (93,0%) |
| moldes (150) | 136 (90,7%) | 141 (94,0%) |
| fala livre (49) | 38 (77,6%, IC 64,1–87,0%) | 44 (89,8%) |
| metade de revisão (99) | 81 (81,8%) | 88 (88,9%) |
| metade de teste (100) | 93 (93,0%) | 97 (97,0%) |

O erro dominante, na metade de revisão: o modelo **entorta a premissa para a conclusão seguir**. "Alguém só pode votar
se estiver credenciado" vira "quem está credenciado pode votar"; "todos os monitores são alunos" vira "todos os alunos
são monitores" quando a conclusão é a recíproca; um "não" some da conclusão. Em 9 itens, um argumento que não segue saiu
"segue". Os outros: "ou… ou…, mas não os dois" partido em duas fórmulas com uma premissa perdida, e a restrição do
sujeito perdida em "nenhuma opinião sem teste" e "toda barraca que aceita cartão".

A v4 do pedido (regras explícitas para "só pode A se B", o sujeito com restrição, o "mas não os dois", e "traduza cada
premissa como se não conhecesse a conclusão") não foi adotada: na metade de revisão, 83 fórmulas fiéis contra 81 da v3
(+7 −5, McNemar p = 0,77), e 10 argumentos que não seguem saíram "segue" (eram 9). A regra no pedido não tira o viés; o
diff está guardado fora do Git. Daí a tradução cega (`formalizarCego`, `cego-v1`): as premissas numa chamada sem a
conclusão, a conclusão noutra que vê só o vocabulário. Para o treino, o gerador ganhou os modos `treino2` e `revisao2`, com os moldes desses erros (os modos
antigos se refazem byte a byte como antes).

### 8c. A tradução cega, medida (29/10/2026)

Mesmo modelo, mesmas regras de leitura do pedido v3, reparo em cada passo; a classe fica para o Z3. Nas duas metades G-:

| | v3 com reparo | v4 (não adotada) | cega (`cego-v1`) |
|---|---|---|---|
| fórmulas fiéis, revisão (99) | 81 | 83 | 82 |
| fórmulas fiéis, teste (100) | 93 | 91 | 92 |
| classe certa pelo Z3, revisão | 88 | 86 | 93 |
| classe certa pelo Z3, teste | 97 | 99 | 96 |
| **não segue, mas saiu "segue"** (revisão + teste) | **9 + 2** | 10 + 0 | **0 + 2** |
| tempo por argumento (mediana, Vega 8) | 40 s | — | 58 s |

A fidelidade é a mesma (McNemar p = 1,0 nas duas metades); o que muda é o lado do erro. Na v3, 11 argumentos que não
seguem saíram "provados"; na cega, 2. Os erros que sobram na cega são, na maioria, do lado prudente (um argumento que
segue saiu "não segue", ou a frase não se leu). Para um revisor, dizer "provado" sem ser é o erro que não pode: a
tradução cega foi adotada no serviço local (`ollama`, revisor e Conversa) e no servidor do revisor. O pedido de
formalização de uma vez só continua no piloto e na formalização pelo Groq.

Uma trava a mais, achada na frase de um usuário ("todo homem parte de Deus, Deus é eterno, logo o homem é eterno"): a
conclusão "o homem é eterno" saiu com a fórmula de "Deus é eterno", o que daria "provado". Nas 199 frases G- isso
aconteceu uma vez (G-196). Agora, a conclusão que repete a fórmula de uma premissa de texto diferente volta ao modelo
com o erro; se ele insistir, fica sem conclusão e o argumento sai "não decidido", nunca "provado". A causa de fundo é
que as regras de leitura não falam do genérico "o A é B" (o homem em geral), e uma sonda mostrou mais: com o vocabulário
na ordem `Homem, deus, Eterno…`, o modelo fazia da frase `Eterno(deus)`; com as constantes no fim, `∀x (Homem(x) ⟹
Eterno(x))`. A ordem da lista decidia o sujeito.

`cego-v2`: a regra do genérico ("o A é B" falando de A em geral = "todo A é B"; o indivíduo único é constante) nas
duas chamadas, e na chamada da conclusão os predicados antes das constantes. Na metade de revisão G-, contra a `cego-v1`:

| | cego-v1 | cego-v2 |
|---|---|---|
| fórmulas fiéis (99) | 82 | 85 (+3 −0, McNemar p = 0,25) |
| classe certa pelo Z3 | 93 | 95 (+2 −0) |
| não segue, mas saiu "segue" | 0 | 0 |

Nenhuma frase piorou; adotada. A metade de teste fica guardada para a próxima conferência. Com o modelo de verdade, a
frase do usuário sai `∀x (Homem(x) ⟹ ParteDeDeus(x))`, `Eterno(deus)` ⊢ `∀x (Homem(x) ⟹ Eterno(x))`: salto, com o
cenário de alguém que é homem, é parte de Deus e não é eterno.

## 9. A ligação que falta (`ponte-v1`, 30/10/2026)

Uma frase de visão de mundo raramente traz tudo. O argumento do dono ("cada pessoa é parte do todo; cada pessoa é
necessária ao todo; toda pessoa cumpre uma função; nenhuma é dona da sua função; logo nenhuma pessoa invalida a
existência de outra"), formalizado à mão, é salto: nada nas premissas fala em invalidar. O que fecha está na cabeça de
quem escreve, e é isso que o Cosmos passa a mostrar.

Quando o Z3 diz salto, a Conversa pede a ligação (`src/motor/ponte.ts`, rota `ollama/ponte`):

1. **Busca pela forma, sem modelo.** "Para quaisquer A e B: se [o que as premissas dizem de A e de B], então [o que a
   conclusão diz]", com uma ou duas condições tiradas dos predicados das premissas (com o sinal com que aparecem lá).
   Os predicados da conclusão ficam de fora: "se A é homem, então A é eterno" é a conclusão, não a ligação. Conclusão
   sobre um indivíduo ("Eterno(socrates)") vira "todo x".
2. **O Z3 decide se serve:** com as premissas, a conclusão tem de decorrer; sozinha, não (senão é a conclusão com outras
   palavras); e ela não pode contradizer as premissas. Falha do Z3 tem uma segunda chance e nunca conta como "não segue".
3. **Até quatro opções**, variadas (cada uma com as condições que as outras não usaram), com os fatos que cada uma usa e
   os que não fazem falta. Escolher entre elas é a visão da pessoa; a resposta diz quantas outras também fecham.
4. **O modelo só se a busca não achar** (conclusão com ∃, formas mais complexas), com uma volta pelo motivo. No argumento
   acima, o qwen3:4b propôs "ninguém invalida a si mesmo", copiando o cenário; por isso ele é a reserva, não o caminho.

No argumento do dono, a busca acha 36 ligações; entre as quatro mostradas, "se A é necessária ao todo e B é necessária
ao todo, então A não invalida a existência de B" usa só "toda pessoa é necessária" (o resto não faz falta), e "se A não
é dona da sua função e B não é dona da sua função…" usa só a última premissa. A resposta separa fato, visão e lógica:
as premissas que a ligação usa são fatos (precisam de fonte, ou são a base assumida); a ligação é a visão (o que a
pessoa escolhe aceitar); com as duas, a conclusão é obrigatória, e o Z3 garante isso. "Aceito esta" leva o argumento
com a ligação para Minha cadeia, como provado.

O que esta peça não resolve: a tradução de frases abstratas pelo modelo pequeno (o mesmo argumento, traduzido pelo
qwen3:4b, saiu com "x é todo" no lugar de "x é parte do todo"). Isso fica com a correção do vocabulário na tela e com o
treino.

### 9b. Corrigir os termos (30/10/2026)

O cartão da Conversa mostra como o Cosmos leu cada termo e deixa a pessoa corrigir a leitura ou acrescentar um termo
(propriedade, relação entre dois ou nome). A verificação é refeita com esse vocabulário fixo nas duas chamadas da
tradução cega (a rota `ollama` aceita o vocabulário junto com o texto, só no formato dos termos). Leitura mudada ganha
símbolo novo, tirado dela ("x é parte do todo" → `ParteDoTodo`), porque o modelo lê o nome do símbolo junto.

No argumento do dono, com "parte do todo", "necessária ao todo", "dona da sua função" e "x invalida a existência de y"
dados, o qwen3:4b traduziu certo três premissas e a conclusão (só "sem cada pessoa, o todo não existiria" saiu torta);
o Z3 deu salto e a busca achou, entre outras, "se A é parte do todo e A não é dona da sua função, então A não invalida a
existência de nenhuma pessoa". A busca entende a conclusão escrita por dentro (`∀x (A(x) ⟹ ∀y (B(y) ⟹ C(x, y)))`), como
o modelo costuma escrever.

### 9c. O modelo grande na nuvem, opcional (30/10/2026)

Com o serviço aberto com `--ollama --groq` (o lançador `Abrir-Cosmos-IA.cmd` põe `--groq` quando a variável
`GROQ_API_KEY` existe), a Conversa mostra a opção de traduzir com o `openai/gpt-oss-120b` no Groq. Ela começa
desligada e fica guardada no aparelho; ligada, o texto do argumento sai do computador (para o Groq), e a tela diz isso.
O pedido é o mesmo (tradução cega `cego-v2`, as mesmas regras e exemplos, temperatura 0, com o reparo); o Z3 decide
aqui, e o cartão diz quem traduziu. Escolhemos o gpt-oss-120b (Apache 2.0) e não o Llama, cuja licença põe condições
em modelo derivado: as traduções que o Z3 aprovar podem virar dado de treino do modelo local (destilação), fora o
conjunto fechado e a metade de teste das frases G-.

Primeira medida, com o argumento do dono (30/10/2026): o gpt-oss-120b leu todos os termos certo sem correção ("parte do
todo", "dona da sua função", "x invalida a existência de y") em 6 s; o Z3 deu salto e a busca achou as quatro ligações,
inclusive "se A não é dona da sua função e B não é dona da sua função, então A não invalida a existência de B". Com a
razão escrita, "toda pessoa possui senso próprio da realidade…" saiu provado. Nas duas, a primeira resposta veio com a
lista de premissas vazia e o reparo resolveu: o gasto foi de cerca de 6 mil tokens por argumento.
