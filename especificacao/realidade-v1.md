# Realidade v1: traduzir a realidade física para a lógica

Versão `realidade-v1`, 01/11/2026. Código: `src/motor/realidade.ts` e `src/dados/realidade-v1.ts`. Testes:
`testes/realidade.test.ts` e `testes/assistente.test.ts`.

## 1. O problema

Até aqui, o Cosmos conferia se a conclusão decorre do que a pessoa disse, **aceitando as premissas como verdadeiras**.
A missão é outra: a pessoa é um fragmento do todo, e o que ela diz não é aceito como verdade. É conferido contra a
realidade registrada, e a resposta mostra como a realidade física é, sem se moldar a quem pergunta e sem chutar.

## 2. O que é exato e o que não é

| Passo | Quem faz | É exato? |
|---|---|---|
| Ler o português e escrever as fórmulas | o modelo de linguagem | **Não.** É o único passo estatístico, e ele aparece na tela ("entendi:") para ser conferido |
| Ligar as palavras da pessoa aos termos da base | regra fixa: sinônimo exato, sem acento | Sim. É determinístico; ambíguo ou negado não liga |
| Dizer se cada frase é fato, contraria os fatos ou não é decidida | Z3 | Sim |
| O mecanismo por trás do que a pessoa observou | Z3 | Sim |
| A conclusão diante dos fatos e do relato | Z3 | Sim |
| Os fatos em si | a base, cada um com fonte | São o que está registrado: valem na escala do dia a dia e com as condições escritas |

O modelo nunca decide. Depois da tradução, a mesma entrada dá sempre a mesma resposta, para qualquer pessoa.

## 3. A base de fatos

Cada fato tem quatro partes:
- um id (`R01`…);
- a frase em português;
- a fórmula em m2 (lógica de primeira ordem);
- a fonte.

Três regras de escrita:

1. **As condições ficam na fórmula.** "Todo aparelho eletrônico **em funcionamento** gera calor", não "todo aparelho
   eletrônico gera calor". Um fato sem a condição que o torna verdadeiro é fanatismo.
2. **Palavras diferentes são coisas diferentes.** "Esquentou" (a temperatura subiu) não é "gera calor": uma xícara no
   sol esquenta sem gerar calor. A ligação entre as duas é a primeira lei da termodinâmica:
   `Esquenta(x) ⟹ GeraCalor(x) ∨ RecebeEnergia(x)`.
3. **A existência também é fato.** Só com regras, "todo ser humano voa" não contradiria nada, porque um mundo sem
   humanos satisfaz as regras. Por isso a base afirma que existem seres humanos, celulares, sons, luz e fogo.

Os sinônimos ligam a fala da pessoa aos símbolos da base. Ficam de fora os que ligariam errado:
- "cai", porque "o preço cai" também se diz;
- "vivo", porque estar vivo não é ser um ser vivo;
- "coisa", por ser vaga demais;
- "queimando", porque também quer dizer febre.

Uma leitura com "não", ou que bate com dois termos da base, **não liga**.

A v1 tem 26 fatos (`R01`–`R26`) sobre aparelhos e calor, seres vivos, gravidade e massa, luz e som, combustão e o
sentido do calor. É pequena de propósito: crescer é acrescentar fatos com fonte, e cada um passa pelos testes de
leitura e de consistência da base.

## 4. O que a resposta mostra

1. **Entendi:** as palavras da pessoa ligadas a termos da base, por exemplo "x esquentou" = "a temperatura de x sobe",
   e as constantes reconhecidas como casos de um tipo ("o celular é um celular").
2. **Cada frase:**

   | Situação | Quando |
   |---|---|
   | Fato registrado | a base prova a frase (com os fatos usados) |
   | Contraria os fatos | a base prova o contrário (com os fatos usados) |
   | Relato seu | fala de termos da base, mas a base não decide. Exemplo: "o celular esquentou" |
   | Visão | não fala de nada que a base conhece |
   | O Z3 não concluiu | tempo esgotado ou resposta indefinida; nunca vira outra coisa |

   Os fatos usados são os necessários: cada um, se for tirado, muda a decisão.
3. **O mecanismo**, para cada relato:
   - o que ele implica pelos fatos;
   - as condições registradas que produzem cada possibilidade.

   Cada condição tem de ser possível, não pode já valer e não pode ser o próprio relato.
4. **A conclusão diante dos fatos e do relato compatível com eles.** As frases que contrariam os fatos ficam de fora
   dessa conta.

## 5. Exemplos (conferidos nos testes com o Z3)

**"O celular esquentou. Logo, está com vírus."**

| Frase | Situação |
|---|---|
| O celular esquentou | Relato seu |
| Está com vírus | Visão: nenhum fato liga vírus a calor |

- **O que o relato implica pelos fatos:** o celular gerou calor ou recebeu energia de fora (R04).
- **Caminhos registrados:**
  - em funcionamento → gera calor (R01, R03);
  - exposto ao sol → recebe energia (R21).
- **A conclusão:** os fatos, com o relato, não levam a ela.

**"Todo ser humano pode morrer. Logo, todo ser humano voa."**

| Frase | Situação |
|---|---|
| Todo ser humano pode morrer | Fato registrado (R05, R06, R07) |
| Todo ser humano voa | Contraria os fatos (R10, R22) |

**"Maria vê os outros como deuses. Logo, Maria sofre."**

As duas frases são visão. A realidade registrada não decide, e o Cosmos diz isso em vez de chutar.

## 6. De ponta a ponta, com o modelo local (01/11/2026)

As mesmas frases passaram pela cadeia inteira: o texto em português, o qwen3:4b no Ollama, o Z3 e a base. O teste fica
em `testes/realidade-ponta.test.ts` e só roda quando chamado; o resultado vai para `tmp/realidade-ponta/`.

| Frase | Primeira rodada | Depois das correções |
|---|---|---|
| "O celular esquentou. Logo, está com vírus." | sem conclusão | **funciona:** a esquentada é relato, com dois caminhos registrados; o vírus é visão |
| "Ana é uma pessoa. Logo, Ana voa." | funciona: só pela lógica é salto; pelos fatos a conclusão é **falsa** | igual |
| "Todo ser humano pode morrer. Logo, todo ser humano voa." | funciona: premissa **fato**, conclusão **contraria os fatos** | igual |
| "O notebook ficou no sol. Logo, o notebook esquentou." | sem conclusão | traduz, mas "ficou no sol" vira uma relação com o sol e não liga a "exposto ao sol" |
| "As pessoas veem as outras como deuses. Logo, as pessoas sofrem." | o modelo usa um símbolo que não declarou | igual |

**O que barrava o celular.** O modelo de 4B, vendo o vocabulário em uso, traduzia "o celular está com vírus" como
`Esquentou(celular)`, uma cópia da premissa. A guarda barrou. Se tivesse passado, seria um "provado" falso: um
raciocínio errado com selo de lógica.

**Duas correções, ambas na tradução:**

1. **cego-v4.** Barrada a cópia, a conclusão é traduzida do zero, sozinha e sem o conector. Depois é unida ao
   vocabulário das premissas por regra fixa: mesma constante, ou predicado com a mesma leitura. Só muda os casos que
   antes ficavam sem conclusão. Ainda **não foi medida** no conjunto de revisão; até lá, os números publicados
   continuam sendo os do cego-v2.
2. **Sujeito oculto.** "Logo, está com vírus" é lida como "Logo, o celular está com vírus", com o sujeito da primeira
   frase. A tela avisa que leu assim.

## 7. Limites

- **O modelo pode ler errado.** O "entendi:" e a correção de termos continuam sendo a defesa.
- **Fato é o que está na base, com fonte.** O que a base não tem não é falso: é não decidido.
- **A v1 não tem números** (temperaturas, velocidades). Os fatos são qualitativos.
- **O mecanismo procura condições de um termo só,** com os tipos da base. Só estados e acontecimentos têm mecanismo; dizer o que algo é ("Ana é uma pessoa") não tem causa física a procurar.
- **A tradução do modelo de 4B ainda falha** em frases com relações ("ficou no sol" virou uma relação com o sol) e às vezes declara mal os símbolos. A base não conserta isso; ela só deixa a frase como visão.

## 8. Contra-ataque: por que isso pode falhar

**1. Toda base de senso comum em lógica já fracassou em escala.** O caso mais conhecido é o Cyc, um projeto de
décadas para escrever o conhecimento comum em lógica. O risco é real.

A resposta aqui:
- **O escopo é estreito:** só a realidade física e só fatos com fonte, nada de senso comum geral.
- **Não é preciso cobrir tudo:** o que não está na base aparece como "não decidido", não como erro.
- **Cada fato é testado** quanto a leitura, consistência e uso.

**2. O alinhamento por sinônimo é frágil.** "Esquentou" liga e "ficou morno" não liga. A escolha é deliberada: um
falso alinhamento seria um chute, e um alinhamento que falta só deixa a frase como relato. Crescer a lista de
sinônimos é trabalho, e cada sinônimo novo precisa passar pela mesma régua: não pode ligar em outro sentido comum.

**3. A tradução continua sendo estatística.** A camada de fatos não remove esse passo, só o torna visível. Medir a
fidelidade da tradução nas frases do dia a dia continua sendo a medição que mais importa.
