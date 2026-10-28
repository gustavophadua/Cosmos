# Avaliação v1 — formalizar frases curtas (conjunto fechado)

O piloto da I-AI mede uma tarefa só, escolhida pelo dono em 26/10/2026: ler frases curtas em português (todo, algum,
nenhum, nem todo, se… então, só se, ou, não) e escrever a formalização em m2 com a classe da conclusão. Este documento
diz o que é um item, como uma resposta é avaliada e por que o conjunto fica fechado. O código é
`src/motor/avaliacao.ts`; os testes, `testes/avaliacao.test.ts`.

## 1. O item

Cada item (formato `avaliacao-frases-v1`) tem:

- **texto:** as premissas e a conclusão, em português;
- **vocabulário:** os símbolos que a resposta pode usar, cada um com a leitura ("x é médico (médica)", "Ana", "x admira y");
- **gabarito:** as premissas e a conclusão em m2, e a classe.

A classe é uma de três, mutuamente exclusivas, sempre com premissas consistentes:

| Classe | Quer dizer | Como o Z3 decide |
| --- | --- | --- |
| segue | as premissas garantem a conclusão | premissas ∧ ¬conclusão é insatisfazível |
| contradiz | as premissas garantem a negação da conclusão | premissas ∧ conclusão é insatisfazível |
| independente | nem uma coisa nem outra | as duas são satisfazíveis |

O gabarito de todo item é conferido pelo Z3 (tradução t1): a classe que o gerador esperava tem de ser a que o
resolvedor dá. Item com premissas inconsistentes ou em que o Z3 não decide não entra. A lógica é a de primeira ordem
clássica: "Todo pato é esperto" não garante que exista pato, e por isso não implica "Algum pato é esperto".

## 2. A resposta e a nota

A resposta traz as premissas em m2, a conclusão em m2 e a classe. Ela só conta como **acerto** se:

1. lê em m2 usando apenas o vocabulário do item (símbolo inventado ou com aridade errada é recusado);
2. a classe é a do gabarito;
3. a conjunção das premissas da resposta é equivalente à do gabarito, e a conclusão também (o Z3 confere que a negação
   do bicondicional é insatisfazível).

Acertar a classe com a fórmula errada não é acerto: em três classes, o acaso já dá um terço. Escrever a mesma coisa de
outro jeito (outra ordem, dupla negação, contrapositiva) é acerto, porque a nota compara sentido, não texto. O resumo
de um lote dá os acertos completos, os que só acertaram a classe e os acertos por classe.

## 3. O conjunto fechado

- **120 itens, 40 por classe**, gerados em 26/10/2026 de padrões de raciocínio (silogismos, modus ponens e tollens,
  falácias do consequente e do antecedente, escopo de quantificador, importação existencial, disjunção, condicional, só
  se, dupla negação, relações) com vocabulário de profissões, adjetivos, pessoas e relações, sorteado com
  `os.urandom`. O conteúdo é absurdo de propósito ("Todo carteiro é jardineiro"): a resposta tem de vir da lógica, não do
  conhecimento do mundo.
- **O conteúdo não é publicado.** O conjunto, o gerador e os sais ficam na máquina do dono (`privado/`, fora do Git).
  Publicado fica só `avaliacao/conjunto-fechado-v1.json`: o número de itens, a contagem por classe, o compromisso de
  cada item e a raiz. O compromisso é o SHA-256 de `avaliacao-frases-v1`, de um sal de 32 bytes e do item em JSON, um
  por linha; o sal impede que alguém adivinhe uma frase curta testando candidatas. A raiz é o SHA-256 dos compromissos,
  um por linha, e vai carimbada no Bitcoin (`public/cosmos-avaliacao-v1-raiz.txt`): **confirmada no bloco 973304**
  (2026-10-26 22:50:05 UTC), antes de qualquer treino. O registro fica em `src/dados/ancora-avaliacao.json`, o
  verificador público o confere a cada execução, e a prova original dos calendários fica em `.calendario.ots`.
- **Regras:** os itens nunca entram em treino nem em exemplo de prompt; a avaliação de um modelo roda na máquina do
  dono; o resultado publicado diz o modelo, a data e a versão do conjunto. Quando o conjunto for aposentado, os itens
  e os sais são revelados, e qualquer um confere que batem com os compromissos e com a raiz carimbada antes do treino.
- **Exemplos públicos:** `avaliacao/exemplos-publicos-v1.jsonl` traz 12 itens (4 por classe) do mesmo formato, com
  vocabulário de animais, só para mostrar o formato e testar a nota. Eles não fazem parte do conjunto fechado.

## 4. Como rodar

Na máquina do dono, com o conjunto em `privado/avaliacao-fechada-v1/conjunto.jsonl`:

- conferir os gabaritos e os compromissos publicados:
  `AVALIACAO_PRIVADA=<conjunto.jsonl> npx vitest run testes/avaliacao.test.ts`;
- dar a nota de um lote de respostas (um JSON por linha: `id`, `premissas`, `conclusao`, `classe`): o mesmo, com
  `AVALIACAO_RESPOSTAS=<respostas.jsonl>`.

O Z3 em WebAssembly se desgasta depois de centenas de chamadas seguidas (uma delas trava sem respeitar o prazo), e uma
instância nova no mesmo processo não ganha memória. Por isso o conjunto se confere em fatias de 20 itens, um processo
por fatia: `AVALIACAO_FATIA=0-20`, `20-40` e assim por diante. Os compromissos saem sempre do conjunto inteiro.

## 5. Limites

- Os itens foram escritos por um gerador, não por pessoas; frases de gente de verdade são mais variadas. Um segundo
  conjunto, com frases escritas à mão, é o passo natural depois do piloto.
- O conjunto mede a formalização dentro do fragmento m2/t1; não mede prova longa nem matemática.
- A fidelidade é conferida contra o gabarito; o gabarito em si foi conferido pelo Z3 quanto à classe, e a tradução de
  cada frase para o gabarito segue os padrões do gerador, revisados à mão nos exemplos públicos.

## 6. A validação, os dados de treino e a nota item a item

Os 120 itens fechados não servem para ajustar nada: pedido, exemplos, votação e o checkpoint do treino se escolhem
num conjunto à parte, e os 120 se medem no máximo três vezes (o piloto registra cada medição; ver
`especificacao/formalizacao-v1.md`).

- **Gerador público:** `scripts/gerar-frases.py`. Semente fixa pelo nome do modo; rodar de novo dá o mesmo arquivo,
  byte a byte. Nunca lê o conjunto fechado.
- **Validação:** `avaliacao/validacao-v1.jsonl` (SHA-256 `0c8126c6152388865c3b9c47c823a2ccb6d688219ef21a231116026c2cb194a6`),
  150 itens, 50 por classe, vocabulário de fantasia (mago, elfa, cavaleiro, sábio, Aurora, Bento, desafia…), só as
  formas de frase de base, os mesmos fenômenos do conjunto fechado. A CI refaz o arquivo pelo gerador e confere o
  gabarito dos 150 pelo Z3, em 6 fatias de 25 (um processo por fatia; os 150 num processo só travaram o Z3 wasm).
- **Treino:** `python -I -X utf8 -B scripts/gerar-frases.py treino SAIDA.jsonl [ITENS_POR_CLASSE]`, por padrão 1000
  por classe. Vocabulário próprio (espaço e campo: robô, astronauta, vaqueira, metódico, Alice, Benito, avisa…),
  formas de frase variadas ("Cada…", "Todos os… são…", "Existe um… que…", "somente se", "Caso… seja…") e 7 padrões a
  mais (e, se e somente se, nem… nem, ou sem simplificar, se sem voltar). O lote se refaz igual e se confere pelo Z3
  com `FRASES_ARQUIVO` e `FRASES_FATIA` em `testes/frases-geradas.test.ts`.
- **Anti-vazamento:** `scripts/anti-vazamento.py <conjunto fechado> <lotes…>`, só na máquina do dono, conta palavras de
  conteúdo, símbolos, frases e fórmulas em comum e só imprime contagens. Em 27/10/2026: validação, treino (3000 itens)
  e exemplos públicos com **0 / 0 / 0 / 0**. O detector foi conferido contra o próprio conjunto fechado (acusa tudo).
- **Nota item a item:** `testes/nota.test.ts` (`NOTA_CONJUNTO`, `NOTA_RESPOSTAS`, `NOTA_SAIDA`, `NOTA_FATIA`) grava uma
  linha por item com a nota de §2 e a classe que o Z3 dá às fórmulas do modelo (a que vale no Cosmos). O relatório
  é `scripts/relatorio-nota.py NOTAS.jsonl [--comparar ANTES.jsonl]`: intervalo de 95% (Wilson), por classe, por
  padrão, matriz de confusão, motivos de erro e, comparando duas medições, McNemar exato nos itens em comum. Com 120
  itens a margem é de cerca de ±8 a 9 pontos; diferença sem p < 0,05 não conta.

**Limite declarado:** o gerador público foi escrito por quem escreveu o do conjunto fechado e cobre os mesmos padrões
de raciocínio (que já são públicos em §3). Por isso a nota nos 120 mede a passagem para **vocabulário novo**, não para
frases escritas por gente; o conjunto escrito à mão (§5) continua sendo o próximo passo para isso.

## 7. Medições no conjunto fechado

| # | Data | Modelo | Configuração | Fórmulas fiéis | Classe pelo Z3 | Classe dita | Completas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 28/10/2026 | `qwen3:4b` no Ollama 0.40.12, sem treino | `formalizacao-v1`, `esquema-json-v1`, sem modo pensando, temperatura 0 | **115/120 = 95,8%** (90,6–98,2%) | **116/120 = 96,7%** (91,7–98,7%) | 95/120 = 79,2% (71,1–85,5%) | 93/120 = 77,5% (69,2–84,1%) |

Os intervalos são de 95% (Wilson). Rodou no computador do dono, só na CPU (cerca de 48 s por item, 1 h 36 min no
total); nenhum item saiu do aparelho. O digest do modelo é
`359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`.

- **Fórmulas fiéis** é o número que vale: no Cosmos, a classe sai do Z3 a partir das fórmulas, e a pessoa aprova a
  leitura de volta. Das 5 que falharam, 2 usaram um símbolo fora do vocabulário do item (recusadas na leitura) e 3
  trouxeram uma premissa ou a conclusão que não equivale à do gabarito.
- **A classe dita pelo modelo** é o ponto fraco: por classe do gabarito, completas em 37/40 (segue), 36/40
  (contradiz) e só 20/40 (independente). Nas independentes, o modelo cai nas falácias que o conjunto testa (diz
  "segue" ou "contradiz" onde nada se conclui). O Cosmos não usa essa classe para decidir nada.
- Matriz da classe dita (linha = gabarito, coluna = modelo): segue 37 / 0 / 3 / 0; contradiz 3 / 36 / 1 / 0;
  independente 5 / 11 / 22 / 2 (a última coluna: sem resposta lida).
- A nota por padrão de raciocínio não é publicada, porque diria quantos itens de cada padrão o conjunto tem.

**Meta e decisão:** o dono fixou a meta em 85% de fórmulas fiéis depois de ver a linha de base (ver
`decisoes-do-dono.md`); o limite de baixo do intervalo já passa dela, então a I-AI v1 fica com o modelo sem treino e
as outras duas medições ficam guardadas. O resumo com os hashes das respostas e das notas está em
`public/cosmos-iai-v1-resultado.txt`, carimbado no Bitcoin pelo OpenTimestamps (enviado aos calendários em
28/10/2026; a confirmação entra num registro próprio, como a da raiz). Quando o conjunto for revelado (§3), qualquer
um refaz a nota a partir das respostas e confere os dois hashes.

**Limites desta nota:** vale para frases no estilo do gerador, com vocabulário novo (§6); com frases escritas por
gente o número pode ser menor. São 120 itens: neste nível de acerto, o intervalo vai até
 cerca de 5 pontos abaixo do medido.
