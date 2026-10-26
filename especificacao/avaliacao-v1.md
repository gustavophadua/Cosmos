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
  um por linha, e vai carimbada no Bitcoin (`public/cosmos-avaliacao-v1-raiz.txt`).
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
