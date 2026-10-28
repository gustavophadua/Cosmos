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
